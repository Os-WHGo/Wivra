// Swift 6 smoke for the iOS accelerated export intent journal (Foundation only;
// runs with swiftc on macOS and Linux). Same cases as the Kotlin JUnit test. — Claude
import Foundation

@main
struct WivraExportIntentJournalSmoke {
    final class Counter: @unchecked Sendable { var failures = 0 }
    static let counter = Counter()
    static func check(_ condition: Bool, _ label: String) {
        if condition { print("ok - \(label)") } else { counter.failures += 1; print("FAIL - \(label)") }
    }
    static func tempDir() -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("wivra-intent-\(UUID().uuidString)", isDirectory: true)
        try! FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
    static func list(_ url: URL) -> [String] {
        ((try? FileManager.default.contentsOfDirectory(atPath: url.path)) ?? []).sorted()
    }

    static func main() {
        // Absent journal is clean; an armed intent survives a new instance.
        do {
            let root = tempDir(), dir = root.appendingPathComponent("intents")
            check(!WivraExportIntentJournal(directory: dir).interrupted(activeTokens: []), "absent journal is clean")
            check(WivraExportIntentJournal(directory: dir).arm(42), "arm creates the journal")
            check(!WivraExportIntentJournal(directory: dir).interrupted(activeTokens: [42]), "live session is not interrupted")
            check(WivraExportIntentJournal(directory: dir).interrupted(activeTokens: []), "new process sees the interruption")
            check(list(dir) == ["intent-42"], "only the token is stored")
            try? FileManager.default.removeItem(at: root)
        }
        // Clear after seal or abort.
        do {
            let dir = tempDir(), j = WivraExportIntentJournal(directory: dir)
            check(j.arm(7) && j.arm(8), "two intents")
            check(j.clear(7) && j.interrupted(activeTokens: []), "one cleared, one remains")
            check(j.clear(8) && j.clear(8) && !j.interrupted(activeTokens: []), "clear is idempotent and leaves clean")
            check(!j.arm(0) && !j.clear(-1), "invalid tokens rejected")
            try? FileManager.default.removeItem(at: dir)
        }
        // Unexpected or unreadable content is never clean.
        do {
            let dir = tempDir()
            _ = FileManager.default.createFile(atPath: dir.appendingPathComponent("intent-notanumber").path, contents: Data("x".utf8))
            check(WivraExportIntentJournal(directory: dir).interrupted(activeTokens: []), "malformed name is interrupted")
            try? FileManager.default.removeItem(at: dir.appendingPathComponent("intent-notanumber"))
            _ = FileManager.default.createFile(atPath: dir.appendingPathComponent("intent-99999999999").path, contents: Data("x".utf8))
            check(WivraExportIntentJournal(directory: dir).interrupted(activeTokens: []), "out-of-range token is interrupted")
            try? FileManager.default.removeItem(at: dir)
            let file = FileManager.default.temporaryDirectory.appendingPathComponent("wivra-intent-\(UUID().uuidString).file")
            _ = FileManager.default.createFile(atPath: file.path, contents: Data())
            let j = WivraExportIntentJournal(directory: file)
            check(j.interrupted(activeTokens: []) && !j.arm(3) && !j.acknowledge(activeTokens: []), "a file in place of the journal is unusable")
            try? FileManager.default.removeItem(at: file)
        }
        // Incomplete arm temp file is ignored; acknowledge removes it.
        do {
            let dir = tempDir()
            _ = FileManager.default.createFile(atPath: dir.appendingPathComponent(".intent-5.tmp").path, contents: Data("1".utf8))
            check(!WivraExportIntentJournal(directory: dir).interrupted(activeTokens: []), "temp file is not an interruption")
            check(WivraExportIntentJournal(directory: dir).acknowledge(activeTokens: []) && list(dir).isEmpty, "acknowledge removes temp file")
            try? FileManager.default.removeItem(at: dir)
        }
        // Acknowledge keeps live sessions.
        do {
            let dir = tempDir(), j = WivraExportIntentJournal(directory: dir)
            check(j.arm(1) && j.arm(2), "two intents for acknowledge")
            _ = FileManager.default.createFile(atPath: dir.appendingPathComponent("intent-garbage").path, contents: Data("x".utf8))
            check(j.acknowledge(activeTokens: [2]) && list(dir) == ["intent-2"], "acknowledge keeps the live token only")
            check(!j.interrupted(activeTokens: [2]) && j.interrupted(activeTokens: []), "live token still protected")
            try? FileManager.default.removeItem(at: dir)
        }
        // Symlinked journal directory is rejected.
        do {
            let root = tempDir(), real = root.appendingPathComponent("real"), link = root.appendingPathComponent("link")
            try! FileManager.default.createDirectory(at: real, withIntermediateDirectories: true)
            try! FileManager.default.createSymbolicLink(at: link, withDestinationURL: real)
            let j = WivraExportIntentJournal(directory: link)
            check(!j.arm(9) && j.interrupted(activeTokens: []) && list(real).isEmpty, "symlinked journal rejected")
            try? FileManager.default.removeItem(at: root)
        }
        // Parser.
        check(WivraExportIntentJournal.token(fromName: "intent-2147483647") == 2147483647, "max token parses")
        check(WivraExportIntentJournal.token(fromName: "intent-01") == nil &&
              WivraExportIntentJournal.token(fromName: "intent-") == nil &&
              WivraExportIntentJournal.token(fromName: "intent-2147483648") == nil, "invalid names rejected")
        if counter.failures > 0 { print("\(counter.failures) intent journal checks FAILED"); exit(1) }
        print("all intent journal checks passed (iPhone code)")
    }
}
