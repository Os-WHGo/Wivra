// W67 | Safe decisions for iPhone dual-camera capture.
// Pure Foundation logic; desktop tests do NOT certify a physical MultiCam session.
import Foundation

enum WivraMultiCamSafetyPolicy {
    static let minimumFreeBytesToStart: Int64 = 512 * 1024 * 1024
    static let minimumFreeBytesToContinue: Int64 = 256 * 1024 * 1024
    static let monitorIntervalSeconds: UInt64 = 8

    enum Action: Equatable {
        case keepRecording
        case switchToSingle
        case stopAndPreserve
    }

    static func canStart(freeBytes: Int64?) -> Bool {
        guard let freeBytes else { return false }
        return freeBytes >= minimumFreeBytesToStart
    }

    static func check(freeBytes: Int64?, seriousThermal: Bool,
                      criticalThermal: Bool, dual: Bool) -> Action {
        guard let freeBytes, freeBytes >= minimumFreeBytesToContinue else {
            return .stopAndPreserve
        }
        if criticalThermal { return .stopAndPreserve }
        if seriousThermal && dual { return .switchToSingle }
        return .keepRecording
    }

    static func mayRestartSingle(ownerStopped: Bool, exitRequested: Bool,
                                 foregroundActive: Bool, camerasRemaining: Int) -> Bool {
        camerasRemaining > 0 && !ownerStopped && !exitRequested && foregroundActive
    }
}
