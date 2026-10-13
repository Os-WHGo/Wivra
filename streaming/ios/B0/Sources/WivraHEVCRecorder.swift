// Wivra Meta B1A: EXPERIMENTAL video-only HEVC MOV recorder.
// Uses compressed DAT CMSampleBuffer frames with AVAssetWriter passthrough.
// No original-glasses-media access, audio, unlimited recording, or RTMPS.
// Every result requires a real-file check and on-device playback validation.
// Copyright 2026 Wivra contributors — written independently for this project.
import AVFoundation
import CoreMedia
import Foundation

enum WivraRecordingResult: Sendable {
    case saved(URL, frames: Int, dropped: Int)
    case noFrames
    case failed(String)
}

/// Serializes all writer operations on one queue. A recording begins only on a
/// HEVC random-access sample. A requested stop ends intake before finalization.
final class WivraHEVCRecorder: @unchecked Sendable {
    private let queue = DispatchQueue(label: "com.wivra.meta.hevc-recorder")
    private var writer: AVAssetWriter?
    private var videoInput: AVAssetWriterInput?
    private var fileURL: URL?
    private var armed = false
    private var finalizing = false
    private var sourceStartTime: CMTime?
    private var previousDTS: CMTime?
    private var appendedCount = 0
    private var droppedCount = 0
    private let defaultFrameDuration = CMTime(value: 1, timescale: 24)

    func arm() -> Bool {
        queue.sync {
            guard !armed && !finalizing && writer == nil else { return false }
            armed = true
            sourceStartTime = nil
            previousDTS = nil
            appendedCount = 0
            droppedCount = 0
            return true
        }
    }

    func append(_ buffer: CMSampleBuffer) {
        queue.sync {
            guard armed && !finalizing && CMSampleBufferDataIsReady(buffer),
                  let format = CMSampleBufferGetFormatDescription(buffer),
                  CMFormatDescriptionGetMediaType(format) == kCMMediaType_Video
            else { return }
            if writer == nil {
                // Never save a file that begins on an undecodable P-frame.
                guard Self.isHEVCKeyframe(buffer) else { return }
                do {
                    let folder = try Self.recordingsDirectory()
                    let url = folder.appendingPathComponent("Wivra_Meta_\(UUID().uuidString).mov")
                    let assetWriter = try AVAssetWriter(outputURL: url, fileType: .mov)
                    let input = AVAssetWriterInput(mediaType: .video, outputSettings: nil, sourceFormatHint: format)
                    input.expectsMediaDataInRealTime = true
                    guard assetWriter.canAdd(input) else {
                        armed = false
                        return
                    }
                    assetWriter.add(input)
                    guard assetWriter.startWriting() else {
                        armed = false
                        return
                    }
                    assetWriter.startSession(atSourceTime: .zero)
                    writer = assetWriter
                    videoInput = input
                    fileURL = url
                } catch {
                    armed = false
                    return
                }
            }
            guard let writer, let input = videoInput, writer.status == .writing else {
                droppedCount += 1
                return
            }
            guard input.isReadyForMoreMediaData else {
                droppedCount += 1
                return
            }
            let originalPTS = CMSampleBufferGetPresentationTimeStamp(buffer)
            guard originalPTS.isValid else {
                droppedCount += 1
                return
            }
            let originalDTS = CMSampleBufferGetDecodeTimeStamp(buffer)
            let originalDuration = CMSampleBufferGetDuration(buffer)
            let duration = originalDuration.isValid && originalDuration > .zero ? originalDuration : defaultFrameDuration
            if sourceStartTime == nil { sourceStartTime = originalPTS }
            guard let origin = sourceStartTime else { return }
            var dts = CMTimeSubtract(originalDTS.isValid ? originalDTS : originalPTS, origin)
            if let previousDTS {
                let next = CMTimeAdd(previousDTS, duration)
                if dts < next { dts = next }
            }
            var pts = CMTimeSubtract(originalPTS, origin)
            if pts < dts { pts = dts }
            var timing = CMSampleTimingInfo(duration: duration, presentationTimeStamp: pts, decodeTimeStamp: dts)
            var adjusted: CMSampleBuffer?
            let status = CMSampleBufferCreateCopyWithNewTiming(
                allocator: kCFAllocatorDefault, sampleBuffer: buffer,
                sampleTimingEntryCount: 1, sampleTimingArray: &timing,
                sampleBufferOut: &adjusted
            )
            guard status == noErr, let adjusted else {
                droppedCount += 1
                return
            }
            let sync = Self.isHEVCKeyframe(buffer)
            if let attachments = CMSampleBufferGetSampleAttachmentsArray(adjusted, createIfNecessary: true) as? [NSMutableDictionary],
               let flags = attachments.first {
                flags[kCMSampleAttachmentKey_NotSync] = !sync
                flags[kCMSampleAttachmentKey_DependsOnOthers] = !sync
            }
            if input.append(adjusted) {
                previousDTS = dts
                appendedCount += 1
            } else {
                droppedCount += 1
            }
        }
    }

    func stop() async -> WivraRecordingResult {
        await withCheckedContinuation { continuation in
            queue.async {
                // Reject concurrent finalization instead of risking two finishWriting calls.
                guard !self.finalizing else {
                    continuation.resume(returning: .failed("Finalización anterior todavía en curso"))
                    return
                }
                self.armed = false
                guard let writer = self.writer, let input = self.videoInput,
                      let url = self.fileURL, self.appendedCount > 0 else {
                    self.reset()
                    continuation.resume(returning: .noFrames)
                    return
                }
                self.finalizing = true
                input.markAsFinished()
                // Callback re-enters the queue only after the writer finishes.
                writer.finishWriting { [self] in
                    self.queue.async {
                        let successful = self.writer?.status == .completed
                        let errorText = self.writer?.error?.localizedDescription ?? "No se pudo finalizar el MOV."
                        let count = self.appendedCount
                        let dropped = self.droppedCount
                        self.reset()
                        if successful && (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int64 ?? 0) ?? 0 > 0 {
                            continuation.resume(returning: .saved(url, frames: count, dropped: dropped))
                        } else {
                            try? FileManager.default.removeItem(at: url)
                            continuation.resume(returning: .failed(errorText))
                        }
                    }
                }
            }
        }
    }

    private func reset() {
        // Called only on our serial queue, not from outside.
        writer = nil
        videoInput = nil
        fileURL = nil
        armed = false
        finalizing = false
        sourceStartTime = nil
        previousDTS = nil
    }

    private static func recordingsDirectory() throws -> URL {
        let base = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let directory = base.appendingPathComponent("WivraRecordings", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    // HEVC length-prefixed NAL units: IRAP NAL types 16...21. Even if the SDK
    // leaves sync flags empty, a real keyframe is required to start recording.
    private static func isHEVCKeyframe(_ buffer: CMSampleBuffer) -> Bool {
        guard let block = CMSampleBufferGetDataBuffer(buffer) else { return false }
        let size = CMBlockBufferGetDataLength(block)
        var cursor = 0
        while cursor + 5 <= size {
            var prefix: UInt32 = 0
            guard CMBlockBufferCopyDataBytes(block, atOffset: cursor, dataLength: 4, destination: &prefix) == kCMBlockBufferNoErr else { return false }
            let length = Int(UInt32(bigEndian: prefix))
            cursor += 4
            guard length > 0 && length <= size - cursor else { return false }
            var header: UInt8 = 0
            guard CMBlockBufferCopyDataBytes(block, atOffset: cursor, dataLength: 1, destination: &header) == kCMBlockBufferNoErr else { return false }
            if (16...21).contains(Int((header >> 1) & 0x3f)) { return true }
            cursor += length
        }
        return false
    }
}
