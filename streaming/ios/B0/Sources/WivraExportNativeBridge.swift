// Editor → native progressive export channel for iOS (protocol v1, see
// app/export-sink.mjs). WebKit has no binary message body, so each ~1 s chunk
// arrives as base64; only one chunk is in flight at a time. Storage work runs on
// the WivraExportStore actor, never on the main thread. Only the exact bundled
// editor main frame is served. It can only create NEW Wivra_Export_* files and
// share them through the system sheet; it never reads other media. — Claude
import Foundation
import UIKit
import WebKit
import Photos

final class WivraExportNativeBridge: NSObject, WKScriptMessageHandlerWithReply {
    weak var webView: WKWebView?
    private let owner = UUID().uuidString

    override init() {
        super.init()
        // `.partial` files from a previous killed session are removed before any new export.
        Task { await WivraExportStore.shared.cleanupOrphans() }
    }

    deinit {
        // Another editor may already exist when this handler is released.
        let owner = owner
        Task { await WivraExportStore.shared.abortOwned(owner: owner) }
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

        if op == "savePhotos" {
            let owner = owner
            Task { @MainActor in
                guard let url = await WivraExportStore.shared.savedURL(token: request.token, owner: owner) else {
                    replyHandler(nil, "Este video ya no está disponible para guardar en Fotos.")
                    return
                }
                do {
                    try await WivraPhotosLibrary.saveVideo(url)
                    replyHandler(["ok": true, "savedToPhotos": true], nil)
                } catch {
                    replyHandler(nil, error.localizedDescription)
                }
            }
            return
        }
        if op == "share" {
            // Capture only the (main-actor, Sendable) web view, never this handler object.
            let view = webView
            let owner = owner
            Task { @MainActor in
                guard let url = await WivraExportStore.shared.savedURL(token: request.token, owner: owner) else {
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
        let owner = owner
        Task { @MainActor in
            do {
                let reply = try await Self.perform(request, owner: owner)
                replyHandler(Self.dictionary(reply), nil)
            } catch {
                replyHandler(nil, error.localizedDescription)
            }
        }
    }

    private static func perform(_ request: Request, owner: String) async throws -> WivraExportReply {
        let store = WivraExportStore.shared
        switch request.op {
        case "hello":
            return WivraExportReply()
        case "begin":
            return try await store.begin(mime: request.mime, estimatedBytes: request.estimatedBytes, owner: owner)
        case "chunk":
            return try await store.append(token: request.token, seq: request.seq, data: request.data ?? Data(), owner: owner)
        case "finish":
            return try await store.finish(token: request.token, bytes: request.bytes,
                                          crc32: request.crc32, chunks: request.chunks, owner: owner)
        case "abort":
            await store.abort(token: request.token, owner: owner)
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
            out["location"] = "Wivra (usa Compartir para guardarlo en Archivos u otra app)"
        }
        if let value = reply.recordedBytes { out["recordedBytes"] = value }
        if let value = reply.recordedCrc32 { out["recordedCrc32"] = value }
        if let value = reply.repair { out["repair"] = value }
        if let value = reply.repairNote { out["repairNote"] = value }
        if let m = reply.media {
            out["media"] = ["container": m.container, "durationMs": m.durationMs, "video": m.video, "audio": m.audio,
                            "declaresDuration": m.declaresDuration, "seekIndex": m.seekIndex]
        }
        return out
    }

    @MainActor
    private static func presentShare(_ url: URL, from webView: WKWebView) -> Bool {
        var top = webView.window?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        guard let presenter = top else { return false }
        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        // The owner approved add-only Photos access. The share sheet now offers
        // Save Video alongside Files and other destinations when iOS supports it.
        if let popover = sheet.popoverPresentationController {
            popover.sourceView = webView
            popover.sourceRect = CGRect(x: webView.bounds.midX, y: webView.bounds.maxY - 40, width: 1, height: 1)
        }
        presenter.present(sheet, animated: true)
        return true
    }
}

/// Shared add-only Photos action for both the live editor and recovered exports.
/// It preserves the Wivra copy and never reads the user's photo library.
@MainActor
enum WivraPhotosLibrary {
    /// Add only one video: if an optional muxed output is unreadable, select
    /// the surviving original *before* requesting Photos permission.
    /// Never retry a failed Photos transaction, which might create duplicates.
    /// Returns true only if the original fallback was used.
    static func savePreferredVideo(_ preferred: URL, fallback: URL?) async throws -> Bool {
        guard let fallback,
              fallback.standardizedFileURL != preferred.standardizedFileURL else {
            try await saveVideo(preferred)
            return false
        }
        if let media = await WivraMp4Repair.inspect(preferred),
           media.video && media.durationMs > 0 {
            try await saveVideo(preferred)
            return false
        }
        try await saveVideo(fallback)
        return true
    }

    static func saveVideo(_ url: URL) async throws {
        guard url.isFileURL, ["mp4", "mov"].contains(url.pathExtension.lowercased()) else {
            throw WivraExportError.io("Fotos solo admite videos MP4 o MOV compatibles.")
        }
        // A verified byte stream can still contain a video that Photos cannot decode.
        // Reject before prompting for permission; leave the original local file intact.
        guard let media = await WivraMp4Repair.inspect(url), media.video, media.durationMs > 0 else {
            throw WivraExportError.io("El MP4 no contiene un video reproducible para Fotos.")
        }
        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard status == .authorized || status == .limited else {
            throw WivraExportError.io("Permiso para añadir videos a Fotos denegado.")
        }
        let journal = WivraPhotosSaveJournal.shared
        let decision = try await journal.begin(for: url)
        let hash: String
        switch decision {
        case .alreadyConfirmed:
            // Idempotent success: the same bytes were previously confirmed.
            return
        case .requiresManualReview:
            throw WivraExportError.io("El resultado de un guardado anterior puede ser incierto. Revisa Fotos manualmente; Wivra no repetirá la operación para evitar duplicados.")
        case .proceed(let reservedHash):
            hash = reservedHash
        }
        do {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                PHPhotoLibrary.shared().performChanges({
                    PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
                }, completionHandler: { success, error in
                    if success { continuation.resume() }
                    else { continuation.resume(throwing: error ?? WivraExportError.io("Fotos no pudo guardar el video.")) }
                })
            }
            // If this durable confirmation fails after Photos accepted the asset,
            // the pending record remains and blocks a duplicate retry after restart.
            try await journal.markConfirmed(hash: hash)
        } catch {
            try? await journal.markUncertain(hash: hash)
            throw error
        }
    }

}
