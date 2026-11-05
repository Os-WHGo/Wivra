import Foundation

@main
struct WivraMultiCamSafetyPolicySmoke {
    static func check(_ ok: Bool, _ name: String) {
        if !ok { fatalError("W67: " + name) }
        print("ok - " + name)
    }
    static func main() {
        typealias P = WivraMultiCamSafetyPolicy
        check(!P.canStart(freeBytes: nil), "fail closed if free disk cannot be measured")
        check(!P.canStart(freeBytes: P.minimumFreeBytesToStart - 1), "reject below start reserve")
        check(P.canStart(freeBytes: P.minimumFreeBytesToStart), "accept start boundary")
        check(P.check(freeBytes: nil, seriousThermal: false, criticalThermal: false, dual: true) == .stopAndPreserve, "unknown free disk stops")
        check(P.check(freeBytes: P.minimumFreeBytesToContinue - 1, seriousThermal: false, criticalThermal: false, dual: true) == .stopAndPreserve, "low disk stops")
        check(P.check(freeBytes: P.minimumFreeBytesToContinue, seriousThermal: false, criticalThermal: false, dual: true) == .keepRecording, "continue reserve boundary")
        check(P.check(freeBytes: Int64.max, seriousThermal: true, criticalThermal: false, dual: true) == .switchToSingle, "dual camera reduces thermal load")
        check(P.check(freeBytes: Int64.max, seriousThermal: true, criticalThermal: false, dual: false) == .keepRecording, "single does not need another switch")
        check(P.check(freeBytes: Int64.max, seriousThermal: true, criticalThermal: true, dual: true) == .stopAndPreserve, "critical heat stops")
        check(P.mayRestartSingle(ownerStopped: false, exitRequested: false, foregroundActive: true, camerasRemaining: 1), "active camera can continue")
        check(!P.mayRestartSingle(ownerStopped: false, exitRequested: true, foregroundActive: true, camerasRemaining: 1), "exit cancels restart")
        check(!P.mayRestartSingle(ownerStopped: true, exitRequested: false, foregroundActive: true, camerasRemaining: 1), "owner stop cancels restart")
        check(!P.mayRestartSingle(ownerStopped: false, exitRequested: false, foregroundActive: false, camerasRemaining: 1), "background cannot restart")
        check(!P.mayRestartSingle(ownerStopped: false, exitRequested: false, foregroundActive: true, camerasRemaining: 0), "no camera cannot restart")
    }
}
