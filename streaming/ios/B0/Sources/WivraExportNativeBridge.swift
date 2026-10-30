// Editor → native progressive export channel for iOS (protocol v1, see
// app/export-sink.mjs). WebKit has no binary message body, so each ~1 s chunk
// arrives as base64; only one chunk is in flight at a time. Storage work runs on
// the WivraExportStore actor, never on the main thread. Only the exact bundled
// editor main frame is served. It can only create NEW Wivra_Export_* files and
// share them through the system sheet; it never reads other media. — Claude
import Foundation
import UIKit
import WebKit

final class WivraExportNativeBridge: NSObject, WKScriptMessageHandlerWithReply {
    weak var webView: WKWebView?

    override init() {
        super.init()
        // `.partial` files from a previous killed session are removed before any new export.
        Task { await WivraExportStore.shared.cleanupOrphans() }
    }

    deinit {
        // Editor closed mid-export: no partial video stays behind.
        Task { await WivraExportStore.shared.abortAll() }
    }

    private struct Request: Sendable {
        let op: String
        let token: Int
        let seq: Int
        let mime: String
        let estimatedBytes: Int64
        let bytes: Int64
        let crc32: UInt32
        let chunks: Int
        let data: Data?
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void
    ) {
        let approved = Bundle.main.url(forResource: "agentcut", withExtension: "html")
        guard message.frameInfo.isMainFrame,
              message.frameInfo.request.url?.isFileURL == true,
              approved?.standardizedFileURL == message.frameInfo.request.url?.standardizedFileURL,
              let body = message.body as? [String: Any],
              body["version"] as? Int == 1,
              let op = body["op"] as? String else {
            replyHandler(nil, "Solicitud no autorizada.")
            return
        }
        let number = { (key: String) -> Int64 in (body[key] as? NSNumber)?.int64Value ?? -1 }
        var data: Data?
        if op == "chunk" {
            guard let b64 = body["b64"] as? String, let decoded = Data(base64Encoded: b64),
                  decoded.count == Int(number("size")) else {
                replyHandler(nil, "Fragmento base64 incompleto.")
                return
            }
            data = decoded
        }
        let request = Request(
            op: op, token: Int(number("token")), seq: Int(number("seq")),
            mime: body["mime"] as? String ?? "", estimatedBytes: number("estimatedBytes"),
            bytes: number("bytes"), crc32: UInt32(truncatingIfNeeded: number("crc32")),
            chunks: Int(number("chunks")), data: data)

        if op == "share" {
            // Capture only the (main-actor, Sendable) web view, never this handler object.
            let view = webView
            Task { @MainActor in
                guard let url = await WivraExportStore.shared.savedURL(token: request.token) else {
                    replyHandler(nil, "Este video ya no está disponible para compartir.")
                    return
                }
                guard let view, Self.presentShare(url, from: view) else {
                    replyHandler(nil, "No se pudo abrir el menú de compartir.")
                    return
                }
                replyHandler(["ok": true], nil)
            }
            return
        }
        Task { @MainActor in
            do {
                let reply = try await Self.perform(request)
                replyHandler(Self.dictionary(reply), nil)
            } catch {
                replyHandler(nil, error.localizedDescription)
            }
        }
    }

    private static func perform(_ request: Request) async throws -> WivraExportReply {
        let store = WivraExportStore.shared
        switch request.op {
        case "hello":
            return WivraExportReply()
        case "begin":
            return try await store.begin(mime: request.mime, estimatedBytes: request.estimatedBytes)
        case "chunk":
            return try await store.append(token: request.token, seq: request.seq, data: request.data ?? Data())
        case "finish":
            return try await store.finish(token: request.token, bytes: request.bytes,
                                          crc32: request.crc32, chunks: request.chunks)
        case "abort":
            await store.abort(token: request.token)
            return WivraExportReply()
        default:
            throw WivraExportError.io("Método no permitido.")
        }
    }

    private static func dictionary(_ reply: WivraExportReply) -> [String: Any] {
        var out: [String: Any] = ["ok": true, "platform": "ios"]
        if let value = reply.token { out["token"] = value }
        if let value = reply.seq { out["seq"] = value }
        if let value = reply.written { out["written"] = value }
        if let value = reply.bytes { out["bytes"] = value }
        if let value = reply.crc32 { out["crc32"] = value }
        if let value = reply.displayName {
            out["displayName"] = value
            out["location"] = "Wivra (usa Compartir para guardarlo en Fotos o Archivos)"
        }
        return out
    }

    @MainActor
    private static func presentShare(_ url: URL, from webView: WKWebView) -> Bool {
        var top = webView.window?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        guard let presenter = top else { return false }
        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        if let popover = sheet.popoverPresentationController {
            popover.sourceView = webView
            popover.sourceRect = CGRect(x: webView.bounds.midX, y: webView.bounds.maxY - 40, width: 1, height: 1)
        }
        presenter.present(sheet, animated: true)
        return true
    }
}
