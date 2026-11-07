package com.oswhgo.wivra

import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/**
 * W81 (Claude): the editor's home (W79) has Capturar and LIVE cards. They can
 * only ask to OPEN the existing native source choosers; nothing is captured,
 * streamed or granted here. Fixed words only, main frame of the bundled editor.
 */
class WivraHomeBridge(private val webView: WebView, private val opener: Opener) {
    fun interface Opener { fun open(what: String) }

    fun install(): Boolean {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) ||
            !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return false
        WebViewCompat.addWebMessageListener(webView, JS_OBJECT, setOf("*")) { view, message, _, isMainFrame, _ ->
            if (!isMainFrame || !WivraExportBridge.isEditor(view.url)) return@addWebMessageListener
            val what = message.data ?: return@addWebMessageListener
            if (what == "capture" || what == "live") opener.open(what)
        }
        WebViewCompat.addDocumentStartJavaScript(webView, SCRIPT, setOf("*"))
        return true
    }

    companion object {
        const val JS_OBJECT = "WivraHomeAndroid"
        // Separate name from iOS's WivraHost so no code mistakes Android for iOS.
        const val SCRIPT = "if (window.WivraHomeAndroid && !window.WivraNativeHome) " +
            "window.WivraNativeHome = Object.freeze({ openNative: (what) => " +
            "window.WivraHomeAndroid.postMessage(String(what)) });"
    }
}
