// Wivra W69: pure Foundation receipt and PTS safety checks.
// Compilation is independent of AVFoundation and physical camera access.
import Foundation

enum WivraMultiCamRecoveryPolicy {
    static func isGeneratedVideoName(_ name: String) -> Bool {
        guard name.hasPrefix("Wivra_"), name.hasSuffix(".mov"),
              name.count == "Wivra_".count + 36 + ".mov".count else { return false }
        let id = String(name.dropFirst("Wivra_".count).dropLast(".mov".count))
        return UUID(uuidString: id) != nil
    }

    static func isValidIntent(_ m: WivraMultiCamTakeManifest) -> Bool {
        guard m.schema == "wivra-multicam-take-v1", m.mode == "dual-separate",
              m.take > 0 && m.take < 100_000,
              isGeneratedVideoName(m.primaryFile),
              let second = m.secondaryFile, isGeneratedVideoName(second),
              second != m.primaryFile, m.secondaryStatus != nil,
              ["back", "front"].contains(m.primaryPosition),
              ["back", "front"].contains(m.secondaryPosition ?? ""),
              m.primaryPosition != m.secondaryPosition,
              ["primary", "none"].contains(m.audio),
              ["awaiting-video-sample-pts", "video-sample-pts"].contains(m.offsetSource),
              (m.secondaryOffsetMs.map { $0.isFinite && abs($0) <= 10_000 } ?? true)
        else { return false }
        return true
    }

    static func mayPair(secondaryVerified: Bool, offsetSource: String,
                        offsetMs: Double?) -> Bool {
        guard secondaryVerified, offsetSource == "video-sample-pts",
              let offsetMs, offsetMs.isFinite, abs(offsetMs) <= 10_000 else { return false }
        return true
    }
}
