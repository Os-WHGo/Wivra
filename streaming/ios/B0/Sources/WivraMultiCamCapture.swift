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
    // Dual capture uses multiple VideoDataOutputs, never two MovieFileOutputs.
    private var sampleRecorder: WivraMultiCamSampleRecorder?

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
    // Foreground and disk/thermal safety guards for a camera session.
    private var stopSessionAfterFinish = false
    private var safetyMonitor: Task<Void, Never>?
    private var sessionRequest = 0

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
        guard isReleased, UIApplication.shared.applicationState == .active else { return }
        stopSessionAfterFinish = false
        sessionRequest += 1
        let request = sessionRequest
        status = "Solicitando permisos…"
        Task { @MainActor [weak self] in
            guard let self else { return }
            guard await AVCaptureDevice.requestAccess(for: .video) else {
                self.status = "Sin permiso de cámara. Actívalo en Ajustes de iOS."
                return
            }
            let mic = await AVCaptureDevice.requestAccess(for: .audio)
            // Permission dialogs are async: dismissing the screen before
            // approval must not resurrect a camera in the background.
            guard self.sessionRequest == request, !self.stopSessionAfterFinish,
                  UIApplication.shared.applicationState == .active else { return }
            self.configure(microphone: mic)
            let current = self.session
            self.runner.start(current) { [weak self] running in
                Task { @MainActor [weak self] in
                    guard let self, self.session === current else { return }
                    if self.sessionRequest != request || self.stopSessionAfterFinish ||
                       UIApplication.shared.applicationState != .active {
                        self.isRunning = false
                        self.runner.stop(current) {}
                        return
                    }
                    self.isRunning = running
                    if !running { self.status = "No se pudo iniciar la captura." }
                }
            }
        }
    }

    private func configure(microphone: Bool) {
        primaryLayer = nil; secondaryLayer = nil
        primaryOutput = nil; secondaryOutput = nil
        sampleRecorder = nil
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
        sampleRecorder = nil
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
        // iOS 17 permits two AVCaptureVideoDataOutput instances. Apple limits
        // MovieFileOutput to one output per session: data buffers + AVAssetWriter
        // are mandatory for two editable originals on one MultiCam clock.
        let mainOut = AVCaptureVideoDataOutput()
        let insetOut = AVCaptureVideoDataOutput()
        for output in [mainOut, insetOut] {
            output.alwaysDiscardsLateVideoFrames = true
            output.videoSettings = [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
            ]
        }
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
        var audioOut: AVCaptureAudioDataOutput?
        includesAudio = false
        if microphone, let mic = AVCaptureDevice.default(for: .audio),
           let micInput = try? AVCaptureDeviceInput(device: mic), s.canAddInput(micInput) {
            s.addInputWithNoConnections(micInput)
            if let port = micInput.ports(for: .audio, sourceDeviceType: mic.deviceType,
                                         sourceDevicePosition: .unspecified).first ??
                          micInput.ports.first(where: { $0.mediaType == .audio }) {
                let output = AVCaptureAudioDataOutput()
                if s.canAddOutput(output) {
                    s.addOutputWithNoConnections(output)
                    let audio = AVCaptureConnection(inputPorts: [port], output: output)
                    if s.canAddConnection(audio) {
                        s.addConnection(audio)
                        audioOut = output
                        includesAudio = true
                    }
                }
            }
        }
        mainLayer.videoGravity = .resizeAspectFill
        insetLayer.videoGravity = .resizeAspectFill
        primaryLayer = mainLayer
        secondaryLayer = insetLayer
        primaryOutput = nil
        secondaryOutput = nil
        sampleRecorder = WivraMultiCamSampleRecorder(primary: mainOut, secondary: insetOut,
                                                     microphone: audioOut)
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

    // Reject an unmeasurable or low disk budget before either camera writes.
    private func freeDiskBytes() -> Int64? {
        let folder = FileManager.default.urls(for: .documentDirectory,
            in: .userDomainMask)[0].appendingPathComponent("WivraIPhoneMedia", isDirectory: true)
        let attrs = try? FileManager.default.attributesOfFileSystem(
            forPath: folder.deletingLastPathComponent().path)
        return (attrs?[.systemFreeSize] as? NSNumber)?.int64Value
    }

    private func armSafetyMonitor() {
        safetyMonitor?.cancel()
        let take = takeIndex
        safetyMonitor = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(Int(WivraMultiCamSafetyPolicy.monitorIntervalSeconds)))
                guard let self, !Task.isCancelled, self.takeIndex == take,
                      self.isRecording, !self.isFinishing else { return }
                let thermal = ProcessInfo.processInfo.thermalState
                let action = WivraMultiCamSafetyPolicy.check(
                    freeBytes: self.freeDiskBytes(),
                    seriousThermal: thermal == .serious || thermal == .critical,
                    criticalThermal: thermal == .critical,
                    dual: self.isDual)
                switch action {
                case .keepRecording:
                    break
                case .switchToSingle:
                    self.cameraLost(reason: "temperatura alta; continuando con una cámara")
                    return
                case .stopAndPreserve:
                    self.status = "Espacio insuficiente o temperatura crítica: cerrando y conservando lo grabado."
                    self.stop()
                    return
                }
            }
        }
    }

    private func startRecording(isContinuation: Bool) {
        guard isRunning, !isFinishing, !stopSessionAfterFinish,
              UIApplication.shared.applicationState == .active else { return }
        guard (isDual ? sampleRecorder != nil : primaryOutput != nil) else { return }
        guard WivraMultiCamSafetyPolicy.canStart(freeBytes: freeDiskBytes()) else {
            status = "No hay espacio seguro para iniciar otra grabación. No se creó ninguna toma."
            return
        }
        do {
            // Resolve both fresh paths before starting either writer.
            let a = try Self.nextURL()
            let b = isDual ? try Self.nextURL() : nil
            takeIndex += 1
            continuation = isContinuation
            ownerStopped = false
            primaryURL = a
            secondaryURL = b
            if isDual, let sink = sampleRecorder, let b {
                let intent = WivraMultiCamTakeManifest(
                    take: takeIndex, mode: "dual-separate",
                    primaryFile: a.lastPathComponent,
                    primaryPosition: frontIsPrimary ? "front" : "back",
                    secondaryFile: b.lastPathComponent,
                    secondaryPosition: frontIsPrimary ? "back" : "front",
                    secondaryOffsetMs: nil,
                    offsetSource: "awaiting-video-sample-pts",
                    audio: includesAudio ? "primary" : "none",
                    corner: corner, continuation: continuation,
                    primaryStatus: .needsReview, secondaryStatus: .needsReview)
                guard (try? WivraMultiCamTakeManifest.write(intent, beside: a)) != nil else {
                    status = "No se pudo guardar el recibo de recuperación; no se inicia la toma."
                    primaryURL = nil
                    secondaryURL = nil
                    return
                }
                pending = [:]
                // Prevent the local recovery screen from examining a MOV that
                // still has active camera writers in this application process.
                WivraMultiCamActiveCaptureRegistry.start(a)
                sink.start(primary: a, secondary: b, audioRequired: includesAudio)
            } else if let output = primaryOutput {
                pending = [a: (nil, false, false)]
                output.startRecording(to: a, recordingDelegate: self)
            } else { return }
            isRecording = true
            armSafetyMonitor()
            status = isContinuation ? "REC · sigue con una cámara (toma nueva)" :
                (isDual ? "REC · dos cámaras" : "REC · una cámara")
        } catch {
            status = "No se pudo crear el archivo: " + error.localizedDescription
        }
    }

    private func stopRecording(owner: Bool) {
        guard isRecording, !isFinishing else { return }
        ownerStopped = owner
        isFinishing = true
        safetyMonitor?.cancel()
        safetyMonitor = nil
        status = "Cerrando los archivos en el iPhone…"
        if isDual, let sink = sampleRecorder {
            sink.finish { [weak self] result in
                Task { @MainActor [weak self] in self?.finishedSamples(result) }
            }
        } else {
            primaryOutput?.stopRecording()
        }
    }

    /// Session interruption, runtime error or device loss (see the screen's
    /// NotificationCenter subscriptions). Mirrors multicamReduce('camera-lost').
    func cameraLost(reason: String) {
        status = "Se interrumpió la cámara (\(reason))."
        // Don't reactivate capture after the user exited or closure began.
        guard !isFinishing, !stopSessionAfterFinish else { return }
        if isRecording {
            continueAfterFinish = WivraMultiCamSafetyPolicy.mayRestartSingle(
                ownerStopped: ownerStopped, exitRequested: stopSessionAfterFinish,
                foregroundActive: UIApplication.shared.applicationState == .active,
                camerasRemaining: 1)
            forceSingle = true
            stopRecording(owner: false)
        } else if isDual && isRunning && UIApplication.shared.applicationState == .active {
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

    private func finishedSamples(_ result: WivraMultiCamSampleRecorder.Result) {
        guard isFinishing, primaryURL == result.primaryURL,
              secondaryURL == result.secondaryURL else { return }
        let root = result.primaryURL.deletingLastPathComponent()
        let audioRequired = includesAudio

        // Persist a fail-closed receipt BEFORE decoding either MOV. If the
        // process is suspended, crashes or the verifier is interrupted, both
        // nonempty originals remain marked needs-review, not "verified".
        let bytes = { (url: URL) -> Int64 in
            (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int64) ?? 0
        }
        let primaryProvisional = WivraMultiCamPolicy.classifyTake(
            bytes: bytes(result.primaryURL), finishedWithoutError: false)
        let secondaryProvisional = WivraMultiCamPolicy.classifyTake(
            bytes: bytes(result.secondaryURL), finishedWithoutError: false)
        if primaryProvisional != .empty || secondaryProvisional != .empty {
            let pendingReceipt = WivraMultiCamTakeManifest(
                take: takeIndex, mode: "dual-separate",
                primaryFile: result.primaryURL.lastPathComponent,
                primaryPosition: frontIsPrimary ? "front" : "back",
                secondaryFile: secondaryProvisional == .empty ? nil : result.secondaryURL.lastPathComponent,
                secondaryPosition: frontIsPrimary ? "back" : "front",
                secondaryOffsetMs: result.secondaryOffsetSeconds.map { $0 * 1000 },
                offsetSource: "video-sample-pts",
                audio: audioRequired ? "primary" : "none",
                corner: corner, continuation: continuation,
                primaryStatus: primaryProvisional,
                secondaryStatus: secondaryProvisional)
            _ = try? WivraMultiCamTakeManifest.write(pendingReceipt, beside: result.primaryURL)
        }
        status = "Verificando ambas grabaciones antes de importar al editor…"

        // Full track/sample/boundary verification happens OFF the main actor.
        // Reuse the canonical capture verifier rather than another MP4 parser:
        // writer.status == completed and byte count alone do not prove a
        // readable, complete video or the requested microphone track.
        Task.detached(priority: .utility) { [weak self] in
            var mainVerified = false
            if result.primaryComplete {
                mainVerified = await WivraCaptureMediaVerifier.verifyFile(
                    result.primaryURL, in: root, requireAudio: audioRequired)
            }
            var secondaryVerified = false
            if result.secondaryComplete {
                secondaryVerified = await WivraCaptureMediaVerifier.verifyFile(
                    result.secondaryURL, in: root, requireAudio: false)
            }
            await MainActor.run { [weak self] in
                guard let self, self.isFinishing,
                      self.primaryURL == result.primaryURL,
                      self.secondaryURL == result.secondaryURL else { return }
                // Re-read sizes on the main actor after the async verifier,
                // without crossing actors with the closure from above.
                let mainBytes = (try? FileManager.default.attributesOfItem(
                    atPath: result.primaryURL.path)[.size] as? Int64) ?? 0
                let insetBytes = (try? FileManager.default.attributesOfItem(
                    atPath: result.secondaryURL.path)[.size] as? Int64) ?? 0
                let mainStatus = WivraMultiCamPolicy.classifyTake(
                    bytes: mainBytes, finishedWithoutError: mainVerified)
                let insetStatus = WivraMultiCamPolicy.classifyTake(
                    bytes: insetBytes, finishedWithoutError: secondaryVerified)
                self.finishTake(mainStatus: mainStatus, insetStatus: insetStatus,
                                offsetMilliseconds: result.secondaryOffsetSeconds.map { $0 * 1000 })
            }
        }
    }

    // Stable single-camera MovieFileOutput path retained for older devices.
    private func finished(_ url: URL, failed: Bool) {
        guard pending[url] != nil else { return }
        pending[url]?.finished = true
        pending[url]?.error = failed
        guard pending.values.allSatisfy(\.finished), let a = primaryURL else { return }
        let size = { (u: URL) -> Int64 in
            (try? FileManager.default.attributesOfItem(atPath: u.path)[.size] as? Int64) ?? 0
        }
        let mainStatus = WivraMultiCamPolicy.classifyTake(
            bytes: size(a), finishedWithoutError: !(pending[a]?.error ?? true))
        var insetStatus: WivraMultiCamTakeStatus?
        var offset: Double?
        if let b = secondaryURL {
            insetStatus = WivraMultiCamPolicy.classifyTake(
                bytes: size(b), finishedWithoutError: !(pending[b]?.error ?? true))
            if let ta = pending[a]?.started, let tb = pending[b]?.started {
                offset = (tb - ta) * 1000
            }
        }
        finishTake(mainStatus: mainStatus, insetStatus: insetStatus,
                   offsetMilliseconds: offset)
    }

    // Shared finalizer: keep nonempty failed files for manual recovery, and
    // publish the editor's optional second video only if BOTH writers finished.
    private func finishTake(mainStatus: WivraMultiCamTakeStatus,
                            insetStatus: WivraMultiCamTakeStatus?,
                            offsetMilliseconds offset: Double?) {
        guard let a = primaryURL else { return }
        if let b = secondaryURL, insetStatus == .empty {
            try? FileManager.default.removeItem(at: b)
        }
        if mainStatus == .empty { try? FileManager.default.removeItem(at: a) }
        if mainStatus != .empty {
            let manifest = WivraMultiCamTakeManifest(
                take: takeIndex, mode: secondaryURL == nil ? "single" : "dual-separate",
                primaryFile: a.lastPathComponent, primaryPosition: frontIsPrimary ? "front" : "back",
                secondaryFile: insetStatus == .empty ? nil : secondaryURL?.lastPathComponent,
                secondaryPosition: secondaryURL == nil ? nil : (frontIsPrimary ? "back" : "front"),
                secondaryOffsetMs: offset, offsetSource: isDual ? "video-sample-pts" : "didStartRecording-callback",
                audio: includesAudio ? "primary" : "none", corner: corner,
                continuation: continuation, primaryStatus: mainStatus, secondaryStatus: insetStatus)
            _ = try? WivraMultiCamTakeManifest.write(manifest, beside: a)
            savedTakes.append(a)
        }
        // Editor import: a regular capture manifest, like the iPhone camera's,
        // only for a cleanly finished main movie. The inset is added only when
        // it also finished cleanly; otherwise the main camera is offered alone.
        if mainStatus == .kept {
            let inset: WivraCaptureMulticam? = {
                guard let b = secondaryURL, insetStatus == .kept else { return nil }
                return WivraCaptureMulticam(
                    secondaryVideoFile: b.lastPathComponent,
                    secondaryOffsetSeconds: offset.map { $0 / 1000 },
                    primaryPosition: frontIsPrimary ? "front" : "back",
                    secondaryPosition: frontIsPrimary ? "back" : "front",
                    corner: corner.rawValue, audio: "primary")
            }()
            _ = try? WivraCaptureManifest.write(videoURL: a, tracks: [], mergedURL: nil,
                                                cameraSource: "iphone-avfoundation", multicam: inset)
        }
        status = mainStatus == .kept ? "Toma guardada en el iPhone (Capturas)."
            : mainStatus == .needsReview ? "La toma se cerró con un error; se conservó para revisarla."
            : "La toma no tenía datos."
        // Keep the in-process registry active through the full native
        // verification and editor manifest commit, then expose recoverables.
        WivraMultiCamActiveCaptureRegistry.finished(a)
        pending = [:]
        isRecording = false
        isFinishing = false
        safetyMonitor?.cancel()
        safetyMonitor = nil
        let shouldRestart = continueAfterFinish &&
            WivraMultiCamSafetyPolicy.mayRestartSingle(
                ownerStopped: ownerStopped, exitRequested: stopSessionAfterFinish,
                foregroundActive: UIApplication.shared.applicationState == .active,
                camerasRemaining: 1)
        continueAfterFinish = false
        if shouldRestart { restartSession(thenRecord: true) }
        if stopSessionAfterFinish {
            stopSessionAfterFinish = false
            if isRunning { isRunning = false; runner.stop(session) {} }
        }
    }

    private func restartSession(thenRecord: Bool = false) {
        guard !stopSessionAfterFinish,
              UIApplication.shared.applicationState == .active else { return }
        let request = sessionRequest
        let old = session
        isRunning = false
        runner.stop(old) { [weak self] in
            Task { @MainActor [weak self] in
                guard let self, self.sessionRequest == request,
                      !self.stopSessionAfterFinish,
                      UIApplication.shared.applicationState == .active else { return }
                self.configure(microphone: AVCaptureDevice.authorizationStatus(for: .audio) == .authorized)
                let current = self.session
                self.runner.start(current) { [weak self] running in
                    Task { @MainActor [weak self] in
                        guard let self, self.session === current else { return }
                        if self.sessionRequest != request || self.stopSessionAfterFinish ||
                           UIApplication.shared.applicationState != .active {
                            self.isRunning = false
                            self.runner.stop(current) {}
                            return
                        }
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
        sessionRequest += 1
        ownerStopped = true
        continueAfterFinish = false
        stopSessionAfterFinish = true
        safetyMonitor?.cancel()
        safetyMonitor = nil
        if isRecording && !isFinishing { stopRecording(owner: true) }
        // Release camera immediately, not after a long file verification.
        if isRunning {
            isRunning = false
            runner.stop(session) {}
        }
        if !isRecording && !isFinishing {
            stopSessionAfterFinish = false
            status = "Dos cámaras: detenido."
        }
    }

    private static func nextURL() throws -> URL {
        // Same folder as the iPhone camera: the capture library already lists it.
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("WivraIPhoneMedia", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent("Wivra_\(UUID().uuidString).mov")
    }
}
