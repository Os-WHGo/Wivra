// macOS Swift 6 smoke for the independent iOS random writer.
// Synthetic media-inspector outcomes are NOT physical iPhone codec validation.
import Foundation
import CryptoKit

@main
struct WivraRandomAccessExportSmoke {
    static func temporary() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("wivra-random-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    static func source() -> Data {
        Data([0, 0, 0, 16, 102, 116, 121, 112, 1, 2, 3, 4, 5, 6, 7, 8])
    }

    static func media(audio: Bool = true, duration: Int64 = 1000)
        -> WivraRandomAccessExportSession.Media {
        .init(video: true, audio: audio, durationMs: duration)
    }

    static func expectFailure(_ operation: @Sendable () async throws -> Void) async throws {
        do {
            try await operation()
            fatalError("Unsafe random export was accepted")
        } catch is WivraRandomAccessExportSession.Failure {
            // Expected integrity refusal.
        }
    }

    static func main() async throws {
        let folder = try temporary()
        defer { try? FileManager.default.removeItem(at: folder) }

        let session = try WivraRandomAccessExportSession(directory: folder, mime: "video/mp4")
        let first = try await session.writeAt(seq: 0, position: 0, data: source())
        assert(first.maxEnd == 16)
        let second = try await session.writeAt(seq: 1, position: 12, data: Data([9,10]))
        assert(second.maxEnd == 16)
        let saved = try await session.finish(expectedBytes: 16, expectedWrites: 2,
                                              expectedDurationMs: 1000, expectAudio: true) { _ in media() }
        var expected = source()
        expected.replaceSubrange(12..<14, with: [9,10])
        let savedData = try Data(contentsOf: saved.url)
        assert(savedData == expected)
        let sha = SHA256.hash(data: expected).map { String(format: "%02x", $0) }.joined()
        assert(saved.sha256 == sha)
        await session.abort()
        assert(FileManager.default.fileExists(atPath: saved.url.path))

        let sparse = try WivraRandomAccessExportSession(directory: folder, mime: "video/mp4")
        _ = try await sparse.writeAt(seq: 0, position: 4, data: source())
        try await expectFailure {
            _ = try await sparse.finish(expectedBytes: 20, expectedWrites: 1,
                                        expectedDurationMs: 1000, expectAudio: false) { _ in
                fatalError("Inspector must not run on sparse output")
            }
        }

        let wrongTotals = try WivraRandomAccessExportSession(directory: folder,
            mime: "video/mp4", reservedBytes: 32)
        _ = try await wrongTotals.writeAt(seq: 0, position: 0, data: source())
        try await expectFailure {
            _ = try await wrongTotals.finish(expectedBytes: 16, expectedWrites: 2,
                expectedDurationMs: 1000, expectAudio: false) { _ in
                fatalError("Inspector must not run when final totals differ")
            }
        }

        let tamper = try WivraRandomAccessExportSession(directory: folder, mime: "video/mp4")
        _ = try await tamper.writeAt(seq: 0, position: 0, data: source())
        try await expectFailure {
            _ = try await tamper.finish(expectedBytes: 16, expectedWrites: 1,
                                        expectedDurationMs: 1000, expectAudio: false) { url in
                try Data(repeating: 0, count: 16).write(to: url)
                return media()
            }
        }

        let missingAudio = try WivraRandomAccessExportSession(directory: folder, mime: "video/mp4")
        _ = try await missingAudio.writeAt(seq: 0, position: 0, data: source())
        try await expectFailure {
            _ = try await missingAudio.finish(expectedBytes: 16, expectedWrites: 1,
                                               expectedDurationMs: 1000, expectAudio: true) { _ in
                media(audio: false)
            }
        }

        let cancelled = try WivraRandomAccessExportSession(directory: folder, mime: "video/mp4")
        _ = try await cancelled.writeAt(seq: 0, position: 0, data: source())
        await cancelled.abort()

        let unrelated = folder.appendingPathComponent("important.mp4")
        try Data("KEEP".utf8).write(to: unrelated)
        let orphan = folder.appendingPathComponent("Wivra_Fast_123.mp4.partial")
        try Data("TEMP".utf8).write(to: orphan)
        let removed = try WivraRandomAccessExportSession.cleanupOrphanPartials(directory: folder)
        assert(removed == 1)
        assert(FileManager.default.fileExists(atPath: saved.url.path))
        assert(FileManager.default.fileExists(atPath: unrelated.path))
        print("Wivra random v2 iOS private staging smoke PASS: patch SHA, gaps, tampering, missing audio, abort, orphan safety")
    }
}
