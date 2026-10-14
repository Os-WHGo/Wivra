// Wivra Meta B0: field-test UI for receiving Ray-Ban Meta video.
// B0 verifies frames/throughput only. NOT a production broadcast.
import MWDATCore
import SwiftUI
import UIKit

@main
struct WivraMetaB0App: App {
    @State private var model: MetaB0Model

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
            MetaB0Screen(model: model)
                .onOpenURL { url in
                    Task { @MainActor in
                        await model.handleMetaCallback(url)
                    }
                }
                .onReceive(NotificationCenter.default.publisher(
                    for: UIApplication.didEnterBackgroundNotification
                )) { _ in
                    // Explicit conservative B0 behavior: stop on background.
                    model.endSession()
                }
        }
    }
}

struct MetaB0Screen: View {
    @Bindable var model: MetaB0Model
    @State private var showNativeSceneLab = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Wivra · Meta B0")
                    .font(.title.bold())
                    .accessibilityIdentifier("wivra_meta_b0_title")

                Text("B0 vista previa. B1D experimental: video HEVC + entrada de audio seleccionada. Sin LIVE.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Button("B2B · Abrir laboratorio LIVE (local)") {
                    showNativeSceneLab = true
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("wivra_live_lab_open")
                Text("Ensayo de escenas y títulos sobre vista RAW. No transmite ni graba LIVE.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Group {
                    if let image = model.previewImage {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFit()
                            .accessibilityLabel("Fotogramas reales recibidos de las gafas")
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
        .sheet(isPresented: $showNativeSceneLab) {
            NavigationStack {
                WivraLiveNativeSceneLab(
                    cameraFrame: model.previewImage,
                    cameraVerified: model.hasPreview && !model.receiveCompressedHEVC
                )
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Cerrar") { showNativeSceneLab = false }
                    }
                }
            }
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
