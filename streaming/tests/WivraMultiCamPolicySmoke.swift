// macOS smoke for WivraMultiCamPolicy (same numbers as core/multicam-plan.mjs). — Claude
import Foundation

@main
struct WivraMultiCamPolicySmoke {
    static func check(_ ok: Bool, _ what: String) {
        if !ok { FileHandle.standardError.write(Data(("FAIL: " + what + "\n").utf8)); exit(1) }
        print("ok - " + what)
    }

    static func main() throws {
        let r = WivraMultiCamPolicy.pipRect(.bottomRight, scale: 0.3, margin: 0.04, frameWidth: 1080, frameHeight: 1920)
        check(r == .init(x: 0.66, y: 0.6775, w: 0.3, h: 0.3), "bottom-right PiP rectangle matches JS")
        let o = WivraMultiCamPolicy.editorOverlay(r)
        check(o.x == 0.81 && o.y == 0.8275 && o.scale == 0.3, "editor overlay matches JS")
        for c in WivraMultiCamCorner.allCases {
            let k = WivraMultiCamPolicy.pipRect(c)
            check(k.x >= 0 && k.y >= 0 && k.x + k.w <= 1.000001 && k.y + k.h <= 1.000001, "inside frame \(c.rawValue)")
        }
        check(WivraMultiCamCorner.topRight.next == .bottomRight, "corner cycle")
        check(!WivraMultiCamPolicy.plan(multiCamSupported: false, hasBack: true, hasFront: true).dual, "unsupported → single")
        check(WivraMultiCamPolicy.plan(multiCamSupported: true, hasBack: true, hasFront: true).dual, "supported → dual")
        check(WivraMultiCamPolicy.plan(multiCamSupported: true, hasBack: true, hasFront: true, hardwareCost: 1.2).reason == "hardware-cost", "hardware cost → single")
        check(WivraMultiCamPolicy.plan(multiCamSupported: true, hasBack: true, hasFront: false).reason == "one-camera", "one camera")
        check(WivraMultiCamPolicy.classifyTake(bytes: 0, finishedWithoutError: true) == .empty, "zero bytes empty")
        check(WivraMultiCamPolicy.classifyTake(bytes: 10, finishedWithoutError: false) == .needsReview, "error keeps bytes")
        check(WivraMultiCamPolicy.classifyTake(bytes: 10, finishedWithoutError: true) == .kept, "clean take kept")
        check(WivraMultiCamPolicy.shouldContinueAfterLoss(remainingCameras: 1, ownerStopped: false), "continue with remaining")
        check(!WivraMultiCamPolicy.shouldContinueAfterLoss(remainingCameras: 0, ownerStopped: false), "stop with none")

        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("wivra-multicam-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let movie = dir.appendingPathComponent("Wivra_A.mov")
        let manifest = WivraMultiCamTakeManifest(
            take: 1, mode: "dual-separate", primaryFile: "Wivra_A.mov", primaryPosition: "back",
            secondaryFile: "Wivra_B.mov", secondaryPosition: "front", secondaryOffsetMs: 41.5,
            offsetSource: "didStartRecording-callback", audio: "primary", corner: .bottomRight,
            continuation: false, primaryStatus: .kept, secondaryStatus: .needsReview)
        let url = try WivraMultiCamTakeManifest.write(manifest, beside: movie)
        check(url.lastPathComponent == "Wivra_A.multicam.json", "manifest next to movie")
        let back = try JSONDecoder().decode(WivraMultiCamTakeManifest.self, from: Data(contentsOf: url))
        check(back == manifest, "manifest round trip")
        let text = try String(contentsOf: url, encoding: .utf8)
        check(text.contains("\"secondaryStatus\":\"needs-review\"") && text.contains("\"schema\":\"wivra-multicam-take-v1\""), "stable JSON names")
        do {
            _ = try WivraMultiCamTakeManifest.write(manifest, beside: dir.appendingPathComponent(".mov"))
            check(false, "hidden name rejected")
        } catch { check(true, "hidden name rejected") }
    }
}
