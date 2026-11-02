// Separate WKScriptMessageHandlerWithReply for Wivra experimental protocol v2.
// It never touches the v1 MediaRecorder handler and accepts ONLY the bundled
// offline Editor's MAIN frame. No untrusted file URLs or arbitrary file reads.
import Foundation
import UIKit
import WebKit

final class WivraAcceleratedExportNativeBridge: NSObject, WKScriptMessageHandlerWithReply {
    weak var webView: WKWebView?
    private let owner = UUID().uuidString
    private let maxBase64Chars = 1_400_000

    override init() {
        super.init()
        Task { try? await WivraAcceleratedExportStore.shared.cleanupOrphans() }
    }

    deinit {
        let owner = owner
        Task { await WivraAcceleratedExportStore.shared.abortOwned(owner: owner) }
    }

    private struct Request: Sendable {
        let op: String
        let token: Int
        let seq: Int
        let position: Int64
        let bytes: Int64
        let writes: Int
        let expectedDurationMs: Int64
        let expectAudio: Bool
        let mime: String
        let estimatedBytes: Int64
        let data: Data?
    }

    func userContentController(_ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void
    ) {
        let approved = Bundle.main.url(forResource: "agentcut", withExtension: "html")
        guard message.frameInfo.isMainFrame,
              message.frameInfo.request.url?.isFileURL == true,
              approved?.standardizedFileURL == message.frameInfo.request.url?.standardizedFileURL,
              let body = message.body as? [String: Any],
              body["version"] as? Int == 2,
              body["protocol"] as? Int == 2,
              let op = body["op"] as? String else {
            replyHandler(nil, "Petición acelerada no autorizada.")
            return
        }
        func number(_ key: String) -> Int64 {
            (body[key] as? NSNumber)?.int64Value ?? -1
        }
        let token = number("token"), seq = number("seq"), position = number("position")
        let writes = number("writes")
        let data: Data?
        if op == "writeAt" {
            guard number("size") > 0,
                  number("size") <= Int64(WivraRandomAccessExportSession.maxWriteBytes),
                  let encoded = body["b64"] as? String,
                  encoded.utf8.count <= maxBase64Chars,
                  let decoded = Data(base64Encoded: encoded),
                  decoded.count == Int(number("size")) else {
                replyHandler(nil, "Bloque aleatorio inválido o demasiado grande.")
                return
            }
            data = decoded
        } else { data = nil }
        // Keep each token/sequence within Int32 so no NSNumber->Int overflow
        // can create a different addressable export on either platform.
        let request = Request(op: op, token: token > 0 && token < Int64(Int32.max) ? Int(token) : -1,
            seq: seq >= 0 && seq < Int64(Int32.max) ? Int(seq) : -1,
            position: position, bytes: number("bytes"),
            writes: writes >= 0 && writes < Int64(Int32.max) ? Int(writes) : -1,
            expectedDurationMs: number("expectedDurationMs"),
            expectAudio: body["expectAudio"] as? Bool ?? false,
            mime: body["mime"] as? String ?? "",
            estimatedBytes: number("estimatedBytes"), data: data)
        let owner = owner
        let view = webView
        Task { @MainActor in
            do {
                let store = WivraAcceleratedExportStore.shared
                switch request.op {
                case "helloRandom":
                    replyHandler(["ok": true, "protocol": 2, "randomWrite": true,
                                  "platform": "ios", "maxWriteBytes":
                                      WivraRandomAccessExportSession.maxWriteBytes], nil)
                case "beginRandom":
                    let value = try await store.begin(mime: request.mime,
                        estimatedBytes: request.estimatedBytes, owner: owner)
                    replyHandler(["ok": true, "token": value], nil)
                case "writeAt":
                    guard let data = request.data else {
                        throw WivraExportError.io("Faltan bytes de escritura.")
                    }
                    let ack = try await store.writeAt(token: request.token,
                        seq: request.seq, position: request.position,
                        data: data, owner: owner)
                    replyHandler(["ok": true, "seq": ack.seq,
                                  "writtenBytes": ack.writtenBytes, "maxEnd": ack.maxEnd], nil)
                case "finishRandom":
                    let saved = try await store.finish(token: request.token,
                        expectedBytes: request.bytes, writes: request.writes,
                        expectedDurationMs: request.expectedDurationMs,
                        expectAudio: request.expectAudio, owner: owner)
                    replyHandler(["ok": true, "verified": true, "bytes": saved.bytes,
                                  "sha256": saved.sha256, "platform": "ios",
                                  "displayName": saved.url.lastPathComponent,
                                  "location": "Wivra (archivo privado recuperable)",
                                  "media": ["video": saved.media.video,
                                            "audio": saved.media.audio,
                                            "durationMs": saved.media.durationMs]], nil)
                case "abortRandom":
                    await store.abort(token: request.token, owner: owner)
                    replyHandler(["ok": true], nil)
                case "savePhotos":
                    guard let saved = await store.saved(token: request.token, owner: owner) else {
                        throw WivraExportError.unknownSession
                    }
                    try await WivraPhotosLibrary.saveVideo(saved.url)
                    replyHandler(["ok": true, "savedToPhotos": true], nil)
                case "share":
                    guard let saved = await store.saved(token: request.token, owner: owner),
                          let view, Self.presentShare(saved.url, from: view) else {
                        throw WivraExportError.unknownSession
                    }
                    replyHandler(["ok": true], nil)
                default:
                    throw WivraExportError.io("Operación aleatoria no permitida.")
                }
            } catch {
                replyHandler(nil, error.localizedDescription)
            }
        }
    }

    @MainActor
    private static func presentShare(_ url: URL, from view: WKWebView) -> Bool {
        var controller = view.window?.rootViewController
        while let presented = controller?.presentedViewController { controller = presented }
        guard let controller else { return false }
        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        if let popover = sheet.popoverPresentationController {
            popover.sourceView = view
            popover.sourceRect = CGRect(x: view.bounds.midX,
                                        y: view.bounds.maxY - 40, width: 1, height: 1)
        }
        controller.present(sheet, animated: true)
        return true
    }
}
