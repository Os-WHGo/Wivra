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
            NSLog("[WivraMetaB0] DAT configuration failed: %s", error.localizedDescription)
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

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Wivra · Meta B0")
                    .font(.title.bold())
                    .accessibilityIdentifier("wivra_meta_b0_title")

                Text("Prueba de conexión entre Ray-Ban Meta y iPhone. No transmite a internet ni graba archivos.")
                    .font(.subheadline)
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
                                Text("Esperando video de las gafas")
                            }
                            .foregroundStyle(.white)
                        }
                        .frame(height: 260)
                    }
                }
                .frame(maxWidth: .infinity)
                .background(.black)
                .clipShape(RoundedRectangle(cornerRadius: 14))

                Text("Bluetooth Classic · 504 × 896 solicitados · 24 FPS solicitados")
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

                Text("Usa esta pantalla en primer plano y toma capturas del contador/FPS para registrar las pruebas. No sobrecalientes las gafas ni tapes sus ventilaciones.")
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
