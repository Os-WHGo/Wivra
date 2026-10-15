// Wivra LIVE B2C operator dashboard, LOCAL CONFIGURATION DEMO only.
// Does not read live platform chats, access accounts, publish video, play TTS,
// change AVAudioSession, or send alerts to streaming audiences.
import Foundation
import SwiftUI
import AVFoundation

private struct WivraCommunitySample: Identifiable {
    let id: String
    let service: String
    let type: String
    let display: String
    let message: String
    let priority: String
}

struct WivraLiveCommunityPanel: View {
    @State private var platform = "YouTube"
    @State private var readComments = false
    @State private var safetyPause = true
    @State private var subscriberPriority = true
    @State private var contributionPriority = true
    @State private var speechDelaySeconds = 6.0
    @State private var minimumRole = "Suscriptores"
    @State private var readDestination = "Monitor privado"
    @State private var alertDestination = "Monitor privado"
    @State private var selectedTransition = "Fundido"
    @State private var showThirds = false
    @State private var outputDescription = "Sin verificar"
    private let platforms = ["YouTube", "Twitch", "Kick", "TikTok", "RTMP personalizado"]
    private let demonstrations: [WivraCommunitySample] = [
        .init(id: "demo-1", service: "YouTube", type: "Super Chat",
              display: "Ana", message: "¡Buen recorrido!", priority: "Alta"),
        .init(id: "demo-2", service: "Kick", type: "Suscripción",
              display: "Usuario de ejemplo", message: "Nueva suscripción", priority: "Media"),
        .init(id: "demo-3", service: "Twitch", type: "Chat",
              display: "Visitante", message: "¿Cómo está la nieve?", priority: "Normal")
    ]

    private var platformState: String {
        switch platform {
        case "YouTube":
            "Existe API oficial de chat; conexión y permisos pendientes."
        case "Twitch":
            "Existe EventSub oficial; conexión y permisos pendientes."
        case "Kick":
            "Existen webhooks oficiales; requieren receptor y verificación."
        case "TikTok":
            "Conector de chat/regalos no verificado ni autorizado."
        default:
            "Destino RTMP aún no conectado a un codificador real."
        }
    }

    private func refreshOutput() {
        let outputs = AVAudioSession.sharedInstance().currentRoute.outputs
        outputDescription = outputs.isEmpty ? "iOS no informa salida activa." :
            outputs.map { $0.portName }.joined(separator: ", ")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("CONTROL LOCAL · SIN EMISIÓN")
                        .font(.caption.bold())
                    Text("Panel de configuración de prueba. Los eventos de ejemplo no provienen de espectadores reales. No hay TTS, alertas de audio ni conexiones activas.")
                        .font(.footnote)
                } header: { Text("Estado") }

                Section("Destinos de streaming") {
                    Picker("Plataforma", selection: $platform) {
                        ForEach(platforms, id: \.self) { name in
                            Text(name).tag(name)
                        }
                    }
                    Text(platformState).font(.footnote).foregroundStyle(.secondary)
                    Label("Sin cuentas vinculadas o stream keys guardadas", systemImage: "lock.shield")
                        .font(.caption)
                }

                Section("Lectura al oído") {
                    Toggle("Leer comentarios seleccionados", isOn: $readComments)
                        .disabled(safetyPause)
                        .accessibilityIdentifier("wivra_live_tts_optin")
                    Toggle("Bloqueo de lectura por seguridad", isOn: $safetyPause)
                        .accessibilityIdentifier("wivra_live_tts_safety_pause")
                    Picker("Comentarios que califican", selection: $minimumRole) {
                        ForEach(["Todos", "Seguidores", "Suscriptores", "Moderadores"],
                                id: \.self) { role in Text(role).tag(role) }
                    }
                    Toggle("Prioridad a suscripciones", isOn: $subscriberPriority)
                    Toggle("Prioridad a donaciones y regalos", isOn: $contributionPriority)
                    VStack(alignment: .leading) {
                        Text("Retardo mínimo: \(Int(speechDelaySeconds)) segundos")
                        Slider(value: $speechDelaySeconds, in: 2...30, step: 1)
                    }
                    Text("Al esquiar o moverte, mantén la lectura pausada si dificulta oír el entorno. Esta pantalla no detecta automáticamente si estás en movimiento.")
                        .font(.caption).foregroundStyle(.secondary)
                }

                Section("Mezcla y salidas") {
                    Picker("Lectura TTS destinada a", selection: $readDestination) {
                        Text("Monitor privado").tag("Monitor privado")
                        Text("Programa (pendiente)").tag("Programa (pendiente)")
                    }
                    Picker("Sonidos de alertas destinados a", selection: $alertDestination) {
                        Text("Monitor privado").tag("Monitor privado")
                        Text("Programa (pendiente)").tag("Programa (pendiente)")
                        Text("Ambos (pendiente)").tag("Ambos (pendiente)")
                    }
                    Text("Ruta de salida actual de iOS: \(outputDescription)")
                        .font(.footnote)
                    Button("Consultar salida del sistema") { refreshOutput() }
                    Text("El micrófono para capturar se elige en el panel de audio de Wivra B1D. Elegir aquí un destino NO redirige AirPods ni activa la mezcla pública.")
                        .font(.caption).foregroundStyle(.secondary)
                }

                Section("Efectos y escenas") {
                    Picker("Transición visual de prueba", selection: $selectedTransition) {
                        ForEach(["Corte", "Fundido", "Deslizar"], id: \.self) {
                            Text($0).tag($0)
                        }
                    }
                    Toggle("Cuadrícula de encuadre", isOn: $showThirds)
                    Text("Efectos definidos como cues. El compositor y los efectos emitidos aún no están integrados.")
                        .font(.caption).foregroundStyle(.secondary)
                }

                Section("Vista previa de alertas ficticias") {
                    ForEach(demonstrations) { item in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(item.service).font(.caption.bold())
                                Spacer()
                                Text(item.priority).font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            Text("\(item.type): \(item.display)").font(.subheadline.bold())
                            Text(item.message).font(.caption)
                        }
                        .accessibilityElement(children: .combine)
                    }
                    Text("Ningún ejemplo reproduce audio o aparece en una transmisión.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Comunidad · LIVE")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { refreshOutput() }
        }
    }
}
