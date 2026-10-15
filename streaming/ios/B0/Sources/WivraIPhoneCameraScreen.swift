// Experimental B1H iPhone source. Switching tabs releases the camera.
// No claim of actual hardware testing, true night mode or LIVE broadcast.
import AVFoundation
import SwiftUI
import UIKit

enum WivraCaptureTab: Hashable {
    case meta
    case iPhone
}

@MainActor
final class WivraPreviewUIView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }

    var previewLayer: AVCaptureVideoPreviewLayer {
        layer as! AVCaptureVideoPreviewLayer
    }
}

struct WivraIPhonePreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> WivraPreviewUIView {
        let view = WivraPreviewUIView()
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ view: WivraPreviewUIView, context: Context) {
        if view.previewLayer.session !== session { view.previewLayer.session = session }
    }
}

struct WivraIPhoneCameraScreen: View {
    @State private var camera = WivraIPhoneCamera()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Wivra · Cámara iPhone")
                    .font(.title.bold())
                Text("Automático para capturar rápido; Pro para exposición y enfoque. Grabaciones locales, sin LIVE.")
                    .font(.subheadline).foregroundStyle(.secondary)

                WivraIPhonePreview(session: camera.session)
                    .frame(height: 300)
                    .background(.black)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .accessibilityLabel("Vista previa en directo de la cámara nativa del iPhone")

                Picker("Lente del iPhone", selection: $camera.selectedLensID) {
                    ForEach(camera.lenses) { lens in
                        Text(lens.name).tag(lens.id)
                    }
                }
                .disabled(camera.isRunning || camera.isStarting || camera.isRecording)
                .accessibilityIdentifier("iphone_lens_selector")

                if camera.lenses.isEmpty {
                    Text("No se detectaron cámaras. La captura requiere iPhone físico.")
                        .foregroundStyle(.secondary)
                }

                HStack {
                    Button(camera.isStarting ? "Preparando…" :
                           camera.isRunning ? "Detener cámara" : "Abrir cámara") {
                        if camera.isRunning || camera.isStarting { camera.stop() }
                        else { camera.start() }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(camera.isFinishing || camera.lenses.isEmpty)
                    .accessibilityIdentifier("iphone_camera_session")

                    if camera.isRunning {
                        Label(camera.includesAudio ? "Micrófono disponible" : "Sin audio",
                              systemImage: camera.includesAudio ? "mic" : "mic.slash")
                            .font(.caption)
                    }
                }

                Picker("Controles", selection: Binding(
                    get: { camera.proMode },
                    set: { camera.setProMode($0) }
                )) {
                    Text("Auto").tag(false)
                    Text("Pro").tag(true)
                }
                .pickerStyle(.segmented)
                .disabled(!camera.isRunning || camera.isRecording || !camera.supportsManualExposure)
                .accessibilityIdentifier("iphone_auto_pro")

                if camera.proMode {
                    VStack(alignment: .leading, spacing: 8) {
                        if camera.supportsManualExposure {
                            Text("ISO: \(Int(camera.iso))")
                            Slider(value: $camera.iso, in: camera.minISO...max(camera.minISO + 1, camera.maxISO))
                                .onChange(of: camera.iso) { _, _ in camera.updateManualExposure() }
                                .accessibilityIdentifier("iphone_iso")

                            Text(String(format: "Obturación: 1/%.0f s", 1.0 / camera.shutterSeconds))
                            Slider(value: $camera.shutterSeconds, in: (1.0 / 1000)...(1.0 / 30))
                                .onChange(of: camera.shutterSeconds) { _, _ in camera.updateManualExposure() }
                                .accessibilityIdentifier("iphone_shutter")
                        }
                        if camera.supportsManualFocus {
                            Text("Enfoque manual")
                            Slider(value: $camera.focusPosition, in: 0...1)
                                .onChange(of: camera.focusPosition) { _, _ in camera.updateManualFocus() }
                                .accessibilityIdentifier("iphone_focus")
                        } else {
                            Text("Esta lente no ofrece control manual de enfoque.")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Text("El obturador Pro de esta etapa está limitado a valores compatibles con video; no es modo de larga exposición.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    .padding()
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .disabled(camera.isRecording || camera.isFinishing)
                }

                HStack(spacing: 14) {
                    Button {
                        camera.takePhoto()
                    } label: {
                        Label(camera.photoBusy ? "Capturando…" : "Foto", systemImage: "camera")
                    }
                    .disabled(!camera.isRunning || camera.photoBusy || camera.isFinishing)
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("iphone_photo_shutter")

                    Button {
                        camera.toggleVideo()
                    } label: {
                        Label(camera.isRecording ? "Finalizar MOV" : "Grabar MOV",
                              systemImage: camera.isRecording ? "stop.circle" : "record.circle")
                    }
                    .disabled(!camera.isRunning || camera.isFinishing || camera.photoBusy)
                    .buttonStyle(.bordered)
                    .tint(camera.isRecording ? .red : .accentColor)
                    .accessibilityIdentifier("iphone_video_record")
                }

                Text(camera.status)
                    .font(.footnote).foregroundStyle(.secondary)
                    .accessibilityIdentifier("iphone_camera_status")

                if let url = camera.lastPhotoURL {
                    Divider()
                    Text("Última foto original").font(.headline)
                    if let image = camera.lastPhotoImage {
                        Image(uiImage: image).resizable().scaledToFit()
                            .frame(maxWidth: 200, maxHeight: 230)
                    }
                    ShareLink(item: url) {
                        Label("Compartir JPEG original", systemImage: "square.and.arrow.up")
                    }
                    Picker("Estilo fotográfico", selection: $camera.photoLook) {
                        ForEach(WivraPhotoLook.allCases) { look in
                            Text(look.label).tag(look)
                        }
                    }
                    HStack {
                        Text("Intensidad")
                        Slider(value: $camera.photoLookStrength, in: 0...1)
                    }
                    Button(camera.filtering ? "Procesando…" : "Guardar copia con filtro") {
                        camera.exportFilteredCopy()
                    }
                    .disabled(camera.filtering)
                    .accessibilityIdentifier("iphone_photo_look_export")
                    if let filtered = camera.lastFilteredURL {
                        ShareLink(item: filtered) {
                            Label("Compartir JPEG editado", systemImage: "square.and.arrow.up")
                        }
                    }
                }

                if let url = camera.lastMovieURL {
                    ShareLink(item: url) {
                        Label("Compartir MOV original", systemImage: "square.and.arrow.up")
                    }
                    .accessibilityIdentifier("iphone_share_movie")
                }

                Text("Prueba pendiente: fotografía durante video sin interrupción, micrófonos y rendimiento en iPhone físico. Esta fuente no promete grabación en segundo plano.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            .padding()
        }
        .onDisappear { camera.stop() }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)) { _ in
            camera.stop()
        }
    }
}
