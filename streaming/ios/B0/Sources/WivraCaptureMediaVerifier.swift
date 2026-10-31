// Native read-only verifyFile for completed private camera captures. Walks real
// samples and decodes video boundaries; never publishes, repairs or deletes media.
// A passing result is not full-frame, sync or physical Ray-Ban certification. — ChatGPT
import AVFoundation
import Foundation

enum WivraCaptureMediaVerifier {
    static func verifyFile(_ url: URL, in root: URL) async -> Bool {
        let file = url.standardizedFileURL
        guard file.isFileURL, file.deletingLastPathComponent() == root.standardizedFileURL,
              let before = try? file.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey, .fileSizeKey, .contentModificationDateKey]),
              before.isSymbolicLink == false, before.isRegularFile == true,
              (before.fileSize ?? 0) > 0 else { return false }
        do {
            let asset = AVURLAsset(url: file)
            let tracks = try await asset.loadTracks(withMediaType: .video)
            let duration = try await asset.load(.duration)
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
            guard reader.startReading() else { return false }
            defer { reader.cancelReading() }
            var samples = 0
            for output in outputs {
                var count = 0
                while let valid = autoreleasepool(invoking: { () -> Bool? in
                    guard let sample = output.copyNextSampleBuffer() else { return nil }
                    return CMSampleBufferDataIsReady(sample) && CMSampleBufferGetTotalSampleSize(sample) > 0 &&
                        CMSampleBufferGetPresentationTimeStamp(sample).isNumeric
                }) {
                    guard valid else { return false }
                    count += 1
                    samples += 1
                    if samples > 2_000_000 || Task.isCancelled { return false }
                }
                guard count > 0 else { return false }
            }
            guard reader.status == .completed else { return false }
            let generator = AVAssetImageGenerator(asset: asset)
            generator.appliesPreferredTrackTransform = true
            for seconds in [0.0, max(0, duration.seconds - 0.05)] {
                let (image, _) = try await generator.image(at: CMTime(seconds: seconds, preferredTimescale: 600))
                guard image.width > 0, image.height > 0 else { return false }
            }
            let after = try file.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey, .isSymbolicLinkKey])
            return after.isSymbolicLink == false && after.fileSize == before.fileSize &&
                after.contentModificationDate == before.contentModificationDate
        } catch { return false }
    }
}
