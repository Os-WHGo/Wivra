import AVFoundation
import HaishinKit
import Observation
import RTMPHaishinKit
import SwiftUI
import UIKit

/// First native iPhone-camera RTMP/RTMPS publisher. No Ray-Ban frames, replay
/// of third-party screens, background broadcast or local MP4 in this path.
@Observable
@MainActor
final class WivraIOSPhoneLivePublisher {
    var endpoint = ""
    var includeMicrophone = false
    var useFrontCamera = false
    var status = "Sin emisión. Wivra no guarda una copia de este LIVE."
    private(set) var isBusy = false
    private(set) var isBroadcastRequested = false
    private(set) var stream: RTMPStream?
    private var connection: RTMPConnection?
    private var mixer: MediaMixer?
    private var generation = UUID()

    var hasValidEndpoint: Bool {
        WivraIOSLiveEndpoint.parse(endpoint) != nil
    }

    func start() async {
        guard !isBusy, !isBroadcastRequested,
              let target = WivraIOSLiveEndpoint.parse(endpoint) else {
            status = "Dirección RTMP/RTMPS incompleta o inválida."
            return
        }
        let current = UUID()
        generation = current
        isBusy = true
        status = "Solicitando permiso de cámara…"
        guard await AVCaptureDevice.requestAccess(for: .video), generation == current else {
            isBusy = false
            status = "La cámara no fue autorizada. No se ha emitido video."
            return
        }
        if includeMicrophone {
            guard await AVCaptureDevice.requestAccess(for: .audio), generation == current else {
                isBusy = false
                status = "No se autorizó el micrófono. Desactiva audio para emitir solo video."
                return
            }
        }
        // Choose the actual AVCaptureDevice before starting capture. Do not
        // mutate the capture session while RTMP is active without real QA.
        let position: AVCaptureDevice.Position = useFrontCamera ? .front : .back
        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera,
                                                  for: .video, position: position) else {
            isBusy = false
            status = "La cámara elegida no está disponible en este iPhone."
            return
        }
        do {
            if includeMicrophone {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playAndRecord, mode: .default,
                                        options: [.defaultToSpeaker, .allowBluetooth])
                try session.setActive(true)
            }
            let newMixer = MediaMixer()
            let newConnection = RTMPConnection()
            let newStream = RTMPStream(connection: newConnection)
            // Retain the objects before the network call so STOP can close
            // an in-flight handshake if the user leaves this foreground view.
            mixer = newMixer
            connection = newConnection
            stream = newStream
            try await newMixer.attachVideo(camera)
            if includeMicrophone {
                try await newMixer.attachAudio(AVCaptureDevice.default(for: .audio))
            }
            await newMixer.addOutput(newStream)
            guard generation == current else {
                await stop()
                return
            }
            status = "Conectando RTMP… No se ha confirmado recepción remota."
            try await newConnection.connect(target.serverURL)
            guard generation == current else {
                await stop()
                return
            }
            try await newStream.publish(target.streamKey)
            guard generation == current else {
                await stop()
                return
            }
            isBroadcastRequested = true
            isBusy = false
            endpoint = "" // Stream key never kept after publish request.
            status = "Publicación RTMP solicitada. Verifica imagen, audio y VOD en la plataforma."
        } catch {
            // Never put an error.localizedDescription or the target in UI/logs:
            // connection failures can embed the private RTMP stream key.
            await stop()
            status = "No se pudo iniciar LIVE. Comprueba destino, permisos y conexión."
        }
    }

    func stop() async {
        generation = UUID()
        if !isBusy && !isBroadcastRequested && connection == nil && mixer == nil {
            endpoint = ""
            return
        }
        isBusy = true
        isBroadcastRequested = false
        let oldStream = stream
        let oldConnection = connection
        let oldMixer = mixer
        stream = nil
        connection = nil
        mixer = nil
        try? await oldStream?.close()
        try? await oldConnection?.close()
        if let oldMixer {
            try? await oldMixer.attachVideo(nil)
            try? await oldMixer.attachAudio(nil)
        }
        if includeMicrophone {
            try? AVAudioSession.sharedInstance().setActive(false,
                options: .notifyOthersOnDeactivation)
        }
        endpoint = ""
        isBusy = false
        status = "LIVE detenido. No hay MP4 local en esta ruta; verifica VOD remoto."
    }
}

@MainActor
private struct WivraIOSLivePreview: UIViewRepresentable {
    let stream: RTMPStream

    func makeUIView(context: Context) -> MTHKView {
        MTHKView(frame: .zero)
    }

    func updateUIView(_ view: MTHKView, context: Context) {
        Task { @MainActor in
            await stream.addOutput(view)
        }
    }
}

@MainActor
struct WivraIOSPhoneLiveScreen: View {
    @Environment(\.dismiss) private var dismiss
    @State private var publisher = WivraIOSPhoneLivePublisher()
    @State private var confirmingPublic = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("LIVE iPhone · cámara del teléfono")
                        .font(.headline)
                    Text("RTMP/RTMPS de cámara del iPhone. No usa Ray-Ban, no captura otras apps, no continúa con la pantalla bloqueada y todavía no crea MP4 local.")
                        .font(.footnote)
                    SecureField("URL completa: rtmps://servidor/app/clave", text: $publisher.endpoint)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .privacySensitive()
                        .accessibilityIdentifier("ios_live_private_endpoint")
                        .disabled(publisher.isBusy || publisher.isBroadcastRequested)
                    Toggle("Usar cámara frontal", isOn: $publisher.useFrontCamera)
                        .disabled(publisher.isBusy || publisher.isBroadcastRequested)
                        .accessibilityIdentifier("ios_live_front_camera_option")
                    Toggle("Enviar audio del micrófono (opcional)", isOn: $publisher.includeMicrophone)
                        .disabled(publisher.isBusy || publisher.isBroadcastRequested)
                    Text("La clave no se guarda. La grabación remota/VOD depende de tu plataforma. El audio no incluye otras aplicaciones.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let activeStream = publisher.stream {
                        WivraIOSLivePreview(stream: activeStream)
                            .frame(height: 260)
                            .accessibilityIdentifier("ios_live_phone_preview")
                    }
                    Text(publisher.status)
                        .font(.footnote)
                        .accessibilityIdentifier("ios_live_status")
                    Button("Preparar LIVE público") {
                        confirmingPublic = true
                    }
                    .disabled(!publisher.hasValidEndpoint || publisher.isBusy ||
                              publisher.isBroadcastRequested)
                    .accessibilityIdentifier("ios_live_confirm_button")
                    Button("Detener LIVE") {
                        Task { await publisher.stop() }
                    }
                    .disabled(!publisher.isBusy && !publisher.isBroadcastRequested)
                    .accessibilityIdentifier("ios_live_stop_button")
                    Button("Volver a Wivra") {
                        Task {
                            await publisher.stop()
                            dismiss()
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Wivra LIVE iPhone")
            .navigationBarTitleDisplayMode(.inline)
            .alert("Confirmar emisión pública", isPresented: $confirmingPublic) {
                Button("Cancelar", role: .cancel) {}
                Button("Iniciar LIVE") {
                    Task { await publisher.start() }
                }
            } message: {
                Text("Compartirás la cámara del teléfono con tu destino RTMP. Wivra no guardará MP4 local: verifica si la plataforma conserva el VOD.")
            }
            .onReceive(NotificationCenter.default.publisher(
                for: UIApplication.didEnterBackgroundNotification
            )) { _ in
                Task { await publisher.stop() }
            }
            .onDisappear {
                Task { await publisher.stop() }
            }
        }
    }
}
