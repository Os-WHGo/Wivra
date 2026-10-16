// Wivra Meta B0/B1 experimental native capture application.
// RAW preview and in-stream JPEG stills; separate HEVC recording and audio are
// independent paths. Neither physical glasses testing nor LIVE is implied.
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
    var capturedPhotoImage: UIImage?
    var lastCapturedPhotoURL: URL?
    var photoCaptureInFlight = false
    var photoCaptureStatus = "Fotografías JPEG guardadas localmente; no se suben automáticamente."
    var chosenPhotoLook: WivraPhotoLook = .original
    var photoLookStrength = 0.7
    var photoLookBusy = false
    var lastEditedPhotoURL: URL?
    var editedPhotoImage: UIImage?
    var photoLookStatus = "La foto original se conserva; los filtros crean una copia."
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
    private var endSessionAfterRecording = false

    // The iPhone source must wait until the DAT stream AND the sidecar/MOV
    // manifest finish, not merely until recordingArmed becomes false.
    var isReleasedForCameraHandoff: Bool {
        deviceSession == nil && camera == nil && !recordingArmed &&
            !recordingFinishing && (sessionState == .idle || sessionState == .stopped)
    }

    var lastRecordedURL: URL?
    var recordingStatus = "B1D experimental: entrada de audio seleccionable, pista independiente y MOV."
    var captureSelectedAudio = true
    var lastSeparateAudioURL: URL?
    var lastCombinedVideoURL: URL?
    var lastAudioSyncOffsetSeconds: Double?
    var lastCaptureManifestURL: URL?
    // A finished recording remains private until Save or confirmed Discard.
    var pendingRecording: WivraPendingRecording?
    var showPendingRecordingChoice = false
    var showPendingRecordingDeletionConfirmation = false
    var isCurrentRecordingPending: Bool {
        lastRecordedURL.map { WivraPendingRecordingStore.isPendingVideo($0) } ?? false
    }
    var selectedAudioDeviceName: String?
    var selectedAudioSourceKind: String?
    let audioRoute = WivraAudioRoute()
    private let audioSidecar = WivraAudioSidecar()
    private let clipRecorder = WivraHEVCRecorder()
    private let segmentedRecorder = WivraSegmentedHEVCRecorder()
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
    var canCapturePhoto: Bool {
        // The DAT still-photo API belongs to the active stream, even when our
        // HEVC writer is armed. Real HEVC+photo coexistence needs device tests.
        camera != nil && streamState == .streaming && framesReceived > 0 &&
        !photoCaptureInFlight && !recordingFinishing
    }
    var isCompressedMode: Bool { camera != nil && receiveCompressedHEVC }

    func capturePhoto() {
        guard canCapturePhoto, let stream = camera?.stream else { return }
        photoCaptureInFlight = true
        photoCaptureStatus = "Solicitando fotografía a las gafas…"
        // This is an SDK still image, NOT a screenshot of the preview stream.
        if !stream.capturePhoto(format: .jpeg) {
            photoCaptureInFlight = false
            photoCaptureStatus = "La cámara no pudo iniciar la foto. Espera y vuelve a intentar."
        }
    }

    private func handleCapturedPhoto(_ bytes: Data) {
        photoCaptureInFlight = false
        guard !bytes.isEmpty, let image = UIImage(data: bytes) else {
            photoCaptureStatus = "La cámara entregó una imagen vacía o ilegible."
            return
        }
        do {
            let folder = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("WivraPhotos", isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let url = folder.appendingPathComponent("Wivra_Photo_\(UUID().uuidString).jpg")
            try bytes.write(to: url, options: .atomic)
            lastCapturedPhotoURL = url
            capturedPhotoImage = image
            lastEditedPhotoURL = nil
            editedPhotoImage = nil
            photoCaptureStatus = "Fotografía JPEG guardada en Wivra; puedes compartirla o guardarla desde el menú."
        } catch {
            photoCaptureStatus = "No se pudo guardar la fotografía: " + error.localizedDescription
        }
    }

    func exportPhotoLookCopy() {
        guard let originalURL = lastCapturedPhotoURL, !photoLookBusy else { return }
        photoLookBusy = true
        photoLookStatus = "Procesando copia local…"
        let look = chosenPhotoLook
        let strength = photoLookStrength
        Task { [weak self] in
            do {
                let result = try await Task.detached(priority: .userInitiated) { () throws -> Data in
                    let bytes = try Data(contentsOf: originalURL)
                    return try WivraPhotoLooks.renderJPEG(bytes, look: look, strength: strength)
                }.value
                guard let self else { return }
                let url = originalURL.deletingPathExtension()
                    .appendingPathExtension("\(look.rawValue)_\(UUID().uuidString).jpg")
                try result.write(to: url, options: .atomic)
                guard let rendered = UIImage(data: result) else {
                    throw WivraPhotoLookError.renderFailed
                }
                self.lastEditedPhotoURL = url
                self.editedPhotoImage = rendered
                self.photoLookStatus = "Copia con filtro guardada. Foto original intacta."
                self.photoLookBusy = false
            } catch {
                self?.photoLookStatus = "No se pudo exportar el filtro: " + error.localizedDescription
                self?.photoLookBusy = false
            }
        }
    }

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
        let started = captureSelectedAudio ? clipRecorder.arm() : segmentedRecorder.arm()
        guard started else {
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
        let wantedAudio = captureSelectedAudio
        let firstVideoClock = wantedAudio ? clipRecorder.firstVideoSampleUptime() : nil
        var sound: WivraAudioResult?
        var soundError: String?
        if wantedAudio {
            do { sound = try audioSidecar.finish() }
            catch { soundError = error.localizedDescription }
        }
        let result = wantedAudio
            ? await clipRecorder.stop()
            : await segmentedRecorder.stop()
        switch result {
        case .savedSegments(let urls, let frames, let dropped):
            guard let first = urls.first else {
                recordingStatus = "No hay segmentos finalizados."
                break
            }
            lastRecordedURL = first
            do {
                let manifests = urls.map {
                    $0.deletingPathExtension().appendingPathExtension("wivra.json")
                }
                pendingRecording = try WivraPendingRecordingStore.stage(
                    videoURL: first, related: urls + manifests
                )
                showPendingRecordingChoice = true
                recordingStatus = "Recuperados \(urls.count) segmentos MOV (\(frames) cuadros, \(dropped) descartados). Aún no están unidos. Elige Guardar o Decidir después."
            } catch {
                recordingStatus = "Segmentos conservados en el iPhone, sin decisión publicada: " +
                    error.localizedDescription
            }
        case .saved(let url, let frames, let dropped):
            lastRecordedURL = url
            recordingStatus = "Video original guardado (\(frames) cuadros; \(dropped) descartados)."
            if let sound {
                lastSeparateAudioURL = sound.url
                if let firstVideoClock, let firstAudioClock = sound.firstSampleUptime {
                    // Positive: audio began after video; negative: before.
                    // Video's receipt clock includes unknown DAT transport delay,
                    // so this is an estimate until verified by a clap test.
                    let offset = firstAudioClock - firstVideoClock
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
                    recordingStatus = "Originales guardados por separado. Falta una marca de tiempo válida para sincronizar; no se combinó automáticamente."
                }
            } else if wantedAudio {
                recordingStatus = "Solo video guardado. El micrófono seleccionado falló: " +
                    (soundError ?? "sin muestras válidas")
            } else {
                recordingStatus = "Video sin audio guardado."
            }
            // Stage user consent BEFORE exposing the manifest to the native
            // editor/library. Share controls also stay hidden while pending.
            // Reserve the expected manifest file so confirmed Discard also
            // removes it, even if the write is interrupted later.
            let manifestURL = url.deletingPathExtension().appendingPathExtension("wivra.json")
            do {
                pendingRecording = try WivraPendingRecordingStore.stage(
                    videoURL: url,
                    related: [lastSeparateAudioURL, lastCombinedVideoURL, manifestURL].compactMap { $0 }
                )
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
                    recordingStatus += " Advertencia: manifiesto pendiente, original protegido."
                }
                recordingStatus += " Decide si quieres guardar o descartar la captura."
                showPendingRecordingChoice = true
            } catch {
                // Never silently delete media if a marker cannot be written.
                // No manifest is published to the editor in this error path.
                recordingStatus += " No se pudo registrar la decisión; video privado conservado: " +
                    error.localizedDescription
            }
        case .noFrames:
            if let sound { lastSeparateAudioURL = sound.url }
            recordingStatus = "No se creó video: faltaron cuadros clave HEVC."
        case .failed(let message):
            if let sound { lastSeparateAudioURL = sound.url }
            recordingStatus = "La grabación de video falló: " + message
        }
        recordingFinishing = false
        if endSessionAfterRecording {
            endSession()
        }
    }

    func refreshPendingRecordingChoice() {
        guard !recordingArmed && !recordingFinishing,
              !showPendingRecordingChoice && !showPendingRecordingDeletionConfirmation
        else { return }
        _ = WivraPendingRecordingStore.recoverUnstagedCheckpoints()
        pendingRecording = WivraPendingRecordingStore.pending().first
        showPendingRecordingChoice = pendingRecording != nil
    }

    func keepPendingRecording() {
        guard let entry = pendingRecording else { return }
        do {
            // Grouped video-only checkpoints receive a standard v2 manifest
            // for EACH independent MOV. Do not misrepresent them as one clip.
            if entry.id.range(
                of: #"_part[0-9]{4}\.mov$"#, options: .regularExpression
            ) != nil {
                let folder = FileManager.default.urls(
                    for: .documentDirectory, in: .userDomainMask
                )[0].appendingPathComponent("WivraRecordings", isDirectory: true)
                let parts = entry.files
                    .filter { $0.range(
                        of: #"_part[0-9]{4}\.mov$"#,
                        options: .regularExpression
                    ) != nil }
                    .sorted()
                for name in parts {
                    let url = folder.appendingPathComponent(name)
                    lastCaptureManifestURL = try WivraCaptureManifest.write(
                        videoURL: url, tracks: [],
                        mergedURL: nil, cameraSource: "meta-dat-hevc"
                    )
                }
            }
            try WivraPendingRecordingStore.keep(entry)
            recordingStatus = "Grabación guardada en Wivra. Puedes compartirla desde la biblioteca."
            pendingRecording = nil
            showPendingRecordingChoice = false
            refreshPendingRecordingChoice()
        } catch {
            recordingStatus = "No se pudo conservar la grabación: " + error.localizedDescription
        }
    }

    func requestPendingDiscard() {
        guard pendingRecording != nil else { return }
        showPendingRecordingChoice = false
        showPendingRecordingDeletionConfirmation = true
    }

    func discardPendingRecordingConfirmed() {
        guard let entry = pendingRecording else { return }
        do {
            try WivraPendingRecordingStore.discardConfirmed(entry)
            if lastRecordedURL?.lastPathComponent == entry.id {
                lastRecordedURL = nil
                lastSeparateAudioURL = nil
                lastCombinedVideoURL = nil
                lastCaptureManifestURL = nil
                lastAudioSyncOffsetSeconds = nil
            }
            recordingStatus = "Grabación temporal eliminada por decisión confirmada."
            pendingRecording = nil
            showPendingRecordingDeletionConfirmation = false
            refreshPendingRecordingChoice()
        } catch {
            recordingStatus = "No se pudo eliminar: " + error.localizedDescription +
                ". Los archivos restantes se conservarán."
            showPendingRecordingDeletionConfirmation = false
        }
    }

    func decidePendingLater() {
        showPendingRecordingChoice = false
        showPendingRecordingDeletionConfirmation = false
        recordingStatus = "Grabación temporal conservada. Podrás decidir después."
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
                    if self.photoCaptureInFlight {
                        self.photoCaptureInFlight = false
                        self.photoCaptureStatus = "La fotografía se interrumpió: " + error.localizedDescription
                    }
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

            // Keep the listener until the camera/stream ends. Actual photo data
            // is returned asynchronously, independently of preview frames.
            stream.photoDataPublisher.listen { [weak self] photo in
                Task { @MainActor [weak self] in
                    self?.handleCapturedPhoto(photo.data)
                }
            }.store(in: streamTokens)

            let compressed = receiveCompressedHEVC
            let recorder = clipRecorder
            let checkpointRecorder = segmentedRecorder
            let separateAudio = captureSelectedAudio
            stream.videoFramePublisher.listen { [weak self] frame in
                if compressed {
                    if separateAudio {
                        recorder.append(frame.sampleBuffer)
                    } else {
                        checkpointRecorder.append(frame.sampleBuffer)
                    }
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
        // Never tear down DAT frames while muxing a just-finished recording.
        if recordingFinishing { return }
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
        // End can be requested while HEVC/CAF/MOV and manifest are still
        // finishing. Do not release DAT until all writer work has completed.
        if recordingArmed || recordingFinishing {
            endSessionAfterRecording = true
            if recordingArmed && !recordingFinishing {
                Task { await finishRecording() }
            }
            return
        }
        endSessionAfterRecording = false
        // This step deliberately also stops when app enters background.
        // The upstream sample does not guarantee a background camera LIVE.
        stopPreview()
        guard let deviceSession else { return }
        sessionState = .stopping
        deviceSession.stop()
    }

    private func clearPreview() {
        streamTokens.clear()
        if photoCaptureInFlight {
            photoCaptureStatus = "Fotografía interrumpida: se cerró la vista previa."
            photoCaptureInFlight = false
        }
        camera = nil
        previewImage = nil
        firstFrameTime = nil
        lastCountTime = nil
        framesThisSecond = 0
        streamState = .stopped
    }
}
