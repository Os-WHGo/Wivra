// Wivra iPhone LIVE P0 · real native phone camera -> RTMP/RTMPS.
// Meta DAT is deliberately excluded: a registered device is not a verified LIVE source.
import AVFoundation
import HaishinKit
import Observation
import RTMPHaishinKit
import SwiftUI

@MainActor @Observable
final class WivraIPhoneLiveController {
    enum Phase: String {
        case idle, preparing, ready, connecting, live, stopping
    }

    private(set) var phase: Phase = .idle
    private(set) var status = "LIVE detenido. No se está emitiendo."
    private(set) var verifiedVideoURL: URL?
    private(set) var unverifiedVideoURL: URL?
    private(set) var savedVideos: [URL] = []
    private(set) var audioUncertainVideos: Set<URL> = []
    private(set) var isReviewingSavedVideos = false

    private var mixer: MediaMixer?
    private var connection: RTMPConnection?
    private var stream: RTMPStream?
    private var recorder: StreamRecorder?
    private var privateVideoURL: URL?
    private var includesMicrophone = false
    private var generation = UUID()
    private var preview: MTHKView?
    private var storageMonitor: Task<Void, Never>?
    private let minimumRecordingFreeBytes: Int64 = 256 * 1024 * 1024

    var canPrepare: Bool { phase == .idle }
    var canStart: Bool { phase == .ready }
    var isActive: Bool { phase != .idle }

    func prepareCamera(microphone: Bool, frontCamera: Bool) async {
        guard phase == .idle else { return }
        phase = .preparing
        let current = UUID()
        generation = current
        status = "Solicitando cámara y preparando vista previa…"
        let allowed = await AVCaptureDevice.requestAccess(for: .video)
        guard generation == current else { return }
        guard allowed else {
            status = "Se necesita permiso de cámara para LIVE."
            phase = .idle
            return
        }
        if microphone {
            let allowedAudio = await AVCaptureDevice.requestAccess(for: .audio)
            guard generation == current else { return }
            guard allowedAudio else {
                status = "Micrófono denegado. Desactiva audio para emitir solo video."
                phase = .idle
                return
            }
        }
        let capture = MediaMixer()
        do {
            if microphone {
                let audioSession = AVAudioSession.sharedInstance()
                try audioSession.setCategory(.playAndRecord, mode: .default,
                                              options: [.defaultToSpeaker, .allowBluetooth])
                try audioSession.setActive(true)
            }
            // Reconciled from PR #159: choose exactly ONE physical camera
            // before configuring MediaMixer. No hot-switch or simultaneous PiP.
            let position: AVCaptureDevice.Position = frontCamera ? .front : .back
            guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera,
                                                       for: .video, position: position) else {
                status = "La cámara elegida no está disponible."
                if microphone {
                    try? AVAudioSession.sharedInstance().setActive(false,
                        options: .notifyOthersOnDeactivation)
                }
                phase = .idle
                return
            }
            // Permission alone does not guarantee a usable microphone device.
            // A requested audio archive must not silently become video-only.
            var selectedAudioInput: AVCaptureDevice?
            if microphone {
                guard let input = AVCaptureDevice.default(for: .audio) else {
                    status = "No hay entrada de micrófono disponible. Desactiva audio para grabar solo video."
                    try? AVAudioSession.sharedInstance().setActive(false,
                        options: .notifyOthersOnDeactivation)
                    phase = .idle
                    return
                }
                selectedAudioInput = input
            }
            try await capture.attachVideo(camera)
            if let selectedAudioInput {
                try await capture.attachAudio(selectedAudioInput)
            }
            await capture.startRunning()
            guard generation == current else {
                await capture.stopRunning()
                return
            }
            includesMicrophone = microphone
            mixer = capture
            if let preview { await capture.addOutput(preview) }
            phase = .ready
            status = "Cámara preparada. Ningún video se ha transmitido."
        } catch {
            await capture.stopRunning()
            if microphone {
                try? AVAudioSession.sharedInstance().setActive(false,
                    options: .notifyOthersOnDeactivation)
            }
            phase = .idle
            status = "No se pudo preparar cámara o audio. Revisa permisos."
        }
    }

    func startConfirmed(rawEndpoint: String, saveLocalCopy: Bool) async {
        guard phase == .ready, let mixer else { return }
        guard let endpoint = WivraIOSLiveEndpoint.parse(rawEndpoint) else {
            status = "Dirección RTMP/RTMPS inválida. No se transmitió."
            return
        }
        // The caller MUST show a second, explicit public-emission confirmation.
        phase = .connecting
        let current = UUID()
        generation = current
        verifiedVideoURL = nil
        unverifiedVideoURL = nil
        status = "Preparando emisión y copia local…"
        let liveConnection = RTMPConnection()
        let liveStream = RTMPStream(connection: liveConnection)
        connection = liveConnection
        stream = liveStream
        await mixer.addOutput(liveStream)
        // STOP may run while this actor hop is suspended. Never allocate or
        // rearm a recorder for a session that was already dismissed.
        guard generation == current, phase == .connecting else { return }
        if saveLocalCopy {
            // Keep enough room for the MP4 index, filesystem journal and UI.
            // A completed local archive is never silently replaced by LIVE-only.
            guard hasRecordingReserve() else {
                status = "Espacio insuficiente para MP4 local: libera al menos 256 MiB."
                await stop()
                return
            }
            do {
                let folder = try localFolder()
                let file = folder.appendingPathComponent(UUID().uuidString)
                    .appendingPathExtension("mp4")
                // Record the user's mic choice before any media bytes are
                // written, including when the app is later killed mid-LIVE.
                try WivraLiveRecordingReceipt.stage(
                    audioRequired: includesMicrophone, for: file, in: folder)
                let writer = StreamRecorder()
                await writer.setMovieFragmentInterval(10.0)
                await mixer.addOutput(writer)
                recorder = writer
                privateVideoURL = file
                let settings = includesMicrophone ? StreamRecorder.defaultSettings
                    : StreamRecorder.defaultSettings.filter { $0.key == .video }
                try await writer.startRecording(file, settings: settings)
                // If STOP arrived while the writer was starting, terminate it
                // here as well. It stays private and never reaches Photos.
                if generation != current || phase != .connecting {
                    _ = try? await writer.stopRecording()
                    await mixer.removeOutput(writer)
                    return
                }
            } catch {
                // A requested archive is a precondition to network LIVE, not
                // a best-effort checkbox that can silently fail.
                status = "No se pudo iniciar la copia MP4. No se emitirá LIVE."
                await stop()
                return
            }
        }
        do {
            guard generation == current, phase == .connecting else { return }
            try await liveConnection.connect(endpoint.serverURL)
            guard generation == current, phase == .connecting else { return }
            _ = try await liveStream.publish(endpoint.streamKey)
            guard generation == current, phase == .connecting else {
                _ = try? await liveStream.close()
                try? await liveConnection.close()
                return
            }
            phase = .live
            if saveLocalCopy {
                storageMonitor?.cancel()
                storageMonitor = Task { [weak self] in
                    while !Task.isCancelled {
                        try? await Task.sleep(nanoseconds: 10_000_000_000)
                        guard let self, !Task.isCancelled else { return }
                        guard self.phase == .live else { return }
                        guard self.hasRecordingReserve() else {
                            self.status = "Espacio crítico. Deteniendo LIVE para proteger la copia privada."
                            await self.stop()
                            return
                        }
                    }
                }
            }
            status = saveLocalCopy
                ? "LIVE activo. MP4 privado en grabación."
                : "LIVE activo sin copia local. Verifica el VOD de tu plataforma."
        } catch {
            // Do not print errors: servers can echo stream keys in their response.
            status = "No se pudo establecer LIVE. Cerrando la copia privada."
            await stop()
        }
    }

    func stop() async {
        guard phase != .idle && phase != .stopping else { return }
        phase = .stopping
        storageMonitor?.cancel()
        storageMonitor = nil
        generation = UUID() // Invalidate all pending permission/connect/publish awaits.
        status = "Cerrando LIVE y verificando archivos…"
        let localStream = stream
        let localConnection = connection
        let localRecorder = recorder
        let localMixer = mixer
        let localFile = privateVideoURL
        stream = nil
        connection = nil
        recorder = nil
        mixer = nil
        privateVideoURL = nil

        if let localStream { _ = try? await localStream.close() }
        if let localConnection { try? await localConnection.close() }
        if let localRecorder {
            do {
                let result = try await localRecorder.stopRecording()
                if let localMixer { await localMixer.removeOutput(localRecorder) }
                // One verified AVAssetReader pass checks media and, when
                // microphone was requested, real nonempty audio samples.
                // A missing/empty audio track must remain private for recovery.
                let verifiedMedia: Bool
                if let folder = try? localFolder() {
                    verifiedMedia = await WivraCaptureMediaVerifier.verifyFile(
                        result, in: folder, requireAudio: includesMicrophone)
                } else {
                    verifiedMedia = false
                }
                if verifiedMedia {
                    verifiedVideoURL = result
                    unverifiedVideoURL = nil
                } else {
                    // Keep all non-empty files for recovery; never publish a
                    // corrupt/incomplete MP4 to Photos or to the Editor.
                    unverifiedVideoURL = result
                }
            } catch {
                // Writer may have produced partial recoverable bytes. Preserve
                // the original path and do not present it as playable.
                unverifiedVideoURL = localFile
                if let localMixer { await localMixer.removeOutput(localRecorder) }
            }
        }
        if let localStream, let localMixer { await localMixer.removeOutput(localStream) }
        if let localMixer { await localMixer.stopRunning() }
        if includesMicrophone {
            try? AVAudioSession.sharedInstance().setActive(false,
                options: .notifyOthersOnDeactivation)
        }
        includesMicrophone = false
        phase = .idle
        status = verifiedVideoURL != nil
            ? "LIVE detenido. Copia MP4 verificada y disponible para compartir."
            : (unverifiedVideoURL != nil
                ? "LIVE detenido. MP4 no verificado: archivo privado retenido para recuperación."
                : "LIVE detenido. Sin copia local. Comprueba el VOD remoto.")
    }

    // Re-discover verified clips after app relaunch, without automatic Photos
    // publishing and without treating partial writers as finished recordings.
    func reviewSavedVideos() async {
        guard phase == .idle, !isReviewingSavedVideos else { return }
        isReviewingSavedVideos = true
        defer { isReviewingSavedVideos = false }
        guard let folder = try? localFolder(),
              let urls = try? FileManager.default.contentsOfDirectory(
                at: folder, includingPropertiesForKeys: [.isRegularFileKey,
                .isSymbolicLinkKey, .fileSizeKey], options: [.skipsHiddenFiles]) else {
            status = "No se pudo abrir el catálogo privado de LIVE."
            return
        }
        var approved: [URL] = []
        var uncertainAudio: Set<URL> = []
        for file in urls where file.pathExtension.lowercased() == "mp4" {
            guard let values = try? file.resourceValues(forKeys: [.isRegularFileKey,
                .isSymbolicLinkKey, .fileSizeKey]),
                values.isRegularFile == true, values.isSymbolicLink == false,
                (values.fileSize ?? 0) > 0 else { continue }
            let expectation = WivraLiveRecordingReceipt.audioExpectation(
                for: file, in: folder)
            if await WivraCaptureMediaVerifier.verifyFile(
                file, in: folder, requireAudio: expectation == .required) {
                approved.append(file)
                if expectation == .unknown { uncertainAudio.insert(file) }
            }
        }
        savedVideos = approved.sorted { $0.lastPathComponent > $1.lastPathComponent }
        audioUncertainVideos = uncertainAudio
        status = "Copias MP4 verificadas: \(savedVideos.count). Audio no confirmado en \(uncertainAudio.count). Las demás permanecen privadas."
    }

    private func hasRecordingReserve() -> Bool {
        guard let root = try? localFolder(),
              let size = try? FileManager.default.attributesOfFileSystem(forPath: root.path),
              let free = size[.systemFreeSize] as? NSNumber else { return false }
        return free.int64Value >= minimumRecordingFreeBytes
    }

    private func localFolder() throws -> URL {
        let root = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("WivraLive", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }
}

extension WivraIPhoneLiveController: MTHKViewRepresentable.PreviewSource {
    nonisolated func connect(to view: MTHKView) {
        Task { @MainActor in
            preview = view
            if let mixer { await mixer.addOutput(view) }
        }
    }
}

struct WivraIPhoneLiveScreen: View {
    @Environment(\.dismiss) private var dismiss
    @State private var controller = WivraIPhoneLiveController()
    @State private var destination = ""
    @State private var includeMicrophone = false
    @State private var frontCamera = false
    @State private var archiveVideo = true
    @State private var confirmPublication = false
    @State private var savingPhotos = false
    @State private var photoMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Wivra LIVE · cámara iPhone") {
                    Text("Cámara frontal o trasera del iPhone. No transmite Ray-Ban ni pantalla.")
                    Toggle("Usar cámara frontal", isOn: $frontCamera)
                        .disabled(controller.phase != .idle)
                        .accessibilityIdentifier("wivra_ios_live_front_camera")
                    Toggle("Micrófono del iPhone (opcional)", isOn: $includeMicrophone)
                        .disabled(controller.phase != .idle)
                    Toggle("Guardar copia MP4 local (recomendado)", isOn: $archiveVideo)
                        .disabled(controller.phase == .connecting || controller.phase == .live || controller.phase == .stopping)
                    Button("Preparar cámara") {
                        Task { await controller.prepareCamera(microphone: includeMicrophone,
                                                              frontCamera: frontCamera) }
                    }.disabled(!controller.canPrepare)
                }
                Section("Destino RTMP/RTMPS") {
                    SecureField("rtmps://servidor/live/clave", text: $destination)
                        .textContentType(.password)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .disabled(controller.phase == .connecting || controller.phase == .live || controller.phase == .stopping)
                    Text("La clave no se guarda. Si desactivas MP4, el video dependerá del VOD de la plataforma.")
                        .font(.caption)
                    Button("Confirmar emisión pública") { confirmPublication = true }
                        .disabled(!controller.canStart || WivraIOSLiveEndpoint.parse(destination) == nil)
                    Button("DETENER LIVE") {
                        Task { await controller.stop() }
                    }.disabled(controller.phase == .idle || controller.phase == .stopping)
                }
                Section("Estado") {
                    Button("Revisar copias locales de LIVE") {
                        Task { await controller.reviewSavedVideos() }
                    }.disabled(controller.isActive || controller.isReviewingSavedVideos)
                    if controller.isReviewingSavedVideos {
                        ProgressView("Comprobando MP4 privados…")
                    }
                    ForEach(controller.savedVideos, id: \.self) { file in
                        ShareLink(item: file) {
                            Label("Compartir MP4 recuperado", systemImage: "film.stack")
                        }
                        if controller.audioUncertainVideos.contains(file) {
                            Text("Audio no confirmado: grabación anterior o registro incompleto.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    if controller.phase == .ready || controller.phase == .connecting ||
                       controller.phase == .live {
                        MTHKViewRepresentable(previewSource: controller)
                            .frame(height: 240)
                            .accessibilityIdentifier("wivra_ios_live_preview")
                    }
                    Text(controller.status).accessibilityIdentifier("wivra_ios_live_status")
                    if let file = controller.verifiedVideoURL {
                        ShareLink(item: file) {
                            Label("Compartir MP4 verificado", systemImage: "square.and.arrow.up")
                        }
                        Button("Guardar MP4 en Fotos") {
                            savingPhotos = true
                            Task { @MainActor in
                                defer { savingPhotos = false }
                                do {
                                    try await WivraPhotosLibrary.saveVideo(file)
                                    photoMessage = "Video guardado en Fotos."
                                } catch {
                                    photoMessage = "No se pudo guardar en Fotos; el archivo local se conserva."
                                }
                            }
                        }.disabled(savingPhotos)
                    }
                    if controller.unverifiedVideoURL != nil {
                        Text("Existe un archivo incompleto/no verificado. No se publicará automáticamente.")
                            .foregroundStyle(.orange)
                    }
                }
            }
            .navigationTitle("LIVE iPhone")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cerrar") { Task { await controller.stop(); dismiss() } }
                }
            }
            .interactiveDismissDisabled(controller.isActive)
            .confirmationDialog(
                "¿Iniciar emisión pública a la plataforma configurada?",
                isPresented: $confirmPublication,
                titleVisibility: .visible
            ) {
                Button("INICIAR LIVE") {
                    let userApprovedEndpoint = destination
                    destination = ""
                    Task {
                        await controller.startConfirmed(rawEndpoint: userApprovedEndpoint,
                                                        saveLocalCopy: archiveVideo)
                    }
                }
                Button("Cancelar", role: .cancel) {}
            } message: {
                Text(archiveVideo
                    ? "Wivra también intentará guardar MP4 privado. Comprueba el VOD de la plataforma."
                    : "No se guardará MP4 local. El VOD remoto puede no existir.")
            }
            .alert("Fotos", isPresented: Binding(
                get: { photoMessage != nil },
                set: { if !$0 { photoMessage = nil } }
            )) {
                Button("OK") { photoMessage = nil }
            } message: { Text(photoMessage ?? "") }
            .onReceive(NotificationCenter.default.publisher(
                for: UIApplication.didEnterBackgroundNotification
            )) { _ in
                // First iPhone LIVE is foreground only. No secret background broadcast.
                Task { await controller.stop() }
            }
            .onDisappear { Task { await controller.stop() } }
        }
    }
}
