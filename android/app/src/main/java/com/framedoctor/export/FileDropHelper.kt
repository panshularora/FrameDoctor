package com.framedoctor.export

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

class FileDropHelper(private val context: Context) {
    fun save(filename: String, content: String): String {
        val mime = when {
            filename.endsWith(".json") -> "application/json"
            filename.endsWith(".csv") -> "text/csv"
            filename.endsWith(".txt") -> "text/plain"
            else -> "text/markdown"
        }
        return try {
            if (Build.VERSION.SDK_INT >= 29) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, filename)
                    put(MediaStore.Downloads.MIME_TYPE, mime)
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }
                val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: throw IllegalStateException("insert failed")
                context.contentResolver.openOutputStream(uri)?.use { it.write(content.toByteArray(Charsets.UTF_8)) }
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                context.contentResolver.update(uri, values, null, null)
                ok("Downloads/$filename")
            } else {
                val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                dir.mkdirs()
                val file = File(dir, filename)
                FileOutputStream(file).use { it.write(content.toByteArray(Charsets.UTF_8)) }
                ok(file.absolutePath)
            }
        } catch (e: Exception) {
            JSONObject().put("ok", false).put("error", e.message ?: "save failed").toString()
        }
    }

    private fun ok(path: String) = JSONObject().put("ok", true).put("path", path).toString()
}
