// Wivra unified iOS prototype: render Claude's exact, locally bundled editor
// inside the same native app that holds Ray-Ban/iPhone capture and the catalog.
//
// This is an embedded editor surface, NOT yet a JS<->native media bridge.
// Media access and IndexedDB persistence must be tested on a signed device.
// No navigation to a remote origin, arbitrary script injection, or payments.
import SwiftUI
import WebKit

private struct WivraEditorWebView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.isOpaque = false
        view.backgroundColor = .black
        view.scrollView.contentInsetAdjustmentBehavior = .never

        // Deliberately use the bundled HTML file, not a public URL, remote
        // webpage or open-ended local filesystem directory.
        if let html = Bundle.main.url(forResource: "agentcut", withExtension: "html") {
            view.loadFileURL(html, allowingReadAccessTo: html.deletingLastPathComponent())
        }
        return view
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}
}

struct WivraEmbeddedEditorScreen: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if Bundle.main.url(forResource: "agentcut", withExtension: "html") != nil {
                    WivraEditorWebView()
                        .ignoresSafeArea(edges: .bottom)
                        .accessibilityIdentifier("wivra_unified_embedded_editor")
                } else {
                    ContentUnavailableView(
                        "Editor no incluido",
                        systemImage: "film",
                        description: Text("Falta app/dist/agentcut.html en los recursos del binario.")
                    )
                }
            }
            .navigationTitle("Wivra Editor")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Volver a cámara") { dismiss() }
                }
            }
        }
    }
}
