// Wivra B2B | Native iPhone LIVE Studio scene lab.
// Renders a local SwiftUI Preview / Program mock with actual DAT .raw UIImage
// only when the upstream B0 camera is genuinely receiving decoded frames.
// No video compositor output, audio mix, local recording, network RTMP, SDK
// privilege changes or stream publishing happens in this view. — ChatGPT
import SwiftUI
import UIKit
import Foundation

private enum WivraLabScene: String, CaseIterable, Identifiable {
    case walk
    case news
    case walkTitle = "walk-title"

    var id: String { rawValue }
    var requiresCamera: Bool { self != .news }
    var caption: String? {
        switch self {
        case .walk: nil
        case .news: "WIVRA · ESCENA DE PRUEBA"
        case .walkTitle: "Hoy recorremos Whistler"
        }
    }
    var title: String {
        switch self {
        case .walk: "POV · Cámara"
        case .news: "CG · Portada"
        case .walkTitle: "POV + título"
        }
    }
}

private struct WivraLabCue: Codable, Identifiable {
    let sequence: Int
    let atMs: Int64
    let type: String
    let sceneId: String
    var id: Int { sequence }
}

struct WivraLiveNativeSceneLab: View {
    let cameraFrame: UIImage?
    let cameraVerified: Bool
    let cameraLastFrameUptime: Double? // received upstream, reset on camera stop

    @State private var selection: WivraLabScene = .news
    @State private var staged: WivraLabScene? = nil
    @State private var program: WivraLabScene? = nil
    @State private var cues: [WivraLabCue] = []
    @State private var message = "Prepara una escena para verla, luego pásala a Programa."
    @State private var logURL: URL?

    private func cameraReady() -> Bool {
        guard cameraVerified, cameraFrame != nil, let last = cameraLastFrameUptime else { return false }
        let age = ProcessInfo.processInfo.systemUptime - last
        // Conservative prototype threshold, NOT a network/fps quality guarantee.
        return age >= 0 && age < 2.5
    }

    private func canUse(_ scene: WivraLabScene) -> Bool {
        !scene.requiresCamera || cameraReady()
    }

    private func timestamp() -> Int64 {
        // Monotonic device uptime; this is NOT presentation-time synchronization.
        Int64(ProcessInfo.processInfo.systemUptime * 1000)
    }

    private func appendEvent(_ kind: String, scene: WivraLabScene) {
        cues.append(.init(sequence: cues.count + 1, atMs: timestamp(),
                          type: kind, sceneId: scene.rawValue))
        logURL = nil // Old exported snapshot must not be represented as current.
    }

    private func cue(_ scene: WivraLabScene) {
        guard canUse(scene) else {
            message = "Esta escena necesita fotogramas reales. Inicia la vista previa RAW de Meta antes de usarla."
            return
        }
        staged = scene
        appendEvent("scene-preview", scene: scene)
        message = "Escena preparada; todavía no está en Programa."
    }

    private func take() {
        guard let scene = staged else {
            message = "Primero prepara una escena."
            return
        }
        // Re-check at the point of Take: the input can disappear after Preview.
        guard canUse(scene) else {
            message = "La cámara dejó de estar disponible. Programa NO ha cambiado."
            return
        }
        program = scene
        appendEvent("scene-take", scene: scene)
        message = "En Programa local. NO se está transmitiendo."
    }

    private func exportCueSheet() {
        let payload: [String: Any] = [
            "schema": "wivra-live-edit-log-v1",
            "projectId": "native-scene-lab",
            "canvas": "9:16",
            "events": cues.map { [
                "sequence": $0.sequence,
                "atMs": $0.atMs,
                "type": $0.type,
                "sceneId": $0.sceneId
            ] },
            "mediaRecorded": false,
            "encoderValidated": false
        ]
        do {
            let data = try JSONSerialization.data(withJSONObject: payload,
                                                  options: [.prettyPrinted, .sortedKeys])
            let filename = "Wivra_LIVE_CueSheet_" + UUID().uuidString + ".json"
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
            try data.write(to: url, options: .atomic)
            logURL = url
            message = "Registro local preparado. Contiene eventos, no video ni audio."
        } catch {
            message = "No se pudo preparar el registro: " + error.localizedDescription
        }
    }

    @ViewBuilder
    private func sceneCanvas(_ scene: WivraLabScene?) -> some View {
        GeometryReader { geo in
            ZStack {
                Color.black
                if let scene {
                    if scene.requiresCamera {
                        if cameraReady(), let image = cameraFrame {
                            Image(uiImage: image)
                                .resizable()
                                .scaledToFill()
                                .frame(width: geo.size.width, height: geo.size.height)
                                .clipped()
                                .accessibilityLabel("Vista local de fotogramas recibidos mediante Meta DAT")
                        } else {
                            Text("CÁMARA NO DISPONIBLE")
                                .font(.caption2.bold())
                                .foregroundStyle(.white)
                        }
                    }
                    if let caption = scene.caption {
                        VStack {
                            Spacer()
                            Text(caption)
                                .font(.caption.bold())
                                .multilineTextAlignment(.center)
                                .foregroundStyle(.white)
                                .padding(8)
                                .frame(maxWidth: .infinity)
                                .background(.black.opacity(0.78))
                                .padding(6)
                        }
                    }
                } else {
                    Text("SIN ESCENA")
                        .font(.caption2.bold())
                        .foregroundStyle(.white)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .clipped()
        }
        .aspectRatio(9.0 / 16.0, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10)
            .stroke(.secondary.opacity(0.3), lineWidth: 1))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Label("B2B · Laboratorio de escenas", systemImage: "rectangle.on.rectangle")
                    .font(.headline)
                Text("Vista previa local y Programa. Sin RTMP, sin audio mezclado ni grabación de la composición.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("PREVIEW").font(.caption.bold())
                        sceneCanvas(staged)
                    }
                    VStack(alignment: .leading, spacing: 5) {
                        Text("PROGRAMA LOCAL").font(.caption.bold())
                        sceneCanvas(program)
                    }
                }

                Label(cameraReady() ? "Cámara RAW recibida por DAT: disponible" :
                      "Cámara RAW no disponible: solo puedes usar escenas CG",
                      systemImage: cameraReady() ? "checkmark.circle" : "video.slash")
                    .font(.caption)
                    .foregroundStyle(cameraReady() ? Color.green : Color.secondary)

                Picker("Preparar escena", selection: $selection) {
                    ForEach(WivraLabScene.allCases) { scene in
                        Text(scene.title).tag(scene)
                    }
                }
                .pickerStyle(.menu)
                .accessibilityIdentifier("wivra_live_scene_choice")

                HStack {
                    Button("Preparar") { cue(selection) }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("wivra_live_preview_cue")
                    Button("Pasar a Programa") { take() }
                        .buttonStyle(.borderedProminent)
                        .disabled(staged == nil || (staged?.requiresCamera == true && !cameraReady()))
                        .accessibilityIdentifier("wivra_live_program_take")
                }

                Text("Deck local · escenas predefinidas")
                    .font(.subheadline.bold())
                HStack(spacing: 8) {
                    ForEach(WivraLabScene.allCases) { scene in
                        Button(scene.title) { cue(scene) }
                            .font(.caption2)
                            .buttonStyle(.bordered)
                            .disabled(!canUse(scene))
                    }
                }
                Text("El Deck prepara escenas; para mostrarlas pulsa «Pasar a Programa».")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Text(message).font(.caption).accessibilityIdentifier("wivra_live_lab_status")
                Divider()
                Text("Eventos: \(cues.count) · solo metadatos de ensayo")
                    .font(.caption.monospacedDigit())
                if !cues.isEmpty {
                    Button("Preparar registro de escenas") { exportCueSheet() }
                        .buttonStyle(.bordered)
                    if let logURL {
                        ShareLink(item: logURL) {
                            Label("Compartir registro JSON", systemImage: "square.and.arrow.up")
                        }
                        .font(.footnote)
                    }
                }
                Text("Las imágenes de cámara son una vista local del modo .raw. En HEVC comprimido todavía no existe decodificador de preview para esta pantalla. Programa no significa salida codificada.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding()
        }
        .navigationTitle("Wivra LIVE Lab")
        .navigationBarTitleDisplayMode(.inline)
    }
}
