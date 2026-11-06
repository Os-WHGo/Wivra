// W108 (Claude): macOS check of the iPhone screen-recording writer with synthetic frames and sound.
// 1) a normal stop gives a playable MOV + app M4A + mic M4A and measured offsets;
// 2) an abrupt end (the MOV copied while still being written, as iOS leaves it when it ends the
//    extension) is still readable up to the last 2 s fragment. Not a ReplayKit or iPhone test.
import AVFoundation
import CoreMedia
import Foundation

@main
struct WivraScreenRecordWriterSmoke {
    static func check(_ ok: Bool, _ what: String) {
        print((ok ? "ok - " : "not ok - ") + what)
        if !ok { exit(1) }
    }

    static func videoSample(_ frame: Int, fps: Int32, width: Int, height: Int) -> CMSampleBuffer {
        var pixel: CVPixelBuffer?
        CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA,
                            [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &pixel)
        let buffer = pixel!
        CVPixelBufferLockBaseAddress(buffer, [])
        let base = CVPixelBufferGetBaseAddress(buffer)!.assumingMemoryBound(to: UInt8.self)
        let row = CVPixelBufferGetBytesPerRow(buffer)
        for y in 0..<height { for x in 0..<width {      // a moving gradient, so frames differ
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

    /// 16-bit interleaved PCM, a quiet tone; `start` in seconds on the same host clock as the video (1000 s base).
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

    static func seconds(_ url: URL) async -> Double {
        (try? await AVURLAsset(url: url).load(.duration).seconds) ?? 0
    }

    static func main() async {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("wivra-screenrec-\(UUID().uuidString)", isDirectory: true)
        let folder = root.appendingPathComponent("20261106_120000_TEST0001", isDirectory: true)
        try! FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let writer = WivraScreenRecordWriter(folder: folder, id: "20261106_120000_TEST0001")
        let fps: Int32 = 30, total = 5 * Int(fps), width = 390, height = 844
        let snapshot = root.appendingPathComponent("abrupt-end.mov")
        var appT = 0.0, micT = 0.4
        for f in 0..<total {
            let r = writer.appendVideo(videoSample(f, fps: fps, width: width, height: height))
            if f == 0 { check(r == .ok, "first frame creates the MOV") } else if r == .failed { check(false, "frame \(f) written") }
            let now = Double(f + 1) / Double(fps)
            while appT < now { writer.appendAudio(audioSample(start: appT, frames: 1024, rate: 44_100, channels: 2), mic: false); appT += 1024 / 44_100 }
            while micT < now { writer.appendAudio(audioSample(start: micT, frames: 1024, rate: 48_000, channels: 1), mic: true); micT += 1024 / 48_000 }
            usleep(20_000)      // about real time, so the encoder and the fragments behave as in a recording
            if f == Int(3.5 * Double(fps)) {
                // What an abrupt end leaves on disk: the MOV exactly as it is now, never finished.
                try? FileManager.default.copyItem(at: writer.videoURL, to: snapshot)
            }
        }
        let clean = writer.close(reason: "stopped")
        check(clean, "normal stop closes the video cleanly")
        check(writer.close(reason: "again") == clean, "closing twice is harmless")

        let mov = await seconds(writer.videoURL)
        print("  finished MOV: \(String(format: "%.2f", mov)) s")
        check(abs(mov - 5) < 0.3, "finished MOV lasts about 5 s")
        check(await WivraCaptureMediaVerifier.verifyFile(writer.videoURL, in: folder), "finished MOV passes Wivra's capture verifier (all samples decoded)")
        let track = try? await AVURLAsset(url: writer.videoURL).loadTracks(withMediaType: .video).first
        let size = try? await track?.load(.naturalSize)
        check(size.map { Int($0.width) == width && Int($0.height) == height } ?? false, "video keeps the screen size \(width)×\(height)")

        let s = writer.session
        check(s.finished && s.stopReason == "stopped", "session.json says finished")
        for (name, label) in [(s.appAudioFile, "app sound"), (s.micAudioFile, "microphone")] {
            guard let name else { check(false, "\(label) file created"); continue }
            check(WivraCaptureMediaVerifier.verifyAudioFile(folder.appendingPathComponent(name), in: folder), "\(label) M4A is readable to the end")
        }
        let micOffset = WivraScreenRecordShared.offset(audio: s.micAudioStart, video: s.videoStart)
        let appOffset = WivraScreenRecordShared.offset(audio: s.appAudioStart, video: s.videoStart)
        print("  offsets: app \(appOffset.map { String($0) } ?? "nil") s, mic \(micOffset.map { String($0) } ?? "nil") s")
        check(appOffset.map { abs($0) < 0.05 } ?? false, "app sound starts with the video")
        check(micOffset.map { abs($0 - 0.4) < 0.05 } ?? false, "microphone offset measured (0.4 s)")
        let saved = try? JSONDecoder().decode(WivraScreenRecordShared.Session.self, from: Data(contentsOf: folder.appendingPathComponent("session.json")))
        check(saved == s, "session.json on disk matches")

        let cut = await seconds(snapshot)
        print("  abrupt end at 3.5 s → readable: \(String(format: "%.2f", cut)) s")
        check(cut >= 1.5, "an abrupt end keeps the video up to the last 2 s fragment")
        let cutFolder = root.appendingPathComponent("cut", isDirectory: true)
        try? FileManager.default.createDirectory(at: cutFolder, withIntermediateDirectories: true)
        let cutCopy = cutFolder.appendingPathComponent("abrupt-end.mov")
        try? FileManager.default.copyItem(at: snapshot, to: cutCopy)
        check(await WivraCaptureMediaVerifier.verifyFile(cutCopy, in: cutFolder), "the cut MOV passes Wivra's capture verifier")
        print("all screen-recording writer checks passed")
    }
}
