// Ray-Ban Meta profiles, «Automático» and stream statistics on iPhone code (macOS, Swift 6) against the
// vectors shared with Android (streaming/contracts/dat-profiles.json). Not a glasses test. — Claude
import Foundation

@main
struct WivraDatProfilesSmoke {
    static func check(_ ok: Bool, _ what: String) {
        print((ok ? "ok - " : "not ok - ") + what)
        if !ok { exit(1) }
    }

    static func observed(_ o: [String: Any], _ profile: String) -> WivraDatAuto.Observed {
        WivraDatAuto.Observed(profile: WivraDatProfile(rawValue: profile)!, seconds: (o["seconds"] as! NSNumber).doubleValue,
                              measuredFps: (o["measuredFps"] as! NSNumber).doubleValue, stalls: (o["stalls"] as! NSNumber).intValue,
                              receivedHeight: (o["receivedHeight"] as! NSNumber).intValue, thermal: o["thermal"] as! Bool)
    }

    static func main() {
        let path = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "streaming/contracts/dat-profiles.json"
        let v = try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: path))) as! [String: Any]
        let profiles = v["profiles"] as! [[String: Any]]
        check(profiles.count == WivraDatProfile.allCases.count, "same number of profiles as Android/contract")
        for p in profiles {
            let k = WivraDatProfile(rawValue: p["id"] as! String)!
            check(k.width == (p["width"] as! Int) && k.height == (p["height"] as! Int) && k.fps == (p["fps"] as! Int), "profile \(k.rawValue) = \(k.label)")
        }
        check(WivraDatProfile.defaultProfile.rawValue == v["default"] as! String, "default profile")
        for s in v["start"] as! [[String: Any]] {
            let last = (s["last"] as? [String: Any]).map { observed($0, $0["profile"] as! String) }
            let got = WivraDatAuto.start(last: last, thermalNow: s["thermalNow"] as! Bool).rawValue
            check(got == s["expect"] as! String, "start: \(s["why"] as! String) → \(got)")
        }
        for s in v["suggest"] as! [[String: Any]] {
            let got = WivraDatAuto.suggest(window: observed(s["window"] as! [String: Any], s["current"] as! String),
                                           secondsSinceLastSuggestion: (s["sinceLast"] as! NSNumber).doubleValue)?.rawValue
            check(got == s["expect"] as? String, "suggest: \(s["why"] as! String) → \(got ?? "nil")")
        }
        let st = v["stats"] as! [String: Any], e = st["expect"] as! [String: Any]
        var stats = WivraDatStreamStats(nominalFps: st["nominalFps"] as! Int)
        for t in st["framesMs"] as! [NSNumber] {
            stats.frame(uptimeMs: t.int64Value, width: st["width"] as! Int, height: st["height"] as! Int, payloadBytes: st["bytesPerFrame"] as! Int)
        }
        let snap = stats.snapshot()
        print("  stats: \(snap.frames) frames, \(String(format: "%.2f", snap.fps)) fps, p95 \(snap.p95IntervalMs) ms, \(snap.stalls) stall(s), max gap \(snap.maxGapMs) ms")
        check(snap.frames == e["frames"] as! Int && snap.stalls == e["stalls"] as! Int, "frames and stalls")
        check(abs(snap.seconds - (e["seconds"] as! NSNumber).doubleValue) < 0.001, "duration")
        check(snap.fps >= (e["fpsMin"] as! NSNumber).doubleValue && snap.fps <= (e["fpsMax"] as! NSNumber).doubleValue, "measured fps")
        check(snap.p95IntervalMs >= (e["p95IntervalMsMin"] as! NSNumber).doubleValue && snap.p95IntervalMs <= (e["p95IntervalMsMax"] as! NSNumber).doubleValue, "p95 interval")
        check(snap.maxGapMs == (e["maxGapMs"] as! NSNumber).int64Value, "largest gap")
        print("all Ray-Ban profile checks passed (iPhone code)")
    }
}
