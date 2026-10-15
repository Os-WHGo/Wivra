// Wivra B1H: independent iPhone capture source. No network upload, no LIVE.
// Keep AVFoundation photo/movie outputs in one configured session; real-device
// continuity (taking a photo during MOV recording) still needs field testing.
@preconcurrency import AVFoundation
import Observation
import SwiftUI
import UIKit

struct WivraIPhoneLens: Identifiable, Hashable {
    let id: String
    let name: String
}

private final class WivraIPhoneSessionRunner: @unchecked Sendable {
    let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "com.oswhgo.wivra.iphone.session", qos: .userInitiated)

    func start(_ completion: @escaping @Sendable (Bool) -> Void) {
        queue.async { [self] in
            if !session.isRunning { session.startRunning() }
            completion(session.isRunning)
        }
    }

    func stop(_ completion: @escaping @Sendable () -> Void) {
        queue.async { [self] in
            if session.isRunning { session.stopRunning() }
            completion()
        }
    }
}

@MainActor
@Observable
final class WivraIPhoneCamera: NSObject, AVCapturePhotoCaptureDelegate, AVCaptureFileOutputRecordingDelegate {
    private let runner = WivraIPhoneSessionRunner()
    private let photoOutput = AVCapturePhotoOutput()
    private let movieOutput = AVCaptureMovieFileOutput()
    private var activeDevice: AVCaptureDevice?
    private var closeAfterVideo = false
    private var generation = 0

    var session: AVCaptureSession { runner.session }
    private(set) var lenses: [WivraIPhoneLens] = []
    var selectedLensID = ""
    private(set) var isRunning = false
    private(set) var isStarting = false
    private(set) var isRecording = false
    private(set) var isFinishing = false
    private(set) var photoBusy = false
    private(set) var includesAudio = false
    private(set) var status = "Cámara detenida. Las capturas se quedan en el iPhone."
    private(set) var lastPhotoURL: URL?
    private(set) var lastMovieURL: URL?
    private(set) var lastFilteredURL: URL?
    private(set) var lastPhotoImage: UIImage?

    var proMode = false
    // Slow shutter belongs to STILL photos only, never an ongoing MOV recording.
    private(set) var nightPhotoMode = false
    private(set) var supportsNightPhoto = false
    private(set) var maxNightPhotoExposureSeconds = 1.0 / 30.0
    var iso = 100.0
    var shutterSeconds = 1.0 / 120
    var focusPosition = 0.5
    private(set) var minISO = 50.0
    private(set) var maxISO = 800.0
    private(set) var supportsManualExposure = false
    private(set) var supportsManualFocus = false
    var photoLook: WivraPhotoLook = .original
    var photoLookStrength = 0.65
    private(set) var filtering = false

    override init() {
        super.init()
        let discovery = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInUltraWideCamera, .builtInWideAngleCamera, .builtInTelephotoCamera],
            mediaType: .video,
            position: .unspecified
        )
        let devices = discovery.devices.filter { $0.position == .back || $0.position == .front }
        lenses = devices.map {
            let position = $0.position == .front ? "Frontal" : "Trasera"
            let kind: String
            switch $0.deviceType {
            case .builtInUltraWideCamera: kind = "ultra gran angular"
            case .builtInTelephotoCamera: kind = "teleobjetivo"
            default: kind = "principal"
            }
            return WivraIPhoneLens(id: $0.uniqueID, name: "\(position) · \(kind)")
        }
        selectedLensID = lenses.first(where: { $0.name.contains("Trasera · principal") })?.id
            ?? lenses.first?.id ?? ""
    }

    func start() {
        guard !isRunning && !isStarting && !isRecording && !selectedLensID.isEmpty else { return }
        isStarting = true
        status = "Solicitando permisos y preparando cámara…"
        generation += 1
        let attempt = generation
        Task { @MainActor in
            let cameraGranted = await AVCaptureDevice.requestAccess(for: .video)
            guard attempt == generation else { return }
            guard cameraGranted else {
                isStarting = false
                status = "Sin permiso de cámara. Actívalo en Ajustes de iOS."
                return
            }
            // Audio is optional: microphone refusal must not block photo/video.
            let microphoneGranted = await AVCaptureDevice.requestAccess(for: .audio)
            guard attempt == generation else { return }
            do {
                try configure(microphoneGranted: microphoneGranted)
            } catch {
                isStarting = false
                status = "No se pudo preparar la cámara: " + error.localizedDescription
                return
            }
            runner.start { [weak self] running in
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    guard self.generation == attempt else {
                        self.runner.stop {}
                        return
                    }
                    self.isStarting = false
                    self.isRunning = running
                    self.status = running
                        ? (self.includesAudio ? "Cámara lista · MOV con audio del sistema" : "Cámara lista · video sin audio")
                        : "No se pudo iniciar la captura; revisa los permisos y la cámara."
                }
            }
        }
    }

    // Lens switches are intentionally allowed only with the session stopped.
    private func configure(microphoneGranted: Bool) throws {
        guard let device = AVCaptureDevice.devices(for: .video)
            .first(where: { $0.uniqueID == selectedLensID }) else {
            throw WivraIPhoneCameraError.lensMissing
        }
        let session = runner.session
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        session.sessionPreset = .high
        session.inputs.forEach { session.removeInput($0) }
        session.outputs.forEach { session.removeOutput($0) }

        let cameraInput = try AVCaptureDeviceInput(device: device)
        guard session.canAddInput(cameraInput) else { throw WivraIPhoneCameraError.unavailable }
        session.addInput(cameraInput)

        includesAudio = false
        if microphoneGranted, let microphone = AVCaptureDevice.default(for: .audio),
           let audioInput = try? AVCaptureDeviceInput(device: microphone),
           session.canAddInput(audioInput) {
            session.addInput(audioInput)
            includesAudio = true
        }

        guard session.canAddOutput(photoOutput), session.canAddOutput(movieOutput) else {
            throw WivraIPhoneCameraError.unavailable
        }
        session.addOutput(photoOutput)
        session.addOutput(movieOutput)
        activeDevice = device
        minISO = Double(device.activeFormat.minISO)
        maxISO = Double(device.activeFormat.maxISO)
        iso = Double(device.iso).clamped(to: minISO...maxISO)
        supportsManualExposure = device.isExposureModeSupported(.custom)
        supportsManualFocus = device.isLockingFocusWithCustomLensPositionSupported
        let hardwareMaximum = CMTimeGetSeconds(device.activeFormat.maxExposureDuration)
        maxNightPhotoExposureSeconds = hardwareMaximum.isFinite
            ? min(8.0, max(1.0 / 30.0, hardwareMaximum))
            : 1.0 / 30.0
        supportsNightPhoto = supportsManualExposure && maxNightPhotoExposureSeconds >= 1.0 / 8.0
        nightPhotoMode = false
        shutterSeconds = 1.0 / 120
        focusPosition = Double(device.lensPosition)
        proMode = false
    }

    func setProMode(_ enabled: Bool) {
        guard isRunning && !isRecording && !isFinishing, let device = activeDevice else { return }
        do {
            try device.lockForConfiguration()
            defer { device.unlockForConfiguration() }
            if enabled && device.isExposureModeSupported(.custom) {
                proMode = true
                nightPhotoMode = false
                shutterSeconds = min(shutterSeconds, 1.0 / 30.0)
                setManualExposureOnLockedDevice(device)
            } else {
                proMode = false
                nightPhotoMode = false
                shutterSeconds = 1.0 / 120.0
                if device.isExposureModeSupported(.continuousAutoExposure) {
                    device.exposureMode = .continuousAutoExposure
                }
                if device.isFocusModeSupported(.continuousAutoFocus) {
                    device.focusMode = .continuousAutoFocus
                }
            }
        } catch {
            status = "No se pudo cambiar exposición: " + error.localizedDescription
        }
    }

    // Custom exposure is provided by AVCaptureDevice.activeFormat, not simulated
    // by brightening a JPEG. Hardware/format limits are read per selected lens.
    // Switching back to video-safe timing is required before recording a movie.
    func setNightPhotoMode(_ enabled: Bool) {
        guard isRunning && !isRecording && !isFinishing && !photoBusy,
              proMode && supportsManualExposure, let device = activeDevice else { return }
        guard !enabled || supportsNightPhoto else {
            status = "La lente no ofrece una obturación fotográfica lenta en este formato."
            return
        }
        do {
            try device.lockForConfiguration()
            defer { device.unlockForConfiguration() }
            nightPhotoMode = enabled
            shutterSeconds = enabled
                ? min(0.5, maxNightPhotoExposureSeconds)
                : min(shutterSeconds, 1.0 / 30.0)
            setManualExposureOnLockedDevice(device)
            status = enabled
                ? "Foto nocturna experimental. Usa trípode; respeta el límite real de esta lente."
                : "Exposición devuelta al rango compatible con grabación de video."
        } catch {
            status = "Foto nocturna: " + error.localizedDescription
        }
    }

    func updateManualExposure() {
        guard isRunning && !isRecording && !isFinishing && !photoBusy
              && proMode && supportsManualExposure,
              let device = activeDevice else { return }
        do {
            try device.lockForConfiguration()
            defer { device.unlockForConfiguration() }
            setManualExposureOnLockedDevice(device)
        } catch {
            status = "ISO/obturación: " + error.localizedDescription
        }
    }

    private func setManualExposureOnLockedDevice(_ device: AVCaptureDevice) {
        let safeISO = Float(iso.clamped(to: minISO...maxISO))
        let floor = max(CMTimeGetSeconds(device.activeFormat.minExposureDuration), 1.0 / 1000.0)
        // Long exposures are possible only in photo-only mode when the device
        // advertises them; otherwise remain within the 1/30-second video bound.
        let limit = nightPhotoMode ? maxNightPhotoExposureSeconds : 1.0 / 30.0
        let ceiling = min(CMTimeGetSeconds(device.activeFormat.maxExposureDuration), limit)
        let seconds = shutterSeconds.clamped(to: floor...max(floor, ceiling))
        device.setExposureModeCustom(duration: CMTimeMakeWithSeconds(seconds, preferredTimescale: 1_000_000),
                                     iso: safeISO, completionHandler: nil)
    }

    func updateManualFocus() {
        guard isRunning && !isRecording && proMode && supportsManualFocus,
              let device = activeDevice else { return }
        do {
            try device.lockForConfiguration()
            defer { device.unlockForConfiguration() }
            device.setFocusModeLocked(lensPosition: Float(focusPosition.clamped(to: 0...1)),
                                      completionHandler: nil)
        } catch {
            status = "Enfoque: " + error.localizedDescription
        }
    }

    func takePhoto() {
        guard isRunning && !photoBusy && !isFinishing else { return }
        photoBusy = true
        status = isRecording ? "Solicitando foto durante video…"
            : nightPhotoMode ? "Capturando foto nocturna con obturación real (experimental)…"
            : "Capturando fotografía…"
        photoOutput.capturePhoto(
            with: AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg]),
            delegate: self
        )
    }

    nonisolated func photoOutput(_ output: AVCapturePhotoOutput,
                                 didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        let bytes = photo.fileDataRepresentation()
        let message = error?.localizedDescription
        Task { @MainActor [weak self] in
            self?.finishPhoto(bytes: bytes, error: message)
        }
    }

    private func finishPhoto(bytes: Data?, error: String?) {
        photoBusy = false
        guard error == nil, let bytes, let image = UIImage(data: bytes) else {
            status = "Fotografía fallida: " + (error ?? "sin datos JPEG válidos")
            return
        }
        do {
            let url = try nextMediaURL(ext: "jpg")
            try bytes.write(to: url, options: .atomic)
            lastPhotoURL = url
            lastFilteredURL = nil
            lastPhotoImage = image
            status = "JPEG original guardado sin modificar."
        } catch {
            status = "No se pudo guardar la foto: " + error.localizedDescription
        }
    }

    func toggleVideo() {
        guard isRunning && !isFinishing else { return }
        if isRecording {
            stopVideo()
            return
        }
        guard !nightPhotoMode else {
            status = "Desactiva Foto nocturna antes de grabar MOV."
            return
        }
        guard !photoBusy else { return }
        do {
            let url = try nextMediaURL(ext: "mov")
            lastMovieURL = nil
            movieOutput.startRecording(to: url, recordingDelegate: self)
            isRecording = true
            status = includesAudio ? "REC · MOV con entrada de audio del sistema" : "REC · MOV sin audio"
        } catch {
            status = "No se pudo crear el archivo MOV: " + error.localizedDescription
        }
    }

    private func stopVideo() {
        guard isRecording && !isFinishing else { return }
        isFinishing = true
        status = "Finalizando video en el iPhone…"
        movieOutput.stopRecording()
    }

    nonisolated func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL,
                                from connections: [AVCaptureConnection], error: Error?) {
        let message = error?.localizedDescription
        Task { @MainActor [weak self] in
            self?.finishVideo(url: outputFileURL, error: message)
        }
    }

    private func finishVideo(url: URL, error: String?) {
        isFinishing = false
        isRecording = false
        if let error {
            status = "Error al finalizar video: " + error
        } else if (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int64) ?? 0 > 0 {
            lastMovieURL = url
            status = "MOV guardado en Wivra. La foto simultánea requiere prueba física."
        } else {
            status = "No se guardó MOV válido."
        }
        if closeAfterVideo {
            closeAfterVideo = false
            stop()
        }
    }

    func stop() {
        generation += 1
        if isFinishing { closeAfterVideo = true; return }
        if isRecording { closeAfterVideo = true; stopVideo(); return }
        if !isRunning && !isStarting { return }
        isStarting = false
        isRunning = false
        runner.stop { [weak self] in
            Task { @MainActor [weak self] in
                self?.activeDevice = nil
                self?.status = "Cámara detenida. Medios originales guardados localmente."
            }
        }
    }

    func exportFilteredCopy() {
        guard !filtering, let original = lastPhotoURL else { return }
        filtering = true
        let chosen = photoLook
        let strength = photoLookStrength
        Task { @MainActor [weak self] in
            do {
                let result = try await Task.detached(priority: .userInitiated) {
                    let bytes = try Data(contentsOf: original)
                    return try WivraPhotoLooks.renderJPEG(bytes, look: chosen, strength: strength)
                }.value
                let url = try self?.nextMediaURL(ext: "jpg")
                if let url {
                    try result.write(to: url, options: .atomic)
                    self?.lastFilteredURL = url
                    self?.status = "Filtro guardado como copia JPEG; original intacto."
                }
            } catch {
                self?.status = "Filtro: " + error.localizedDescription
            }
            self?.filtering = false
        }
    }

    private func nextMediaURL(ext: String) throws -> URL {
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("WivraIPhoneMedia", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent("Wivra_\(UUID().uuidString).\(ext)")
    }
}

private enum WivraIPhoneCameraError: LocalizedError {
    case lensMissing
    case unavailable
    var errorDescription: String? {
        switch self {
        case .lensMissing: "La lente seleccionada ya no está disponible."
        case .unavailable: "Este dispositivo no admite esta combinación de captura."
        }
    }
}

private extension Double {
    func clamped(to bounds: ClosedRange<Double>) -> Double {
        min(max(self, bounds.lowerBound), bounds.upperBound)
    }
}
