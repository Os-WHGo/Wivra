package com.oswhgo.wivra

import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

/** Read-only host.verifyFile channel. Only exact session-owned checkpoint names;
 * never accepts paths, URIs, arbitrary files, camera commands or permissions. — ChatGPT */
class WivraCaptureVerificationBridge(private val webView: WebView) {
    private val context = webView.context.applicationContext
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var disposed = false

    fun install() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        WebViewCompat.addWebMessageListener(webView, "WivraCaptureNative", setOf("*")) { view, message, _, isMainFrame, reply ->
            if (disposed || !isMainFrame || view.url != WivraExportBridge.EDITOR_URL) return@addWebMessageListener
            val data = runCatching { JSONObject(message.data ?: "") }.getOrNull() ?: return@addWebMessageListener
            val rid = data.optLong("rid", -1)
            if (rid < 0 || data.optInt("v") != 1 || data.optString("op") != "verifyFile") return@addWebMessageListener
            val id = data.optString("id")
            val name = data.optString("file")
            val scoped = id.matches(Regex("[0-9a-f]{32}")) &&
                name.matches(Regex("wivra_rayban_${id}_part[0-9]{4}\\.mp4"))
            io.execute {
                val valid = scoped && !disposed && runCatching {
                    val root = File(context.filesDir, "wivra_pending_videos")
                    WivraCaptureMediaVerifier.verifyFile(File(root, name), root, requireHevc = true).valid
                }.getOrDefault(false)
                main.post {
                    if (!disposed && webView.url == WivraExportBridge.EDITOR_URL) {
                        runCatching { reply.postMessage(JSONObject().put("rid", rid).put("verified", valid).toString()) }
                    }
                }
            }
        }
    }

    fun dispose() {
        disposed = true
        io.shutdownNow()
    }
}
