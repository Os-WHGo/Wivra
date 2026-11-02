// Initial locale handoff for the bundled Claude editor only.
// It does NOT replace Claude's i18n engine or translate content in the DOM.
import Foundation
import WebKit

enum WivraEditorLocaleBootstrap {
    private static let nativeLanguages: Set<String> = ["es", "en", "fr", "de", "it", "ja"]

    // Use the actual native app localization, not an invented translation or
    // blindly the first OS language when it is unsupported by the native UI.
    static func nativeLanguage(bundle: Bundle = .main) -> String {
        let localized = bundle.preferredLocalizations.first ?? "en"
        let code = localized.replacingOccurrences(of: "_", with: "-")
            .split(separator: "-").first.map(String.init)?.lowercased() ?? "en"
        return nativeLanguages.contains(code) ? code : "en"
    }

    static func makeFirstLaunchScript(bundle: Bundle = .main) -> WKUserScript {
        // nativeLanguage() returns one of six hardcoded ASCII locale codes.
        // It is therefore safe to interpolate in this strictly controlled JS.
        let code = nativeLanguage(bundle: bundle)
        let source = """
        (() => {
          // Do not run on arbitrary file pages or remote origins.
          if (location.protocol !== 'file:' ||
              location.pathname.split('/').pop() !== 'agentcut.html') return;
          try {
            const key = 'wivra.lang';
            // A selection made within Claude's Editor has strict precedence.
            // Even an unknown saved value is never overwritten by native code.
            if (localStorage.getItem(key) !== null) return;
            localStorage.setItem(key, '\(code)');
          } catch (_) {
            // WKWebView file-origin storage may be unavailable on some OS builds:
            // allow the Editor to show its own language selection, not crash.
          }
        })();
        """
        return WKUserScript(source: source,
                            injectionTime: .atDocumentStart,
                            forMainFrameOnly: true)
    }
}
