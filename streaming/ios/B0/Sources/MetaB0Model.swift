// Wivra Meta B0 — ORIGINAL test application. Not compiled or hardware-verified.
// Uses the public DAT 1.0.1 lifecycle; this is camera PREVIEW ONLY,
// no audio, local recording, stored-glasses-media import or RTMPS publishing.
// — ChatGPT, 2026-10-13
import Foundation
import MWDATCore
import MWDATCamera
import Observation
import UIKit
import QuartzCore

@Observable
@MainActor
final class MetaB0Model {
    var registrationState: RegistrationState
    var sessionState: DeviceSessionState = .idle
    var streamState: StreamState = .stopped
    var previewImage: UIImage?
    var showCameraPermissionConfirm = false
    var errorMessage: String?
    var framesReceived = 0
    var measuredFPS: Double = 0
    var activeVideoSeconds: Double = 0
    var frameWidth = 0
    var frameHeight = 0
    var lastErrorWasThermal = false
    var chosenProfile = "balanced" // switched only before a new preview session

    private let wearables: any WearablesInterface
    private let selector: AutoDeviceSelector
    private var deviceSession: DeviceSession?
    private var camera: MWDATCamera.Camera?
    private let sessionTokens = ListenerTokenBag()
    private let streamTokens = ListenerTokenBag()
    private var registrationTask: Task<Void, Never>?
    private var firstFrameTime: CFTimeInterval?
    private var framesThisSecond = 0
    private var lastCountTime: CFTimeInterval?

    init(wearables: any WearablesInterface = Wearables.shared) {
        self.wearables = wearables
        self.selector = AutoDeviceSelector(wearables: wearables)
        self.registrationState = wearables.registrationState
        registrationTask = Task { [weak self] in
            guard let self else { return }
            for await state in wearables.registrationStateStream() {
                self.registrationState = state
            }
        }
    }

    var isRegistered: Bool { registrationState == .registered }
    var canStartSession: Bool { isRegistered && sessionState == .idle }
    var canStartPreview: Bool { sessionState == .started && camera == nil }
    var hasPreview: Bool { camera != nil && streamState != .stopped }

    func register() {
        guard registrationState != .registering else { return }
        Task { @MainActor in
            do {
                try await wearables.startRegistration()
            } catch {
                errorMessage = "Meta: " + error.localizedDescription
            }
        }
    }

    func handleMetaCallback(_ url: URL) async {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.queryItems?.contains(where: { $0.name == "metaWearablesAction" }) == true
        else { return }

        do {
            _ = try await wearables.handleUrl(url)
        } catch {
            errorMessage = "Meta callback: " + error.localizedDescription
        }
    }

    func startSession() {
        guard canStartSession else { return }
        do {
            let newSession = try wearables.createSession(deviceSelector: selector)
            deviceSession = newSession
            sessionTokens.clear()
            newSession.statePublisher.listen { [weak self] state in
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    self.sessionState = state
                    if state == .stopped {
                        self.clearPreview()
                        self.sessionTokens.clear()
                        self.deviceSession = nil
                    }
                }
            }.store(in: sessionTokens)
            newSession.errorPublisher.listen { [weak self] error in
                Task { @MainActor [weak self] in
                    self?.errorMessage = error.localizedDescription
                }
            }.store(in: sessionTokens)
            sessionState = .starting
            try newSession.start()
        } catch {
            sessionState = .idle
            sessionTokens.clear()
            deviceSession = nil
            errorMessage = "Iniciar sesión: " + error.localizedDescription
        }
    }

    func requestPreview() async {
        guard canStartPreview else { return }
        do {
            if try await wearables.checkPermissionStatus(.camera) == .granted {
                beginPreview()
            } else {
                // requestPermission sends the user to Meta AI. Ask FIRST.
                showCameraPermissionConfirm = true
            }
        } catch {
            errorMessage = "Permisos: " + error.localizedDescription
        }
    }

    func confirmPreviewPermission() async {
        showCameraPermissionConfirm = false
        guard canStartPreview else { return }
        do {
            guard try await wearables.requestPermission(.camera) == .granted else {
                errorMessage = "Permiso de cámara no otorgado en Meta AI."
                return
            }
            beginPreview()
        } catch {
            errorMessage = "Permiso cámara: " + error.localizedDescription
        }
    }

    private func beginPreview() {
        guard let session = deviceSession, session.state == .started, camera == nil else { return }
        // B0: .raw avoids implementing VideoToolbox HEVC decode before
        // first-frame and link reliability tests. The SDK performs decoding.
        // B1 will move the file/RTMPS path to .hvc1 compressed samples.
        let economy = chosenProfile == "economy"
        let config = StreamConfiguration(
            videoCodec: .raw,
            resolution: economy ? .low : .medium,
            frameRate: economy ? 15 : 24
        )
        do {
            guard let newCamera = try session.addCamera(config: config) else {
                errorMessage = "Meta no permitió crear la cámara. Revisa estado de sesión."
                return
            }
            clearPreview()
            camera = newCamera
            let stream = newCamera.stream

            stream.statePublisher.listen { [weak self] state in
                Task { @MainActor [weak self] in
                    self?.streamState = state
                    if state == .stopped {
                        self?.camera?.stop()
                        self?.clearPreview()
                    }
                }
            }.store(in: streamTokens)

            stream.errorPublisher.listen { [weak self] error in
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    self.errorMessage = error.localizedDescription
                    // Never fight SDK thermal safety to preserve a LIVE.
                    switch error {
                    case .thermalHot:
                        self.lastErrorWasThermal = true
                        self.stopPreview()
                    case .batteryLow:
                        self.errorMessage = "Batería de las gafas baja: " + error.localizedDescription
                    default:
                        break
                    }
                }
            }.store(in: streamTokens)

            stream.videoFramePublisher.listen { [weak self] frame in
                let renderedFrame = frame.makeUIImage()
                Task { @MainActor [weak self] in
                    self?.onFrame(renderedFrame)
                }
            }.store(in: streamTokens)

            streamState = .starting
            framesReceived = 0
            measuredFPS = 0
            activeVideoSeconds = 0
            lastErrorWasThermal = false
            newCamera.stream.start()
        } catch {
            clearPreview()
            errorMessage = "Vista previa: " + error.localizedDescription
        }
    }

    private func onFrame(_ image: UIImage?) {
        guard camera != nil, streamState != .stopped else { return }
        guard let image else { return }
        previewImage = image
        framesReceived += 1
        framesThisSecond += 1
        // UIImage dimensions may vary due to radio conditions; use actual image.
        frameWidth = Int(image.size.width * image.scale)
        frameHeight = Int(image.size.height * image.scale)

        let now = CACurrentMediaTime()
        if firstFrameTime == nil {
            firstFrameTime = now
            lastCountTime = now
        }
        if let firstFrameTime {
            activeVideoSeconds = now - firstFrameTime
        }
        if let lastCountTime, now - lastCountTime >= 1 {
            measuredFPS = Double(framesThisSecond) / (now - lastCountTime)
            framesThisSecond = 0
            self.lastCountTime = now
        }
    }

    func stopPreview() {
        guard let activeCamera = camera else { return }
        streamState = .stopping
        activeCamera.stop()
        clearPreview()
    }

    func endSession() {
        // This step deliberately also stops when app enters background.
        // The upstream sample does not guarantee a background camera LIVE.
        stopPreview()
        guard let deviceSession else { return }
        sessionState = .stopping
        deviceSession.stop()
    }

    private func clearPreview() {
        streamTokens.clear()
        camera = nil
        previewImage = nil
        firstFrameTime = nil
        lastCountTime = nil
        framesThisSecond = 0
        streamState = .stopped
    }
}
