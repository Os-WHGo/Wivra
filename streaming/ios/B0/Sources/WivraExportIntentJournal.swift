// Native write-ahead journal for accelerated (v2 random-write) exports on iOS.
// Mirror of streaming/android/.../WivraExportIntentJournal.kt. — Claude
//
// One tiny file per native token is armed BEFORE the export session exists and
// removed only when that token's MP4 was sealed and verified, or the session
// was explicitly aborted before finalization. Any other end (app killed,
// WKWebView content process crash, a finish failure, wiped website data) leaves
// the intent behind, so the editor asks for a review of recoverable videos and
// Photos before exporting again. It complements the editor's localStorage
// marker. The file holds no project data, names or paths: only the token.
// Unreadable or unexpected journal content is never treated as a clean exit.
// Limitation: the parent directory is not fsynced, so an intent armed an
// instant before sudden power loss may still be lost.
import Foundation

struct WivraExportIntentJournal: Sendable {
    let directory: URL
    private static let tmpPrefix = ".intent-"

    init(directory: URL) { self.directory = directory }

    private func target(_ token: Int) -> URL {
        directory.appendingPathComponent("intent-\(token)", isDirectory: false)
    }

    /// Parses "intent-<1...10 digits, no leading zero>" into a token.
    static func token(fromName name: String) -> Int? {
        guard name.hasPrefix("intent-") else { return nil }
        let digits = name.dropFirst("intent-".count)
        guard (1...10).contains(digits.count), digits.first != "0",
              digits.allSatisfy({ $0 >= "0" && $0 <= "9" }),
              let value = Int(digits), value > 0, value <= Int(Int32.max) else { return nil }
        return value
    }

    private func isSymlink(_ url: URL) -> Bool {
        (try? FileManager.default.destinationOfSymbolicLink(atPath: url.path)) != nil
    }

    private enum DirectoryState { case absent, directory, unusable }
    private func state() -> DirectoryState {
        if isSymlink(directory) { return .unusable }
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: directory.path, isDirectory: &isDirectory)
        else { return .absent }
        return isDirectory.boolValue ? .directory : .unusable
    }

    /// Durably record that `token` may produce a file. false means: do not start.
    func arm(_ token: Int) -> Bool {
        guard token > 0 else { return false }
        switch state() {
        case .unusable: return false
        case .absent:
            do { try FileManager.default.createDirectory(at: directory,
                    withIntermediateDirectories: true) } catch { return false }
            if state() != .directory { return false }
        case .directory: break
        }
        let tmp = directory.appendingPathComponent("\(Self.tmpPrefix)\(token).tmp")
        guard FileManager.default.createFile(atPath: tmp.path, contents: Data("1".utf8)) else {
            return false
        }
        do {
            let handle = try FileHandle(forWritingTo: tmp)
            try handle.synchronize()
            try handle.close()
        } catch {
            try? FileManager.default.removeItem(at: tmp)
            return false
        }
        // rename(2) atomically replaces the target within one directory.
        guard rename(tmp.path, target(token).path) == 0 else {
            try? FileManager.default.removeItem(at: tmp)
            return false
        }
        return FileManager.default.fileExists(atPath: target(token).path)
    }

    /// Remove `token`'s intent. true when no intent for that token remains.
    func clear(_ token: Int) -> Bool {
        guard token > 0 else { return false }
        let file = target(token)
        guard FileManager.default.fileExists(atPath: file.path) else { return true }
        do { try FileManager.default.removeItem(at: file); return true } catch { return false }
    }

    private func names() -> [String]? {
        try? FileManager.default.contentsOfDirectory(atPath: directory.path)
    }

    /// true when an intent exists that no live session in this process owns,
    /// or when the journal cannot be read. An absent journal is a clean state.
    func interrupted(activeTokens: Set<Int>) -> Bool {
        switch state() {
        case .absent: return false
        case .unusable: return true
        case .directory: break
        }
        guard let names = names() else { return true }
        for name in names {
            // A temp file means arm() never completed: begin refused to start.
            if name.hasPrefix(Self.tmpPrefix) { continue }
            guard let token = Self.token(fromName: name) else { return true }
            if !activeTokens.contains(token) { return true }
        }
        return false
    }

    /// After the person reviewed recovery and Photos: forget every intent no
    /// live session owns. true only when none of them remains.
    func acknowledge(activeTokens: Set<Int>) -> Bool {
        switch state() {
        case .absent: return true
        case .unusable: return false
        case .directory: break
        }
        guard let names = names() else { return false }
        var ok = true
        for name in names {
            if let token = Self.token(fromName: name), activeTokens.contains(token) { continue }
            let url = directory.appendingPathComponent(name)
            var isDirectory: ObjCBool = false
            if FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory),
               isDirectory.boolValue, !isSymlink(url) { ok = false; continue }
            do { try FileManager.default.removeItem(at: url) } catch { ok = false }
        }
        return ok && !interrupted(activeTokens: activeTokens)
    }
}
