// Wivra Ray-Ban iOS: video-only independent MOV checkpoints.
// Uses existing compressed-HEVC AVAssetWriter. No new camera/editor/audio stack.
// Each finished part is a playable MOV candidate; verify with physical glasses.
import AVFoundation
import CoreMedia
import Foundation

/// A segment begins only at an HEVC IRAP picture. The duration target is not
/// a hard upper bound when the stream does not deliver random-access pictures.
final class WivraSegmentedHEVCRecorder: @unchecked Sendable {
    private let queue = DispatchQueue(label: "com.wivra.meta.hevc-checkpoints")
    private let intervalSeconds: Double
    private var current: WivraHEVCRecorder?
    private var firstPTS: CMTime?
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
            firstPTS = nil
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

            if firstPTS == nil && pts.isValid && isKeyframe { firstPTS = pts }
            if let firstPTS, pts.isValid, isKeyframe,
               CMTimeCompare(pts, firstPTS) > 0,
               CMTimeGetSeconds(CMTimeSubtract(pts, firstPTS)) >= intervalSeconds,
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
                    self.firstPTS = pts
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
            firstPTS = nil
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
