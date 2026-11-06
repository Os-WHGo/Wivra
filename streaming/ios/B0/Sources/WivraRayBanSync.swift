// Ray-Ban «solo vídeo» + independent microphone on iPhone: the same video anchoring as Android
// (WivraRayBanSync.kt, vectors in streaming/contracts/rayban-audio-sync.json). — Claude
// Host clock (CACurrentMediaTime) arrival of each written DAT sample, together with its presentation time:
// the first frame is anchored at min(arrival − pts) + firstPts, the least-delayed sample, so one late
// Bluetooth packet does not shift the audio offset. If pts regress, the first arrival is used instead.
// The glasses' own link delay is unknown to Wivra and is never invented.
import Foundation

struct WivraRayBanPartClock: Sendable {
    private(set) var firstArrival: Double = -1
    private(set) var firstPts: Double = -1
    private(set) var lastPts: Double = -1
    private(set) var samples = 0
    private(set) var ptsMonotonic = true
    private var minDelta = Double.greatestFiniteMagnitude

    mutating func observe(arrival: Double, pts: Double) {
        guard arrival > 0, pts.isFinite, pts >= 0 else { return }
        if samples == 0 { firstArrival = arrival; firstPts = pts } else if pts < lastPts { ptsMonotonic = false }
        lastPts = pts
        samples += 1
        minDelta = Swift.min(minDelta, arrival - pts)
    }

    /// Host time of the first written frame, or nil when nothing arrived.
    var start: Double? {
        guard samples > 0 else { return nil }
        return ptsMonotonic ? minDelta + firstPts : firstArrival
    }

    /// Span of presentation times; 0 when unknown (never invented).
    var duration: Double { samples > 1 && ptsMonotonic ? lastPts - firstPts : 0 }
}

/// Ray-Ban → LIVE on iPhone: DAT presentation times are in the glasses' own clock, the microphone in the
/// iPhone host clock. Each frame gets a host time: anchored at the first arrival, then DAT's own spacing;
/// re-anchored when pts go back (pause/resume) or wander > 0.5 s from arrival. Always increasing.
/// Same vectors as the Node twin (streaming/contracts/rayban-live.json, `liveClock`). — Claude
struct WivraGlassesLiveClock: Sendable {
    private var anchor: Double?
    private var lastPts: Double = -1
    private var lastOut: Double = -1

    mutating func hostTime(pts: Double, arrival: Double) -> Double {
        if let a = anchor, pts >= lastPts, abs(a + pts - arrival) <= 0.5 {} else { anchor = arrival - pts }
        lastPts = pts
        var out = (anchor ?? 0) + pts
        if out <= lastOut { out = lastOut + 0.001 }
        lastOut = out
        return out
    }
}

/// Output size and bitrate per glasses profile, the twin of WivraRayBanLivePlan.kt (same contract vectors).
struct WivraRayBanLivePlan: Sendable, Equatable {
    let width: Int, height: Int, fallbackWidth: Int, fallbackHeight: Int, fps: Int
    let videoBitrate: Int, keyframeSeconds: Int, audioSampleRate: Int, audioBitrate: Int

    static func forProfile(_ p: WivraDatProfile, withAudio: Bool) -> WivraRayBanLivePlan {
        let bitrate: Int
        switch p.height {
        case 640: bitrate = 800_000
        case 896: bitrate = p.fps >= 30 ? 2_000_000 : 1_600_000
        default: bitrate = p.fps >= 30 ? 3_000_000 : 2_500_000
        }
        let fallback: (Int, Int) = p.height == 640 ? (352, 624) : p.height == 896 ? (480, 848) : (720, 1280)
        return .init(width: p.width, height: p.height, fallbackWidth: fallback.0, fallbackHeight: fallback.1, fps: p.fps,
                     videoBitrate: bitrate, keyframeSeconds: 2, audioSampleRate: 44_100, audioBitrate: withAudio ? 96_000 : 0)
    }
}
