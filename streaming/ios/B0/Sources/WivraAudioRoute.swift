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

    func activateSelectedInput() throws -> String {
        guard authorized && !selectedUID.isEmpty else {
            throw WivraAudioRouteError.noSelection
        }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .videoRecording,
                                options: [.allowBluetoothHFP, .mixWithOthers])
        try session.setActive(true)
        guard let input = session.availableInputs?.first(where: {
            $0.uid == selectedUID && $0.portType == .bluetoothHFP
        }) else {
            throw WivraAudioRouteError.inputLost
        }
        try session.setPreferredInput(input)
        // Preferred input is only a request: verify the active route.
        guard hasSelectedRoute else { throw WivraAudioRouteError.routeRejected }
        status = "Micrófono confirmado: " + input.portName
        return input.portName
    }

    var hasSelectedRoute: Bool {
        !selectedUID.isEmpty && AVAudioSession.sharedInstance().currentRoute.inputs.contains {
            $0.uid == selectedUID && $0.portType == .bluetoothHFP
        }
    }
}

enum WivraAudioRouteError: LocalizedError {
    case noSelection, inputLost, routeRejected
    var errorDescription: String? {
        switch self {
        case .noSelection: "Selecciona explícitamente el micrófono Bluetooth de tus gafas."
        case .inputLost: "Ya no está conectado el micrófono Bluetooth elegido."
        case .routeRejected: "iOS seleccionó otra entrada. No se grabará el micrófono equivocado."
        }
    }
}
