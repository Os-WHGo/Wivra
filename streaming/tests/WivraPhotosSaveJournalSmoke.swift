import Foundation

@main
struct WivraPhotosSaveJournalSmoke {
    static func main() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("wivra-photos-journal-\\(UUID().uuidString)", isDirectory: true)
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
        precondition(try await restarted.begin(for: media) == .alreadyConfirmed)

        let interruptedURL = root.appendingPathComponent("interrupted.mov")
        try Data("second export".utf8).write(to: interruptedURL)
        let interrupted = WivraPhotosSaveJournal(fileURL: journalURL)
        guard case .proceed(let interruptedHash) = try await interrupted.begin(for: interruptedURL)
        else { fatalError("new media must reserve intent") }
        // Simulate process death: a new actor sees persisted pending intent.
        let afterCrash = WivraPhotosSaveJournal(fileURL: journalURL)
        precondition(try await afterCrash.begin(for: interruptedURL) == .requiresManualReview)
        try await afterCrash.markUncertain(hash: interruptedHash)
        let afterFailure = WivraPhotosSaveJournal(fileURL: journalURL)
        precondition(try await afterFailure.begin(for: interruptedURL) == .requiresManualReview)

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
