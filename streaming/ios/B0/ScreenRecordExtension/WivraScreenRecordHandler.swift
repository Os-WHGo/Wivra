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
    private var folder: URL?
    private var session: Shared.Session?
    private var videoWriter: AVAssetWriter?
    private var videoInput: AVAssetWriterInput?
    private var appWriter: AVAssetWriter?
    private var appInput: AVAssetWriterInput?
    private var micWriter: AVAssetWriter?
    private var micInput: AVAssetWriterInput?
    private var closed = false
    private var lastSpaceCheck = 0.0

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
            folder = dir
            session = Shared.Session(id: id, startedAtISO8601: ISO8601DateFormatter().string(from: Date()),
                                     videoFile: "Wivra_Screen_\(id).mov", appAudioFile: nil, micAudioFile: nil,
                                     videoStart: nil, appAudioStart: nil, micAudioStart: nil,
                                     finished: false, stopReason: nil)
            save()
        }
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        queue.sync {
            guard !closed, folder != nil, CMSampleBufferDataIsReady(sampleBuffer) else { return }
            switch sampleBufferType {
            case .video: writeVideo(sampleBuffer)
            case .audioApp: writeAudio(sampleBuffer, mic: false)
            case .audioMic: writeAudio(sampleBuffer, mic: true)
            @unknown default: break
            }
        }
    }

    override func broadcastFinished() {
        queue.sync { close(reason: "stopped") }
    }

    // MARK: - Video

    private func writeVideo(_ sample: CMSampleBuffer) {
        let pts = CMSampleBufferGetPresentationTimeStamp(sample)
        if videoWriter == nil {
            guard let folder, let name = session?.videoFile, let image = CMSampleBufferGetImageBuffer(sample) else { return }
            let width = CVPixelBufferGetWidth(image), height = CVPixelBufferGetHeight(image)
            do {
                let writer = try AVAssetWriter(outputURL: folder.appendingPathComponent(name), fileType: .mov)
                // Fragments every 2 s: if iOS ends the extension abruptly, what was
                // written up to the last fragment stays readable (no lost recording).
                writer.movieFragmentInterval = CMTime(seconds: 2, preferredTimescale: 600)
                let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
                    AVVideoCodecKey: AVVideoCodecType.h264,
                    AVVideoWidthKey: width,
                    AVVideoHeightKey: height,
                    AVVideoCompressionPropertiesKey: [
                        AVVideoAverageBitRateKey: Shared.videoBitrate(width: width, height: height),
                        AVVideoMaxKeyFrameIntervalDurationKey: 2,
                        AVVideoExpectedSourceFrameRateKey: 30,
                        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                    ] as [String: Any],
                ])
                input.expectsMediaDataInRealTime = true
                // The iPhone's orientation when recording starts (rotating later keeps this one).
                input.transform = Self.transform(for: sample)
                guard writer.canAdd(input) else { return stop(.writeFailed) }
                writer.add(input)
                guard writer.startWriting() else { return stop(.writeFailed) }
                writer.startSession(atSourceTime: pts)
                videoWriter = writer
                videoInput = input
                session?.videoStart = pts.seconds
                save()
            } catch { return stop(.writeFailed) }
        }
        guard let writer = videoWriter, let input = videoInput else { return }
        if writer.status == .failed { return stop(.writeFailed) }
        // A busy encoder drops this frame instead of piling frames up in memory.
        if input.isReadyForMoreMediaData { input.append(sample) }
        if pts.seconds - lastSpaceCheck >= 10, let folder {
            lastSpaceCheck = pts.seconds
            if Shared.mustStop(freeBytes: freeBytes(at: folder)) { return stop(.lowSpace) }
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

    // MARK: - Audio (app sound and microphone, each in its own file)

    private func writeAudio(_ sample: CMSampleBuffer, mic: Bool) {
        let pts = CMSampleBufferGetPresentationTimeStamp(sample)
        if (mic ? micWriter : appWriter) == nil {
            // Created on the first sample: a source that never sends sound leaves no empty file.
            guard let folder, let id = session?.id,
                  let format = CMSampleBufferGetFormatDescription(sample),
                  let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(format)?.pointee else { return }
            let channels = min(2, max(1, Int(asbd.mChannelsPerFrame)))
            let rate = asbd.mSampleRate > 0 ? min(48_000, asbd.mSampleRate) : 44_100
            let name = "Wivra_Screen_\(id)_\(mic ? "mic" : "app").m4a"
            do {
                let writer = try AVAssetWriter(outputURL: folder.appendingPathComponent(name), fileType: .m4a)
                let input = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                    AVFormatIDKey: kAudioFormatMPEG4AAC,
                    AVSampleRateKey: rate,
                    AVNumberOfChannelsKey: channels,
                    AVEncoderBitRateKey: channels == 1 ? 96_000 : 128_000,
                ], sourceFormatHint: format)
                input.expectsMediaDataInRealTime = true
                guard writer.canAdd(input) else { return }   // sound is optional: the video goes on
                writer.add(input)
                guard writer.startWriting() else { return }
                writer.startSession(atSourceTime: pts)
                if mic {
                    micWriter = writer; micInput = input
                    session?.micAudioFile = name; session?.micAudioStart = pts.seconds
                } else {
                    appWriter = writer; appInput = input
                    session?.appAudioFile = name; session?.appAudioStart = pts.seconds
                }
                save()
            } catch { return }
        }
        guard let writer = mic ? micWriter : appWriter, let input = mic ? micInput : appInput,
              writer.status == .writing, input.isReadyForMoreMediaData else { return }
        input.append(sample)
    }

    // MARK: - Ending

    private func freeBytes(at url: URL) -> Int64 {
        let values = try? url.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
        return values?.volumeAvailableCapacityForImportantUsage ?? Int64.max
    }

    /// Closes every file, then asks iOS to end the recording with a short reason.
    private func stop(_ message: Shared.Message) {
        close(reason: message.rawValue)
        let error = NSError(domain: "com.oswhgo.wivra.screenrecord", code: 1,
                            userInfo: [NSLocalizedDescriptionKey: Shared.message(message)])
        // Outside our queue: iOS may call broadcastFinished() while ending it.
        DispatchQueue.main.async { [weak self] in self?.finishBroadcastWithError(error) }
    }

    /// Idempotent: every writer is finished and waited for (the extension may be torn down right after).
    private func close(reason: String) {
        guard !closed else { return }
        closed = true
        var allClean = videoWriter != nil
        for (writer, input) in [(videoWriter, videoInput), (appWriter, appInput), (micWriter, micInput)] {
            guard let writer, let input, writer.status == .writing else {
                if writer === videoWriter { allClean = false }
                continue
            }
            input.markAsFinished()
            let done = DispatchSemaphore(value: 0)
            writer.finishWriting { done.signal() }
            if done.wait(timeout: .now() + 10) == .timedOut || writer.status != .completed {
                if writer === videoWriter { allClean = false }
            }
        }
        session?.finished = allClean
        session?.stopReason = reason
        save()
    }

    private func save() {
        guard let folder, let session, let data = try? JSONEncoder().encode(session) else { return }
        try? data.write(to: folder.appendingPathComponent(Shared.sessionFile), options: .atomic)
    }
}
