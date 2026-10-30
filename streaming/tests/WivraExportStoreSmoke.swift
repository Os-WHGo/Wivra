// macOS-only synthetic smoke test of the iOS progressive export store. No device claims:
// it proves ordering, CRC-32 against a known vector, disk re-read, cleanup and space gates.
import Foundation

@main
struct WivraExportStoreSmoke {
    @MainActor
    static func expectThrows(_ label: String, _ body: () async throws -> Void) async {
        do { try await body(); preconditionFailure("expected failure: " + label) } catch {}
    }

    @MainActor
    static func main() async throws {
        let folder = FileManager.default.temporaryDirectory
            .appendingPathComponent("WivraExportSmoke-" + UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        precondition(WivraCRC32.update(0, Data("123456789".utf8)) == 0xCBF4_3926)

        let store = WivraExportStore(directory: folder, freeBytes: { _ in 10_000_000_000 })
        // 1) Complete export in several chunks: final file is byte-identical and verified.
        let webm = Data([0x1A, 0x45, 0xDF, 0xA3]) + Data((0..<300_000).map { UInt8($0 % 251) })
        let parts = stride(from: 0, to: webm.count, by: 70_000).map { webm.subdata(in: $0..<min($0 + 70_000, webm.count)) }
        let begin = try await store.begin(mime: "video/webm;codecs=vp8,opus", estimatedBytes: 1_000_000)
        guard let token = begin.token, let name = begin.displayName else { preconditionFailure("no token") }
        precondition(name.hasSuffix(".webm"))
        var crc: UInt32 = 0
        for (seq, part) in parts.enumerated() {
            let reply = try await store.append(token: token, seq: seq, data: part)
            crc = WivraCRC32.update(crc, part)
            precondition(reply.seq == seq)
        }
        let partials = try FileManager.default.contentsOfDirectory(atPath: folder.path)
        precondition(partials.contains(name + ".partial"), "chunks must be on disk before finish")
        let done = try await store.finish(token: token, bytes: Int64(webm.count), crc32: crc, chunks: parts.count)
        precondition(done.bytes == Int64(webm.count) && done.crc32 == crc)
        let finalURL = folder.appendingPathComponent(name)
        let written = try Data(contentsOf: finalURL)
        precondition(written == webm)
        let remembered = await store.savedURL(token: token)
        precondition(remembered == finalURL)

        // 2) Out-of-order chunk aborts and deletes the partial file.
        let second = try await store.begin(mime: "video/mp4", estimatedBytes: 0)
        let mp4Head = Data([0, 0, 0, 0x18]) + Data("ftypisom".utf8)
        _ = try await store.append(token: second.token!, seq: 0, data: mp4Head)
        await expectThrows("out of order") { _ = try await store.append(token: second.token!, seq: 2, data: mp4Head) }
        precondition(!FileManager.default.fileExists(atPath: folder.appendingPathComponent(second.displayName! + ".partial").path))

        // 3) CRC mismatch never produces a final file.
        let third = try await store.begin(mime: "video/mp4", estimatedBytes: 0)
        _ = try await store.append(token: third.token!, seq: 0, data: mp4Head)
        await expectThrows("crc mismatch") {
            _ = try await store.finish(token: third.token!, bytes: Int64(mp4Head.count), crc32: 1, chunks: 1)
        }
        precondition(!FileManager.default.fileExists(atPath: folder.appendingPathComponent(third.displayName!).path))

        // 4) Wrong container for the declared type is refused.
        let fourth = try await store.begin(mime: "video/mp4", estimatedBytes: 0)
        _ = try await store.append(token: fourth.token!, seq: 0, data: webm.prefix(64))
        await expectThrows("container") {
            _ = try await store.finish(token: fourth.token!, bytes: 64, crc32: WivraCRC32.update(0, webm.prefix(64)), chunks: 1)
        }

        // 5) Abort is idempotent and leaves nothing behind.
        let fifth = try await store.begin(mime: "video/webm", estimatedBytes: 0)
        _ = try await store.append(token: fifth.token!, seq: 0, data: webm.prefix(100))
        await store.abort(token: fifth.token!)
        await store.abort(token: fifth.token!)
        precondition(!FileManager.default.fileExists(atPath: folder.appendingPathComponent(fifth.displayName! + ".partial").path))

        // 6) Orphan cleanup removes stale partials only, never finished videos.
        let orphan = folder.appendingPathComponent("Wivra_Export_1.webm.partial")
        FileManager.default.createFile(atPath: orphan.path, contents: Data([1, 2, 3]))
        let remuxOrphan = folder.appendingPathComponent("Wivra_Export_2.mp4.remux.mp4")
        FileManager.default.createFile(atPath: remuxOrphan.path, contents: Data([4, 5, 6]))
        let removed = await store.cleanupOrphans()
        precondition(removed == 2)
        precondition(!FileManager.default.fileExists(atPath: remuxOrphan.path))
        precondition(!FileManager.default.fileExists(atPath: orphan.path))
        precondition(FileManager.default.fileExists(atPath: finalURL.path))

        // 7) Not enough free space: refused before creating any file.
        let tight = WivraExportStore(directory: folder, freeBytes: { _ in 50_000_000 })
        let before = try FileManager.default.contentsOfDirectory(atPath: folder.path).count
        await expectThrows("space") { _ = try await tight.begin(mime: "video/webm", estimatedBytes: 10_000_000) }
        let after = try FileManager.default.contentsOfDirectory(atPath: folder.path).count
        precondition(after == before)

        // 8) Real fragmented MP4 recordings (duration 0, no index) become playable with real duration.
        let fixtures = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
            .appendingPathComponent("app/tests/fixtures/mediarecorder", isDirectory: true)
        for (name, mime, expectedMs) in [("ffmpeg-h264-aac-fragmented.mp4", "video/mp4;codecs=avc1.42E01E,mp4a.40.2", 2023.0),
                                         ("chromium-avc1-opus-fragmented.mp4", "video/mp4;codecs=avc1,opus", 2214.0)] {
            let data = try Data(contentsOf: fixtures.appendingPathComponent(name))
            // In-place patch alone, on a copy: measured duration must match the JS implementation.
            let copy = folder.appendingPathComponent("patch-" + name)
            try data.write(to: copy)
            let patched = try WivraMp4Repair.patchFragmented(at: copy)
            precondition(abs(patched.durationMs - expectedMs) < 2, "\(name) duration \(patched.durationMs)")
            let afterPatch = await WivraMp4Repair.inspect(copy)
            print("iOS repair \(name): patch durationMs=\(Int(patched.durationMs)) indexAdded=\(patched.indexAdded) avfoundation=\(String(describing: afterPatch))")
            // Full store flow: chunks -> verified recording -> repair -> AVFoundation inspection.
            let started = try await store.begin(mime: mime, estimatedBytes: Int64(data.count))
            var c: UInt32 = 0, seq = 0
            for off in stride(from: 0, to: data.count, by: 16_384) {
                let part = data.subdata(in: off..<min(off + 16_384, data.count))
                _ = try await store.append(token: started.token!, seq: seq, data: part); c = WivraCRC32.update(c, part); seq += 1
            }
            let reply = try await store.finish(token: started.token!, bytes: Int64(data.count), crc32: c, chunks: seq)
            print("iOS store \(name): repair=\(reply.repair ?? "-") note=\(reply.repairNote ?? "") bytes=\(reply.bytes ?? 0) media=\(String(describing: reply.media))")
            precondition(reply.recordedBytes == Int64(data.count) && reply.recordedCrc32 == c)
            precondition(["mp4-passthrough", "mp4-patched"].contains(reply.repair ?? ""), "repair must at least patch")
            if name.hasPrefix("ffmpeg") {
                precondition(reply.repair == "mp4-passthrough", "H.264+AAC must become a regular MP4")
                guard let m = reply.media else { preconditionFailure("AVFoundation must read the export") }
                precondition(m.video && m.audio && abs(Double(m.durationMs) - expectedMs) < 150, "media \(m)")
            }
            let delivered = await store.savedURL(token: started.token!)
            precondition(delivered.map { FileManager.default.fileExists(atPath: $0.path) } == true, "delivered file must exist")
        }

        print("Wivra iOS progressive export store smoke: OK (8 scenarios, synthetic + real MediaRecorder MP4, macOS)")
    }
}
