// W109 (Claude): macOS check of «Pasar a Wivra» for iPhone screen recordings (W100), with real files made
// by the same writer the ReplayKit extension uses (W108). Checks the list (a recording still being
// written is never offered; an interrupted one is offered as such), the import (verified, moved, manifest
// v2 with the microphone and app sound as separate tracks and measured offsets), "never overwrite", the
// import of an interrupted recording, and delete. The manifests are then read by the editor's own parser
// (streaming/tests/ios-screenrec-import-editor.mjs). Not a ReplayKit or iPhone test.
import AVFoundation
import CoreMedia
import Foundation

@main
struct WivraScreenRecordImportSmoke {
    static func check(_ ok: Bool, _ what: String) {
        print((ok ? "ok - " : "not ok - ") + what)
        if !ok { exit(1) }
    }

    static func videoSample(_ frame: Int, fps: Int32) -> CMSampleBuffer {
        let width = 240, height = 520
        var pixel: CVPixelBuffer?
        CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA,
                            [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &pixel)
        let buffer = pixel!
        CVPixelBufferLockBaseAddress(buffer, [])
        let base = CVPixelBufferGetBaseAddress(buffer)!.assumingMemoryBound(to: UInt8.self)
        let row = CVPixelBufferGetBytesPerRow(buffer)
        for y in 0..<height { for x in 0..<width {
            let p = base + y * row + x * 4
            p[0] = UInt8((x + frame * 4) & 0xFF); p[1] = UInt8((y + frame * 2) & 0xFF); p[2] = UInt8(frame & 0xFF); p[3] = 255
        } }
        CVPixelBufferUnlockBaseAddress(buffer, [])
        var format: CMVideoFormatDescription?
        CMVideoFormatDescriptionCreateForImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: buffer, formatDescriptionOut: &format)
        var timing = CMSampleTimingInfo(duration: CMTime(value: 1, timescale: fps),
                                        presentationTimeStamp: CMTime(value: CMTimeValue(1000 * fps + Int32(frame)), timescale: fps),
                                        decodeTimeStamp: .invalid)
        var sample: CMSampleBuffer?
        CMSampleBufferCreateReadyWithImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: buffer,
                                                 formatDescription: format!, sampleTiming: &timing, sampleBufferOut: &sample)
        return sample!
    }

    static func audioSample(start: Double, frames: Int, rate: Double, channels: UInt32) -> CMSampleBuffer {
        var asbd = AudioStreamBasicDescription(mSampleRate: rate, mFormatID: kAudioFormatLinearPCM,
                                               mFormatFlags: kLinearPCMFormatFlagIsSignedInteger | kLinearPCMFormatFlagIsPacked,
                                               mBytesPerPacket: 2 * channels, mFramesPerPacket: 1, mBytesPerFrame: 2 * channels,
                                               mChannelsPerFrame: channels, mBitsPerChannel: 16, mReserved: 0)
        var format: CMAudioFormatDescription?
        CMAudioFormatDescriptionCreate(allocator: kCFAllocatorDefault, asbd: &asbd, layoutSize: 0, layout: nil,
                                       magicCookieSize: 0, magicCookie: nil, extensions: nil, formatDescriptionOut: &format)
        let bytes = frames * Int(2 * channels)
        var block: CMBlockBuffer?
        CMBlockBufferCreateWithMemoryBlock(allocator: kCFAllocatorDefault, memoryBlock: nil, blockLength: bytes,
                                           blockAllocator: kCFAllocatorDefault, customBlockSource: nil, offsetToData: 0,
                                           dataLength: bytes, flags: kCMBlockBufferAssureMemoryNowFlag, blockBufferOut: &block)
        var pcm = [Int16](repeating: 0, count: frames * Int(channels))
        for i in 0..<frames { let v = Int16(2000 * sin(2 * Double.pi * 440 * (start + Double(i) / rate))); for c in 0..<Int(channels) { pcm[i * Int(channels) + c] = v } }
        pcm.withUnsafeBytes { raw in _ = CMBlockBufferReplaceDataBytes(with: raw.baseAddress!, blockBuffer: block!, offsetIntoDestination: 0, dataLength: bytes) }
        var sample: CMSampleBuffer?
        CMAudioSampleBufferCreateReadyWithPacketDescriptions(allocator: kCFAllocatorDefault, dataBuffer: block!, formatDescription: format!,
                                                             sampleCount: frames, presentationTimeStamp: CMTime(seconds: 1000 + start, preferredTimescale: CMTimeScale(rate)),
                                                             packetDescriptions: nil, sampleBufferOut: &sample)
        return sample!
    }

    /// Records `seconds` of frames (+ app sound, + microphone from 0.4 s); closes it only when asked.
    static func record(in root: URL, id: String, seconds: Int, close: Bool) -> WivraScreenRecordWriter {
        let dir = root.appendingPathComponent(id, isDirectory: true)
        try! FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let w = WivraScreenRecordWriter(folder: dir, id: id)
        let fps: Int32 = 30
        var appT = 0.0, micT = 0.4
        for f in 0..<(seconds * Int(fps)) {
            _ = w.appendVideo(videoSample(f, fps: fps))
            let now = Double(f + 1) / Double(fps)
            while appT < now { w.appendAudio(audioSample(start: appT, frames: 1024, rate: 44_100, channels: 2), mic: false); appT += 1024 / 44_100 }
            while micT < now { w.appendAudio(audioSample(start: micT, frames: 1024, rate: 48_000, channels: 1), mic: true); micT += 1024 / 48_000 }
            usleep(15_000)
        }
        if close { w.close(reason: "stopped") }
        return w
    }

    static func age(_ folder: URL, seconds: TimeInterval) {
        let old = Date().addingTimeInterval(-seconds)
        for f in (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? [] {
            try? FileManager.default.setAttributes([.modificationDate: old], ofItemAtPath: f.path)
        }
    }

    static func main() async {
        let fm = FileManager.default
        let base = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : NSTemporaryDirectory())
            .appendingPathComponent("wivra-screenrec-import", isDirectory: true)
        try? fm.removeItem(at: base)
        let root = base.appendingPathComponent("group/WivraScreenRecordings", isDirectory: true)
        let dest = base.appendingPathComponent("Documents/WivraIPhoneMedia", isDirectory: true)
        try! fm.createDirectory(at: root, withIntermediateDirectories: true)

        _ = record(in: root, id: "20261106_120000_FINISHED", seconds: 3, close: true)
        let writing = record(in: root, id: "20261106_120100_WRITING", seconds: 2, close: false)
        // Judge "still being written" from the moment it was last written, not from the end of the slower
        // recordings below: a busy CI runner can take longer than the 20 s stale threshold to make them.
        let writingLastWrite = Date()
        let cut = record(in: root, id: "20261106_120200_INTERRUPT", seconds: 3, close: false)
        age(cut.folder, seconds: 120)      // iOS ended it two minutes ago; nothing touched it since
        _ = record(in: root, id: "20261106_120300_COLLIDES", seconds: 2, close: true)
        _ = record(in: root, id: "20261106_120400_TODELETE", seconds: 2, close: true)
        try? fm.createDirectory(at: root.appendingPathComponent("../../outside", isDirectory: true), withIntermediateDirectories: true)

        var items = WivraScreenRecordInbox.list(root: root, now: writingLastWrite.addingTimeInterval(1))
        let ids = Set(items.map(\.id))
        print("  listed: \(ids.sorted())")
        check(!ids.contains(writing.session.id), "a recording still being written is never offered")
        check(ids.contains("20261106_120000_FINISHED") && ids.contains("20261106_120200_INTERRUPT"), "finished and interrupted recordings are offered")
        check(items.first { $0.id == "20261106_120200_INTERRUPT" }?.interrupted == true, "the interrupted one is marked as such")
        check(items.first { $0.id == "20261106_120000_FINISHED" }?.interrupted == false, "the finished one is not marked")

        // 1. Normal import.
        let finished = items.first { $0.id == "20261106_120000_FINISHED" }!
        var manifests: [URL] = []
        do {
            let m = try await WivraScreenRecordInbox.importRecording(finished, destination: dest)
            manifests.append(m)
            let decoded = try JSONDecoder().decode(WivraCaptureManifest.self, from: Data(contentsOf: m))
            check(decoded.schemaVersion == 2 && decoded.cameraSource == "ios-replaykit-screen", "manifest v2 for a screen recording")
            check(fm.fileExists(atPath: dest.appendingPathComponent(decoded.originalVideoFile).path), "video moved into the capture folder")
            let mic = decoded.tracks.first { $0.source == "ios-replaykit-mic" }, app = decoded.tracks.first { $0.source == "ios-replaykit-app" }
            check(mic?.role == "voice_primary" && app?.role == "other", "microphone and app sound are two separate tracks")
            print("  offsets: mic \(mic?.startOffsetSeconds.map { String($0) } ?? "nil"), app \(app?.startOffsetSeconds.map { String($0) } ?? "nil")")
            check(abs((mic?.startOffsetSeconds ?? -9) - 0.4) < 0.05 && abs(app?.startOffsetSeconds ?? -9) < 0.05, "measured offsets kept (0.4 s and 0 s)")
            for t in decoded.tracks { check(fm.fileExists(atPath: dest.appendingPathComponent(t.file).path), "\(t.file) moved") }
            check(!fm.fileExists(atPath: finished.folder.path), "the empty session folder is removed")
        } catch { check(false, "normal import (\(error))") }

        // 2. Never overwrite: a file with the same name already in the capture folder.
        items = WivraScreenRecordInbox.list(root: root)
        let collides = items.first { $0.id == "20261106_120300_COLLIDES" }!
        let blocker = dest.appendingPathComponent(collides.session.videoFile)
        try! Data("keep me".utf8).write(to: blocker)
        do {
            _ = try await WivraScreenRecordInbox.importRecording(collides, destination: dest)
            check(false, "an import that would overwrite is refused")
        } catch {
            check(true, "an import that would overwrite is refused")
            check((try? String(contentsOf: blocker, encoding: .utf8)) == "keep me", "the existing file is untouched")
            check(fm.fileExists(atPath: collides.folder.appendingPathComponent(collides.session.videoFile).path), "the recording stays where it was")
        }

        // 3. Interrupted recording: the video up to the last fragment; a sound file that cannot be read is left out.
        let interrupted = items.first { $0.id == "20261106_120200_INTERRUPT" }!
        do {
            let m = try await WivraScreenRecordInbox.importRecording(interrupted, destination: dest)
            manifests.append(m)
            let decoded = try JSONDecoder().decode(WivraCaptureManifest.self, from: Data(contentsOf: m))
            let seconds = (try? await AVURLAsset(url: dest.appendingPathComponent(decoded.originalVideoFile)).load(.duration).seconds) ?? 0
            print("  interrupted import: \(String(format: "%.2f", seconds)) s of video, \(decoded.tracks.count) sound track(s)")
            check(seconds >= 1.5, "an interrupted recording is imported up to its last fragment")
        } catch { check(false, "interrupted import (\(error))") }

        // 4. Delete (after the screen's confirmation) only inside the recordings folder.
        let toDelete = items.first { $0.id == "20261106_120400_TODELETE" }!
        check(WivraScreenRecordInbox.discard(toDelete, root: root), "a listed recording can be deleted")
        check(!fm.fileExists(atPath: toDelete.folder.path), "its folder is gone")
        let outsider = WivraScreenRecording(id: "outside", folder: base.appendingPathComponent("outside", isDirectory: true),
                                            session: toDelete.session, startedAt: nil, bytes: 0, interrupted: false)
        check(!WivraScreenRecordInbox.discard(outsider, root: root), "nothing outside the recordings folder is ever deleted")
        check(fm.fileExists(atPath: outsider.folder.path), "the outside folder is untouched")

        writing.close(reason: "test end")
        try! manifests.map(\.path).joined(separator: "\n").write(to: base.appendingPathComponent("manifests.txt"), atomically: true, encoding: .utf8)
        print("all screen-recording import checks passed")
    }
}
