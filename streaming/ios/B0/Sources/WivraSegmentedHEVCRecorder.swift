// Wivra Ray-Ban iOS: video-only independent MOV checkpoints.
// Uses existing compressed-HEVC AVAssetWriter. No new camera/editor/audio stack.
// Each finished part is a playable MOV candidate; verify with physical glasses.
import AVFoundation
import CoreMedia
import Foundation
import QuartzCore

/// A segment begins only at an HEVC IRAP picture. The duration target is not
/// a hard upper bound when the stream does not deliver random-access pictures.
final class WivraSegmentedHEVCRecorder: @unchecked Sendable {
    private let queue = DispatchQueue(label: "com.wivra.meta.hevc-checkpoints")
    private let intervalSeconds: Double
    private var current: WivraHEVCRecorder?
    private var segmentStartUptime: CFTimeInterval?
    private var finalizations: [Task<WivraRecordingResult, Never>] = []
    private var sessionID = ""
    private var partIndex = 0
    private var active = false

    init(intervalSeconds: Double = 30) {
        self.intervalSeconds = max(5, intervalSeconds)
    }

    var completedCheckpoints: Int {
        queue.sync { finalizations.count }
    }

    func arm() -> Bool {
        queue.sync {
            guard !active && current == nil else { return false }
            sessionID = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
            partIndex = 1
            segmentStartUptime = nil
            finalizations = []
            let writer = WivraHEVCRecorder()
            guard writer.arm(fileName: partName(partIndex)) else { return false }
            current = writer
            active = true
            return true
        }
    }

    private func partName(_ part: Int) -> String {
        "Wivra_Meta_\(sessionID)_part\(String(format: "%04d", part)).mov"
    }

    func append(_ buffer: CMSampleBuffer) {
        queue.sync {
            guard active, let writer = current,
                  CMSampleBufferDataIsReady(buffer) else { return }
            let pts = CMSampleBufferGetPresentationTimeStamp(buffer)
            let isKeyframe = WivraHEVCRecorder.isHEVCKeyframe(buffer)
            // DAT may reset HEVC PTS after a cap-touch pause. Use a host
            // monotonic clock for checkpoint scheduling only, never to
            // rewrite the sample's video/audio timestamps.
            let now = CACurrentMediaTime()
            if segmentStartUptime == nil && pts.isValid && isKeyframe {
                segmentStartUptime = now
            }
            if let segmentStartUptime, pts.isValid, isKeyframe,
               now - segmentStartUptime >= intervalSeconds,
               writer.writtenFrames >= 2 {
                // Intake is serialized: the previous writer sees no more frames.
                // Finalization proceeds asynchronously while the new MOV begins
                // on this random-access frame. Never delete finalized predecessors.
                finalizations.append(Task.detached(priority: .utility) {
                    await writer.stop()
                })
                let next = WivraHEVCRecorder()
                partIndex += 1
                if next.arm(fileName: partName(partIndex)) {
                    current = next
                    self.segmentStartUptime = now
                } else {
                    // Avoid a false claim of recording if the next part cannot
                    // open. Earlier checkpoint tasks still remain recoverable.
                    current = nil
                    active = false
                    return
                }
            }
            current?.append(buffer)
        }
    }

    func stop() async -> WivraRecordingResult {
        let jobs: [Task<WivraRecordingResult, Never>]? = queue.sync {
            guard active || current != nil || !finalizations.isEmpty else {
                return nil
            }
            active = false
            if let writer = current {
                finalizations.append(Task.detached(priority: .utility) {
                    await writer.stop()
                })
            }
            current = nil
            segmentStartUptime = nil
            let submitted = finalizations
            finalizations = []
            return submitted
        }
        guard let jobs else { return .noFrames }
        var files: [URL] = []
        var frames = 0
        var dropped = 0
        var lastFailure: String?
        for job in jobs {
            switch await job.value {
            case .saved(let url, let count, let missing):
                files.append(url)
                frames += count
                dropped += missing
            case .savedSegments(let urls, let count, let missing):
                files.append(contentsOf: urls)
                frames += count
                dropped += missing
            case .failed(let message):
                lastFailure = message
            case .noFrames:
                break
            }
        }
        // Preserve all completed parts even if the final part failed.
        if !files.isEmpty {
            return .savedSegments(files, frames: frames, dropped: dropped)
        }
        return lastFailure.map { .failed($0) } ?? .noFrames
    }
}
