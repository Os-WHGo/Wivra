// Wivra Gen2 P0: private durable count of expected HEVC MOV checkpoints.
// The receipt proves that stop() reached each writer, not that DAT had no
// dropped frames. Only verified, explicitly kept media may enter Photos.
import Foundation

struct WivraSegmentedTakeReceipt: Codable {
    let schemaVersion: Int
    let sessionID: String
    let expectedParts: Int
    let savedFiles: [String]
    let fullyFinalized: Bool
    let finalizedAtISO8601: String

    private static let sessionPattern = #"^[0-9a-f]{32}$"#
    private static let partPattern = #"^Wivra_Meta_[0-9a-f]{32}_part[0-9]{4}\.mov$"#
    private static let completePattern = #"^Wivra_Meta_[0-9a-f]{32}_complete\.mov$"#

    private static func prefix(of video: URL) -> String? {
        guard video.isFileURL else { return nil }
        let name = video.lastPathComponent
        if name.range(of: partPattern, options: .regularExpression) != nil {
            return String(name.dropLast("_part0001.mov".count))
        }
        if name.range(of: completePattern, options: .regularExpression) != nil {
            return String(name.dropLast("_complete.mov".count))
        }
        return nil
    }

    static func fileURL(for video: URL) -> URL? {
        WivraPendingRecordingStore.completionReceiptURL(for: video)
    }

    /// Called by recorder.stop() after ALL known writer tasks have completed.
    /// An interrupted sequence is recorded as partial and must not be shared
    /// as a complete movie, even if its first MOV plays without error.
    @discardableResult
    static func write(
        sessionID: String, expectedParts: Int, savedFiles: [URL],
        fullyFinalized: Bool
    ) throws -> URL {
        guard sessionID.range(of: sessionPattern, options: .regularExpression) != nil,
              (1...9999).contains(expectedParts),
              let base = savedFiles.first,
              let fileURL = fileURL(for: base) else {
            throw CocoaError(.fileWriteInvalidFileName)
        }
        let prefix = "Wivra_Meta_" + sessionID
        let names = savedFiles.map(\.lastPathComponent)
        let folder = base.deletingLastPathComponent().standardizedFileURL
        guard savedFiles.allSatisfy({
            $0.standardizedFileURL.deletingLastPathComponent() == folder &&
            $0.lastPathComponent.hasPrefix(prefix + "_part") &&
            $0.lastPathComponent.range(of: partPattern,
                                       options: .regularExpression) != nil
        }), Set(names).count == names.count else {
            throw CocoaError(.fileWriteInvalidFileName)
        }
        let record = WivraSegmentedTakeReceipt(
            schemaVersion: 1, sessionID: sessionID,
            expectedParts: expectedParts, savedFiles: names,
            fullyFinalized: fullyFinalized,
            finalizedAtISO8601: ISO8601DateFormatter().string(from: Date())
        )
        try JSONEncoder().encode(record).write(to: fileURL, options: .atomic)
        return fileURL
    }

    /// A missing, malformed or partial receipt means UNKNOWN, not complete.
    /// Verify all original file names and presence, including _part0002+.
    static func verifiedComplete(for video: URL) -> Bool {
        guard let prefix = prefix(of: video),
              let receiptURL = fileURL(for: video),
              let values = try? receiptURL.resourceValues(
                forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey]
              ),
              values.isRegularFile == true,
              values.isSymbolicLink != true,
              let size = values.fileSize, size > 0, size <= 128 * 1024,
              let data = try? Data(contentsOf: receiptURL),
              let receipt = try? JSONDecoder().decode(
                WivraSegmentedTakeReceipt.self, from: data
              ),
              receipt.schemaVersion == 1,
              receipt.fullyFinalized,
              (1...9999).contains(receipt.expectedParts),
              receipt.savedFiles.count == receipt.expectedParts,
              prefix == "Wivra_Meta_" + receipt.sessionID else { return false }

        let folder = video.deletingLastPathComponent().standardizedFileURL
        for (index, name) in receipt.savedFiles.enumerated() {
            guard name == prefix + "_part" + String(format: "%04d", index + 1) + ".mov"
            else { return false }
            let url = folder.appendingPathComponent(name)
            guard let info = try? url.resourceValues(
                forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey]
            ), info.isRegularFile == true, info.isSymbolicLink != true,
               (info.fileSize ?? 0) > 0 else { return false }
        }
        return true
    }
}
