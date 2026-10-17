// Wivra unified iOS prototype: render Claude's exact, locally bundled editor
// inside the same native app that holds Ray-Ban/iPhone capture and the catalog.
//
// This is an embedded editor surface, NOT yet a JS<->native media bridge.
// Media access and IndexedDB persistence must be tested on a signed device.
// No navigation to a remote origin, arbitrary script injection, or payments.
import SwiftUI
import WebKit
import UIKit
import UniformTypeIdentifiers

@MainActor
private final class WivraEditorNavigationPolicy: NSObject, WKNavigationDelegate, WKUIDelegate, UIDocumentPickerDelegate {
    private var pendingFileSelection: (@MainActor @Sendable ([URL]?) -> Void)?

    private func finishSelection(_ urls: [URL]?) {
        guard let completion = pendingFileSelection else { return }
        pendingFileSelection = nil
        completion(urls)
    }

    // The editor already imports a manifest + MOV + CAF through its existing
    // input#capFile. Use the native file chooser to provide those exact local
    // file URLs, never clone media bytes into JS or invent a second asset format.
    // The same delegate continues to support the normal system Files picker.
    @available(iOS 18.4, *)
    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping @MainActor @Sendable ([URL]?) -> Void
    ) {
        let approvedEditor = Bundle.main.url(forResource: "agentcut", withExtension: "html")
        guard pendingFileSelection == nil,
              frame.isMainFrame,
              let requestURL = frame.request.url,
              requestURL.isFileURL,
              approvedEditor?.standardizedFileURL == requestURL.standardizedFileURL,
              let presenter = webView.window?.rootViewController else {
            completionHandler(nil)
            return
        }
        pendingFileSelection = completionHandler
        let all = WivraLocalCaptureScanner.read().days.flatMap { $0.captures }
        let ready = all.filter { $0.videoURL != nil }
            .sorted { $0.recordedAt > $1.recordedAt }
        let sheet = UIAlertController(
            title: NSLocalizedString("ios.picker.title", comment: ""),
            message: NSLocalizedString("ios.picker.message", comment: ""),
            preferredStyle: .actionSheet
        )

        // A capture requires a manifest AND a video (and optional CAF tracks),
        // so it is only offered for multi-file input elements.
        if parameters.allowsMultipleSelection {
            for item in ready.prefix(12) {
                let label = "\(item.source) · \(item.recordedAt.formatted(date: .abbreviated, time: .shortened))"
                sheet.addAction(UIAlertAction(title: label, style: .default) { [weak self] _ in
                    guard let video = item.videoURL else {
                        self?.finishSelection(nil)
                        return
                    }
                    let urls = [item.manifestURL, video] +
                        (item.alternateVideoURL.map { [$0] } ?? []) + item.audioURLs
                    self?.finishSelection(urls)
                })
            }
        }
        sheet.addAction(UIAlertAction(title: NSLocalizedString("ios.picker.browse", comment: ""), style: .default) { [weak self] _ in
            guard let self else { return }
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.item], asCopy: false)
            picker.allowsMultipleSelection = parameters.allowsMultipleSelection
            picker.delegate = self
            presenter.present(picker, animated: true)
        })
        sheet.addAction(UIAlertAction(title: NSLocalizedString("ios.picker.cancel", comment: ""), style: .cancel) { [weak self] _ in
            self?.finishSelection(nil)
        })
        if let popover = sheet.popoverPresentationController {
            popover.sourceView = webView
            popover.sourceRect = CGRect(x: webView.bounds.midX, y: 12, width: 1, height: 1)
        }
        presenter.present(sheet, animated: true)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        // Security-scoped file URLs from the document provider must be handled
        // by the system; any inaccessible item is reported by the web editor.
        finishSelection(urls)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        finishSelection(nil)
    }

    // A remote page must never receive the file-origin native message bridge.
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        // Only app-bundled local pages may replace the main editor document.
        if navigationAction.targetFrame?.isMainFrame != false {
            // Never navigate away from the exact shipped Claude editor into a
            // different local file that would inherit the native message handler.
            let approved = Bundle.main.url(forResource: "agentcut", withExtension: "html")
            let isBundledEditor = url.isFileURL &&
                approved?.standardizedFileURL == url.standardizedFileURL
            decisionHandler(isBundledEditor ? .allow : .cancel)
        } else {
            // The offline editor may load local resources, but embedded remote
            // documents must not be able to reach the native file bridge.
            let bundledDirectory = Bundle.main.url(forResource: "agentcut", withExtension: "html")?
                .deletingLastPathComponent().standardizedFileURL
            let localResource = url.isFileURL && bundledDirectory.map { root in
                let file = url.standardizedFileURL
                return file.path.hasPrefix(root.path + "/")
            } == true
            let safeBlankDocument = url.absoluteString == "about:blank"
            decisionHandler(localResource || safeBlankDocument ? .allow : .cancel)
        }
    }
}

private struct WivraEditorWebView: UIViewRepresentable {
    func makeCoordinator() -> WivraEditorNavigationPolicy {
        WivraEditorNavigationPolicy()
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        // Seed only if there is no stored preference. The editor itself owns
        // future language changes; never overwrite its existing selection.
        configuration.userContentController.addUserScript(
            WivraEditorLocaleBootstrap.makeFirstLaunchScript()
        )
        // Main-frame-only, fixed method list. JS gets metadata, never a file URL.
        let script = WKUserScript(source: """
            window.WivraHost = Object.freeze({
              capabilities: () => window.webkit.messageHandlers.wivraNative.postMessage({version: 1, method: 'host.capabilities'}),
              listCaptures: () => window.webkit.messageHandlers.wivraNative.postMessage({version: 1, method: 'library.list'})
            });
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        configuration.userContentController.addUserScript(script)
        configuration.userContentController.addScriptMessageHandler(
            WivraEditorNativeBridge(), contentWorld: .page, name: "wivraNative")
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
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
                        "ios.editor.missing",
                        systemImage: "film",
                        description: Text("ios.editor.missing_description")
                    )
                }
            }
            .navigationTitle("ios.editor.title")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("ios.editor.back") { dismiss() }
                }
            }
        }
    }
}
