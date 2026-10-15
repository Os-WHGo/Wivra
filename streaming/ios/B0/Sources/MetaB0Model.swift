// Wivra Meta B0 — ORIGINAL test application. Compiled for simulator; NOT hardware-verified.
// Uses the public DAT 1.0.1 lifecycle; this is camera PREVIEW ONLY,
// no audio, local recording, stored-glasses-media import or RTMPS publishing.
// — ChatGPT, 2026-10-13
import Foundation
import MWDATCore
import MWDATCamera
import Observation
import UIKit
import QuartzCore
import CoreMedia
import AVFoundation

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
    var chosenProfile = "balanced" // chosen before a new camera session
    var receiveCompressedHEVC = false
    var recordingArmed = false
    var recordingFinishing = false
    var lastRecordedURL: URL?
    var recordingStatus = "B1D experimental: entrada de audio seleccionable, pista independiente y MOV."
    var captureSelectedAudio = true
    var lastSeparateAudioURL: URL?
    var lastCombinedVideoURL: URL?
    var lastAudioSyncOffsetSeconds: Double?
    var lastCaptureManifestURL: URL?
    var selectedAudioDeviceName: String?
    var selectedAudioSourceKind: String?
    let audioRoute = WivraAudioRoute()
    private let audioSidecar = WivraAudioSidecar()
    private let clipRecorder = WivraHEVCRecorder()
    private var audioRouteObserver: NSObjectProtocol?

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
        audioRouteObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, self.recordingArmed,
                      self.captureSelectedAudio, !self.audioRoute.hasSelectedRoute else { return }
                self.recordingStatus = "Se perdió el micrófono seleccionado; cerrando la grabación."
                await self.finishRecording()
            }
        }
        registrationTask = Task { [weak self] in
            guard let self else { return }
            for await state in wearables.registrationStateStream() {
                self.registrationState = state
            }
        }
    }

    var isRegistered: Bool { registrationState == .registered }
    var canStartSession: Bool {
        isRegistered && sessionState == .idle &&
            (!receiveCompressedHEVC || !captureSelectedAudio || audioRoute.hasSelectedRoute)
    }
    var canStartPreview: Bool { sessionState == .started && camera == nil }
    var hasPreview: Bool { camera != nil && streamState != .stopped }
    var canRecord: Bool { receiveCompressedHEVC && camera != nil && framesReceived > 0 && !recordingFinishing }
    var isCompressedMode: Bool { camera != nil && receiveCompressedHEVC }

    func beginRecording() {
        guard canRecord && !recordingArmed else { return }
        lastRecordedURL = nil
        lastSeparateAudioURL = nil
        lastCombinedVideoURL = nil
        lastAudioSyncOffsetSeconds = nil
        lastCaptureManifestURL = nil
        selectedAudioDeviceName = nil
        selectedAudioSourceKind = nil
        if captureSelectedAudio {
            // Never try to re-open Bluetooth HFP while DAT camera is already
            // running: a changed route requires a fresh preflight/session.
            guard audioRoute.hasSelectedRoute else {
                recordingStatus = "Se perdió el micrófono preparado. Termina la sesión y elige la fuente otra vez."
                return
            }
            do {
                selectedAudioDeviceName = try audioRoute.activateSelectedInput()
                selectedAudioSourceKind = audioRoute.selectedSource
                try audioSidecar.start(verifiedSelectedRoute: audioRoute.hasSelectedRoute)
                // Starting AVAudioEngine may itself change the iOS route.
                if !audioRoute.hasSelectedRoute {
                    _ = try? audioSidecar.finish()
                    throw WivraAudioRouteError.routeRejected
                }
            } catch {
                recordingStatus = "Entrada seleccionada: " + error.localizedDescription
                return
            }
        }
        guard clipRecorder.arm() else {
            if audioSidecar.isRecording { _ = try? audioSidecar.finish() }
            recordingStatus = "Hay una grabación pendiente de finalizar."
            return
        }
        recordingArmed = true
        recordingStatus = captureSelectedAudio
            ? "Grabando video HEVC y entrada de audio seleccionada en archivo separado."
            : "Grabando solo video HEVC, sin audio."
    }

    func finishRecording() async {
        guard recordingArmed && !recordingFinishing else { return }
        recordingArmed = false
        recordingFinishing = true
        let firstVideoClock = clipRecorder.firstVideoSampleUptime()
        let wantedAudio = captureSelectedAudio
        var sound: WivraAudioResult?
        var soundError: String?
        if wantedAudio {
            do { sound = try audioSidecar.finish() }
            catch { soundError = error.localizedDescription }
        }
        let result = await clipRecorder.stop()
        switch result {
        case .saved(let url, let frames, let dropped):
            lastRecordedURL = url
            recordingStatus = "Video original guardado (\(frames) cuadros; \(dropped) descartados)."
            if let sound {
                lastSeparateAudioURL = sound.url
                if let firstVideoClock {
                    let offset = sound.firstSampleUptime - firstVideoClock
                    lastAudioSyncOffsetSeconds = offset
                    do {
                        let combined = try await WivraLocalMux.merge(
                            videoURL: url, audioURL: sound.url, audioStartOffset: offset
                        )
                        lastCombinedVideoURL = combined
                        recordingStatus = "Video con audio y pista CAF independiente guardados. Verifica sincronía."
                    } catch {
                        recordingStatus = "Originales guardados. No se pudo combinar: " + error.localizedDescription
                    }
                } else {
                    recordingStatus = "Originales guardados. No hay reloj de inicio de video para sincronizar."
                }
            } else if wantedAudio {
                recordingStatus = "Solo video guardado. El micrófono seleccionado falló: " +
                    (soundError ?? "sin muestras válidas")
            } else {
                recordingStatus = "Video sin audio guardado."
            }
            do {
                lastCaptureManifestURL = try WivraCaptureManifest.write(
                    videoURL: url, audioURL: lastSeparateAudioURL,
                    mergedURL: lastCombinedVideoURL,
                    audioOffsetSeconds: lastAudioSyncOffsetSeconds,
                    audioPortName: selectedAudioDeviceName,
                    audioSource: selectedAudioSourceKind ?? "unknown",
                    audioSampleRateHz: sound?.sampleRate,
                    audioChannelCount: sound?.channelCount
                )
            } catch {
                recordingStatus += " Advertencia: no se guardó el manifiesto de proyecto."
            }
        case .noFrames:
            if let sound { lastSeparateAudioURL = sound.url }
            recordingStatus = "No se creó video: faltaron cuadros clave HEVC."
        case .failed(let message):
            if let sound { lastSeparateAudioURL = sound.url }
            recordingStatus = "La grabación de video falló: " + message
        }
        recordingFinishing = false
    }

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
        guard canStartSession else {
            errorMessage = "Prepara la entrada de audio antes de iniciar la sesión de cámara."
            return
        }
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
        if receiveCompressedHEVC && captureSelectedAudio && !audioRoute.hasSelectedRoute {
            errorMessage = "La entrada seleccionada no está activa. Finaliza la sesión y prepárala nuevamente."
            return
        }
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
        // B0 preview uses SDK decoded frames (.raw). B1A uses compressed
        // .hvc1 for direct file writing. B1A has no image preview yet.
        let economy = chosenProfile == "economy"
        let config = StreamConfiguration(
            videoCodec: receiveCompressedHEVC ? .hvc1 : .raw,
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
                        if self?.recordingArmed == true {
                            Task { await self?.finishRecording() }
                        }
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

            let compressed = receiveCompressedHEVC
            let recorder = clipRecorder
            stream.videoFramePublisher.listen { [weak self] frame in
                if compressed {
                    recorder.append(frame.sampleBuffer)
                    let dimensions = CMSampleBufferGetFormatDescription(frame.sampleBuffer)
                        .map { CMVideoFormatDescriptionGetDimensions($0) }
                    let width = Int(dimensions?.width ?? 0)
                    let height = Int(dimensions?.height ?? 0)
                    Task { @MainActor [weak self] in
                        self?.onFrame(nil, compressedWidth: width, compressedHeight: height)
                    }
                } else {
                    let image = frame.makeUIImage()
                    Task { @MainActor [weak self] in
                        self?.onFrame(image)
                    }
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

    private func onFrame(_ image: UIImage?, compressedWidth: Int = 0, compressedHeight: Int = 0) {
        guard camera != nil, streamState != .stopped else { return }
        if !receiveCompressedHEVC && image == nil { return }
        if let image {
            previewImage = image
            frameWidth = Int(image.size.width * image.scale)
            frameHeight = Int(image.size.height * image.scale)
        } else {
            frameWidth = compressedWidth
            frameHeight = compressedHeight
        }
        framesReceived += 1
        framesThisSecond += 1

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
        if recordingArmed {
            Task {
                await finishRecording()
                stopPreview()
            }
            return
        }
        guard let activeCamera = camera else { return }
        streamState = .stopping
        activeCamera.stop()
        clearPreview()
    }

    func endSession() {
        if recordingArmed {
            Task {
                await finishRecording()
                endSession()
            }
            return
        }
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
