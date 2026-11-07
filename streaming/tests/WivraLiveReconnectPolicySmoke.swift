// macOS smoke for WivraLiveReconnectPolicy (same numbers as core/live-reconnect.mjs). — Claude
import Foundation

@main
struct WivraLiveReconnectPolicySmoke {
    static func check(_ ok: Bool, _ what: String) {
        if !ok { FileHandle.standardError.write(Data(("FAIL: " + what + "\n").utf8)); exit(1) }
        print("ok - " + what)
    }

    static func main() {
        var p = WivraLiveReconnectPolicy()
        var delays: [Int] = []
        while let d = p.nextDelaySeconds() { delays.append(d) }
        check(delays == [2, 4, 8, 15, 15, 15], "growing pauses then give up")
        check(p.gaveUp, "gave up after six attempts")
        p.connected()
        check(p.attempt == 0 && !p.gaveUp && p.nextDelaySeconds() == 2, "success resets the budget")
        check(WivraLiveReconnectPolicy.classify("NetConnection.Connect.Closed") == .retry, "closed retried")
        check(WivraLiveReconnectPolicy.classify("NetConnection.Connect.NetworkChange") == .retry, "network change retried")
        check(WivraLiveReconnectPolicy.classify("NetConnection.Connect.Rejected") == .neverRetry, "rejected never retried")
        check(WivraLiveReconnectPolicy.classify("NetConnection.Connect.InvalidApp") == .neverRetry, "invalid app never retried")
        check(WivraLiveReconnectPolicy.classify("NetConnection.Connect.Success") == .connected, "success recognised")
        check(WivraLiveReconnectPolicy.classify("NetStream.Publish.Start") == .ignore, "stream events ignored")
    }
}
