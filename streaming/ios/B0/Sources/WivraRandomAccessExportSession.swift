// Wivra P0-W experimental iOS random-write primitive (protocol v2).
// Deliberately separate from WivraExportStore's v1 MediaRecorder writer.
// This stage does NOT register a WebKit handler or publish videos to Photos.
// A later guarded bridge must provide real AVFoundation track inspection.
import Foundation
import CryptoKit
import CoreFoundation

/// Reject NSNumber coercions that blur JSON booleans, strings, and fractions.
enum WivraStrictJSONValue {
    static func integer(_ value: Any?) -> Int64? {
        guard let number = value as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        let type = String(cString: number.objCType)
        guard type != "f" && type != "d" else { return nil }
        let token = number.stringValue
        let bytes = Array(token.utf8)
        guard !bytes.isEmpty else { return nil }
        let start = bytes[0] == 45 ? 1 : 0
        guard start < bytes.count else { return nil }
        if bytes[start] == 48 {
            guard bytes.count == start + 1 else { return nil }
        } else {
            guard bytes[start] >= 49 && bytes[start] <= 57,
                  bytes.dropFirst(start + 1).allSatisfy({ $0 >= 48 && $0 <= 57 })
            else { return nil }
        }
        return Int64(token)
    }
    static func boolean(_ value: Any?) -> Bool? {
        guard let number = value as? NSNumber,
              CFGetTypeID(number) == CFBooleanGetTypeID() else { return nil }
        return number.boolValue
    }
}

actor WivraRandomAccessExportSession {
    static let maxWriteBytes = 1024 * 1024
    static let maxOutputBytes: Int64 = 16 * 1024 * 1024 * 1024

    enum State: Sendable { case open, verifying, sealed, failed, aborted }
    struct Ack: Sendable {
        let seq: Int
        let writtenBytes: Int
        let maxEnd: Int64
    }
    struct Media: Sendable {
        let video: Bool
        let audio: Bool
        let durationMs: Int64
    }
    struct Saved: Sendable {
        let url: URL
        let bytes: Int64
        let sha256: String
        let media: Media
    }
    enum Failure: LocalizedError {
        case invalid(String)
        var errorDescription: String? {
            if case let .invalid(reason) = self { return reason }
            return nil
        }
    }

    private let partial: URL
    private let final: URL
    private let mime: String
    private let reservedBytes: Int64
    private var file: FileHandle?
    private var covered: [Range<Int64>] = []
    private var writeRanges: [Range<Int64>] = []
    private var patchRanges: [Range<Int64>] = []
    private(set) var state: State = .open
    private(set) var maxEnd: Int64 = 0
    private(set) var writes = 0

    init(directory: URL, mime: String,
         reservedBytes: Int64 = WivraRandomAccessExportSession.maxOutputBytes) throws {
        guard mime == "video/mp4" || mime == "video/webm" else {
            throw Failure.invalid("Contenedor aleatorio no admitido.")
        }
        guard (1...Self.maxOutputBytes).contains(reservedBytes) else {
            throw Failure.invalid("Tamaño reservado de salida fuera de límites.")
        }
        self.reservedBytes = reservedBytes
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let ext = mime == "video/mp4" ? "mp4" : "webm"
        let basename = "Wivra_Fast_\(UUID().uuidString).\(ext)"
        self.partial = directory.appendingPathComponent(basename + ".partial")
        self.final = directory.appendingPathComponent(basename)
        self.mime = mime
        guard FileManager.default.createFile(atPath: partial.path, contents: nil) else {
            throw Failure.invalid("No se pudo crear el archivo privado.")
        }
        do {
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var temp = partial
            try? temp.setResourceValues(values)
            self.file = try FileHandle(forWritingTo: partial)
        } catch {
            try? FileManager.default.removeItem(at: partial)
            throw error
        }
    }

    private func markCovered(_ range: Range<Int64>) {
        var all = covered
        all.append(range)
        all.sort { $0.lowerBound < $1.lowerBound }
        var merged: [Range<Int64>] = []
        for current in all {
            if let last = merged.last, current.lowerBound <= last.upperBound {
                merged[merged.count - 1] = last.lowerBound..<max(last.upperBound, current.upperBound)
            } else {
                merged.append(current)
            }
        }
        covered = merged
    }

    private func validateWriteRange(_ range: Range<Int64>) throws {
        let overlaps = writeRanges.filter {
            range.lowerBound < $0.upperBound && range.upperBound > $0.lowerBound
        }
        if overlaps.isEmpty { return }
        let alreadyCovered = covered.contains {
            $0.lowerBound <= range.lowerBound && $0.upperBound >= range.upperBound
        }
        let duplicate = writeRanges.contains { $0 == range }
        let overlapsPriorPatch = patchRanges.contains {
            range.lowerBound < $0.upperBound && range.upperBound > $0.lowerBound
        }
        guard alreadyCovered, !duplicate, !overlapsPriorPatch else {
            throw Failure.invalid("La escritura se solapa con bytes existentes fuera de un parche contenido único.")
        }
        // Container header/index patches are allowed only inside fully written
        // bytes. A second patch cannot rewrite any byte patched previously.
        patchRanges.append(range)
    }

    func writeAt(seq: Int, position: Int64, data: Data) throws -> Ack {
        guard state == .open, seq == writes, seq >= 0,
              !data.isEmpty, data.count <= Self.maxWriteBytes,
              position >= 0, position <= reservedBytes - Int64(data.count),
              let file else {
            throw Failure.invalid("Bloque aleatorio o secuencia inválidos.")
        }
        let end = position + Int64(data.count)
        let range = position..<end
        try validateWriteRange(range)
        do {
            try file.seek(toOffset: UInt64(position))
            try file.write(contentsOf: data)
            writeRanges.append(range)
            markCovered(range)
            maxEnd = max(maxEnd, end)
            writes += 1
            return Ack(seq: seq, writtenBytes: data.count, maxEnd: maxEnd)
        } catch {
            state = .failed
            try? file.close()
            self.file = nil
            try? FileManager.default.removeItem(at: partial)
            throw error
        }
    }

    private static func hash(_ url: URL) throws -> String {
        let input = try FileHandle(forReadingFrom: url)
        defer { try? input.close() }
        var digest = SHA256()
        while let chunk = try input.read(upToCount: 1024 * 1024), !chunk.isEmpty {
            digest.update(data: chunk)
        }
        return digest.finalize().map { String(format: "%02x", $0) }.joined()
    }

    private func validHeader() throws -> Bool {
        let read = try FileHandle(forReadingFrom: partial)
        defer { try? read.close() }
        let header = try read.read(upToCount: 8) ?? Data()
        let bytes = [UInt8](header)
        if mime == "video/mp4" {
            return bytes.count == 8 && Array(bytes[4..<8]) == Array("ftyp".utf8)
        }
        return bytes.count >= 4 && Array(bytes[0..<4]) == [0x1a, 0x45, 0xdf, 0xa3]
    }

    private func fileLength() throws -> Int64 {
        let info = try FileManager.default.attributesOfItem(atPath: partial.path)
        return (info[.size] as? NSNumber)?.int64Value ?? -1
    }

    /// Caller MUST run AVFoundation inspection of real tracks and duration.
    /// Hash both before and after that callback. Never rename a sparse file.
    func finish(expectedBytes: Int64, expectedWrites: Int, expectedDurationMs: Int64,
                expectAudio: Bool, inspect: @Sendable (URL) async throws -> Media?) async throws -> Saved {
        guard state == .open else { throw Failure.invalid("La sesión no está abierta.") }
        state = .verifying
        do {
            guard maxEnd > 0, expectedBytes == maxEnd, expectedWrites == writes,
                  expectedDurationMs > 0, covered.count == 1,
                  covered[0].lowerBound == 0, covered[0].upperBound == maxEnd,
                  let file else {
                throw Failure.invalid("Archivo incompleto: faltan rangos o los totales difieren.")
            }
            try file.synchronize()
            try file.close()
            self.file = nil
            guard try fileLength() == maxEnd, try validHeader() else {
                throw Failure.invalid("Encabezado o tamaño del contenedor inválidos.")
            }
            let originalSHA = try Self.hash(partial)
            guard let media = try await inspect(partial),
                  media.video, media.durationMs > 0,
                  media.audio == expectAudio else {
                throw Failure.invalid("Pistas o duración multimedia no válidas.")
            }
            let tolerance = max(Int64(1500), min(Int64(5000), expectedDurationMs / 100))
            guard abs(media.durationMs - expectedDurationMs) <= tolerance else {
                throw Failure.invalid("La duración final difiere del montaje solicitado.")
            }
            try Task.checkCancellation()
            guard try fileLength() == maxEnd, try Self.hash(partial) == originalSHA else {
                throw Failure.invalid("Los bytes cambiaron durante la inspección.")
            }
            guard !FileManager.default.fileExists(atPath: final.path) else {
                throw Failure.invalid("No se sobrescribirá un archivo existente.")
            }
            try FileManager.default.moveItem(at: partial, to: final)
            state = .sealed
            return Saved(url: final, bytes: maxEnd, sha256: originalSHA, media: media)
        } catch {
            state = .failed
            try? file?.close()
            file = nil
            try? FileManager.default.removeItem(at: partial)
            throw error
        }
    }

    func abort() {
        // A finalization in progress must not race deletion of a verified file.
        if state == .sealed || state == .aborted || state == .verifying { return }
        state = .aborted
        try? file?.close()
        file = nil
        try? FileManager.default.removeItem(at: partial)
    }

    static func cleanupOrphanPartials(directory: URL) throws -> Int {
        guard FileManager.default.fileExists(atPath: directory.path) else { return 0 }
        let files = try FileManager.default.contentsOfDirectory(at: directory,
            includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        var count = 0
        for url in files where url.lastPathComponent.hasPrefix("Wivra_Fast_")
                && url.lastPathComponent.hasSuffix(".partial") {
            let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
            if values.isRegularFile == true && values.isSymbolicLink != true {
                try FileManager.default.removeItem(at: url)
                count += 1
            }
        }
        return count
    }
}
