import Foundation
import Darwin

// Synthetic journal only. No PHPhotoLibrary, permission or device operation.
@main
struct WivraPhotosActiveSaveSmoke {
    static func main() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("wivra-active-photos-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let file = root.appendingPathComponent("sample.mp4")
        try Data("synthetic active Photos transaction".utf8).write(to: file)
        let journalURL = root.appendingPathComponent("journal.json")
        let journal = WivraPhotosSaveJournal(fileURL: journalURL)
        guard case .proceed(let hash) = try await journal.begin(for: file) else {
            fatalError("first transaction must reserve intent")
        }
        // A different screen can call the same actor while Photos awaits a
        // completion callback. Neither manual action may settle/delete intent.
        var blockedAbsent = false
        do { try await journal.authorizeRetryAfterManualAbsence(for: file) }
        catch WivraPhotosSaveJournal.JournalError.invalidResolution { blockedAbsent = true }
        guard blockedAbsent else {
            print("FAIL: manual absence cleared an active Photos reservation")
            exit(1)
        }
        var blockedPresent = false
        do { try await journal.confirmManuallyPresent(for: file) }
        catch WivraPhotosSaveJournal.JournalError.invalidResolution { blockedPresent = true }
        precondition(blockedPresent, "active transaction cannot be manually confirmed")
        let secondAttempt = try await journal.begin(for: file)
        precondition(secondAttempt == .requiresManualReview)
        // A settled uncertain completion can be reviewed manually.
        try await journal.markUncertain(hash: hash)
        try await journal.authorizeRetryAfterManualAbsence(for: file)
        let cleared = try await journal.reviewStatus(for: file)
        precondition(cleared == .noRecord)
        guard case .proceed(let retryHash) = try await journal.begin(for: file) else {
            fatalError("explicit review after settlement must permit a fresh transaction")
        }
        try await journal.markConfirmed(hash: retryHash)
        let confirmed = try await journal.begin(for: file)
        precondition(confirmed == .alreadyConfirmed)
        // A new process has no in-memory active transactions. Existing durable
        // pending intent must still support the established manual recovery.
        let pending = root.appendingPathComponent("cold.mp4")
        try Data("synthetic process interruption".utf8).write(to: pending)
        guard case .proceed = try await journal.begin(for: pending) else {
            fatalError("cold fixture must reserve intent")
        }
        let restarted = WivraPhotosSaveJournal(fileURL: journalURL)
        try await restarted.authorizeRetryAfterManualAbsence(for: pending)
        let coldState = try await restarted.reviewStatus(for: pending)
        precondition(coldState == .noRecord)
        print("PASS: active Photos save blocks cross-screen manual settlement; completion and cold recovery preserved")
    }
}
