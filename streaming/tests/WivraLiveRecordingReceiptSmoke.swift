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

        precondition(expectation(video) == .unknown)
        try WivraLiveRecordingReceipt.stage(audioRequired: true, for: video, in: root)
        precondition(expectation(video) == .required)
        precondition(expectation(other) == .unknown)

        try WivraLiveRecordingReceipt.stage(audioRequired: false, for: video, in: root)
        precondition(expectation(video) == .notRequired)
        try Data("corrupt".utf8).write(to: receipt, options: [.atomic])
        precondition(expectation(video) == .unknown)

        try WivraLiveRecordingReceipt.stage(audioRequired: true, for: video, in: root)
        let original = try Data(contentsOf: receipt)
        try Data(repeating: 65, count: 512).write(to: receipt, options: [.atomic])
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

        // A replaced metadata symlink must not make the recovery scan accept
        // arbitrary data or follow a file outside the local recording folder.
        try FileManager.default.removeItem(at: receipt)
        let target = root.appendingPathComponent("outside-metadata.json")
        try original.write(to: target)
        try FileManager.default.createSymbolicLink(at: receipt, withDestinationURL: target)
        precondition(expectation(video) == .unknown)

        print("Wivra LIVE audio receipt PASS: opt-in preserved, legacy unknown, corrupt/oversized/symlink and path guards")
    }
}
