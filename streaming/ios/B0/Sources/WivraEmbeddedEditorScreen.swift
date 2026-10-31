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

    // SwiftUI can present the editor inside a sheet or navigation container.
    // Present the chooser from the visible controller, not a hidden root.
    private func visiblePresenter(for webView: WKWebView) -> UIViewController? {
        var current = webView.window?.rootViewController
        while let presented = current?.presentedViewController {
            current = presented
        }
        return current
    }

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
              let presenter = visiblePresenter(for: webView) else {
            completionHandler(nil)
            return
        }
        pendingFileSelection = completionHandler
        // WKOpenPanelParameters exposes only multiple/directory switches, NOT
        // the HTML input's accept= types. Both #file and #capFile are multiple.
        // Read one fixed, boolean-only marker from the verified offline editor.
        // Do not inject URLs, script from captures or arbitrary HTML into JS.
        let multiple = parameters.allowsMultipleSelection
        webView.evaluateJavaScript("window.__wivraCaptureInputIntent === true") {
            [weak self, weak webView, weak presenter] result, _ in
            guard let self, let webView, let presenter else {
                self?.finishSelection(nil)
                return
            }
            self.presentFileSelection(in: webView, from: presenter,
                allowsMultiple: multiple,
                offerCaptureBundles: multiple && result as? Bool == true)
        }
    }

    private func presentFileSelection(
        in webView: WKWebView, from presenter: UIViewController,
        allowsMultiple: Bool, offerCaptureBundles: Bool
    ) {
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
        if offerCaptureBundles {
            // Keep the first action sheet compact; recordings are selected in
            // a separate browser. The system Files fallback remains available.
            sheet.addAction(UIAlertAction(title: "Grabaciones de Wivra (\(ready.count))", style: .default) { [weak self, weak presenter] _ in
                guard let self, let presenter else { self?.finishSelection(nil); return }
                let browser = WivraCaptureSearchView(captures: ready) { [weak self] selected in
                    presenter.dismiss(animated: true)
                    guard let selected, let video = selected.videoURL else {
                        self?.finishSelection(nil)
                        return
                    }
                    let urls = [selected.manifestURL, video] +
                        (selected.alternateVideoURL.map { [$0] } ?? []) + selected.audioURLs
                    self?.finishSelection(urls)
                }
                presenter.present(UIHostingController(rootView: browser), animated: true)
            })
        }
        sheet.addAction(UIAlertAction(title: NSLocalizedString("ios.picker.browse", comment: ""), style: .default) { [weak self] _ in
            guard let self else { return }
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.item], asCopy: false)
            picker.allowsMultipleSelection = allowsMultiple
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
                .deletingLastPathComponent().resolvingSymlinksInPath().standardizedFileURL
            let localResource = url.isFileURL && bundledDirectory.map { root in
                let file = url.resolvingSymlinksInPath().standardizedFileURL
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
            // Remember only which trusted local input the user actually used.
            // A label-click is forwarded to the input's own click event.
            window.__wivraCaptureInputIntent = false;
            document.addEventListener('click', (event) => {
              const el = event.target?.closest?.('input[type="file"]');
              window.__wivraCaptureInputIntent = el?.id === 'capFile';
            }, true);
            window.WivraHost = Object.freeze({
              capabilities: () => window.webkit.messageHandlers.wivraNative.postMessage({version: 1, method: 'host.capabilities'}),
              listCaptures: () => window.webkit.messageHandlers.wivraNative.postMessage({version: 1, method: 'library.list'}),
              checkCapture: (captureId) => window.webkit.messageHandlers.wivraNative.postMessage({version: 1, method: 'library.importSelection', captureId})
            });
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        configuration.userContentController.addUserScript(script)
        configuration.userContentController.addScriptMessageHandler(
            WivraEditorNativeBridge(), contentWorld: .page, name: "wivraNative")
        // Progressive export: editor chunks are written to a local file as they are
        // recorded (bounded memory); the verified file is offered via the share sheet.
        let exportBridge = WivraExportNativeBridge()
        configuration.userContentController.addScriptMessageHandler(
            exportBridge, contentWorld: .page, name: "wivraExport")
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        // Export plays hidden <video> elements of the user's own clips programmatically, after
        // async steps (no tap in progress). WKWebView on iPhone requires a gesture for media and
        // plays fullscreen unless inline playback is allowed. Not yet measured on a device.
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        let view = WKWebView(frame: .zero, configuration: configuration)
        exportBridge.webView = view
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

private struct WivraCaptureSearchView: View {
    let captures: [WivraStoredCapture]
    let onSelect: (WivraStoredCapture?) -> Void
    @State private var query = ""

    private var filtered: [WivraStoredCapture] {
        guard !query.isEmpty else { return captures }
        return captures.filter {
            $0.source.localizedCaseInsensitiveContains(query) ||
            $0.id.localizedCaseInsensitiveContains(query) ||
            $0.recordedAt.formatted(date: .abbreviated, time: .shortened)
                .localizedCaseInsensitiveContains(query)
        }
    }

    var body: some View {
        NavigationStack {
            List(filtered) { capture in
                Button {
                    onSelect(capture)
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(capture.source).font(.headline)
                        Text(capture.recordedAt.formatted(date: .abbreviated, time: .shortened))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .searchable(text: $query, prompt: "Buscar grabaciones")
            .navigationTitle("Grabaciones de Wivra")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { onSelect(nil) }
                }
            }
        }
    }
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
