// Wivra iPhone MultiCam: two real video-data outputs, two bounded movie writers.
// AVCaptureSession allows only ONE MovieFileOutput, whereas iOS 17.2 supports
// multiple VideoDataOutputs. Apple AVMultiCamPiP uses data outputs + AssetWriter.
// The stable single-camera MovieFileOutput path remains separate and unchanged.
// Source/CI does not prove device dual-camera acceptance; the host can fail
// closed to a single-camera session when native capability/cost checks fail.
@preconcurrency import AVFoundation
import Foundation

final class WivraMultiCamSampleRecorder: NSObject,
    AVCaptureVideoDataOutputSampleBufferDelegate,
    AVCaptureAudioDataOutputSampleBufferDelegate, @unchecked Sendable {

    struct Result: Sendable {
        let primaryURL: URL
        let secondaryURL: URL
        let primaryComplete: Bool
        let secondaryComplete: Bool
        let secondaryOffsetSeconds: Double?
        let primaryFrames: Int
        let secondaryFrames: Int
        let primaryAudioSamples: Int
        let videoDropped: Int
    }

    // Every sample and start/stop operation is serialized on one dedicated
    // queue: never accumulate detached CMSampleBuffers or unbounded frames.
    let queue = DispatchQueue(label: "com.oswhgo.wivra.multicam.samples",
                              qos: .userInitiated)
    let primaryOutput: AVCaptureVideoDataOutput
    let secondaryOutput: AVCaptureVideoDataOutput
    let microphoneOutput: AVCaptureAudioDataOutput?
    private var take: Take?

    init(primary: AVCaptureVideoDataOutput, secondary: AVCaptureVideoDataOutput,
         microphone: AVCaptureAudioDataOutput?) {
        self.primaryOutput = primary
        self.secondaryOutput = secondary
        self.microphoneOutput = microphone
        super.init()
        primary.setSampleBufferDelegate(self, queue: queue)
        secondary.setSampleBufferDelegate(self, queue: queue)
        microphone?.setSampleBufferDelegate(self, queue: queue)
    }

    func start(primary: URL, secondary: URL, audioRequired: Bool) {
        queue.async { [self] in
            // Only caller after the previous completion may start again.
            guard take == nil else { return }
            take = Take(primary: primary, secondary: secondary,
                        audioRequired: audioRequired)
        }
    }

    func finish(_ completion: @escaping @Sendable (Result) -> Void) {
        queue.async { [self] in
            guard let old = take else { return }
            take = nil
            old.finish(completion)
        }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        guard let take else { return }
        if output === primaryOutput {
            take.primary.appendVideo(sampleBuffer)
        } else if output === secondaryOutput {
            take.secondary.appendVideo(sampleBuffer)
        } else if let microphoneOutput, output === microphoneOutput {
            take.primary.appendAudio(sampleBuffer)
        }
    }

    // Each writer owns exactly one .mov and never replaces a previously
    // created movie. Each starts at its own first VIDEO PTS (same host clock),
    // so the receipt offset is based on sample timestamps, not callback lag.
    private final class Side: @unchecked Sendable {
        let url: URL
        let audioRequired: Bool
        var writer: AVAssetWriter?
        var video: AVAssetWriterInput?
        var audio: AVAssetWriterInput?
        var firstPTS: CMTime?
        var videoFrames = 0
        var audioSamples = 0
        var dropped = 0
        var completed = false
        private var disabled = false

        init(url: URL, audioRequired: Bool) {
            self.url = url
            self.audioRequired = audioRequired
        }

        private func configure(_ sample: CMSampleBuffer) {
            guard writer == nil, !disabled,
                  let format = CMSampleBufferGetFormatDescription(sample) else { return }
            let dim = CMVideoFormatDescriptionGetDimensions(format)
            guard dim.width > 0, dim.height > 0,
                  dim.width <= 3840, dim.height <= 3840 else {
                disabled = true
                return
            }
            do {
                let w = try AVAssetWriter(outputURL: url, fileType: .mov)
                let settings: [String: Any] = [
                    AVVideoCodecKey: AVVideoCodecType.h264,
                    AVVideoWidthKey: Int(dim.width),
                    AVVideoHeightKey: Int(dim.height),
                    AVVideoCompressionPropertiesKey: [
                        AVVideoAverageBitRateKey: 3_000_000,
                        AVVideoExpectedSourceFrameRateKey: 30
                    ]
                ]
                let v = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
                v.expectsMediaDataInRealTime = true
                guard w.canAdd(v) else { disabled = true; return }
                w.add(v)
                if audioRequired {
                    let audioSettings: [String: Any] = [
                        AVFormatIDKey: kAudioFormatMPEG4AAC,
                        AVSampleRateKey: 44_100,
                        AVNumberOfChannelsKey: 1,
                        AVEncoderBitRateKey: 96_000
                    ]
                    let a = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
                    a.expectsMediaDataInRealTime = true
                    guard w.canAdd(a) else { disabled = true; return }
                    w.add(a)
                    audio = a
                }
                writer = w
                video = v
            } catch {
                // No deletion: damaged or partial bytes remain for recovery.
                disabled = true
            }
        }

        func appendVideo(_ sample: CMSampleBuffer) {
            if writer == nil { configure(sample) }
            guard !disabled, let writer, let video else { return }
            let pts = CMSampleBufferGetPresentationTimeStamp(sample)
            guard pts.isValid else { dropped += 1; return }
            if writer.status == .unknown {
                guard writer.startWriting() else { disabled = true; return }
                writer.startSession(atSourceTime: pts)
                firstPTS = pts
            }
            guard writer.status == .writing else { disabled = true; return }
            if video.isReadyForMoreMediaData {
                if video.append(sample) { videoFrames += 1 }
                else { disabled = true }
            } else {
                // Writer can't sustain real time: drop instead of retaining
                // unbounded camera frames or freezing the capture delegate.
                dropped += 1
            }
        }

        func appendAudio(_ sample: CMSampleBuffer) {
            guard audioRequired, let writer, let audio, let start = firstPTS,
                  writer.status == .writing else { return }
            let pts = CMSampleBufferGetPresentationTimeStamp(sample)
            guard pts.isValid, CMTimeCompare(pts, start) >= 0 else { return }
            if audio.isReadyForMoreMediaData {
                if audio.append(sample) { audioSamples += CMSampleBufferGetNumSamples(sample) }
                else { disabled = true }
            }
        }

        func finish(_ done: @escaping @Sendable () -> Void) {
            guard let writer, writer.status == .writing else {
                completed = false
                done()
                return
            }
            video?.markAsFinished()
            audio?.markAsFinished()
            writer.finishWriting { [self] in
                // The primary only claims success if the microphone was
                // actually encoded when requested, never mere permission.
                completed = writer.status == .completed && !disabled &&
                    videoFrames > 0 && (!audioRequired || audioSamples > 0)
                done()
            }
        }
    }

    private final class Take: @unchecked Sendable {
        let primary: Side
        let secondary: Side

        init(primary: URL, secondary: URL, audioRequired: Bool) {
            self.primary = Side(url: primary, audioRequired: audioRequired)
            self.secondary = Side(url: secondary, audioRequired: false)
        }

        func finish(_ completion: @escaping @Sendable (Result) -> Void) {
            let group = DispatchGroup()
            group.enter()
            primary.finish { group.leave() }
            group.enter()
            secondary.finish { group.leave() }
            group.notify(queue: .global(qos: .utility)) { [self] in
                let offset: Double? = {
                    guard let a = primary.firstPTS, let b = secondary.firstPTS else {
                        return nil
                    }
                    let seconds = CMTimeGetSeconds(CMTimeSubtract(b, a))
                    return seconds.isFinite ? seconds : nil
                }()
                completion(Result(primaryURL: primary.url,
                                  secondaryURL: secondary.url,
                                  primaryComplete: primary.completed,
                                  secondaryComplete: secondary.completed,
                                  secondaryOffsetSeconds: offset,
                                  primaryFrames: primary.videoFrames,
                                  secondaryFrames: secondary.videoFrames,
                                  primaryAudioSamples: primary.audioSamples,
                                  videoDropped: primary.dropped + secondary.dropped))
            }
        }
    }
}
