import Foundation

@main
struct WivraPhotosSaveJournalSmoke {
    static func main() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("wivra-photos-journal-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let media = root.appendingPathComponent("sample.mp4")
        try Data("synthetic H264/AAC export bytes".utf8).write(to: media)
        let journalURL = root.appendingPathComponent("journal.json")

        let first = WivraPhotosSaveJournal(fileURL: journalURL)
        let decision = try await first.begin(for: media)
        guard case .proceed(let hash) = decision else { fatalError("first save must reserve intent") }
        try await first.markConfirmed(hash: hash)
        let restarted = WivraPhotosSaveJournal(fileURL: journalURL)
        let confirmedAgain = try await restarted.begin(for: media)
        precondition(confirmedAgain == .alreadyConfirmed)

        let interruptedURL = root.appendingPathComponent("interrupted.mov")
        try Data("second export".utf8).write(to: interruptedURL)
        let interrupted = WivraPhotosSaveJournal(fileURL: journalURL)
        guard case .proceed(let interruptedHash) = try await interrupted.begin(for: interruptedURL)
        else { fatalError("new media must reserve intent") }
        // Simulate process death: a new actor sees persisted pending intent.
        let afterCrash = WivraPhotosSaveJournal(fileURL: journalURL)
        let crashDecision = try await afterCrash.begin(for: interruptedURL)
        precondition(crashDecision == .requiresManualReview)
        try await afterCrash.markUncertain(hash: interruptedHash)
        let afterFailure = WivraPhotosSaveJournal(fileURL: journalURL)
        let failureDecision = try await afterFailure.begin(for: interruptedURL)
        precondition(failureDecision == .requiresManualReview)

        // Manual review can settle a confirmed asset or authorize a new
        // transaction only after the user confirms it is absent from Photos.
        let presentURL = root.appendingPathComponent("manual-present.mp4")
        try Data("manually found in Photos".utf8).write(to: presentURL)
        let manualPresent = WivraPhotosSaveJournal(fileURL: journalURL)
        guard case .proceed(let presentHash) = try await manualPresent.begin(for: presentURL)
        else { fatalError("manual-present media must reserve intent") }
        try await manualPresent.markUncertain(hash: presentHash)
        try await manualPresent.confirmManuallyPresent(for: presentURL)
        let presentStatus = try await manualPresent.reviewStatus(for: presentURL)
        precondition(presentStatus == .confirmed)
        let noDuplicate = try await manualPresent.begin(for: presentURL)
        precondition(noDuplicate == .alreadyConfirmed)

        let absentURL = root.appendingPathComponent("manual-absent.mp4")
        try Data("manually confirmed absent in Photos".utf8).write(to: absentURL)
        let manualAbsent = WivraPhotosSaveJournal(fileURL: journalURL)
        guard case .proceed(let absentHash) = try await manualAbsent.begin(for: absentURL)
        else { fatalError("manual-absent media must reserve intent") }
        try await manualAbsent.markUncertain(hash: absentHash)
        try await manualAbsent.authorizeRetryAfterManualAbsence(for: absentURL)
        let retryAllowed = try await manualAbsent.begin(for: absentURL)
        guard case .proceed = retryAllowed else {
            fatalError("explicit absence must allow a new transaction")
        }
        do {
            try await manualAbsent.authorizeRetryAfterManualAbsence(for: presentURL)
            fatalError("confirmed asset must never be cleared for retry")
        } catch WivraPhotosSaveJournal.JournalError.invalidResolution {
            // Expected: confirmed entries cannot be reset by retry resolution.
        }

        // Corruption must fail closed, not silently reset deduplication history.
        try Data("not-json".utf8).write(to: journalURL)
        let corrupted = WivraPhotosSaveJournal(fileURL: journalURL)
        do {
            _ = try await corrupted.begin(for: media)
            fatalError("corrupt journal must block Photos saves")
        } catch WivraPhotosSaveJournal.JournalError.corruptJournal {
            // Expected.
        }
        print("Wivra Photos journal PASS: confirmed idempotency, crash-pending protection, uncertain no-retry, corrupt-journal fail-closed")
    }
}
