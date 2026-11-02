// Wivra Mobile: observes the PHONE's default network path only.
// No Internet speed test, Meta DAT transport introspection or LIVE publishing.
import Foundation
import Network
import Observation

@Observable
@MainActor
final class WivraPhoneNetworkStatus {
    enum Route: String, Sendable {
        case unknown, offline, wifi, cellular, ethernet, other
    }

    private(set) var route: Route = .unknown
    private(set) var isExpensive = false
    private(set) var isConstrained = false
    private(set) var hasSystemPath = false

    @ObservationIgnored private let monitor = NWPathMonitor()
    @ObservationIgnored private let monitorQueue = DispatchQueue(
        label: "com.oswhgo.wivra.mobile.network", qos: .utility
    )
    @ObservationIgnored private var started = false

    func start() {
        guard !started else { return }
        started = true
        monitor.pathUpdateHandler = { [weak self] path in
            // Transfer plain Sendable values rather than NWPath across actors.
            let connected = path.status == .satisfied
            let route: Route
            if !connected {
                route = .offline
            } else if path.usesInterfaceType(.wifi) {
                route = .wifi
            } else if path.usesInterfaceType(.cellular) {
                route = .cellular
            } else if path.usesInterfaceType(.wiredEthernet) {
                route = .ethernet
            } else {
                route = .other
            }
            let expensive = path.isExpensive
            let constrained = path.isConstrained
            Task { @MainActor [weak self] in
                self?.route = route
                self?.isExpensive = expensive
                self?.isConstrained = constrained
                self?.hasSystemPath = connected
            }
        }
        monitor.start(queue: monitorQueue)
    }

    var localizedRoute: String {
        switch route {
        case .unknown: NSLocalizedString("ios.network.unknown", comment: "")
        case .offline: NSLocalizedString("ios.network.offline", comment: "")
        case .wifi: NSLocalizedString("ios.network.wifi", comment: "")
        case .cellular: NSLocalizedString("ios.network.cellular", comment: "")
        case .ethernet: NSLocalizedString("ios.network.ethernet", comment: "")
        case .other: NSLocalizedString("ios.network.other", comment: "")
        }
    }

    var summary: String {
        String(format: NSLocalizedString("ios.network.route", comment: ""), localizedRoute)
    }

    // NWPathMonitor does NOT verify stable connectivity to YouTube/Twitch/Kick,
    // or reveal whether Meta DAT currently uses Wi-Fi SoftAP vs Bluetooth.
    var qualification: String {
        if !hasSystemPath { return NSLocalizedString("ios.network.no_verified_uplink", comment: "") }
        if isConstrained { return NSLocalizedString("ios.network.constrained", comment: "") }
        if isExpensive { return NSLocalizedString("ios.network.expensive", comment: "") }
        return NSLocalizedString("ios.network.disclaimer", comment: "")
    }
}
