package com.framedoctor

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.webkit.JavascriptInterface
import com.framedoctor.capture.DeviceSamplers
import com.framedoctor.capture.FrameSampler
import com.framedoctor.export.FileDropHelper

class NativeBridge(private val context: Context) {
    private val frames = FrameSampler()
    private val device = DeviceSamplers(context)
    private val files = FileDropHelper(context)

    @JavascriptInterface
    fun available(): Boolean = true

    @JavascriptInterface
    fun deviceInfo(): String = device.deviceInfo()

    @JavascriptInterface
    fun snapshot(): String = device.snapshot().toString()

    @JavascriptInterface
    fun startCapture() {
        frames.start()
    }

    @JavascriptInterface
    fun stopCapture() {
        frames.stop()
    }

    @JavascriptInterface
    fun framesJson(): String = frames.toJson()

    @JavascriptInterface
    fun saveToDownloads(filename: String, content: String): String = files.save(filename, content)

    @JavascriptInterface
    fun clipboard(text: String) {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("FrameDoctor", text))
    }

    @JavascriptInterface
    fun vibrate(pattern: String) {
        val parts = pattern.split(",").mapNotNull { it.trim().toLongOrNull() }.toLongArray()
        if (parts.isEmpty()) return
        if (Build.VERSION.SDK_INT >= 31) {
            val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vm.defaultVibrator.vibrate(VibrationEffect.createWaveform(parts, -1))
        } else {
            @Suppress("DEPRECATION")
            val v = context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            if (Build.VERSION.SDK_INT >= 26) {
                v.vibrate(VibrationEffect.createWaveform(parts, -1))
            } else {
                @Suppress("DEPRECATION")
                v.vibrate(parts, -1)
            }
        }
    }
}
