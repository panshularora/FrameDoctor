package com.framedoctor.capture

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.view.WindowManager
import org.json.JSONObject

class DeviceSamplers(private val context: Context) {
    private val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    private val battery = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager

    fun thermalStatus(): Int {
        return if (Build.VERSION.SDK_INT >= 29) {
            power.currentThermalStatus.coerceIn(0, 6)
        } else 0
    }

    fun thermalLabel(): String {
        return when (thermalStatus()) {
            0 -> "NONE"
            1 -> "LIGHT"
            2 -> "MODERATE"
            3 -> "SEVERE"
            4 -> "CRITICAL"
            5 -> "EMERGENCY"
            6 -> "SHUTDOWN"
            else -> "NONE"
        }
    }

    fun batteryPct(): Double {
        val cap = battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        if (cap in 0..100) return cap.toDouble()
        val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        return if (level >= 0) level * 100.0 / scale else -1.0
    }

    fun batteryTempC(): Double {
        val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val tenth = intent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1) ?: -1
        return if (tenth > 0) tenth / 10.0 else -1.0
    }

    fun currentNowUa(): Int {
        return battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW)
    }

    fun refreshHz(): Float {
        val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        return if (Build.VERSION.SDK_INT >= 30) {
            context.display?.refreshRate ?: 60f
        } else {
            @Suppress("DEPRECATION")
            wm.defaultDisplay.refreshRate
        }
    }

    fun deviceInfo(): String {
        val o = JSONObject()
        o.put("brand", Build.BRAND)
        o.put("model", Build.MODEL)
        o.put("device", Build.DEVICE)
        o.put("sdk", Build.VERSION.SDK_INT)
        o.put("refreshHz", refreshHz().toDouble())
        return o.toString()
    }

    fun snapshot(): JSONObject {
        val o = JSONObject()
        o.put("thermal", thermalStatus())
        o.put("thermalLabel", thermalLabel())
        o.put("batteryPct", batteryPct())
        o.put("batteryTempC", batteryTempC())
        o.put("currentNowUa", currentNowUa())
        o.put("refreshHz", refreshHz().toDouble())
        return o
    }
}
