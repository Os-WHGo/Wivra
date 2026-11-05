// Private, non-secret iPhone LIVE metadata. A recording's microphone choice
// must survive app relaunch so a video-only partial cannot be mislabeled as
// a complete microphone recording. Does not store endpoints or credentials.
import Foundation

enum WivraLiveRecordingReceipt {
    enum AudioExpectation: Equatable, Sendable {
        case required
        case notRequired
        case unknown
    }

    enum ReceiptError: Error {
        case invalidVideoPath
    }

    private struct Record: Codable {
        let schemaVersion: Int
        let audioRequired: Bool
    }

    private static func checkedReceiptURL(for video: URL, in folder: URL) -> URL? {
        let file = video.standardizedFileURL
        let root = folder.standardizedFileURL
        guard file.isFileURL, root.isFileURL,
              file.deletingLastPathComponent() == root,
              file.pathExtension.lowercased() == "mp4",
              UUID(uuidString: file.deletingPathExtension().lastPathComponent) != nil
        else { return nil }
        return file.appendingPathExtension("wivra.live.json")
    }

    /// Write BEFORE starting StreamRecorder, never after publishing RTMP.
    /// A receipt is write-once: a restarted/duplicate start must not downgrade
    /// a previous audio-required intent to video-only. Stage a complete private
    /// file first, then link it to its final name without replacing any existing
    /// receipt. The temporary file and the destination live on the same volume.
    static func stage(audioRequired: Bool, for video: URL, in folder: URL) throws {
        guard let receipt = checkedReceiptURL(for: video, in: folder) else {
            throw ReceiptError.invalidVideoPath
        }
        let bytes = try JSONEncoder().encode(Record(schemaVersion: 1,
                                                    audioRequired: audioRequired))
        let temporary = folder.appendingPathComponent(".wivra-live-\(UUID().uuidString).tmp")
        defer { try? FileManager.default.removeItem(at: temporary) }
        try bytes.write(to: temporary, options: [.atomic])
        #if os(iOS)
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: temporary.path)
        #endif
        // Hard-link creation fails when destination exists (even a symlink).
        // Never use moveItem or atomic rename here: those may replace receipts.
        try FileManager.default.linkItem(at: temporary, to: receipt)
    }

    /// Missing/corrupt/symlinked legacy metadata is UNKNOWN, never a
    /// declaration that microphone audio was absent or properly recorded.
    static func audioExpectation(for video: URL, in folder: URL) -> AudioExpectation {
        guard let receipt = checkedReceiptURL(for: video, in: folder),
              let values = try? receipt.resourceValues(
                forKeys: [.isSymbolicLinkKey, .isRegularFileKey, .fileSizeKey]),
              values.isSymbolicLink == false, values.isRegularFile == true,
              let size = values.fileSize, size > 0, size <= 256,
              let bytes = try? Data(contentsOf: receipt), bytes.count == size,
              let record = try? JSONDecoder().decode(Record.self, from: bytes),
              record.schemaVersion == 1
        else { return .unknown }
        return record.audioRequired ? .required : .notRequired
    }
}
