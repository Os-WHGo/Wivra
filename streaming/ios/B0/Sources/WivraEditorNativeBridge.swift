// Wivra native -> editor bridge v1 (metadata only).
// Does not grant access to file paths or media bytes; those require a separate
// permission-scoped scheme handler / asset reference contract, not JS injection.
import Foundation
import WebKit

final class WivraEditorNativeBridge: NSObject, WKScriptMessageHandlerWithReply {
    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void
    ) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.request.url?.isFileURL == true,
              let body = message.body as? [String: Any],
              body["version"] as? Int == 1,
              let method = body["method"] as? String else {
            replyHandler(nil, "Solicitud no autorizada.")
            return
        }
        switch method {
        case "host.capabilities":
            replyHandler([
                "version": 1,
                "editor": "embedded_local",
                "capture": "native_available_with_permissions",
                "captureLibrary": "metadata_only",
                "nativeMediaImport": "not_available",
                "live": "not_verified",
                "gps": "not_requested",
                "paidServices": false
            ], nil)
        case "library.list":
            // Scanner already validates manifest v2, safe basenames, duplicates,
            // time metadata and real app-local capture directories.
            let found = WivraLocalCaptureScanner.read()
            let entries: [[String: Any]] = found.days.flatMap { day in
                day.captures.map { item in
                    [
                        "captureId": item.id,
                        "source": item.source,
                        "recordedAt": ISO8601DateFormatter().string(from: item.recordedAt),
                        "videoAvailable": item.videoURL != nil,
                        "audioTracksAvailable": item.audioURLs.count,
                        "missingFileCount": item.missing.count
                    ]
                }
            }
            replyHandler([
                "version": 1, "captures": Array(entries.prefix(100)),
                "truncated": entries.count > 100,
                "rejectedManifests": found.rejected
            ], nil)
        default:
            replyHandler(nil, "Método no permitido.")
        }
    }
}
