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
import org.json.JSONArray
import java.io.IOException
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Independent experimental v2 bridge. It never accepts v1 MediaRecorder
 * frames, never uses addJavascriptInterface and never reads user media.
 * Only the main frame of the exact packaged offline Editor can issue writes.
 *
 * Bounded JSON/base64 writeAt is a compatibility transport, not a promise of
 * optimized zero-copy. Maximum 1 MiB per message; one IO task at a time.
 * The editor does NOT select accelerated rendering automatically.
 */
class WivraAcceleratedExportBridge(
    private val activity: Activity,
    private val webView: WebView
) {
    private val owner = UUID.randomUUID().toString()
    private val main = Handler(Looper.getMainLooper())
    private val context = activity.applicationContext
    @Volatile private var disposed = false

    fun install(): Boolean {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return false
        WebViewCompat.addWebMessageListener(webView, OBJECT, setOf("*")) {
            view, message, _, isMainFrame, reply ->
            if (disposed || !isMainFrame || !WivraExportBridge.isEditor(view.url))
                return@addWebMessageListener
            onMessage(message, reply)
        }
        io.execute { WivraRandomExportStore.cleanupOrphanPartials(context) }
        return true
    }

    fun dispose() {
        if (disposed) return
        disposed = true
        io.execute { WivraRandomExportStore.abortOwned(owner) }
    }

    private fun onMessage(message: WebMessageCompat, reply: JavaScriptReplyProxy) {
        // Never reinterpret v1 binary chunks as v2 random offsets.
        if (message.type != WebMessageCompat.TYPE_STRING) return
        val raw = message.data ?: return
        if (raw.length > MAX_MESSAGE_CHARS) return
        val request = try { JSONObject(raw) } catch (_: Exception) { return }
        val version = try { WivraStrictJsonNumber.requireLong(request.opt("v"), "v", 2L, 2L) }
            catch (_: IllegalArgumentException) { return }
        val protocol = try { WivraStrictJsonNumber.requireLong(request.opt("protocol"), "protocol", 2L, 2L) }
            catch (_: IllegalArgumentException) { return }
        if (version != 2L || protocol != 2L) return
        val rid = try {
            WivraStrictJsonNumber.requireLong(request.opt("rid"), "rid", 1L, Int.MAX_VALUE.toLong())
        } catch (_: IllegalArgumentException) { return }
        when (request.opt("op") as? String ?: return) {
            "helloRandom" -> enqueue(reply, rid) {
                JSONObject().put("protocol", 2).put("randomWrite", true)
                    .put("platform", "android").put("maxWriteBytes",
                        WivraRandomAccessExportSession.MAX_WRITE_BYTES)
            }
            "beginRandom" -> enqueue(reply, rid) {
                val mime = request.opt("mime") as? String
                    ?: throw IOException("Contenedor acelerado inválido.")
                val estimatedBytes = WivraStrictJsonNumber.requireLong(
                    request.opt("estimatedBytes"), "estimatedBytes", 1L,
                    WivraRandomAccessExportSession.MAX_OUTPUT_BYTES)
                val token = WivraRandomExportStore.begin(context, mime, estimatedBytes, owner)
                JSONObject().put("token", token)
            }
            "writeAt" -> enqueue(reply, rid) {
                val size = WivraStrictJsonNumber.requireInt(
                    request.opt("size"), "size", 1, WivraRandomAccessExportSession.MAX_WRITE_BYTES)
                val token = WivraStrictJsonNumber.requireInt(request.opt("token"), "token", 1, Int.MAX_VALUE)
                val seq = WivraStrictJsonNumber.requireInt(request.opt("seq"), "seq", 0, Int.MAX_VALUE)
                val position = WivraStrictJsonNumber.requireLong(
                    request.opt("position"), "position", 0L, Long.MAX_VALUE)
                val b64 = request.opt("b64") as? String
                    ?: throw IOException("Bloque base64 inválido.")
                if (b64.length > MAX_B64_CHARS) throw IOException("Bloque base64 demasiado grande.")
                val data = Base64.decode(b64, Base64.DEFAULT)
                if (data.size != size) throw IOException("Bloque aleatorio truncado.")
                val ack = WivraRandomExportStore.writeAt(context, token, seq, position, data, owner)
                JSONObject().put("seq", ack.seq).put("writtenBytes", ack.writtenBytes)
                    .put("maxEnd", ack.maxEnd)
            }
            "finishRandom" -> enqueue(reply, rid) {
                val token = WivraStrictJsonNumber.requireInt(request.opt("token"), "token", 1, Int.MAX_VALUE)
                val bytes = WivraStrictJsonNumber.requireLong(request.opt("bytes"), "bytes", 1L, Long.MAX_VALUE)
                val writes = WivraStrictJsonNumber.requireInt(request.opt("writes"), "writes", 1, Int.MAX_VALUE)
                val duration = WivraStrictJsonNumber.requireLong(
                    request.opt("expectedDurationMs"), "expectedDurationMs", 1L, Long.MAX_VALUE)
                val expectAudio = WivraStrictJsonNumber.requireBoolean(request.opt("expectAudio"), "expectAudio")
                val saved = WivraRandomExportStore.finish(context, token, bytes, writes, duration, expectAudio, owner)
                JSONObject().put("verified", true).put("token", token)
                    .put("bytes", saved.bytes).put("sha256", saved.sha256)
                    .put("displayName", saved.name).put("location", "Movies/Wivra")
                    .put("media", JSONObject().put("video", saved.media.video)
                        .put("audio", saved.media.audio)
                        .put("durationMs", saved.media.durationMs))
            }
            "abortRandom" -> enqueue(reply, rid) {
                val token = WivraStrictJsonNumber.requireInt(request.opt("token"), "token", 1, Int.MAX_VALUE)
                WivraRandomExportStore.abort(token, owner)
                JSONObject()
            }
            "listRecovered" -> enqueue(reply, rid) {
                val files = JSONArray()
                for (item in WivraRandomExportStore.recovered(context).take(100))
                    files.put(JSONObject().put("name", item.name)
                        .put("bytes", item.bytes)
                        .put("durationMs", item.media.durationMs))
                JSONObject().put("files", files)
            }
            "restoreRecovered" -> enqueue(reply, rid) {
                // Existing store verifies a sealed private file and copies to
                // a new MediaStore row; it never accepts arbitrary file paths.
                val name = request.opt("name") as? String
                    ?: throw IOException("Nombre de recuperación inválido.")
                val saved = WivraRandomExportStore.restore(context, name)
                JSONObject().put("restored", true).put("name", saved.name)
                    .put("bytes", saved.bytes)
                    .put("alreadyPublished", saved.alreadyPublished)
            }
            "share" -> {
                val token = try {
                    WivraStrictJsonNumber.requireInt(request.opt("token"), "token", 1, Int.MAX_VALUE)
                } catch (_: IllegalArgumentException) {
                    send(reply, failure(rid, "Token acelerado inválido."))
                    return
                }
                val saved = WivraRandomExportStore.saved(token, owner)
                if (saved == null) {
                    send(reply, failure(rid, "No existe un archivo acelerado publicado."))
                    return
                }
                try {
                    val intent = Intent(Intent.ACTION_SEND).apply {
                        type = saved.mime
                        putExtra(Intent.EXTRA_STREAM, saved.uri)
                        clipData = ClipData.newRawUri(saved.name, saved.uri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    activity.startActivity(Intent.createChooser(intent, saved.name))
                    send(reply, JSONObject().put("rid", rid).put("ok", true))
                } catch (_: RuntimeException) {
                    send(reply, failure(rid, "No se pudo abrir el menú Compartir."))
                }
            }
            else -> send(reply, failure(rid, "Operación aleatoria no permitida."))
        }
    }

    private fun enqueue(reply: JavaScriptReplyProxy, rid: Long, work: () -> JSONObject) {
        if (disposed) return
        io.execute {
            val result = try { work().put("rid", rid).put("ok", true) }
                catch (error: Exception) {
                    failure(rid, error.message ?: error.javaClass.simpleName)
                }
            main.post { send(reply, result) }
        }
    }

    private fun failure(rid: Long, message: String) =
        JSONObject().put("rid", rid).put("ok", false).put("error", message.take(300))

    private fun send(reply: JavaScriptReplyProxy, json: JSONObject) {
        if (disposed) return
        try { reply.postMessage(json.toString()) } catch (_: Exception) { }
    }

    companion object {
        const val OBJECT = "WivraAcceleratedExportNative"
        private const val MAX_B64_CHARS = 1_400_000
        private const val MAX_MESSAGE_CHARS = 1_400_400
        private val io = Executors.newSingleThreadExecutor()
    }
}
