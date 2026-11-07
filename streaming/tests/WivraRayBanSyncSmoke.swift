// iPhone video anchoring for Ray-Ban + independent microphone against the vectors shared with Android
// (streaming/contracts/rayban-audio-sync.json). Not a glasses test. — Claude
import Foundation

@main
struct WivraRayBanSyncSmoke {
    static func check(_ ok: Bool, _ what: String) {
        print((ok ? "ok - " : "not ok - ") + what)
        if !ok { exit(1) }
    }

    static func main() {
        let path = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "streaming/contracts/rayban-audio-sync.json"
        let v = try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: path))) as! [String: Any]
        for c in v["partClocks"] as! [[String: Any]] {
            var clock = WivraRayBanPartClock()
            for s in c["samples"] as! [[NSNumber]] { clock.observe(arrival: s[0].doubleValue / 1e9, pts: s[1].doubleValue / 1e6) }
            let why = c["why"] as! String
            let expectStart = (c["expectStartNs"] as! NSNumber).doubleValue
            if expectStart < 0 { check(clock.start == nil, why) } else { check(abs((clock.start ?? -1) - expectStart / 1e9) < 1e-6, why + " (start)") }
            check(abs(clock.duration - (c["expectDurationUs"] as! NSNumber).doubleValue / 1e6) < 1e-9, why + " (duration)")
            check(clock.ptsMonotonic == (c["expectMonotonic"] as! Bool), why + " (monotonic)")
        }
        // Ray-Ban → LIVE: host-clock times for DAT frames and the output plan (streaming/contracts/rayban-live.json).
        let livePath = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "streaming/contracts/rayban-live.json"
        let live = try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: livePath))) as! [String: Any]
        for c in live["liveClock"] as! [[String: Any]] {
            var clock = WivraGlassesLiveClock()
            let got = (c["frames"] as! [[NSNumber]]).map { clock.hostTime(pts: $0[0].doubleValue, arrival: $0[1].doubleValue) }
            let want = (c["expect"] as! [NSNumber]).map(\.doubleValue)
            check(got.count == want.count && zip(got, want).allSatisfy { abs($0 - $1) < 1e-6 }, "live clock: " + (c["why"] as! String))
        }
        for p in live["plans"] as! [[String: Any]] {
            let plan = WivraRayBanLivePlan.forProfile(WivraDatProfile(rawValue: p["profile"] as! String)!, withAudio: p["audio"] as! Bool)
            let want = (p["expect"] as! [NSNumber]).map(\.intValue)
            check([plan.width, plan.height, plan.fallbackWidth, plan.fallbackHeight, plan.fps, plan.videoBitrate,
                   plan.keyframeSeconds, plan.audioSampleRate, plan.audioBitrate] == want, "live plan: " + (p["profile"] as! String))
        }
        // Light LIVE looks (streaming/contracts/rayban-looks.json): table and CPU reference of the chain.
        let looksPath = CommandLine.arguments.count > 3 ? CommandLine.arguments[3] : "streaming/contracts/rayban-looks.json"
        let lk = try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: looksPath))) as! [String: Any]
        let table = lk["looks"] as! [[String: Any]]
        check(table.count == WivraRayBanLook.allCases.count && WivraRayBanLook.defaultLook.rawValue == lk["default"] as! String, "looks table")
        for l in table {
            let look = WivraRayBanLook(rawValue: l["id"] as! String)!
            check(abs(look.exposureEv - (l["exposureEv"] as! NSNumber).doubleValue) < 1e-9 &&
                  abs(look.contrast - (l["contrast"] as! NSNumber).doubleValue) < 1e-9 &&
                  abs(look.sharpen - (l["sharpen"] as! NSNumber).doubleValue) < 1e-9, "look " + look.rawValue)
        }
        for r in lk["reference"] as! [[String: Any]] {
            let p = (r["pixel"] as! [NSNumber]).map(\.doubleValue)
            let got = WivraRayBanLook.reference(WivraRayBanLook(rawValue: r["look"] as! String)!, p[0], p[1], p[2], p[3], p[4])
            check(abs(got - (r["expect"] as! NSNumber).doubleValue) < 1e-4, "look reference " + (r["look"] as! String))
        }
        print("all Ray-Ban sync checks passed (iPhone code)")
    }
}
