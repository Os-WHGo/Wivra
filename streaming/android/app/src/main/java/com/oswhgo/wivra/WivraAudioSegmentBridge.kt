package com.oswhgo.wivra

import android.app.Activity
import android.util.Base64
import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * W98 (Claude): «WivraAudioPcm.extract(name, size, from, to)» for the bundled editor's main frame only.
 * Reads one ≤ 35 s piece of a file the person chose for the editor (see WivraAudioSegments) and answers
 * 16 kHz mono 16-bit PCM as base64. One piece at a time, on a background thread.
 */
class WivraAudioSegmentBridge(private val activity: Activity, private val webView: WebView) {
    private val worker = Executors.newSingleThreadExecutor()

    fun install(): Boolean {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) ||
            !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return false
        WebViewCompat.addWebMessageListener(webView, JS_OBJECT, setOf("*")) { view, message, _, isMainFrame, reply ->
            if (!isMainFrame || !WivraExportBridge.isEditor(view.url)) return@addWebMessageListener
            val req = try { JSONObject(message.data ?: return@addWebMessageListener) } catch (_: Exception) { return@addWebMessageListener }
            val id = req.optInt("id", -1); val name = req.optString("name", ""); val size = req.optLong("size", -1)
            val from = req.optDouble("from", Double.NaN); val to = req.optDouble("to", Double.NaN)
            worker.execute {
                val answer = JSONObject().put("id", id)
                try {
                    val uri = WivraAudioSegments.lookup(name, size) ?: throw IllegalStateException("NOT_GRANTED")
                    require(from.isFinite() && to.isFinite()) { "piece" }
                    val pcm = WivraAudioSegments.extract(activity, uri, from, to)
                    val bytes = java.nio.ByteBuffer.allocate(pcm.size * 2).order(java.nio.ByteOrder.LITTLE_ENDIAN)
                    bytes.asShortBuffer().put(pcm)
                    answer.put("ok", true).put("rate", WivraAudioSegments.RATE).put("b64", Base64.encodeToString(bytes.array(), Base64.NO_WRAP))
                } catch (e: Exception) {
                    answer.put("ok", false).put("error", if (e.message == "NOT_GRANTED") "NOT_GRANTED" else "UNREADABLE")
                }
                activity.runOnUiThread { runCatching { reply.postMessage(answer.toString()) } }
            }
        }
        WebViewCompat.addDocumentStartJavaScript(webView, SCRIPT, setOf("*"))
        return true
    }

    companion object {
        const val JS_OBJECT = "WivraAudioPcmAndroid"
        const val SCRIPT = "if (window.WivraAudioPcmAndroid && !window.WivraAudioPcm) (function () {" +
            " var n = 0, wait = {};" +
            " window.WivraAudioPcmAndroid.onmessage = function (e) { try { var a = JSON.parse(e.data), w = wait[a.id]; if (w) { delete wait[a.id]; w(a); } } catch (x) {} };" +
            " window.WivraAudioPcm = Object.freeze({ extract: function (name, size, from, to) { return new Promise(function (ok) { var id = ++n; wait[id] = ok;" +
            " window.WivraAudioPcmAndroid.postMessage(JSON.stringify({ id: id, name: String(name), size: Number(size), from: Number(from), to: Number(to) })); }); } });" +
            "})();"
    }
}
