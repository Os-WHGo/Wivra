// macOS AVFoundation integration; synthetic fixture, never physical capture. — ChatGPT
import AVFoundation
import Foundation

@main
struct WivraCaptureVerificationSmoke {
    static func main() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = URL(fileURLWithPath: "app/tests/fixtures/mediarecorder/ffmpeg-h264-aac-fragmented.mp4")
        let original = try Data(contentsOf: fixture)
        let video = root.appendingPathComponent("capture.mov")
        try original.write(to: video)
        let valid = await WivraCaptureMediaVerifier.verifyFile(video, in: root)
        precondition(valid, "real samples and boundary decode must pass")
        let after = try Data(contentsOf: video)
        precondition(after == original)
        let bad = root.appendingPathComponent("broken.mov")
        try original.prefix(80).write(to: bad)
        let invalid = await WivraCaptureMediaVerifier.verifyFile(bad, in: root)
        precondition(!invalid)
        let escaped = await WivraCaptureMediaVerifier.verifyFile(video, in: root.deletingLastPathComponent())
        precondition(!escaped)
        let link = root.appendingPathComponent("link.mov")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: video)
        let linked = await WivraCaptureMediaVerifier.verifyFile(link, in: root)
        precondition(!linked)

        let pendingRoot = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("WivraRecordings")
        try FileManager.default.createDirectory(at: pendingRoot, withIntermediateDirectories: true)
        let goodPart = pendingRoot.appendingPathComponent("Wivra_Meta_\(UUID().uuidString).mov")
        let badPart = pendingRoot.appendingPathComponent("Wivra_Meta_\(UUID().uuidString).mov")
        defer {
            for url in [goodPart, badPart, goodPart.appendingPathExtension("wivra.pending.json")] {
                try? FileManager.default.removeItem(at: url)
            }
        }
        try original.write(to: goodPart)
        try original.prefix(80).write(to: badPart)
        let ticket = try WivraPendingRecordingStore.stage(videoURL: goodPart, related: [badPart])
        do {
            try await WivraPendingRecordingStore.keep(ticket)
            preconditionFailure("must refuse a grouped take with one corrupt segment")
        } catch { }
        precondition(WivraPendingRecordingStore.pending().contains { $0.id == ticket.id })
        precondition(FileManager.default.fileExists(atPath: goodPart.path))
        precondition(FileManager.default.fileExists(atPath: badPart.path))
        try original.write(to: badPart)
        try await WivraPendingRecordingStore.keep(ticket)
        precondition(!WivraPendingRecordingStore.pending().contains { $0.id == ticket.id })
        precondition(FileManager.default.fileExists(atPath: goodPart.path))
        print("Capture verification smoke OK (samples, decode, truncation, scope, symlink, grouped keep/retry; no physical device)")
    }
}
