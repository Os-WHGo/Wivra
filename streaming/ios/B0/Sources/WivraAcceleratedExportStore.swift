// Wivra experimental WebCodecs/Mediabunny protocol v2 on iOS.
// The existing WivraExportStore v1 is never modified or bypassed.
// Only verified MP4 is retained in app-private Application Support. Photos is
// an explicit, separate add-only user action via WivraPhotosLibrary.
import Foundation
import CryptoKit

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
    private let directory: URL
    private let freeSpace: @Sendable (URL) -> Int64

    init(directory: URL? = nil, freeSpace: (@Sendable (URL) -> Int64)? = nil) {
        self.directory = directory ?? FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("WivraAcceleratedExports", isDirectory: true)
        self.freeSpace = freeSpace ?? { url in
            let values = try? url.resourceValues(
                forKeys: [.volumeAvailableCapacityForImportantUsageKey])
            return values?.volumeAvailableCapacityForImportantUsage ?? 0
        }
    }

    private var sessions: [Int: Session] = [:]
    private var finished: [Int: (owner: String, result: Completed)] = [:]

    private func freeBytes() -> Int64 { freeSpace(directory) }

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


    /// Re-discover NEW sealed files after a process restart, without trusting
    /// the name alone or exposing arbitrary app/user files. Only confirmed
    /// non-symlink MP4 assets with real AVFoundation tracks are returned.
    /// Explicitly called from the native export recovery library, not at boot.
    func recovered() async -> [Completed] {
        let root = directory.resolvingSymlinksInPath().standardizedFileURL
        guard let urls = try? FileManager.default.contentsOfDirectory(
            at: directory, includingPropertiesForKeys: [
                .isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey
            ], options: [.skipsHiddenFiles]) else { return [] }
        var result: [Completed] = []
        for url in urls.prefix(200) {
            let name = url.lastPathComponent
            guard name.hasPrefix("Wivra_Fast_"), name.hasSuffix(".mp4"),
                  UUID(uuidString: String(name.dropFirst(11).dropLast(4))) != nil,
                  url.standardizedFileURL.deletingLastPathComponent() == root,
                  url.resolvingSymlinksInPath().standardizedFileURL
                    .deletingLastPathComponent() == root,
                  let info = try? url.resourceValues(forKeys: [
                    .isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey
                  ]),
                  info.isRegularFile == true, info.isSymbolicLink == false,
                  let size = info.fileSize, size > 0,
                  Int64(size) <= WivraRandomAccessExportSession.maxOutputBytes
            else { continue }
            guard let metadata = await WivraMp4Repair.inspect(url),
                  metadata.video, metadata.durationMs > 0, metadata.seekIndex else { continue }
            do {
                let input = try FileHandle(forReadingFrom: url)
                defer { try? input.close() }
                var digest = SHA256()
                var actualBytes: Int64 = 0
                while let bytes = try input.read(upToCount: 1024 * 1024), !bytes.isEmpty {
                    digest.update(data: bytes)
                    actualBytes += Int64(bytes.count)
                }
                guard actualBytes == Int64(size) else { continue }
                let sha = digest.finalize().map { String(format: "%02x", $0) }.joined()
                result.append(Completed(url: url, bytes: actualBytes, sha256: sha,
                    media: WivraRandomAccessExportSession.Media(
                        video: metadata.video, audio: metadata.audio,
                        durationMs: metadata.durationMs)))
            } catch {
                // Never present an unreadable or changing private output.
                continue
            }
        }
        return result.sorted { $0.url.lastPathComponent > $1.url.lastPathComponent }
    }

    func saved(token: Int, owner: String) -> Completed? {
        guard let item = finished[token], item.owner == owner else { return nil }
        return item.result
    }
}
