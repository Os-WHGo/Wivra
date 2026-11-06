// W108 (Claude): the file-writing part of iPhone screen recording, without ReplayKit, so it can be
// checked on macOS with synthetic frames (streaming/tests/WivraScreenRecordWriterSmoke.swift).
// One recording = one folder: an H.264 MOV written in 2 s fragments (readable up to the last fragment
// if the process is ended abruptly), app sound and microphone each in their own M4A, created on their
// first sample, and session.json with the measured start of each file. Not thread-safe: the caller
// uses it from one serial queue. Nothing here sends anything anywhere.
import AVFoundation
import Foundation

final class WivraScreenRecordWriter {
    private typealias Shared = WivraScreenRecordShared
    enum AppendResult { case ok, failed }

    let folder: URL
    private(set) var session: Shared.Session
    private var videoWriter: AVAssetWriter?
    private var videoInput: AVAssetWriterInput?
    private var appWriter: AVAssetWriter?
    private var appInput: AVAssetWriterInput?
    private var micWriter: AVAssetWriter?
    private var micInput: AVAssetWriterInput?
    private(set) var closed = false
    private var lastSpaceCheck = -Double.infinity
    /// Fragment length of the MOV (an abrupt end loses at most about this much).
    static let fragmentSeconds = 2.0

    init(folder: URL, id: String, startedAt: Date = Date()) {
        self.folder = folder
        session = Shared.Session(id: id, startedAtISO8601: ISO8601DateFormatter().string(from: startedAt),
                                 videoFile: "Wivra_Screen_\(id).mov", appAudioFile: nil, micAudioFile: nil,
                                 videoStart: nil, appAudioStart: nil, micAudioStart: nil,
                                 finished: false, stopReason: nil)
        save()
    }

    var videoURL: URL { folder.appendingPathComponent(session.videoFile) }

    /// Appends one frame; the first frame creates the MOV at that frame's size. A busy encoder drops the
    /// frame instead of piling frames up in memory (the extension's memory budget is small).
    func appendVideo(_ sample: CMSampleBuffer, transform: CGAffineTransform = .identity) -> AppendResult {
        guard !closed else { return .ok }
        let pts = CMSampleBufferGetPresentationTimeStamp(sample)
        if videoWriter == nil {
            guard let image = CMSampleBufferGetImageBuffer(sample) else { return .ok }
            let width = CVPixelBufferGetWidth(image), height = CVPixelBufferGetHeight(image)
            guard let writer = try? AVAssetWriter(outputURL: videoURL, fileType: .mov) else { return .failed }
            writer.movieFragmentInterval = CMTime(seconds: Self.fragmentSeconds, preferredTimescale: 600)
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
            input.transform = transform
            guard writer.canAdd(input) else { return .failed }
            writer.add(input)
            guard writer.startWriting() else { return .failed }
            writer.startSession(atSourceTime: pts)
            videoWriter = writer
            videoInput = input
            session.videoStart = pts.seconds
            save()
        }
        guard let writer = videoWriter, let input = videoInput else { return .ok }
        if writer.status == .failed { return .failed }
        if input.isReadyForMoreMediaData { input.append(sample) }
        return writer.status == .failed ? .failed : .ok
    }

    /// True about every 10 s of video: time for the caller to check free space.
    func spaceCheckDue(_ sample: CMSampleBuffer) -> Bool {
        let t = CMSampleBufferGetPresentationTimeStamp(sample).seconds
        guard t - lastSpaceCheck >= 10 else { return false }
        lastSpaceCheck = t
        return true
    }

    /// App sound or microphone, each in its own M4A created on its first sample (a source that
    /// never sends sound leaves no empty file). Sound is optional: a failure never stops the video.
    func appendAudio(_ sample: CMSampleBuffer, mic: Bool) {
        guard !closed else { return }
        let pts = CMSampleBufferGetPresentationTimeStamp(sample)
        if (mic ? micWriter : appWriter) == nil {
            guard let format = CMSampleBufferGetFormatDescription(sample),
                  let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(format)?.pointee else { return }
            let channels = min(2, max(1, Int(asbd.mChannelsPerFrame)))
            let rate = asbd.mSampleRate > 0 ? min(48_000, asbd.mSampleRate) : 44_100
            let name = "Wivra_Screen_\(session.id)_\(mic ? "mic" : "app").m4a"
            guard let writer = try? AVAssetWriter(outputURL: folder.appendingPathComponent(name), fileType: .m4a) else { return }
            let input = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: rate,
                AVNumberOfChannelsKey: channels,
                AVEncoderBitRateKey: channels == 1 ? 96_000 : 128_000,
            ], sourceFormatHint: format)
            input.expectsMediaDataInRealTime = true
            guard writer.canAdd(input) else { return }
            writer.add(input)
            guard writer.startWriting() else { return }
            writer.startSession(atSourceTime: pts)
            if mic {
                micWriter = writer; micInput = input
                session.micAudioFile = name; session.micAudioStart = pts.seconds
            } else {
                appWriter = writer; appInput = input
                session.appAudioFile = name; session.appAudioStart = pts.seconds
            }
            save()
        }
        guard let writer = mic ? micWriter : appWriter, let input = mic ? micInput : appInput,
              writer.status == .writing, input.isReadyForMoreMediaData else { return }
        input.append(sample)
    }

    /// Idempotent: finishes every file and waits for it (an extension may be torn down right after).
    /// Returns whether the video was closed cleanly; the result is recorded in session.json.
    @discardableResult
    func close(reason: String) -> Bool {
        guard !closed else { return session.finished }
        closed = true
        var videoClean = false
        for (writer, input, isVideo) in [(videoWriter, videoInput, true), (appWriter, appInput, false), (micWriter, micInput, false)] {
            guard let writer, let input, writer.status == .writing else { continue }
            input.markAsFinished()
            let done = DispatchSemaphore(value: 0)
            writer.finishWriting { done.signal() }
            let finished = done.wait(timeout: .now() + 10) == .success && writer.status == .completed
            if isVideo { videoClean = finished }
        }
        session.finished = videoClean
        session.stopReason = reason
        save()
        return videoClean
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(session) else { return }
        try? data.write(to: folder.appendingPathComponent(Shared.sessionFile), options: .atomic)
    }
}
