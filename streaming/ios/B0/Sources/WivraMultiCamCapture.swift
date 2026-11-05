// Wivra iPhone: back + front cameras at once with AVCaptureMultiCamSession.
// Two separate movie files on one session (the editor composes main + PiP from
// the pair receipt). One audio source: the microphone goes ONLY into the main
// movie. If MultiCam is unsupported, too costly or fails, one camera records.
// If a camera stops while recording (interruption, runtime error, pressure),
// the files are closed (they keep every frame up to that moment) and, when the
// main camera can continue, a NEW single-camera take starts.
// Not verified on a physical iPhone. — Claude
@preconcurrency import AVFoundation
import Observation
import QuartzCore
import UIKit

private final class WivraMultiCamRunner: @unchecked Sendable {
    private let queue = DispatchQueue(label: "com.oswhgo.wivra.multicam.session", qos: .userInitiated)
    func start(_ session: AVCaptureSession, _ done: @escaping @Sendable (Bool) -> Void) {
        queue.async {
            if !session.isRunning { session.startRunning() }
            done(session.isRunning)
        }
    }
    func stop(_ session: AVCaptureSession, _ done: @escaping @Sendable () -> Void) {
        queue.async {
            if session.isRunning { session.stopRunning() }
            done()
        }
    }
}

@MainActor
@Observable
final class WivraMultiCamCapture: NSObject, AVCaptureFileOutputRecordingDelegate {
    private let runner = WivraMultiCamRunner()
    private(set) var session: AVCaptureSession = AVCaptureSession()
    private(set) var primaryLayer: AVCaptureVideoPreviewLayer?
    private(set) var secondaryLayer: AVCaptureVideoPreviewLayer?
    private var primaryOutput: AVCaptureMovieFileOutput?
    private var secondaryOutput: AVCaptureMovieFileOutput?

    private(set) var isDual = false
    private(set) var isRunning = false
    private(set) var isRecording = false
    private(set) var isFinishing = false
    private(set) var status = "Dos cámaras: detenido. Todo se queda en el iPhone."
    private(set) var inventory: [String] = []
    private(set) var savedTakes: [URL] = []
    var corner: WivraMultiCamCorner = .bottomRight
    var frontIsPrimary = false
    private(set) var includesAudio = false

    private var forceSingle = false
    private var ownerStopped = false
    private var continueAfterFinish = false
    private var takeIndex = 0
    private var continuation = false
    private var pending: [URL: (started: CFTimeInterval?, finished: Bool, error: Bool)] = [:]
    private var primaryURL: URL?
    private var secondaryURL: URL?

    var isReleased: Bool { !isRunning && !isRecording && !isFinishing }

    /// What THIS iPhone reports (diagnostic text shown as-is).
    func refreshInventory() {
        let discovery = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .builtInUltraWideCamera, .builtInTelephotoCamera],
            mediaType: .video, position: .unspecified)
        var lines = discovery.devices.map { d in
            "• " + (d.position == .front ? "Frontal" : d.position == .back ? "Trasera" : "Otra") + " · " + d.localizedName
        }
        lines.append(AVCaptureMultiCamSession.isMultiCamSupported
            ? "MultiCam: admitido por este iPhone (\(discovery.supportedMultiCamDeviceSets.count) combinaciones)."
            : "MultiCam: este iPhone no lo admite; se grabará con una cámara.")
        inventory = lines
    }

    private func wide(_ position: AVCaptureDevice.Position) -> AVCaptureDevice? {
        AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position)
    }

    func start() {
        guard isReleased else { return }
        status = "Solicitando permisos…"
        Task { @MainActor in
            guard await AVCaptureDevice.requestAccess(for: .video) else {
                status = "Sin permiso de cámara. Actívalo en Ajustes de iOS."
                return
            }
            let mic = await AVCaptureDevice.requestAccess(for: .audio)
            configure(microphone: mic)
            let current = session
            runner.start(current) { [weak self] running in
                Task { @MainActor [weak self] in
                    guard let self, self.session === current else { return }
                    self.isRunning = running
                    if !running { self.status = "No se pudo iniciar la captura." }
                }
            }
        }
    }

    private func configure(microphone: Bool) {
        primaryLayer = nil; secondaryLayer = nil
        primaryOutput = nil; secondaryOutput = nil
        isDual = false
        let primaryPos: AVCaptureDevice.Position = frontIsPrimary ? .front : .back
        let secondaryPos: AVCaptureDevice.Position = frontIsPrimary ? .back : .front
        let first = WivraMultiCamPolicy.plan(
            multiCamSupported: AVCaptureMultiCamSession.isMultiCamSupported && !forceSingle,
            hasBack: wide(.back) != nil, hasFront: wide(.front) != nil)
        if first.dual, let main = wide(primaryPos), let inset = wide(secondaryPos) {
            let multi = AVCaptureMultiCamSession()
            if configureDual(multi, main: main, inset: inset, microphone: microphone) {
                let costs = WivraMultiCamPolicy.plan(
                    multiCamSupported: true, hasBack: true, hasFront: true,
                    hardwareCost: multi.hardwareCost, systemPressureCost: multi.systemPressureCost)
                if costs.dual {
                    session = multi
                    isDual = true
                    status = "Dos cámaras listas. Se graban dos videos; el editor los une con recuadro."
                    return
                }
                status = "Este iPhone no puede sostener dos cámaras ahora (costo \(costs.reason)). Se usa una."
            } else {
                status = "No se pudieron abrir las dos cámaras. Se usa una."
            }
            primaryLayer = nil; secondaryLayer = nil
            primaryOutput = nil; secondaryOutput = nil
        } else if !forceSingle {
            status = first.reason == "multicam-unsupported"
                ? "Este iPhone no admite dos cámaras a la vez. Se graba con una."
                : "No hay cámara trasera y frontal disponibles a la vez. Se graba con una."
        }
        configureSingle(position: primaryPos, microphone: microphone)
    }

    private func configureDual(_ s: AVCaptureMultiCamSession, main: AVCaptureDevice, inset: AVCaptureDevice,
                               microphone: Bool) -> Bool {
        s.beginConfiguration()
        defer { s.commitConfiguration() }
        let mainOut = AVCaptureMovieFileOutput()
        let insetOut = AVCaptureMovieFileOutput()
        let mainLayer = AVCaptureVideoPreviewLayer(sessionWithNoConnection: s)
        let insetLayer = AVCaptureVideoPreviewLayer(sessionWithNoConnection: s)
        for (device, output, layer) in [(main, mainOut, mainLayer), (inset, insetOut, insetLayer)] {
            guard let input = try? AVCaptureDeviceInput(device: device), s.canAddInput(input) else { return false }
            s.addInputWithNoConnections(input)
            guard s.canAddOutput(output) else { return false }
            s.addOutputWithNoConnections(output)
            guard let port = input.ports(for: .video, sourceDeviceType: device.deviceType,
                                         sourceDevicePosition: device.position).first else { return false }
            let recording = AVCaptureConnection(inputPorts: [port], output: output)
            guard s.canAddConnection(recording) else { return false }
            s.addConnection(recording)
            let preview = AVCaptureConnection(inputPort: port, videoPreviewLayer: layer)
            guard s.canAddConnection(preview) else { return false }
            s.addConnection(preview)
        }
        includesAudio = false
        if microphone, let mic = AVCaptureDevice.default(for: .audio),
           let micInput = try? AVCaptureDeviceInput(device: mic), s.canAddInput(micInput) {
            s.addInputWithNoConnections(micInput)
            if let port = micInput.ports(for: .audio, sourceDeviceType: mic.deviceType,
                                         sourceDevicePosition: .unspecified).first ?? micInput.ports.first(where: { $0.mediaType == .audio }) {
                let audio = AVCaptureConnection(inputPorts: [port], output: mainOut)
                if s.canAddConnection(audio) { s.addConnection(audio); includesAudio = true }
            }
        }
        mainLayer.videoGravity = .resizeAspectFill
        insetLayer.videoGravity = .resizeAspectFill
        primaryLayer = mainLayer; secondaryLayer = insetLayer
        primaryOutput = mainOut; secondaryOutput = insetOut
        return true
    }

    private func configureSingle(position: AVCaptureDevice.Position, microphone: Bool) {
        let s = AVCaptureSession()
        s.beginConfiguration()
        defer { s.commitConfiguration() }
        includesAudio = false
        let out = AVCaptureMovieFileOutput()
        guard let device = wide(position) ?? wide(position == .back ? .front : .back),
              let input = try? AVCaptureDeviceInput(device: device), s.canAddInput(input),
              s.canAddOutput(out) else {
            session = s
            status = "No queda ninguna cámara disponible."
            return
        }
        s.addInput(input)
        s.addOutput(out)
        if microphone, let mic = AVCaptureDevice.default(for: .audio),
           let micInput = try? AVCaptureDeviceInput(device: mic), s.canAddInput(micInput) {
            s.addInput(micInput)
            includesAudio = true
        }
        let layer = AVCaptureVideoPreviewLayer(session: s)
        layer.videoGravity = .resizeAspectFill
        session = s
        primaryLayer = layer
        primaryOutput = out
    }

    func toggleRecording() {
        if isRecording { stopRecording(owner: true) } else { startRecording(isContinuation: false) }
    }

    private func startRecording(isContinuation: Bool) {
        guard isRunning, !isFinishing, let main = primaryOutput else { return }
        do {
            takeIndex += 1
            continuation = isContinuation
            ownerStopped = false
            let a = try Self.nextURL()
            primaryURL = a
            pending = [a: (nil, false, false)]
            main.startRecording(to: a, recordingDelegate: self)
            if isDual, let inset = secondaryOutput {
                let b = try Self.nextURL()
                secondaryURL = b
                pending[b] = (nil, false, false)
                inset.startRecording(to: b, recordingDelegate: self)
            } else { secondaryURL = nil }
            isRecording = true
            status = isContinuation ? "REC · sigue con una cámara (toma nueva)" : (isDual ? "REC · dos cámaras" : "REC · una cámara")
        } catch {
            status = "No se pudo crear el archivo: " + error.localizedDescription
        }
    }

    private func stopRecording(owner: Bool) {
        guard isRecording, !isFinishing else { return }
        ownerStopped = owner
        isFinishing = true
        status = "Cerrando los archivos en el iPhone…"
        primaryOutput?.stopRecording()
        secondaryOutput?.stopRecording()
    }

    /// Session interruption, runtime error or device loss (see the screen's
    /// NotificationCenter subscriptions). Mirrors multicamReduce('camera-lost').
    func cameraLost(reason: String) {
        status = "Se interrumpió la cámara (\(reason))."
        if isRecording {
            // Single mode after the loss; continue only if the owner did not stop.
            continueAfterFinish = WivraMultiCamPolicy.shouldContinueAfterLoss(
                remainingCameras: 1, ownerStopped: ownerStopped)
            forceSingle = true
            stopRecording(owner: false)
        } else if isDual {
            forceSingle = true
            restartSession()
        }
    }

    /// AVCaptureSessionInterruptionReason raw value from the notification.
    /// Only system pressure (5) is treated as a lost camera worth continuing
    /// with one camera; a call, background or another app stops cleanly.
    func interrupted(reasonRaw: Int?) {
        if reasonRaw == 5 {
            cameraLost(reason: "presión del sistema")
            return
        }
        continueAfterFinish = false
        if isRecording { stopRecording(owner: false) }
        status = "Cámara interrumpida por el sistema. Lo grabado se conserva."
    }

    func interruptionEnded() {
        if isRecording || isFinishing {
            status += " Al detener podrás volver a intentar dos cámaras."
        }
    }

    nonisolated func fileOutput(_ output: AVCaptureFileOutput, didStartRecordingTo fileURL: URL,
                                from connections: [AVCaptureConnection]) {
        let now = CACurrentMediaTime()
        Task { @MainActor [weak self] in self?.pending[fileURL]?.started = now }
    }

    nonisolated func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL,
                                from connections: [AVCaptureConnection], error: Error?) {
        let failed = error.map { (($0 as NSError).userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool) != true } ?? false
        Task { @MainActor [weak self] in self?.finished(outputFileURL, failed: failed) }
    }

    private func finished(_ url: URL, failed: Bool) {
        guard pending[url] != nil else { return }
        pending[url]?.finished = true
        pending[url]?.error = failed
        guard pending.values.allSatisfy(\.finished), let a = primaryURL else { return }
        let size = { (u: URL) -> Int64 in
            (try? FileManager.default.attributesOfItem(atPath: u.path)[.size] as? Int64) ?? 0
        }
        let mainStatus = WivraMultiCamPolicy.classifyTake(bytes: size(a), finishedWithoutError: !(pending[a]?.error ?? true))
        var insetStatus: WivraMultiCamTakeStatus?
        var offset: Double?
        if let b = secondaryURL {
            insetStatus = WivraMultiCamPolicy.classifyTake(bytes: size(b), finishedWithoutError: !(pending[b]?.error ?? true))
            if let ta = pending[a]?.started, let tb = pending[b]?.started { offset = (tb - ta) * 1000 }
            if insetStatus == .empty { try? FileManager.default.removeItem(at: b) }
        }
        if mainStatus == .empty { try? FileManager.default.removeItem(at: a) }
        if mainStatus != .empty {
            let manifest = WivraMultiCamTakeManifest(
                take: takeIndex, mode: secondaryURL == nil ? "single" : "dual-separate",
                primaryFile: a.lastPathComponent, primaryPosition: frontIsPrimary ? "front" : "back",
                secondaryFile: insetStatus == .empty ? nil : secondaryURL?.lastPathComponent,
                secondaryPosition: secondaryURL == nil ? nil : (frontIsPrimary ? "back" : "front"),
                secondaryOffsetMs: offset, offsetSource: "didStartRecording-callback",
                audio: includesAudio ? "primary" : "none", corner: corner,
                continuation: continuation, primaryStatus: mainStatus, secondaryStatus: insetStatus)
            _ = try? WivraMultiCamTakeManifest.write(manifest, next: a)
            savedTakes.append(a)
        }
        status = mainStatus == .kept ? "Toma guardada en el iPhone (Capturas)."
            : mainStatus == .needsReview ? "La toma se cerró con un error; se conservó para revisarla."
            : "La toma no tenía datos."
        pending = [:]
        isRecording = false
        isFinishing = false
        if continueAfterFinish {
            continueAfterFinish = false
            restartSession(thenRecord: true)
        }
    }

    private func restartSession(thenRecord: Bool = false) {
        let old = session
        isRunning = false
        runner.stop(old) { [weak self] in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.configure(microphone: AVCaptureDevice.authorizationStatus(for: .audio) == .authorized)
                let current = self.session
                self.runner.start(current) { [weak self] running in
                    Task { @MainActor [weak self] in
                        guard let self, self.session === current else { return }
                        self.isRunning = running
                        if running && thenRecord { self.startRecording(isContinuation: true) }
                    }
                }
            }
        }
    }

    /// Owner choices, only while stopped. Also retries two cameras.
    func swapCameras() {
        guard !isRecording && !isFinishing else { return }
        frontIsPrimary.toggle()
        forceSingle = false
        if isRunning { restartSession() }
    }

    func moveInset() { corner = corner.next }

    func stop() {
        if isRecording { stopRecording(owner: true); return }
        guard isRunning else { return }
        isRunning = false
        runner.stop(session) {}
        status = "Dos cámaras: detenido."
    }

    private static func nextURL() throws -> URL {
        // Same folder as the iPhone camera: the capture library already lists it.
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("WivraIPhoneMedia", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent("Wivra_\(UUID().uuidString).mov")
    }
}
