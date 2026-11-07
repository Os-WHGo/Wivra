// Wivra B1D: choose a real iOS recording input, never a pretend brand/device.
// One active input route; a USB receiver may expose multiple channels.
// No automatic substitution when the selected device disconnects. -- ChatGPT
import AVFoundation
import Observation
import Foundation

struct WivraMicPort: Identifiable, Equatable {
    let id: String
    let name: String
    let kind: String
    let source: String
}

@MainActor @Observable
final class WivraAudioRoute {
    var ports: [WivraMicPort] = []
    var selectedUID = ""
    var status = "Detecta micrófonos disponibles"
    var authorized = false
    /// MU (owner): Ray-Ban «solo vídeo». Bluetooth inputs (HFP) are listed only when asked, because on the
    /// glasses' link the DAT camera and the HFP microphone compete (lower quality or cuts). Never chosen silently.
    var includeBluetooth = false

    /// Glasses' own microphone (by its reported name). Never pre-selected, never used as a silent fallback.
    static func looksLikeGlasses(_ name: String) -> Bool {
        name.range(of: #"ray[- ]?ban|meta|oakley|glasses|gafas"#, options: [.regularExpression, .caseInsensitive]) != nil
    }

    /// True when no Bluetooth HFP route is open for input or output (checked on the real current route).
    static var hfpClosed: Bool {
        let route = AVAudioSession.sharedInstance().currentRoute
        return !route.inputs.contains { $0.portType == .bluetoothHFP } &&
            !route.outputs.contains { $0.portType == .bluetoothHFP }
    }

    private func categoryOptions(for type: AVAudioSession.Port?) -> AVAudioSession.CategoryOptions {
        type == .bluetoothHFP ? [.allowBluetoothHFP, .mixWithOthers] : [.mixWithOthers]
    }

    /// Microphones still usable for the next take, glasses excluded (for the «micrófono perdido» notice).
    var nonGlassesAlternatives: [WivraMicPort] {
        ports.filter { $0.id != selectedUID && !Self.looksLikeGlasses($0.name) }
    }

    private static func supported(_ type: AVAudioSession.Port) -> Bool {
        type == .bluetoothHFP || type == .builtInMic ||
        type == .headsetMic || type == .usbAudio
    }

    private static func describe(_ type: AVAudioSession.Port) -> (kind: String, source: String) {
        switch type {
        case .bluetoothHFP: return ("Bluetooth · llamadas", "ios-bluetooth-hfp")
        case .builtInMic: return ("Micrófono del iPhone", "ios-built-in-mic")
        case .headsetMic: return ("Micrófono por cable", "ios-headset-mic")
        case .usbAudio: return ("Entrada de audio USB", "ios-usb-audio")
        default: return ("Entrada no compatible", "unknown")
        }
    }

    var selectedSource: String? {
        ports.first(where: { $0.id == selectedUID })?.source
    }

    func discover() async {
        authorized = await AVAudioApplication.requestRecordPermission()
        guard authorized else {
            status = "Permiso de micrófono denegado."
            ports = []
            selectedUID = ""
            return
        }
        do {
            let session = AVAudioSession.sharedInstance()
            // Without HFP unless Bluetooth was explicitly requested: allowing it lets iOS move the input
            // to the glasses' microphone on its own.
            try session.setCategory(.playAndRecord, mode: .videoRecording,
                                    options: includeBluetooth ? [.allowBluetoothHFP, .mixWithOthers] : [.mixWithOthers])
            try session.setActive(true)
            ports = (session.availableInputs ?? [])
                .filter { Self.supported($0.portType) && (includeBluetooth || $0.portType != .bluetoothHFP) }
                .map { input in
                    let desc = Self.describe(input.portType)
                    return WivraMicPort(id: input.uid, name: input.portName,
                                        kind: desc.kind, source: desc.source)
                }
            if !ports.contains(where: { $0.id == selectedUID }) {
                // Default to a non-glasses microphone (phone, cable, USB), never the glasses.
                selectedUID = ports.first(where: { $0.source != "ios-bluetooth-hfp" && !Self.looksLikeGlasses($0.name) })?.id ?? ""
            }
            status = ports.isEmpty ? "No se detectaron entradas utilizables." :
                "Elige la fuente real y toca Preparar antes de iniciar la cámara."
        } catch {
            status = "No se pudieron detectar entradas: " + error.localizedDescription
            ports = []
            selectedUID = ""
        }
    }

    @discardableResult
    func activateSelectedInput() throws -> String {
        guard authorized && !selectedUID.isEmpty else {
            throw WivraAudioRouteError.noSelection
        }
        let session = AVAudioSession.sharedInstance()
        // If already prepared before DAT, don't reconfigure the entire HFP route
        // during video capture. Reconfiguration can interfere with camera streaming.
        if hasSelectedRoute,
           let selected = session.availableInputs?.first(where: { $0.uid == selectedUID }) {
            status = "Entrada activa confirmada: " + selected.portName
            return selected.portName
        }
        let wanted = session.availableInputs?.first(where: { $0.uid == selectedUID })
        try session.setCategory(.playAndRecord, mode: .videoRecording,
                                options: categoryOptions(for: wanted?.portType))
        try session.setActive(true)
        guard let input = session.availableInputs?.first(where: {
            $0.uid == selectedUID && Self.supported($0.portType)
        }) else {
            throw WivraAudioRouteError.inputLost
        }
        try session.setPreferredInput(input)
        // setPreferredInput is only a request; currentRoute is the real input.
        guard hasSelectedRoute else { throw WivraAudioRouteError.routeRejected }
        // A non-Bluetooth choice must leave HFP closed (the glasses keep the link for video).
        if input.portType != .bluetoothHFP && !Self.hfpClosed { throw WivraAudioRouteError.hfpStillOpen }
        status = "Entrada activa confirmada: " + input.portName +
            (input.portType == .bluetoothHFP ? "" : " · HFP de las gafas cerrado")
        return input.portName
    }

    var hasSelectedRoute: Bool {
        !selectedUID.isEmpty && AVAudioSession.sharedInstance().currentRoute.inputs.contains {
            $0.uid == selectedUID && Self.supported($0.portType)
        }
    }
}

enum WivraAudioRouteError: LocalizedError {
    case noSelection, inputLost, routeRejected, hfpStillOpen
    var errorDescription: String? {
        switch self {
        case .noSelection: "Elige un micrófono detectado y concédele permiso a Wivra."
        case .inputLost: "El micrófono seleccionado ya no está disponible."
        case .routeRejected: "iOS usa otra entrada; no grabaremos desde una fuente distinta sin permiso."
        case .hfpStillOpen: "iOS mantiene abierto el micrófono Bluetooth (HFP); desconecta el audio de las gafas en Ajustes > Bluetooth e inténtalo otra vez."
        }
    }
}
