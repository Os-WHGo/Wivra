// Wivra iOS multicamera decisions (Foundation only, compiled by a macOS smoke).
// Mirrors core/multicam-plan.mjs: same PiP numbers, same take classification.
// Choosing two cameras here is NOT evidence that an iPhone records them; only
// two verified files are. — Claude
import Foundation

enum WivraMultiCamCorner: String, CaseIterable, Codable, Sendable {
    case bottomRight = "bottom-right", bottomLeft = "bottom-left", topLeft = "top-left", topRight = "top-right"
    var next: WivraMultiCamCorner {
        let all = Self.allCases
        return all[(all.firstIndex(of: self)! + 1) % all.count]
    }
}

enum WivraMultiCamTakeStatus: String, Codable, Sendable {
    case kept, needsReview = "needs-review", empty
}

enum WivraMultiCamPolicy {
    struct Rect: Equatable, Sendable { let x: Double, y: Double, w: Double, h: Double }
    struct Plan: Equatable, Sendable { let dual: Bool; let reason: String }

    static func round6(_ v: Double) -> Double { (v * 1_000_000).rounded() / 1_000_000 }

    /// Normalized rectangle, origin top-left; same scale on both axes.
    static func pipRect(_ corner: WivraMultiCamCorner, scale: Double = 0.3, margin: Double = 0.04,
                        frameWidth: Double = 1080, frameHeight: Double = 1920) -> Rect {
        let s = min(0.5, max(0.15, scale))
        let mx = min(0.1, max(0, margin))
        let my = mx * frameWidth / frameHeight
        let left = corner == .bottomLeft || corner == .topLeft
        let top = corner == .topLeft || corner == .topRight
        return Rect(x: round6(left ? mx : 1 - mx - s), y: round6(top ? my : 1 - my - s),
                    w: round6(s), h: round6(s))
    }

    /// Editor overlay clip values (x, y = centre; scale = width fraction).
    static func editorOverlay(_ r: Rect) -> (x: Double, y: Double, scale: Double) {
        (round6(r.x + r.w / 2), round6(r.y + r.h / 2), round6(r.w))
    }

    /// `multiCamSupported` must be AVCaptureMultiCamSession.isMultiCamSupported
    /// on THIS device, and the cost check the configured session's real costs.
    static func plan(multiCamSupported: Bool, hasBack: Bool, hasFront: Bool,
                     hardwareCost: Float? = nil, systemPressureCost: Float? = nil) -> Plan {
        guard hasBack || hasFront else { return Plan(dual: false, reason: "no-camera") }
        guard hasBack && hasFront else { return Plan(dual: false, reason: "one-camera") }
        guard multiCamSupported else { return Plan(dual: false, reason: "multicam-unsupported") }
        if let cost = hardwareCost, cost > 1.0 { return Plan(dual: false, reason: "hardware-cost") }
        if let cost = systemPressureCost, cost > 1.0 { return Plan(dual: false, reason: "system-pressure-cost") }
        return Plan(dual: true, reason: "multicam-session")
    }

    /// A file with bytes is never discarded automatically.
    static func classifyTake(bytes: Int64, finishedWithoutError: Bool) -> WivraMultiCamTakeStatus {
        if bytes <= 0 { return .empty }
        return finishedWithoutError ? .kept : .needsReview
    }

    /// After a camera is lost mid-recording, continue only with one left.
    static func shouldContinueAfterLoss(remainingCameras: Int, ownerStopped: Bool) -> Bool {
        remainingCameras > 0 && !ownerStopped
    }
}

/// Pair receipt written next to the two movies so the editor can compose
/// them (main + PiP) with the measured start offset. Offsets come from the
/// didStartRecording callbacks on one host clock: approximate, not frame-exact.
struct WivraMultiCamTakeManifest: Codable, Equatable, Sendable {
    var schema = "wivra-multicam-take-v1"
    let take: Int
    let mode: String              // "dual-separate" | "single"
    let primaryFile: String
    let primaryPosition: String   // "back" | "front"
    let secondaryFile: String?
    let secondaryPosition: String?
    let secondaryOffsetMs: Double?
    let offsetSource: String
    let audio: String             // "primary" | "none"
    let corner: WivraMultiCamCorner
    let continuation: Bool
    let primaryStatus: WivraMultiCamTakeStatus
    let secondaryStatus: WivraMultiCamTakeStatus?

    static func write(_ manifest: WivraMultiCamTakeManifest, beside movie: URL) throws -> URL {
        let safe = movie.deletingPathExtension().lastPathComponent
        guard !safe.isEmpty, !safe.contains("/"), !safe.hasPrefix(".") else {
            throw CocoaError(.fileWriteInvalidFileName)
        }
        let url = movie.deletingLastPathComponent().appendingPathComponent(safe + ".multicam.json")
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(manifest).write(to: url, options: .atomic)
        return url
    }
}
