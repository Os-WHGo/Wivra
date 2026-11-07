// Wivra LIVE reconnection policy for iOS (Foundation only, macOS smoke).
// Mirror of core/live-reconnect.mjs. The local MP4 copy is never stopped by
// a reconnection; the stream key stays in memory for this session only. — Claude
import Foundation

struct WivraLiveReconnectPolicy: Sendable {
    static let delaysSeconds = [2, 4, 8, 15, 15, 15]

    enum Event: Equatable, Sendable { case connected, retry, neverRetry, ignore }

    private(set) var attempt = 0
    private(set) var gaveUp = false

    /// HaishinKit RTMPConnection status codes (NetConnection.*).
    static func classify(_ code: String) -> Event {
        switch code {
        case "NetConnection.Connect.Success": return .connected
        case "NetConnection.Connect.Closed", "NetConnection.Connect.Failed",
             "NetConnection.Connect.IdleTimeOut", "NetConnection.Connect.NetworkChange",
             "NetConnection.Connect.AppShutdown": return .retry
        case "NetConnection.Connect.Rejected", "NetConnection.Connect.InvalidApp": return .neverRetry
        default: return .ignore
        }
    }

    /// Seconds before the next attempt, or nil when it must give up.
    mutating func nextDelaySeconds() -> Int? {
        guard attempt < Self.delaysSeconds.count else { gaveUp = true; return nil }
        let delay = Self.delaysSeconds[attempt]
        attempt += 1
        gaveUp = false
        return delay
    }

    mutating func connected() {
        attempt = 0
        gaveUp = false
    }
}
