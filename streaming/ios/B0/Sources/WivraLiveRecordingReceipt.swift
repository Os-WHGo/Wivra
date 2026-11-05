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
    /// An orphan receipt is harmless; the user-owned video is never deleted.
    static func stage(audioRequired: Bool, for video: URL, in folder: URL) throws {
        guard let receipt = checkedReceiptURL(for: video, in: folder) else {
            throw ReceiptError.invalidVideoPath
        }
        let bytes = try JSONEncoder().encode(Record(schemaVersion: 1,
                                                    audioRequired: audioRequired))
        try bytes.write(to: receipt, options: [.atomic])
        #if os(iOS)
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: receipt.path)
        #endif
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
