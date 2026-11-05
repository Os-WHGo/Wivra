// Synthetic Foundation-only Wivra LIVE audio receipt smoke. No camera,
// RTMP, Photos access or file deletion outside this test's temporary folder.
import Foundation

@main
struct WivraLiveRecordingReceiptSmoke {
    static func main() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let video = root.appendingPathComponent(UUID().uuidString).appendingPathExtension("mp4")
        let other = root.appendingPathComponent(UUID().uuidString).appendingPathExtension("mp4")
        let receipt = video.appendingPathExtension("wivra.live.json")
        func expectation(_ video: URL) -> WivraLiveRecordingReceipt.AudioExpectation {
            WivraLiveRecordingReceipt.audioExpectation(for: video, in: root)
        }

        func expectStageBlocked(_ audioRequired: Bool, _ video: URL) {
            do {
                try WivraLiveRecordingReceipt.stage(audioRequired: audioRequired, for: video, in: root)
                preconditionFailure("staging must not replace an existing receipt")
            } catch { }
        }

        precondition(expectation(video) == .unknown)
        try WivraLiveRecordingReceipt.stage(audioRequired: true, for: video, in: root)
        precondition(expectation(video) == .required)
        precondition(expectation(other) == .unknown)

        expectStageBlocked(false, video)  // No downgrade to video-only.
        expectStageBlocked(true, video)   // No replacement even with same intent.
        precondition(expectation(video) == .required)
        try WivraLiveRecordingReceipt.stage(audioRequired: false, for: other, in: root)
        precondition(expectation(other) == .notRequired)

        let original = try Data(contentsOf: receipt)
        try Data("corrupt".utf8).write(to: receipt, options: [.atomic])
        precondition(expectation(video) == .unknown)
        expectStageBlocked(false, video)
        precondition(expectation(video) == .unknown)

        try Data(repeating: 65, count: 512).write(to: receipt, options: [.atomic])
        precondition(expectation(video) == .unknown)
        expectStageBlocked(true, video)
        precondition(expectation(video) == .unknown)
        try original.write(to: receipt, options: [.atomic])
        precondition(expectation(video) == .required)

        let outside = root.deletingLastPathComponent()
            .appendingPathComponent(UUID().uuidString).appendingPathExtension("mp4")
        do {
            try WivraLiveRecordingReceipt.stage(audioRequired: false, for: outside, in: root)
            preconditionFailure("receipt must reject out-of-root paths")
        } catch WivraLiveRecordingReceipt.ReceiptError.invalidVideoPath { }

        let badName = root.appendingPathComponent("not-a-uuid.mp4")
        do {
            try WivraLiveRecordingReceipt.stage(audioRequired: true, for: badName, in: root)
            preconditionFailure("receipt must reject unexpected video filename")
        } catch WivraLiveRecordingReceipt.ReceiptError.invalidVideoPath { }

        // A replaced metadata symlink must not be followed or replaced.
        try FileManager.default.removeItem(at: receipt)
        let target = root.appendingPathComponent("outside-metadata.json")
        try original.write(to: target)
        try FileManager.default.createSymbolicLink(at: receipt, withDestinationURL: target)
        precondition(expectation(video) == .unknown)
        expectStageBlocked(false, video)
        let targetBytes = try Data(contentsOf: target)
        precondition(targetBytes == original)
        precondition(expectation(video) == .unknown)

        let leakedTemps = try FileManager.default.contentsOfDirectory(atPath: root.path)
            .filter { $0.hasPrefix(".wivra-live-") }
        precondition(leakedTemps.isEmpty)

        print("Wivra LIVE receipt PASS: write-once audio intent, no downgrade, corrupt/oversized/symlink fail-closed, temp cleanup")
    }
}
