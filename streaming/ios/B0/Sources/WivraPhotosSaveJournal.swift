// Durable idempotency journal for explicit add-only Photos saves.
// A pending entry left by process death is deliberately treated as uncertain:
// the app cannot query Photos under add-only permission to prove whether it committed.
import Foundation
import CryptoKit

actor WivraPhotosSaveJournal {
    enum Decision: Equatable {
        case proceed(hash: String)
        case alreadyConfirmed
        case requiresManualReview
    }

    private enum State: String, Codable { case pending, confirmed, uncertain }
    private struct Entry: Codable {
        let hash: String
        let filename: String
        var state: State
        var updatedAt: Date
    }
    private struct Document: Codable {
        let version: Int
        var entries: [String: Entry]
    }

    static let shared = WivraPhotosSaveJournal()
    private let fileURL: URL

    init(fileURL: URL? = nil) {
        if let fileURL {
            self.fileURL = fileURL
        } else {
            let root = FileManager.default.urls(for: .applicationSupportDirectory,
                in: .userDomainMask)[0].appendingPathComponent("Wivra", isDirectory: true)
            self.fileURL = root.appendingPathComponent("PhotosSaveJournal.json")
        }
    }

    /// Writes the pending intent before calling Photos. Existing pending or
    /// uncertain entries are never retried automatically, avoiding duplicates.
    func begin(for url: URL) throws -> Decision {
        guard url.isFileURL else { throw JournalError.invalidFile }
        let hash = try Self.sha256(url)
        var document = try load()
        if let entry = document.entries[hash] {
            return entry.state == .confirmed ? .alreadyConfirmed : .requiresManualReview
        }
        document.entries[hash] = Entry(hash: hash,
            filename: url.lastPathComponent, state: .pending, updatedAt: Date())
        try persist(document)
        return .proceed(hash: hash)
    }

    func markConfirmed(hash: String) throws {
        try update(hash: hash, to: .confirmed)
    }

    func markUncertain(hash: String) throws {
        try update(hash: hash, to: .uncertain)
    }

    private func update(hash: String, to state: State) throws {
        var document = try load()
        guard var entry = document.entries[hash] else { throw JournalError.missingEntry }
        entry.state = state
        entry.updatedAt = Date()
        document.entries[hash] = entry
        try persist(document)
    }

    private func load() throws -> Document {
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            return Document(version: 1, entries: [:])
        }
        do {
            let data = try Data(contentsOf: fileURL)
            let document = try JSONDecoder().decode(Document.self, from: data)
            guard document.version == 1,
                  document.entries.allSatisfy({ key, value in
                      key == value.hash && key.count == 64 &&
                      key.allSatisfy({ $0.isHexDigit })
                  }) else { throw JournalError.corruptJournal }
            return document
        } catch let error as JournalError {
            throw error
        } catch {
            // Never reset a damaged journal: doing so could duplicate a Photos asset.
            throw JournalError.corruptJournal
        }
    }

    private func persist(_ document: Document) throws {
        do {
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            let data = try encoder.encode(document)
            try data.write(to: fileURL, options: .atomic)
            #if os(iOS)
            try? FileManager.default.setAttributes(
                [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                ofItemAtPath: fileURL.path)
            #endif
        } catch {
            throw JournalError.persistenceFailed
        }
    }

    private static func sha256(_ url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var digest = SHA256()
        while let chunk = try handle.read(upToCount: 1024 * 1024), !chunk.isEmpty {
            digest.update(data: chunk)
        }
        return digest.finalize().map { String(format: "%02x", $0) }.joined()
    }

    enum JournalError: LocalizedError {
        case invalidFile, missingEntry, corruptJournal, persistenceFailed
        var errorDescription: String? {
            switch self {
            case .invalidFile: return "El archivo local no es válido para registrar el guardado."
            case .missingEntry: return "No existe una operación de Fotos pendiente para confirmar."
            case .corruptJournal: return "El registro de guardados está dañado. Se bloqueó el reintento para evitar duplicados."
            case .persistenceFailed: return "No se pudo guardar de forma segura el estado de Fotos."
            }
        }
    }
}
