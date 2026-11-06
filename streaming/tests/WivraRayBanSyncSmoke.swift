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
        print("all Ray-Ban sync checks passed (iPhone code)")
    }
}
