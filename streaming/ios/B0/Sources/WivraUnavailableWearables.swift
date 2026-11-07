// W80 (Claude): if Meta DAT cannot be configured (seen in the iOS Simulator:
// "Error interno"), touching Wearables.shared traps and the whole app quits at
// launch. This stand-in reports the glasses as UNAVAILABLE so the rest of Wivra
// (home, iPhone camera, LIVE, editor) still opens. It never pretends to have a
// device, never registers and never grants a permission.
import Foundation
import MWDATCore

struct WivraUnavailableWearables: WearablesInterface {
    private struct Token: MWDATCore.AnyListenerToken { func cancel() async {} }

    var registrationState: MWDATCore.RegistrationState { .unavailable }
    func addRegistrationStateListener(_ listener: @escaping @Sendable (MWDATCore.RegistrationState) -> Void) -> any MWDATCore.AnyListenerToken { Token() }
    func registrationStateStream() -> AsyncStream<MWDATCore.RegistrationState> {
        AsyncStream { $0.yield(.unavailable); $0.finish() }
    }
    func startRegistration() async throws(MWDATCore.RegistrationError) { throw .configurationInvalid }
    func handleUrl(_ url: URL) async throws(MWDATCore.WearablesHandleURLError) -> Bool { false }
    func handleUrl(_ url: URL, onRegistrationRequest callback: @escaping @Sendable (MWDATCore.RegistrationRequest) -> Void) async throws(MWDATCore.WearablesHandleURLError) -> Bool { false }
    func startUnregistration() async throws(MWDATCore.UnregistrationError) { throw .configurationInvalid }
    func openFirmwareUpdate() async throws(MWDATCore.NavigationError) { throw .notRegistered }
    func openDATGlassesAppUpdate() async throws(MWDATCore.NavigationError) { throw .notRegistered }
    var devices: [MWDATCore.DeviceIdentifier] { [] }
    func addDevicesListener(_ listener: @escaping @Sendable ([MWDATCore.DeviceIdentifier]) -> Void) -> any MWDATCore.AnyListenerToken { Token() }
    func devicesStream() -> AsyncStream<[MWDATCore.DeviceIdentifier]> { AsyncStream { $0.yield([]); $0.finish() } }
    func deviceForIdentifier(_ identifier: MWDATCore.DeviceIdentifier) -> MWDATCore.Device? { nil }
    func checkPermissionStatus(_ permission: MWDATCore.Permission) async throws(MWDATCore.PermissionError) -> MWDATCore.PermissionStatus { .denied }
    func requestPermission(_ permission: MWDATCore.Permission) async throws(MWDATCore.PermissionError) -> MWDATCore.PermissionStatus { throw .noDevice }
    func createSession(deviceSelector: any MWDATCore.DeviceSelector) throws(MWDATCore.DeviceSessionError) -> MWDATCore.DeviceSession { throw .noEligibleDevice }
}
