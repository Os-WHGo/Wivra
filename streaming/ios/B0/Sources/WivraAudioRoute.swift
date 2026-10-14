// Wivra B1B: audio source discovery. No automatic fallback to phone microphone.
import AVFoundation
import Observation
import Foundation

struct WivraMicPort: Identifiable, Equatable {
    let id: String
    let name: String
}

@MainActor @Observable
final class WivraAudioRoute {
    var ports: [WivraMicPort] = []
    var selectedUID = ""
    var status = "Buscar micrófonos Bluetooth"
    var authorized = false

    func discover() async {
        authorized = await AVAudioApplication.requestRecordPermission()
        guard authorized else {
            status = "Permiso de micrófono denegado."
            ports = []
            return
        }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .videoRecording,
                                    options: [.allowBluetoothHFP, .mixWithOthers])
            try session.setActive(true)
            ports = (session.availableInputs ?? [])
                .filter { $0.portType == .bluetoothHFP }
                .map { WivraMicPort(id: $0.uid, name: $0.portName) }
            if !ports.contains(where: { $0.id == selectedUID }) { selectedUID = "" }
            status = ports.isEmpty ? "Sin entrada Bluetooth HFP: audio deshabilitado." :
                                     "Selecciona el micrófono real de las Ray-Ban."
        } catch {
            status = "Error al buscar micrófonos: " + error.localizedDescription
        }
    }
}