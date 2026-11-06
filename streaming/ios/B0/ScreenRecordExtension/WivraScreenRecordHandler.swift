// W100 (Claude, owner decision 1A): iPhone screen recording, LOCAL ONLY.
// A ReplayKit Broadcast Upload Extension is the only way iOS lets an app record
// the whole screen (other apps included). Here nothing is uploaded: the
// extension writes files into Wivra's App Group folder and the Wivra app turns
// them into a normal capture (manifest v2) that the editor imports.
//
// Real iOS limits (see docs/WIVRA_SCREEN_RECORDING_2026-11-06.md):
// - The person starts and stops it from iOS (Wivra's button or Control Center);
//   the red status indicator is always visible.
// - Protected content (DRM video, some banking/streaming apps) is recorded black.
// - Sound of other apps arrives as "app audio"; the microphone only when the person
//   turns it on in the iOS sheet. They are kept as two separate files/tracks.
// - The extension has a small memory budget (about 50 MB reported, not published by
//   Apple): frames are written straight to the hardware encoder, never kept.
// - The camera cannot be used here.
import AVFoundation
import ReplayKit

final class WivraScreenRecordHandler: RPBroadcastSampleHandler {
    private typealias Shared = WivraScreenRecordShared
    private let queue = DispatchQueue(label: "com.oswhgo.wivra.screenrecord")
    // W108: all file writing lives in Shared/WivraScreenRecordWriter.swift (checked on macOS).
    private var writer: WivraScreenRecordWriter?
    private var ended = false

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        queue.sync {
            guard let root = Shared.root() else { return stop(.noStorage) }
            if Shared.mustStop(freeBytes: freeBytes(at: root.deletingLastPathComponent())) { return stop(.lowSpace) }
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = "yyyyMMdd_HHmmss"
            let id = formatter.string(from: Date()) + "_" + String(UUID().uuidString.prefix(8))
            let dir = root.appendingPathComponent(id, isDirectory: true)
            do {
                try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            } catch { return stop(.noStorage) }
            writer = WivraScreenRecordWriter(folder: dir, id: id)
        }
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        queue.sync {
            guard !ended, let writer, CMSampleBufferDataIsReady(sampleBuffer) else { return }
            switch sampleBufferType {
            case .video:
                // The iPhone's orientation when recording starts (rotating later keeps this one).
                if writer.appendVideo(sampleBuffer, transform: Self.transform(for: sampleBuffer)) == .failed { return stop(.writeFailed) }
                if writer.spaceCheckDue(sampleBuffer), Shared.mustStop(freeBytes: freeBytes(at: writer.folder)) { return stop(.lowSpace) }
            case .audioApp: writer.appendAudio(sampleBuffer, mic: false)
            case .audioMic: writer.appendAudio(sampleBuffer, mic: true)
            @unknown default: break
            }
        }
    }

    override func broadcastFinished() {
        queue.sync {
            ended = true
            writer?.close(reason: "stopped")
        }
    }

    private static func transform(for sample: CMSampleBuffer) -> CGAffineTransform {
        guard let raw = CMGetAttachment(sample, key: RPVideoSampleOrientationKey as CFString, attachmentModeOut: nil) as? NSNumber,
              let orientation = CGImagePropertyOrientation(rawValue: raw.uint32Value) else { return .identity }
        switch orientation {
        case .left: return CGAffineTransform(rotationAngle: -.pi / 2)
        case .right: return CGAffineTransform(rotationAngle: .pi / 2)
        case .down: return CGAffineTransform(rotationAngle: .pi)
        default: return .identity
        }
    }

    private func freeBytes(at url: URL) -> Int64 {
        let values = try? url.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
        return values?.volumeAvailableCapacityForImportantUsage ?? Int64.max
    }

    /// Closes every file (keeping what was recorded), then asks iOS to end the recording with a short reason.
    private func stop(_ message: Shared.Message) {
        ended = true
        writer?.close(reason: message.rawValue)
        let error = NSError(domain: "com.oswhgo.wivra.screenrecord", code: 1,
                            userInfo: [NSLocalizedDescriptionKey: Shared.message(message)])
        // Outside our queue: iOS may call broadcastFinished() while ending it.
        DispatchQueue.main.async { [weak self] in self?.finishBroadcastWithError(error) }
    }
}
