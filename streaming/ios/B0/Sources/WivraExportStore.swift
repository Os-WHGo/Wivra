// Wivra progressive export, iOS storage side (Foundation + AVFoundation via WivraMp4Repair;
// also compiled and exercised on macOS CI by streaming/tests/WivraExportStoreSmoke.swift).
//
// The editor sends MediaRecorder chunks (~1 s) in order; each is appended to a
// `.partial` file in Application Support and released. finish() checks the
// editor's byte/chunk/CRC-32 totals and the container header, syncs, re-reads the
// file from disk, and only then renames it to its final name. Every failure,
// cancel, editor close or app relaunch deletes `.partial` files. — Claude
import Foundation

struct WivraExportReply: Sendable {
    var token: Int?
    var seq: Int?
    var written: Int64?
    var bytes: Int64?
    var crc32: UInt32?
    var displayName: String?
    // Verified recording vs delivered file: they differ when the container was repaired.
    var recordedBytes: Int64?
    var recordedCrc32: UInt32?
    var repair: String?
    var repairNote: String?
    var media: WivraMp4Repair.Media?
}

enum WivraExportError: LocalizedError {
    case insufficientStorage(free: Int64, needed: Int64)
    case unknownSession
    case integrity(String)
    case io(String)

    var errorDescription: String? {
        switch self {
        case let .insufficientStorage(free, needed):
            return "Espacio insuficiente: hay \(free / 1_000_000) MB libres y hacen falta unos \(needed / 1_000_000) MB."
        case .unknownSession: return "Sesión de exportación desconocida."
        case let .integrity(text): return text
        case let .io(text): return text
        }
    }
}

enum WivraCRC32 {
    static let table: [UInt32] = (0..<256).map { n -> UInt32 in
        var c = UInt32(n)
        for _ in 0..<8 { c = (c & 1) != 0 ? 0xEDB8_8320 ^ (c >> 1) : c >> 1 }
        return c
    }

    /// Incremental CRC-32 IEEE, identical to zlib / java.util.zip.CRC32 / app/export-sink.mjs.
    static func update(_ crc: UInt32, _ data: Data) -> UInt32 {
        var c = crc ^ 0xFFFF_FFFF
        data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
            for byte in raw { c = table[Int((c ^ UInt32(byte)) & 0xFF)] ^ (c >> 8) }
        }
        return c ^ 0xFFFF_FFFF
    }
}

actor WivraExportStore {
    static let shared = WivraExportStore()
    static let minimumFreeBytes: Int64 = 200 * 1024 * 1024
    static let maximumChunkBytes = 32 * 1024 * 1024

    private struct Session {
        let handle: FileHandle
        let partialURL: URL
        let finalURL: URL
        let mime: String
        var seq = 0
        var bytes: Int64 = 0
        var crc: UInt32 = 0
        var head = Data()
    }

    private let directory: URL
    private let freeBytes: @Sendable (URL) -> Int64
    private var sessions: [Int: Session] = [:]
    private var finished: [Int: URL] = [:]

    init(directory: URL? = nil, freeBytes: (@Sendable (URL) -> Int64)? = nil) {
        self.directory = directory ?? FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("WivraExports", isDirectory: true)
        self.freeBytes = freeBytes ?? { url in
            let values = try? url.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
            return values?.volumeAvailableCapacityForImportantUsage ?? 0
        }
    }

    static func normalizedMime(_ mime: String) -> String {
        mime.lowercased().hasPrefix("video/mp4") ? "video/mp4" : "video/webm"
    }

    static func looksLikeContainer(mime: String, head: Data) -> Bool {
        let bytes = [UInt8](head.prefix(8))
        if normalizedMime(mime) == "video/mp4" {
            return bytes.count >= 8 && Array(bytes[4..<8]) == Array("ftyp".utf8)
        }
        return bytes.count >= 4 && Array(bytes[0..<4]) == [0x1A, 0x45, 0xDF, 0xA3]
    }

    private func prepareDirectory() throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    func begin(mime rawMime: String, estimatedBytes: Int64) throws -> WivraExportReply {
        try prepareDirectory()
        let free = freeBytes(directory)
        let needed = max(0, estimatedBytes) + Self.minimumFreeBytes
        guard free >= needed else { throw WivraExportError.insufficientStorage(free: free, needed: needed) }
        let mime = Self.normalizedMime(rawMime)
        var token = 0
        repeat { token = Int.random(in: 1..<Int(Int32.max)) } while sessions[token] != nil || finished[token] != nil
        let stamp = Int(Date().timeIntervalSince1970 * 1000)
        let name = "Wivra_Export_\(stamp)_\(String(token, radix: 16)).\(mime == "video/mp4" ? "mp4" : "webm")"
        let finalURL = directory.appendingPathComponent(name)
        var partialURL = directory.appendingPathComponent(name + ".partial")
        guard FileManager.default.createFile(atPath: partialURL.path, contents: nil) else {
            throw WivraExportError.io("No se pudo crear el archivo del video.")
        }
        var noBackup = URLResourceValues()
        noBackup.isExcludedFromBackup = true
        try? partialURL.setResourceValues(noBackup)
        let handle = try FileHandle(forWritingTo: partialURL)
        sessions[token] = Session(handle: handle, partialURL: partialURL, finalURL: finalURL, mime: mime)
        return WivraExportReply(token: token, displayName: name)
    }

    func append(token: Int, seq: Int, data: Data) throws -> WivraExportReply {
        guard var session = sessions[token] else { throw WivraExportError.unknownSession }
        do {
            guard seq == session.seq else {
                throw WivraExportError.integrity("Fragmento fuera de orden: llegó \(seq), se esperaba \(session.seq).")
            }
            guard !data.isEmpty, data.count <= Self.maximumChunkBytes else {
                throw WivraExportError.integrity("Tamaño de fragmento inválido: \(data.count) bytes.")
            }
            if session.bytes / (16 * 1024 * 1024) != (session.bytes + Int64(data.count)) / (16 * 1024 * 1024),
               freeBytes(directory) < Self.minimumFreeBytes / 2 {
                throw WivraExportError.insufficientStorage(free: freeBytes(directory), needed: Self.minimumFreeBytes)
            }
            try session.handle.write(contentsOf: data)
            session.crc = WivraCRC32.update(session.crc, data)
            if session.head.count < 16 { session.head.append(data.prefix(16 - session.head.count)) }
            session.bytes += Int64(data.count)
            session.seq += 1
            sessions[token] = session
            return WivraExportReply(seq: seq, written: session.bytes)
        } catch {
            abort(token: token)
            throw error
        }
    }

    func finish(token: Int, bytes: Int64, crc32: UInt32, chunks: Int, repair: Bool = true) async throws -> WivraExportReply {
        guard let session = sessions.removeValue(forKey: token) else { throw WivraExportError.unknownSession }
        let diskBytes: Int64, diskCrc: UInt32
        do {
            guard session.seq > 0, session.bytes == bytes, session.seq == chunks, session.crc == crc32 else {
                throw WivraExportError.integrity("El archivo no coincide con lo grabado en el editor.")
            }
            guard Self.looksLikeContainer(mime: session.mime, head: session.head) else {
                throw WivraExportError.integrity("El archivo no empieza como un \(session.mime) válido.")
            }
            try session.handle.synchronize()
            try session.handle.close()
            // Prove what is actually on disk before giving the file its final name.
            let measured = try Self.measure(session.partialURL)
            diskBytes = measured.0; diskCrc = measured.1
            guard diskBytes == bytes, diskCrc == crc32 else {
                throw WivraExportError.integrity("El archivo releído del disco no coincide con lo grabado.")
            }
            try? FileManager.default.removeItem(at: session.finalURL)
            try FileManager.default.moveItem(at: session.partialURL, to: session.finalURL)
        } catch {
            try? session.handle.close()
            try? FileManager.default.removeItem(at: session.partialURL)
            throw error
        }
        // The recording is verified and in place. Repairs below never delete it unless a
        // verified replacement exists; any failure keeps the verified recording.
        finished[token] = session.finalURL
        var method = "none", note = ""
        if repair && session.mime == "video/mp4" {
            do {
                let patched = try WivraMp4Repair.patchFragmented(at: session.finalURL)
                if patched.changed { method = "mp4-patched" } else { note = patched.reason }
                let original = await WivraMp4Repair.inspect(session.finalURL)
                let temp = directory.appendingPathComponent(session.finalURL.lastPathComponent + ".remux.mp4")
                do {
                    try await WivraMp4Repair.passthrough(from: session.finalURL, to: temp)
                    let copy = await WivraMp4Repair.inspect(temp)
                    if let copy, copy.video, copy.durationMs > 0, !(original?.audio == true && !copy.audio) {
                        _ = try FileManager.default.replaceItemAt(session.finalURL, withItemAt: temp)
                        method = "mp4-passthrough"
                    } else {
                        try? FileManager.default.removeItem(at: temp)
                        note = "La copia sin recodificar no conserva las pistas; se entrega el original reparado."
                    }
                } catch {
                    try? FileManager.default.removeItem(at: temp)
                    note = error.localizedDescription
                }
            } catch {
                note = error.localizedDescription
            }
        } else if repair {
            note = "WebM en iOS: sin reparación nativa (Fotos no importa WebM)."
        }
        let finalSize = (try? FileManager.default.attributesOfItem(atPath: session.finalURL.path)[.size] as? NSNumber)?.int64Value ?? diskBytes
        var reply = WivraExportReply(token: token, bytes: finalSize, crc32: diskCrc, displayName: session.finalURL.lastPathComponent)
        reply.recordedBytes = diskBytes; reply.recordedCrc32 = diskCrc
        reply.repair = method; reply.repairNote = note
        reply.media = await WivraMp4Repair.inspect(session.finalURL)
        return reply
    }

    /// Idempotent: closes and deletes the partial file.
    func abort(token: Int) {
        guard let session = sessions.removeValue(forKey: token) else { return }
        try? session.handle.close()
        try? FileManager.default.removeItem(at: session.partialURL)
    }

    func abortAll() {
        for token in Array(sessions.keys) { abort(token: token) }
    }

    func savedURL(token: Int) -> URL? { finished[token] }

    /// Deletes `.partial` files left by a killed process. Never touches finished videos.
    @discardableResult
    func cleanupOrphans() -> Int {
        let active = Set(sessions.values.map { $0.partialURL.standardizedFileURL })
        let items = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        var removed = 0
        // `.partial` = interrupted recording; `.remux.mp4` = interrupted AVFoundation copy.
        for url in items where url.lastPathComponent.hasPrefix("Wivra_Export_") &&
            (url.pathExtension == "partial" || url.lastPathComponent.hasSuffix(".remux.mp4")) {
            if active.contains(url.standardizedFileURL) { continue }
            if (try? FileManager.default.removeItem(at: url)) != nil { removed += 1 }
        }
        return removed
    }

    static func measure(_ url: URL) throws -> (Int64, UInt32) {
        let reader = try FileHandle(forReadingFrom: url)
        defer { try? reader.close() }
        var crc: UInt32 = 0
        var total: Int64 = 0
        while let block = try reader.read(upToCount: 1024 * 1024), !block.isEmpty {
            crc = WivraCRC32.update(crc, block)
            total += Int64(block.count)
        }
        return (total, crc)
    }
}
