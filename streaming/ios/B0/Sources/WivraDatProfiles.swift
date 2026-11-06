// Ray-Ban Meta camera stream profiles (DAT 1.0.1), the same table as Android (WivraDatProfiles.kt) and
// streaming/contracts/dat-profiles.json (checked by tests on both). Sizes and frame rates are the SDK's
// documented values; the SDK itself may lower resolution, then fps (never below 15), when the Bluetooth
// Classic link is short of bandwidth. Meta: lower resolution/fps gives better quality per frame. — Claude
import Foundation

enum WivraDatProfile: String, CaseIterable, Sendable {
    case economy, balanced, motion, detail, max

    static let defaultProfile: WivraDatProfile = .balanced
    static let auto = "auto"

    var width: Int { switch self { case .economy: 360; case .balanced, .motion: 504; case .detail, .max: 720 } }
    var height: Int { switch self { case .economy: 640; case .balanced, .motion: 896; case .detail, .max: 1280 } }
    var fps: Int { switch self { case .economy, .detail: 15; case .balanced: 24; case .motion, .max: 30 } }
    var label: String { "\(width) × \(height), \(fps) FPS" }
}

/// «Automático»: chooses the profile for the NEXT camera start from what the last session really delivered,
/// and only SUGGESTS a lower profile during a session (a DAT profile change restarts the camera: never silent,
/// never while recording or live). Hysteresis: judged after ≥ 10 s (≥ 30 s to step up), at most one
/// suggestion per minute, never suggests going up, never goes to 720p by itself.
enum WivraDatAuto {
    struct Observed: Sendable {
        let profile: WivraDatProfile
        let seconds: Double
        let measuredFps: Double
        let stalls: Int
        let receivedHeight: Int
        let thermal: Bool
    }

    private static let ladder: [WivraDatProfile] = [.economy, .balanced, .motion]

    private static func unhealthy(_ o: Observed) -> Bool {
        o.measuredFps < 0.75 * Double(o.profile.fps) ||
            Double(o.stalls) * 60 / Swift.max(1, o.seconds) > 2 ||
            (o.receivedHeight > 0 && o.receivedHeight < o.profile.height)
    }

    private static func lower(_ p: WivraDatProfile) -> WivraDatProfile? {
        switch p { case .economy: nil; case .balanced: .economy; default: .balanced }
    }

    static func start(last: Observed?, thermalNow: Bool) -> WivraDatProfile {
        if thermalNow { return .economy }
        guard let last else { return .defaultProfile }
        let base = ladder.contains(last.profile) ? last.profile : .balanced
        if last.seconds < 10 { return base }
        if last.thermal || unhealthy(last) { return lower(last.profile) ?? .economy }
        let healthy = last.seconds >= 30 && last.measuredFps >= 0.95 * Double(last.profile.fps) && last.stalls == 0 &&
            last.receivedHeight >= last.profile.height
        if healthy, let i = ladder.firstIndex(of: last.profile) { return ladder[Swift.min(ladder.count - 1, i + 1)] }
        return base
    }

    static func suggest(window: Observed, secondsSinceLastSuggestion: Double) -> WivraDatProfile? {
        if window.seconds < 10 || secondsSinceLastSuggestion < 60 { return nil }
        if window.thermal || unhealthy(window) { return lower(window.profile) }
        return nil
    }
}

/// Privacy-respecting stream diagnostics: only arrival times, sizes and byte counts of frames are kept
/// (bounded: the last 600 intervals), never pictures. A stall is a gap above max(500 ms, 4 frame periods).
struct WivraDatStreamStats: Sendable {
    struct Snapshot: Sendable {
        let frames: Int, seconds: Double, fps: Double, p95IntervalMs: Double, maxGapMs: Int64
        let stalls: Int, width: Int, height: Int, mbps: Double
    }

    let nominalFps: Int
    private var intervals: [Int64] = []
    private var first: Int64 = -1
    private var last: Int64 = -1
    private var frames = 0
    private var stalls = 0
    private var maxGap: Int64 = 0
    private var bytes: Int64 = 0
    private(set) var width = 0
    private(set) var height = 0

    init(nominalFps: Int) { self.nominalFps = nominalFps }

    mutating func frame(uptimeMs: Int64, width w: Int, height h: Int, payloadBytes: Int) {
        if first < 0 { first = uptimeMs }
        if last >= 0 {
            let gap = uptimeMs - last
            intervals.append(gap)
            if intervals.count > 600 { intervals.removeFirst() }
            if gap > Swift.max(500, Int64(4000.0 / Double(Swift.max(1, nominalFps)))) { stalls += 1 }
            if gap > maxGap { maxGap = gap }
        }
        last = uptimeMs
        frames += 1
        bytes += Int64(Swift.max(0, payloadBytes))
        if w > 0 && h > 0 { width = w; height = h }
    }

    func snapshot() -> Snapshot {
        let seconds = frames > 1 ? Double(last - first) / 1000 : 0
        let sorted = intervals.sorted()
        let p95 = sorted.isEmpty ? 0 : Double(sorted[Swift.max(0, Int((0.95 * Double(sorted.count)).rounded(.up)) - 1)])
        return Snapshot(frames: frames, seconds: seconds, fps: seconds > 0 ? Double(frames - 1) / seconds : 0,
                        p95IntervalMs: p95, maxGapMs: maxGap, stalls: stalls, width: width, height: height,
                        mbps: seconds > 0 ? Double(bytes) * 8 / seconds / 1_000_000 : 0)
    }
}
