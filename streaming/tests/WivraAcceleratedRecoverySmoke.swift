// Native macOS Swift 6 rehearsal for PRIVATE accelerated-video recovery.
// Real H.264/AAC fixture with AVFoundation; no iPhone hardware/Photos claims.
import Foundation
import CryptoKit

@main
struct WivraAcceleratedRecoverySmoke {
    static func main() async throws {
        precondition(WivraStrictJSONValue.integer(NSNumber(value: 1024)) == 1024)
        precondition(WivraStrictJSONValue.integer(NSNumber(value: -1)) == -1)
        precondition(WivraStrictJSONValue.integer(NSNumber(value: 1.5)) == nil)
        precondition(WivraStrictJSONValue.integer(NSNumber(value: 1.0)) == nil)
        precondition(WivraStrictJSONValue.integer(true) == nil)
        precondition(WivraStrictJSONValue.integer("1024") == nil)
        precondition(WivraStrictJSONValue.integer(NSNull()) == nil)
        precondition(WivraStrictJSONValue.boolean(true) == true)
        precondition(WivraStrictJSONValue.boolean(false) == false)
        precondition(WivraStrictJSONValue.boolean(NSNumber(value: 1)) == nil)
        precondition(WivraStrictJSONValue.boolean("true") == nil)
        precondition(WivraStrictJSONValue.boolean(NSNull()) == nil)

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
        let onDiskBytes = try Data(contentsOf: finished.url)
        let codecsVerified = await WivraAcceleratedExportStore.compatibleNativeCodecs(
            finished.url, expectAudio: true)
        precondition(onDiskBytes == sourceBytes && codecsVerified)
        let recoveredWriter = WivraAcceleratedExportStore(directory: writerRoot,
            freeSpace: { _ in 8_000_000_000 })
        let recoveredWriterFiles = await recoveredWriter.recovered()
        precondition(recoveredWriterFiles.count == 1)
        precondition(recoveredWriterFiles[0].sha256 == sha)
        precondition(recoveredWriterFiles[0].media.video && recoveredWriterFiles[0].media.audio)

        // A crashed inspector's hidden hard link may be reclaimed only
        // after its age threshold. Do not touch a new inspection, a symlink,
        // an unrelated app-private file or the actual sealed H264/AAC video.
        let oldAlias = writerRoot.appendingPathComponent(
            ".Wivra_Fast_Verify_\(UUID().uuidString).mp4")
        let newAlias = writerRoot.appendingPathComponent(
            ".Wivra_Fast_Verify_\(UUID().uuidString).mp4")
        let foreignAlias = writerRoot.appendingPathComponent("foreign-video.mp4")
        let linkedAlias = writerRoot.appendingPathComponent(
            ".Wivra_Fast_Verify_\(UUID().uuidString).mp4")
        try Data("old inspection".utf8).write(to: oldAlias)
        try Data("active inspection".utf8).write(to: newAlias)
        try Data("KEEP".utf8).write(to: foreignAlias)
        try FileManager.default.createSymbolicLink(at: linkedAlias,
            withDestinationURL: oldAlias)
        try FileManager.default.setAttributes(
            [.modificationDate: Date().addingTimeInterval(-7200)],
            ofItemAtPath: oldAlias.path)
        let cleanedAliases = try WivraAcceleratedExportStore
            .cleanupOldVerificationAliases(directory: writerRoot)
        precondition(cleanedAliases == 1)
        precondition(!FileManager.default.fileExists(atPath: oldAlias.path))
        precondition(FileManager.default.fileExists(atPath: newAlias.path))
        precondition(FileManager.default.fileExists(atPath: foreignAlias.path))
        precondition(FileManager.default.fileExists(atPath: linkedAlias.path)
                     || (try? FileManager.default.destinationOfSymbolicLink(
                        atPath: linkedAlias.path)) != nil)
        precondition(FileManager.default.fileExists(atPath: finished.url.path))

        // W73: a large directory of unrelated or deceptively named files
        // must not consume the 200-candidate verification cap. The only
        // valid sealed MP4 is still the original AVFoundation-verified movie.
        for index in 0..<240 {
            let noise = root.appendingPathComponent(
                String(format: "unrelated-%04d.backup", index))
            try Data("not a completed Wivra export".utf8).write(to: noise)
        }
        for index in 0..<30 {
            let falseName = root.appendingPathComponent(
                String(format: "Wivra_Fast_invalid-%04d.mp4", index))
            try Data([0, 1, 2, 3]).write(to: falseName)
        }
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
