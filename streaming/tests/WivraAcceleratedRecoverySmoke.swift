// Native macOS Swift 6 rehearsal for PRIVATE accelerated-video recovery.
// Real H.264/AAC fixture with AVFoundation; no iPhone hardware/Photos claims.
import Foundation
import CryptoKit

@main
struct WivraAcceleratedRecoverySmoke {
    static func main() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("wivra-accelerated-recovery-\(UUID().uuidString)",
                                    isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let fixture = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
            .appendingPathComponent("app/tests/fixtures/mediarecorder/ffmpeg-h264-aac-fragmented.mp4")
        precondition(FileManager.default.fileExists(atPath: fixture.path))
        let verified = root.appendingPathComponent("Wivra_Fast_\(UUID().uuidString).mp4")
        try await WivraMp4Repair.passthrough(from: fixture, to: verified)
        guard let media = await WivraMp4Repair.inspect(verified) else {
            preconditionFailure("Fixture cannot be inspected")
        }
        precondition(media.video && media.audio && media.durationMs > 1000 && media.seekIndex)
        let supported = await WivraAcceleratedExportStore.compatibleNativeCodecs(
            verified, expectAudio: true)
        precondition(supported)
        // Different codecs inside a .mp4 must NEVER be assumed playable
        // in Photos merely because AVFoundation sees an MP4 container.
        let testRoot = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
            .appendingPathComponent("app/tests/fixtures/mediarecorder")
        let hevc = testRoot.appendingPathComponent("capture-hevc.mp4")
        let opus = testRoot.appendingPathComponent("chromium-avc1-opus-fragmented.mp4")
        let hevcSupported = await WivraAcceleratedExportStore.compatibleNativeCodecs(
            hevc, expectAudio: false)
        let opusSupported = await WivraAcceleratedExportStore.compatibleNativeCodecs(
            opus, expectAudio: true)
        precondition(!hevcSupported && !opusSupported)

        // P0-W37: exercise the ENTIRE v2 writer with bytes from an actual
        // AVFoundation-validated H.264/AAC MP4, not a mocked media inspector.
        // The muxer's header is deliberately delivered AFTER its media tail,
        // then patched to prove random-offset coverage/hash/finalization.
        let sourceBytes = try Data(contentsOf: verified)
        precondition(sourceBytes.count > 256)
        let writerRoot = root.appendingPathComponent("v2-real-media", isDirectory: true)
        let writer = WivraAcceleratedExportStore(directory: writerRoot,
            freeSpace: { _ in 8_000_000_000 })
        let owner = "wivra-macos-codec-test-owner"
        let token = try await writer.begin(mime: "video/mp4",
            estimatedBytes: Int64(sourceBytes.count) + 64 * 1024 * 1024,
            owner: owner)
        let split = min(64 * 1024, sourceBytes.count / 2)
        var seq = 0
        var offset = split
        while offset < sourceBytes.count {
            let end = min(sourceBytes.count, offset + 128 * 1024)
            let ack = try await writer.writeAt(token: token, seq: seq,
                position: Int64(offset), data: sourceBytes.subdata(in: offset..<end),
                owner: owner)
            precondition(ack.writtenBytes == end - offset)
            offset = end
            seq += 1
        }
        _ = try await writer.writeAt(token: token, seq: seq, position: 0,
            data: sourceBytes.subdata(in: 0..<split), owner: owner)
        seq += 1
        // A muxer may overwrite an already-written moov/ftyp header.
        _ = try await writer.writeAt(token: token, seq: seq, position: 0,
            data: sourceBytes.subdata(in: 0..<16), owner: owner)
        seq += 1
        let finished = try await writer.finish(token: token,
            expectedBytes: Int64(sourceBytes.count), writes: seq,
            expectedDurationMs: media.durationMs, expectAudio: true,
            owner: owner)
        let sha = SHA256.hash(data: sourceBytes)
            .map { String(format: "%02x", $0) }.joined()
        precondition(finished.bytes == Int64(sourceBytes.count))
        precondition(finished.sha256 == sha)
        precondition(try Data(contentsOf: finished.url) == sourceBytes)
        precondition(await WivraAcceleratedExportStore.compatibleNativeCodecs(
            finished.url, expectAudio: true))
        let recoveredWriter = WivraAcceleratedExportStore(directory: writerRoot,
            freeSpace: { _ in 8_000_000_000 })
        let recoveredWriterFiles = await recoveredWriter.recovered()
        precondition(recoveredWriterFiles.count == 1)
        precondition(recoveredWriterFiles[0].sha256 == sha)
        precondition(recoveredWriterFiles[0].media.video && recoveredWriterFiles[0].media.audio)

        let store = WivraAcceleratedExportStore(directory: root,
            freeSpace: { _ in 8_000_000_000 })
        let first = await store.recovered()
        precondition(first.count == 1)
        precondition(first[0].url.resolvingSymlinksInPath().standardizedFileURL ==
                     verified.resolvingSymlinksInPath().standardizedFileURL)
        precondition(first[0].media.audio && first[0].media.video)
        precondition(first[0].bytes > 1_000 && first[0].sha256.count == 64)

        // Never surface an invalid header, unfinished file, symlink, or a
        // correctly encoded video whose name was not generated by Wivra.
        let partial = root.appendingPathComponent("Wivra_Fast_\(UUID().uuidString).mp4.partial")
        try Data([1,2,3,4]).write(to: partial)
        let bad = root.appendingPathComponent("Wivra_Fast_\(UUID().uuidString).mp4")
        try Data(repeating: 0, count: 4096).write(to: bad)
        let foreign = root.appendingPathComponent("recording.mp4")
        try FileManager.default.copyItem(at: verified, to: foreign)
        let linked = root.appendingPathComponent("Wivra_Fast_\(UUID().uuidString).mp4")
        try FileManager.default.createSymbolicLink(at: linked, withDestinationURL: verified)
        let reloaded = WivraAcceleratedExportStore(directory: root,
            freeSpace: { _ in 8_000_000_000 })
        let second = await reloaded.recovered()
        precondition(second.count == 1 &&
                     second[0].url.resolvingSymlinksInPath().standardizedFileURL ==
                     verified.resolvingSymlinksInPath().standardizedFileURL)

        let removed = try await reloaded.cleanupOrphans()
        precondition(removed == 1)
        precondition(FileManager.default.fileExists(atPath: verified.path))
        precondition(FileManager.default.fileExists(atPath: foreign.path))
        precondition(FileManager.default.fileExists(atPath: linked.path))
        precondition(!FileManager.default.fileExists(atPath: partial.path))
        print("Wivra accelerated macOS PASS: real H264/AAC random v2 writer, header patch, SHA256, native AVFoundation inspection, cold recovery, corruption and symlink safety")
    }
}
