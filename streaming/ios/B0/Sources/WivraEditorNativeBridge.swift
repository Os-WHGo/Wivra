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
        // Only the exact bundled HTML may request capture metadata.
        // A random file:// document is NOT a trusted native bridge client.
        let approved = Bundle.main.url(forResource: "agentcut", withExtension: "html")
        guard message.frameInfo.isMainFrame,
              message.frameInfo.request.url?.isFileURL == true,
              approved?.standardizedFileURL ==
                message.frameInfo.request.url?.standardizedFileURL,
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
                "nativeMediaImport": "file_picker",
                "live": "not_verified",
                "gps": "not_requested",
                "paidServices": false
            ], nil)
        case "capture.verifyFile":
            guard let id = body["sessionId"] as? String,
                  id.range(of: #"^[0-9a-f]{32}$"#, options: .regularExpression) != nil,
                  let name = body["file"] as? String,
                  name.range(of: "^Wivra_Meta_\(id)_part[0-9]{4}\\.mov$", options: .regularExpression) != nil else {
                replyHandler(["verified": false], nil)
                return
            }
            let root = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("WivraRecordings", isDirectory: true)
            let file = root.appendingPathComponent(name)
            Task { @MainActor in
                let valid = await WivraCaptureMediaVerifier.verifyFile(file, in: root)
                replyHandler(["verified": valid], nil)
            }
        case "library.importSelection":
            // A native file picker is the only authorized media handoff. The
            // editor must receive File objects through WebKit's open panel;
            // never expose sandbox paths or copy media bytes into a JS reply.
            guard let captureId = body["captureId"] as? String,
                  !captureId.isEmpty, captureId.count <= 200 else {
                replyHandler(nil, "Identificador de captura inválido.")
                return
            }
            let found = WivraLocalCaptureScanner.read()
            guard let capture = found.days.flatMap({ $0.captures }).first(where: {
                $0.id == captureId && $0.videoURL != nil
            }) else {
                replyHandler(nil, "Captura no disponible.")
                return
            }
            replyHandler([
                "version": 1,
                "captureId": capture.id,
                "readyForPicker": true,
                "fileCount": 2 + capture.audioURLs.count + (capture.alternateVideoURL == nil ? 0 : 1)
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
