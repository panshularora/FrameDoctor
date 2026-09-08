package com.framedoctor.capture

import android.view.Choreographer
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentLinkedQueue

class FrameSampler : Choreographer.FrameCallback {
    private val frames = ConcurrentLinkedQueue<JSONObject>()
    private var lastNanos = 0L
    private var running = false

    fun start() {
        frames.clear()
        lastNanos = 0L
        running = true
        Choreographer.getInstance().postFrameCallback(this)
    }

    fun stop() {
        running = false
        Choreographer.getInstance().removeFrameCallback(this)
    }

    override fun doFrame(frameTimeNanos: Long) {
        if (!running) return
        if (lastNanos > 0L) {
            val ms = (frameTimeNanos - lastNanos) / 1_000_000.0
            if (ms > 0 && ms < 400) {
                val obj = JSONObject()
                obj.put("t", frameTimeNanos / 1_000_000.0)
                obj.put("ms", (ms * 10.0).toInt() / 10.0)
                frames.add(obj)
                while (frames.size > 20000) frames.poll()
            }
        }
        lastNanos = frameTimeNanos
        Choreographer.getInstance().postFrameCallback(this)
    }

    fun toJson(): String {
        val arr = JSONArray()
        frames.forEach { arr.put(it) }
        return arr.toString()
    }
}
