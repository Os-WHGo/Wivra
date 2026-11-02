// Wivra experimental WebCodecs/Mediabunny protocol v2 on iOS.
// The existing WivraExportStore v1 is never modified or bypassed.
// Only verified MP4 is retained in app-private Application Support. Photos is
// an explicit, separate add-only user action via WivraPhotosLibrary.
import Foundation

actor WivraAcceleratedExportStore {
    static let shared = WivraAcceleratedExportStore()
    static let minimumFreeBytes: Int64 = 200 * 1024 * 1024

    struct Completed: Sendable {
        let url: URL
        let bytes: Int64
        let sha256: String
        let media: WivraRandomAccessExportSession.Media
    }

    private struct Session {
        let owner: String
        let writer: WivraRandomAccessExportSession
    }
    private let directory = FileManager.default
        .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("WivraAcceleratedExports", isDirectory: true)
    private var sessions: [Int: Session] = [:]
    private var finished: [Int: (owner: String, result: Completed)] = [:]

    private func freeBytes() -> Int64 {
        let values = try? directory.resourceValues(
            forKeys: [.volumeAvailableCapacityForImportantUsageKey])
        return values?.volumeAvailableCapacityForImportantUsage ?? 0
    }

    func cleanupOrphans() throws -> Int {
        // Never delete an active writer even if an editor was opened quickly.
        guard sessions.isEmpty else { return 0 }
        return try WivraRandomAccessExportSession.cleanupOrphanPartials(directory: directory)
    }

    func begin(mime: String, estimatedBytes: Int64, owner: String) throws -> Int {
        // AVFoundation on iOS does not generally decode WebM. Do not claim
        // that an apparently valid WebM is a playable Photos video.
        guard mime == "video/mp4" else {
            throw WivraExportError.io("Exportación acelerada iOS requiere MP4 compatible.")
        }
        guard (0...WivraRandomAccessExportSession.maxOutputBytes).contains(estimatedBytes) else {
            throw WivraExportError.io("Tamaño aleatorio fuera de límites.")
        }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let free = freeBytes()
        let needed = estimatedBytes + Self.minimumFreeBytes
        guard free >= needed else { throw WivraExportError.insufficientStorage(free: free, needed: needed) }
        var token: Int
        repeat { token = Int.random(in: 1..<Int(Int32.max)) }
        while sessions[token] != nil || finished[token] != nil
        sessions[token] = Session(owner: owner,
            writer: try WivraRandomAccessExportSession(directory: directory, mime: mime))
        return token
    }

    func writeAt(token: Int, seq: Int, position: Int64, data: Data,
                 owner: String) async throws -> WivraRandomAccessExportSession.Ack {
        guard let item = sessions[token], item.owner == owner else {
            throw WivraExportError.unknownSession
        }
        do {
            if freeBytes() < Self.minimumFreeBytes / 2 {
                throw WivraExportError.io("Espacio insuficiente para continuar la exportación.")
            }
            return try await item.writer.writeAt(seq: seq, position: position, data: data)
        } catch {
            sessions.removeValue(forKey: token)
            await item.writer.abort()
            throw error
        }
    }

    func finish(token: Int, expectedBytes: Int64, writes: Int,
                expectedDurationMs: Int64, expectAudio: Bool,
                owner: String) async throws -> Completed {
        guard let item = sessions[token], item.owner == owner else {
            throw WivraExportError.unknownSession
        }
        // Removing before suspension prevents late writes from reviving a
        // finalizing session; the writer actor also enters .verifying.
        sessions.removeValue(forKey: token)
        let saved = try await item.writer.finish(expectedBytes: expectedBytes,
            expectedWrites: writes, expectedDurationMs: expectedDurationMs,
            expectAudio: expectAudio) { url in
            guard let real = await WivraMp4Repair.inspect(url),
                  real.video, real.durationMs > 0, real.seekIndex else { return nil }
            return WivraRandomAccessExportSession.Media(
                video: real.video, audio: real.audio, durationMs: real.durationMs)
        }
        let completion = Completed(url: saved.url, bytes: saved.bytes,
                                   sha256: saved.sha256, media: saved.media)
        finished[token] = (owner, completion)
        return completion
    }

    func abort(token: Int, owner: String) async {
        guard let item = sessions[token], item.owner == owner else { return }
        sessions.removeValue(forKey: token)
        await item.writer.abort()
    }

    func abortOwned(owner: String) async {
        let owned = sessions.filter { $0.value.owner == owner }
        for (token, session) in owned {
            sessions.removeValue(forKey: token)
            await session.writer.abort()
        }
    }

    func saved(token: Int, owner: String) -> Completed? {
        guard let item = finished[token], item.owner == owner else { return nil }
        return item.result
    }
}
