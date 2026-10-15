// Wivra Meta B0: field-test UI for receiving Ray-Ban Meta video.
// B0 verifies frames/throughput only. NOT a production broadcast.
import MWDATCore
import SwiftUI
import UIKit

@main
struct WivraMetaB0App: App {
    @State private var model: MetaB0Model
    @State private var captureTab: WivraCaptureTab = .meta
    @State private var pendingCaptureTab: WivraCaptureTab?
    @State private var iPhoneCamera = WivraIPhoneCamera()
    @State private var showingCaptureLibrary = false

    // Moving between sources is a two-phase handoff. SwiftUI cannot switch
    // to the destination until the current camera has released AVFoundation
    // or Meta DAT (including HEVC/CAF and manifest finalization).
    private func requestCaptureTab(_ destination: WivraCaptureTab) {
        guard destination != captureTab, pendingCaptureTab == nil else { return }
        if destination == .iPhone {
            if model.isReleasedForCameraHandoff {
                captureTab = .iPhone
            } else {
                pendingCaptureTab = .iPhone
                model.endSession()
            }
        } else if iPhoneCamera.isReleasedForCameraHandoff {
            captureTab = .meta
        } else {
            pendingCaptureTab = .meta
            iPhoneCamera.stop()
        }
    }

    private func completeCameraHandoffIfReady() {
        guard let destination = pendingCaptureTab else { return }
        let released = destination == .iPhone
            ? model.isReleasedForCameraHandoff
            : iPhoneCamera.isReleasedForCameraHandoff
        guard released else { return }
        pendingCaptureTab = nil
        captureTab = destination
    }

    init() {
        do {
            try Wearables.configure()
        } catch {
            NSLog("[WivraMetaB0] DAT configuration failed: %@", error.localizedDescription)
        }
        _model = State(initialValue: MetaB0Model(wearables: Wearables.shared))
    }

    var body: some Scene {
        WindowGroup {
            TabView(selection: Binding(
                get: { captureTab },
                set: { requestCaptureTab($0) }
            )) {
                MetaB0Screen(model: model)
                    .tabItem { Label("Ray-Ban", systemImage: "eyeglasses") }
                    .tag(WivraCaptureTab.meta)
                WivraIPhoneCameraScreen(camera: iPhoneCamera)
                    .tabItem { Label("iPhone", systemImage: "iphone.gen3") }
                    .tag(WivraCaptureTab.iPhone)
            }
            .safeAreaInset(edge: .top) {
                HStack {
                    Spacer()
                    Button {
                        showingCaptureLibrary = true
                    } label: {
                        Label("Mis capturas", systemImage: "folder")
                    }
                    .disabled(!model.isReleasedForCameraHandoff ||
                              !iPhoneCamera.isReleasedForCameraHandoff ||
                              pendingCaptureTab != nil)
                    .padding(.horizontal)
                }
            }
            .sheet(isPresented: $showingCaptureLibrary) {
                WivraNativeCaptureLibraryScreen()
            }
            .overlay(alignment: .top) {
                if pendingCaptureTab != nil {
                    Label("Finalizando grabación y liberando cámara…",
                          systemImage: "hourglass")
                        .font(.footnote.bold())
                        .padding(10)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
                        .accessibilityIdentifier("camera_handoff_pending")
                }
            }
            .onChange(of: model.isReleasedForCameraHandoff) { _, _ in
                completeCameraHandoffIfReady()
            }
            .onChange(of: iPhoneCamera.isReleasedForCameraHandoff) { _, _ in
                completeCameraHandoffIfReady()
            }
            .onOpenURL { url in
                Task { @MainActor in
                    await model.handleMetaCallback(url)
                }
            }
            .onReceive(NotificationCenter.default.publisher(
                for: UIApplication.didEnterBackgroundNotification
            )) { _ in
                // Neither source claims screen-off or background recording.
                model.endSession()
                iPhoneCamera.stop()
            }
        }
    }
}

struct MetaB0Screen: View {
    @Bindable var model: MetaB0Model
    @State private var photoGridEnabled = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Wivra · Meta B0")
                    .font(.title.bold())
                    .accessibilityIdentifier("wivra_meta_b0_title")

                Text("B0 vista previa. B1D experimental: video HEVC + entrada de audio seleccionada. Sin LIVE.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Group {
                    if let image = model.previewImage {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFit()
                            .overlay {
                                if photoGridEnabled && !model.receiveCompressedHEVC {
                                    GeometryReader { proxy in
                                        Path { path in
                                            for fraction in [1.0 / 3.0, 2.0 / 3.0] {
                                                path.move(to: CGPoint(x: proxy.size.width * fraction, y: 0))
                                                path.addLine(to: CGPoint(x: proxy.size.width * fraction, y: proxy.size.height))
                                                path.move(to: CGPoint(x: 0, y: proxy.size.height * fraction))
                                                path.addLine(to: CGPoint(x: proxy.size.width, y: proxy.size.height * fraction))
                                            }
                                        }
                                        .stroke(.white.opacity(0.65), lineWidth: 1)
                                    }
                                    .allowsHitTesting(false)
                                }
                            }
                            .accessibilityLabel("Vista previa de la cámara de las gafas")
                    } else {
                        ZStack {
                            Color.black
                            VStack(spacing: 10) {
                                Image(systemName: "eyeglasses")
                                    .font(.system(size: 38))
                                Text(model.isCompressedMode
                                     ? "Modo HEVC comprimido: sin vista previa visual; revisa contador de fotogramas"
                                     : "Esperando video de las gafas")
                                    .multilineTextAlignment(.center)
                                    .padding(.horizontal, 12)
                            }
                            .foregroundStyle(.white)
                        }
                        .frame(height: 260)
                    }
                }
                .frame(maxWidth: .infinity)
                .background(.black)
                .clipShape(RoundedRectangle(cornerRadius: 14))

                Picker("Modo de cámara", selection: $model.receiveCompressedHEVC) {
                    Text("B0 · Vista previa").tag(false)
                    Text("B1A · Grabar HEVC").tag(true)
                }
                .pickerStyle(.segmented)
                .disabled(model.hasPreview)

                Picker("Perfil de cámara", selection: $model.chosenProfile) {
                    Text("Equilibrado").tag("balanced")
                    Text("Ahorro").tag("economy")
                }
                .pickerStyle(.segmented)
                .disabled(model.hasPreview)
                Text(model.chosenProfile == "economy"
                     ? "DAT · 360 × 640, 15 FPS solicitados"
                     : "DAT · 504 × 896, 24 FPS solicitados")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                Text("Transporte efectivo: gestionado por Meta DAT; aún sin medición de enlace físico.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                Group {
                    Text("Registro: \(model.isRegistered ? "autorizado" : "pendiente")")
                    Text("Sesión: \(String(describing: model.sessionState))")
                    Text("Cámara: \(String(describing: model.streamState))")
                    Text("Fotogramas reales: \(model.framesReceived)")
                    Text(String(format: "FPS observados: %.1f", model.measuredFPS))
                    Text("Resolución recibida: \(model.frameWidth) × \(model.frameHeight)")
                    Text(String(format: "Tiempo con fotogramas: %.1f s", model.activeVideoSeconds))
                }
                .font(.system(.footnote, design: .monospaced))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))

                Button("1 · Vincular con Meta AI") { model.register() }
                    .disabled(model.isRegistered || model.registrationState == .registering)
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("register_with_meta")

                if model.receiveCompressedHEVC {
                    VStack(alignment: .leading, spacing: 8) {
                        Toggle("Grabar pista de audio independiente", isOn: $model.captureSelectedAudio)
                            .disabled(model.sessionState != .idle)
                            .accessibilityIdentifier("meta_b1b_audio_enabled")
                        if model.captureSelectedAudio {
                            Button("Detectar entradas de audio") {
                                Task { await model.audioRoute.discover() }
                            }
                            .disabled(model.sessionState != .idle)
                            Picker("Fuente de audio", selection: Binding(
                                get: { model.audioRoute.selectedUID },
                                set: { model.audioRoute.selectedUID = $0 }
                            )) {
                                Text("Elegir dispositivo detectado").tag("")
                                ForEach(model.audioRoute.ports) { port in
                                    Text("\(port.name) · \(port.kind)").tag(port.id)
                                }
                            }
                            .disabled(model.sessionState != .idle)
                            Button("Preparar micrófono seleccionado") {
                                do {
                                    _ = try model.audioRoute.activateSelectedInput()
                                } catch {
                                    model.errorMessage = error.localizedDescription
                                }
                            }
                            .disabled(model.sessionState != .idle ||
                                      model.audioRoute.selectedUID.isEmpty)
                            Text(model.audioRoute.status).font(.footnote)
                            Text("Se usa una sola entrada activa. Un receptor USB de dos canales podrá separarse en pistas cuando el hardware lo permita.")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .padding()
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                Button("2 · Iniciar sesión con gafas") { model.startSession() }
                    .disabled(!model.canStartSession)
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("start_device_session")

                Button("3 · Iniciar vista previa") {
                    Task { await model.requestPreview() }
                }
                .disabled(!model.canStartPreview)
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("start_meta_preview")

                Group {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Fotografía desde las gafas", systemImage: "camera")
                            .font(.headline)
                        Text(model.receiveCompressedHEVC
                             ? "En HEVC se puede solicitar una foto mientras se graba; la vista previa visual aún no está disponible en este modo. Validar simultaneidad con gafas reales."
                             : "El iPhone muestra los fotogramas recibidos de las Ray-Ban. El botón solicita una foto real, no una captura de pantalla.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        Toggle("Cuadrícula de tercios (solo encuadre)", isOn: $photoGridEnabled)
                            .disabled(model.receiveCompressedHEVC)
                            .accessibilityIdentifier("wivra_photo_grid")
                        Button {
                            model.capturePhoto()
                        } label: {
                            Label(model.photoCaptureInFlight ? "Tomando foto…" : "Tomar fotografía",
                                  systemImage: "camera.shutter.button")
                        }
                        .disabled(!model.canCapturePhoto)
                        .buttonStyle(.borderedProminent)
                        .accessibilityIdentifier("wivra_photo_shutter")
                        Text(model.photoCaptureStatus)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .accessibilityIdentifier("wivra_photo_status")
                        if let image = model.capturedPhotoImage,
                           let url = model.lastCapturedPhotoURL {
                            Image(uiImage: image)
                                .resizable()
                                .scaledToFit()
                                .frame(maxWidth: 180, maxHeight: 200)
                                .accessibilityLabel("Última fotografía guardada")
                            ShareLink(item: url) {
                                Label("Compartir o guardar fotografía JPEG", systemImage: "square.and.arrow.up")
                            }
                            .accessibilityIdentifier("wivra_photo_share")
                        }
                        if model.lastCapturedPhotoURL != nil {
                            Divider()
                            Label("Estilos fotográficos", systemImage: "camera.filters")
                                .font(.subheadline.bold())
                            Picker("Aspecto de película", selection: $model.chosenPhotoLook) {
                                ForEach(WivraPhotoLook.allCases) { look in
                                    Text(look.label).tag(look)
                                }
                            }
                            .accessibilityIdentifier("wivra_photo_look")
                            HStack {
                                Text("Intensidad")
                                Slider(value: $model.photoLookStrength, in: 0...1)
                                    .accessibilityIdentifier("wivra_photo_look_strength")
                            }
                            Button {
                                model.exportPhotoLookCopy()
                            } label: {
                                Label(model.photoLookBusy ? "Aplicando filtro…" : "Guardar copia con filtro",
                                      systemImage: "square.and.arrow.down")
                            }
                            .disabled(model.photoLookBusy)
                            .buttonStyle(.bordered)
                            .accessibilityIdentifier("wivra_photo_look_export")
                            Text(model.photoLookStatus)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            if let image = model.editedPhotoImage,
                               let editedURL = model.lastEditedPhotoURL {
                                Image(uiImage: image).resizable().scaledToFit()
                                    .frame(maxWidth: 180, maxHeight: 200)
                                    .accessibilityLabel("Copia con filtro")
                                ShareLink(item: editedURL) {
                                    Label("Compartir fotografía con filtro", systemImage: "square.and.arrow.up")
                                }
                            }
                        }
                        Text("Modo fotográfico experimental. ISO, obturador y enfoque manual de las gafas no están expuestos por la API utilizada. Los filtros modifican copias, nunca la exposición del sensor.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding()
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                if model.receiveCompressedHEVC {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(model.captureSelectedAudio
                             ? "Fuente verificada · CAF independiente + MOV combinado solicitado"
                             : "Grabación HEVC sin audio")
                            .font(.footnote)

                        HStack {
                            Button(model.recordingArmed ? "Detener y guardar MOV" : "Grabar HEVC") {
                                if model.recordingArmed {
                                    Task { await model.finishRecording() }
                                } else {
                                    model.beginRecording()
                                }
                            }
                            .disabled(!model.canRecord)
                            .buttonStyle(.borderedProminent)
                            .accessibilityIdentifier("meta_b1_record")
                            if model.recordingArmed {
                                Label(model.captureSelectedAudio ? "REC · video + audio" : "REC · solo video",
                                      systemImage: "record.circle.fill")
                                    .foregroundStyle(.red)
                            }
                        }
                        Text(model.recordingStatus)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .accessibilityIdentifier("meta_b1_recording_status")
                        if let audioURL = model.lastSeparateAudioURL {
                            ShareLink(item: audioURL) {
                                Label("Compartir pista de audio independiente (CAF)",
                                      systemImage: "waveform")
                            }
                            .accessibilityIdentifier("meta_b1b_share_audio")
                        }
                        if let combinedURL = model.lastCombinedVideoURL {
                            ShareLink(item: combinedURL) {
                                Label("Compartir MOV con audio integrado",
                                      systemImage: "square.and.arrow.up")
                            }
                            .accessibilityIdentifier("meta_b1b_share_muxed")
                        }
                        if let manifestURL = model.lastCaptureManifestURL {
                            ShareLink(item: manifestURL) {
                                Label("Compartir manifiesto del proyecto Wivra (JSON)",
                                      systemImage: "doc.text")
                            }
                            .accessibilityIdentifier("meta_b1b_manifest")
                        }
                        if let offset = model.lastAudioSyncOffsetSeconds {
                            Text(String(format: "Desfase inicial medido: %.3f s", offset))
                                .font(.caption.monospacedDigit())
                        }
                        if let url = model.lastRecordedURL {
                            ShareLink(item: url) {
                                Label("Compartir / Guardar video MOV", systemImage: "square.and.arrow.up")
                            }
                            .accessibilityIdentifier("meta_b1_export_mov")
                            Text("Archivo local: \(url.lastPathComponent). Verifica su reproducción antes de usarlo en el editor.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding()
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                HStack {
                    Button("Detener vista previa") { model.stopPreview() }
                        .disabled(!model.hasPreview)
                    Button("Terminar sesión") { model.endSession() }
                        .disabled(model.sessionState == .idle)
                }
                .buttonStyle(.bordered)

                if model.lastErrorWasThermal {
                    Label("Meta indicó exceso de temperatura. Deja descansar las gafas.",
                          systemImage: "thermometer.high")
                        .foregroundStyle(.red)
                }

                Text("Mantén Wivra en primer plano. B1D es experimental: comprueba pista original, audio CAF y video integrado con auriculares. La sincronía y duración real todavía requieren gafas físicas. Respeta alertas térmicas.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding()
        }
        .confirmationDialog(
            "Meta AI debe autorizar la cámara",
            isPresented: $model.showCameraPermissionConfirm,
            titleVisibility: .visible
        ) {
            Button("Abrir Meta AI y dar permiso") {
                Task { await model.confirmPreviewPermission() }
            }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("La solicitud abrirá la aplicación Meta AI. Vuelve a Wivra cuando termine.")
        }
        .alert(
            "Estado de la conexión",
            isPresented: Binding(
                get: { model.errorMessage != nil },
                set: { if !$0 { model.errorMessage = nil } }
            )
        ) {
            Button("Cerrar") { model.errorMessage = nil }
        } message: {
            Text(model.errorMessage ?? "")
        }
    }
}
