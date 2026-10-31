// Native read-only verifyFile for completed private camera captures. Walks real
// samples and decodes video boundaries; never publishes, repairs or deletes media.
// A passing result is not full-frame, sync or physical Ray-Ban certification. — ChatGPT
import AVFoundation
import Foundation

enum WivraCaptureMediaVerifier {
    static func verifyAudioFile(_ url: URL, in root: URL) -> Bool {
        let file = url.standardizedFileURL
        guard file.isFileURL, file.deletingLastPathComponent() == root.standardizedFileURL,
              let before = try? file.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey, .fileSizeKey, .contentModificationDateKey]),
              before.isSymbolicLink == false, before.isRegularFile == true, (before.fileSize ?? 0) > 0 else { return false }
        do {
            let audio = try AVAudioFile(forReading: file)
            guard audio.length > 0, audio.processingFormat.channelCount <= 32,
                  let buffer = AVAudioPCMBuffer(pcmFormat: audio.processingFormat, frameCapacity: 4096) else { return false }
            var frames: AVAudioFramePosition = 0
            while frames < audio.length {
                if Task.isCancelled { return false }
                let count = AVAudioFrameCount(min(4096, audio.length - frames))
                try audio.read(into: buffer, frameCount: count)
                guard buffer.frameLength > 0 else { return false }
                frames += AVAudioFramePosition(buffer.frameLength)
            }
            let after = try file.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey, .isSymbolicLinkKey])
            return frames == audio.length && after.isSymbolicLink == false && after.fileSize == before.fileSize &&
                after.contentModificationDate == before.contentModificationDate
        } catch { return false }
    }

    static func verifyFile(_ url: URL, in root: URL, diagnostic: @Sendable (String) -> Void = { _ in }) async -> Bool {
        var phase = "file scope or properties"
        var verified = false
        defer { if !verified { diagnostic(phase) } }
        let file = url.standardizedFileURL
        guard file.isFileURL, file.deletingLastPathComponent() == root.standardizedFileURL,
              let before = try? file.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey, .fileSizeKey, .contentModificationDateKey]),
              before.isSymbolicLink == false, before.isRegularFile == true,
              (before.fileSize ?? 0) > 0 else { return false }
        do {
            let asset = AVURLAsset(url: file)
            let tracks = try await asset.loadTracks(withMediaType: .video)
            let duration = try await asset.load(.duration)
            phase = "video tracks or duration"
            guard tracks.count == 1, duration.isNumeric, duration.seconds > 0 else { return false }
            let reader = try AVAssetReader(asset: asset)
            let allTracks = tracks + (try await asset.loadTracks(withMediaType: .audio))
            var outputs: [AVAssetReaderTrackOutput] = []
            for track in allTracks {
                let output = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
                output.alwaysCopiesSampleData = false
                guard reader.canAdd(output) else { return false }
                reader.add(output)
                outputs.append(output)
            }
            phase = "reader start"
            guard reader.startReading() else { return false }
            defer { reader.cancelReading() }
            var samples = 0
            for output in outputs {
                var count = 0
                while let result = autoreleasepool(invoking: { () -> Int? in
                    guard let sample = output.copyNextSampleBuffer() else { return nil }
                    let ready = CMSampleBufferDataIsReady(sample)
                    let size = CMSampleBufferGetTotalSampleSize(sample)
                    let time = CMSampleBufferGetPresentationTimeStamp(sample)
                    // AVAssetReader emits zero-sample timing markers in valid
                    // fragmented MP4. They are not media and cannot satisfy the
                    // non-empty track check. Do not mistake them for truncation.
                    if ready && size == 0 && CMSampleBufferGetNumSamples(sample) == 0 { return 0 }
                    if !ready || size == 0 || !time.isNumeric {
                        diagnostic("sample ready=\(ready) bytes=\(size) count=\(CMSampleBufferGetNumSamples(sample)) numeric=\(time.isNumeric)")
                    }
                    return ready && size > 0 && time.isNumeric ? 1 : -1
                }) {
                    samples += 1
                    if samples > 2_000_000 || Task.isCancelled { return false }
                    if result == 0 { continue }
                    phase = "invalid sample data or time"
                    guard result > 0 else { return false }
                    count += 1
                }
                phase = "empty track; reader status \(reader.status.rawValue)"
                guard count > 0 else { return false }
            }
            phase = "incomplete sample read; status \(reader.status.rawValue)"
            guard reader.status == .completed else { return false }
            let generator = AVAssetImageGenerator(asset: asset)
            generator.appliesPreferredTrackTransform = true
            for seconds in [0.0, max(0, duration.seconds - 0.05)] {
                phase = "boundary decode at \(seconds) seconds"
                let (image, _) = try await generator.image(at: CMTime(seconds: seconds, preferredTimescale: 600))
                guard image.width > 0, image.height > 0 else { return false }
            }
            let after = try file.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey, .isSymbolicLinkKey])
            phase = "file changed during verification"
            verified = after.isSymbolicLink == false && after.fileSize == before.fileSize &&
                after.contentModificationDate == before.contentModificationDate
            return verified
        } catch { return false }
    }
}
