package com.oswhgo.wivra

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Editor → native progressive export channel (protocol v1, see app/export-sink.mjs).
 *
 * Uses AndroidX WebMessageListener instead of addJavascriptInterface: messages are
 * asynchronous (no JS thread blocked by disk I/O), binary chunks travel as
 * ArrayBuffer without base64, and every message reports its frame. Only the main
 * frame of the bundled offline editor is served; anything else gets no reply.
 * This channel can only write NEW Wivra_Export_* videos and share them; it never
 * reads, lists or deletes other media. — Claude
 */
class WivraExportBridge(private val activity: Activity, private val webView: WebView) {
    private val owner = java.util.UUID.randomUUID().toString()
    private val main = Handler(Looper.getMainLooper())
    private val appContext = activity.applicationContext
    @Volatile private var disposed = false

    /** Returns false when this WebView cannot provide the channel (memory export remains). */
    fun install(): Boolean {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return false
        // file:// pages have no origin a rule can name; "*" plus the main-frame and
        // exact-URL check below is the narrowest option. Navigation is already locked
        // to the bundled asset by MainActivity's WebViewClient.
        WebViewCompat.addWebMessageListener(webView, JS_OBJECT, setOf("*")) { view, message, _, isMainFrame, reply ->
            if (!isMainFrame || view.url != EDITOR_URL || disposed) return@addWebMessageListener
            onMessage(message, reply)
        }
        // Rows left pending by a killed process are deleted before any new export.
        io.execute { WivraExportStore.cleanupOrphans(appContext) }
        return true
    }

    fun dispose() {
        if (disposed) return
        disposed = true
        io.execute { WivraExportStore.abortOwned(appContext, owner) }
    }

    private fun onMessage(message: WebMessageCompat, reply: JavaScriptReplyProxy) {
        if (message.type == WebMessageCompat.TYPE_ARRAY_BUFFER) {
            val frame = WivraProgressiveExportSession.parseFrame(message.arrayBuffer) ?: return
            run(reply, frame.rid) {
                val written = WivraExportStore.append(appContext, frame.token, frame.seq, frame.data, frame.offset, frame.length)
                JSONObject().put("seq", frame.seq).put("written", written)
            }
            return
        }
        val request = try { JSONObject(message.data ?: return) } catch (_: Exception) { return }
        val rid = request.optLong("rid", -1L)
        if (rid < 0 || request.optInt("v", 0) != PROTOCOL) return
        when (request.optString("op")) {
            "hello" -> run(reply, rid) {
                JSONObject().put("protocol", PROTOCOL)
                    .put("arrayBuffer", WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER))
                    .put("platform", "android")
            }
            "begin" -> run(reply, rid) {
                val (token, name) = WivraExportStore.begin(appContext, request.optString("mime"), request.optLong("estimatedBytes", 0L), owner)
                JSONObject().put("token", token).put("displayName", name)
            }
            "chunk" -> run(reply, rid) {
                val data = Base64.decode(request.getString("b64"), Base64.DEFAULT)
                if (data.size != request.optInt("size", -1)) throw java.io.IOException("Fragmento base64 incompleto.")
                val seq = request.getInt("seq")
                val written = WivraExportStore.append(appContext, request.getInt("token"), seq, data, 0, data.size)
                JSONObject().put("seq", seq).put("written", written)
            }
            "finish" -> run(reply, rid) {
                val token = request.getInt("token")
                val saved = WivraExportStore.finish(appContext, token, request.getLong("bytes"),
                    request.getLong("crc32"), request.getInt("chunks"))
                val reply = JSONObject().put("token", token).put("bytes", saved.bytes).put("crc32", saved.crc32)
                    .put("recordedBytes", saved.recordedBytes).put("recordedCrc32", saved.recordedCrc32)
                    .put("displayName", saved.displayName).put("location", "Galería › Movies/Wivra")
                    .put("repair", saved.repair).put("repairNote", saved.repairNote)
                saved.media?.let { m -> reply.put("media", JSONObject().put("container", m.container).put("durationMs", m.durationMs)
                    .put("video", m.video).put("audio", m.audio).put("declaresDuration", m.declaresDuration).put("seekIndex", m.seekIndex)) }
                reply
            }
            "abort" -> run(reply, rid) {
                WivraExportStore.abort(appContext, request.getInt("token"))
                JSONObject()
            }
            "share" -> {
                val saved = WivraExportStore.savedExport(request.optInt("token", 0))
                if (saved == null) { send(reply, failure(rid, "Este video ya no está disponible para compartir.")); return }
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = saved.mime
                    putExtra(Intent.EXTRA_STREAM, saved.uri)
                    clipData = ClipData.newRawUri(saved.displayName, saved.uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                try {
                    activity.startActivity(Intent.createChooser(intent, saved.displayName))
                    send(reply, JSONObject().put("rid", rid).put("ok", true))
                } catch (_: RuntimeException) {
                    send(reply, failure(rid, "No hay ninguna app para abrir o compartir el video."))
                }
            }
            else -> send(reply, failure(rid, "Método no permitido."))
        }
    }

    /** All storage work runs on ONE background thread, in arrival order. */
    private fun run(reply: JavaScriptReplyProxy, rid: Long, work: () -> JSONObject) {
        if (disposed) return
        try {
            io.execute {
                val answer = try {
                    work().put("rid", rid).put("ok", true)
                } catch (problem: Exception) {
                    failure(rid, problem.message ?: problem.javaClass.simpleName)
                }
                main.post { send(reply, answer) }
            }
        } catch (_: java.util.concurrent.RejectedExecutionException) {
            // Activity destroyed: the editor is gone with it.
        }
    }

    private fun failure(rid: Long, message: String): JSONObject =
        JSONObject().put("rid", rid).put("ok", false).put("error", message.take(300))

    private fun send(reply: JavaScriptReplyProxy, answer: JSONObject) {
        if (disposed) return
        try { reply.postMessage(answer.toString()) } catch (_: Exception) { /* page navigated away */ }
    }

    companion object {
        // The store is process-wide. Activity recreation must not create a second
        // storage worker that races orphan scans, finalization or old-page cleanup.
        private val io: ExecutorService = Executors.newSingleThreadExecutor()
        const val JS_OBJECT = "WivraExportNative"
        const val EDITOR_URL = "file:///android_asset/agentcut.html"
        const val PROTOCOL = 1
    }
}
