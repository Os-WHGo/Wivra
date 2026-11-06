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
