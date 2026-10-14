// Wivra B1B: local, separately editable audio sidecar from a verified input.
// Prototype: file writes in audio callback need load tests for dropouts.
import AVFoundation
import QuartzCore
import Foundation

struct WivraAudioResult: Sendable {
    let url: URL
    let firstSampleUptime: Double
    let frames: Int64
    let sampleRate: Double
}

enum WivraAudioError: LocalizedError {
    case invalidFormat, noFrames, alreadyRecording
    var errorDescription: String? {
        switch self {
        case .invalidFormat: "La entrada de audio no ofrece un formato válido."
        case .noFrames: "No se grabó ninguna muestra real del micrófono."
        case .alreadyRecording: "Ya hay una grabación de audio activa."
        }
    }
}

// AVAudioEngine invokes the tap outside the main actor. File access is protected
// during stop, so no audio callback can append after finalization.
private final class WivraAudioFileSink: @unchecked Sendable {
    private let lock = NSLock()
    private var file: AVAudioFile?
    private var startTime: Double?
    private var count: Int64 = 0
    let sampleRate: Double

    init(file: AVAudioFile, sampleRate: Double) {
        self.file = file
        self.sampleRate = sampleRate
    }
    func append(_ buffer: AVAudioPCMBuffer) {
        lock.lock()
        defer { lock.unlock() }
        guard let file, buffer.frameLength > 0 else { return }
        do {
            try file.write(from: buffer)
            if startTime == nil { startTime = CACurrentMediaTime() }
            count += Int64(buffer.frameLength)
        } catch {
            // B1B test must detect no audio; never claim samples were written.
        }
    }
    func close() -> (Double?, Int64) {
        lock.lock()
        defer { lock.unlock() }
        file = nil
        return (startTime, count)
    }
}

@MainActor
final class WivraAudioSidecar {
    private var engine: AVAudioEngine?
    private var sink: WivraAudioFileSink?
    private var destination: URL?

    var isRecording: Bool { engine != nil }

    func start(verifiedSelectedRoute: Bool) throws {
        guard verifiedSelectedRoute else { throw WivraAudioRouteError.routeRejected }
        guard engine == nil else { throw WivraAudioError.alreadyRecording }
        let session = AVAudioSession.sharedInstance()
        let audioEngine = AVAudioEngine()
        let input = audioEngine.inputNode
        let format = input.inputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            throw WivraAudioError.invalidFormat
        }
        let folder = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("WivraRecordings", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let fileURL = folder.appendingPathComponent("Wivra_Audio_" + UUID().uuidString + ".caf")
        let audioFile = try AVAudioFile(forWriting: fileURL, settings: format.settings)
        let fileSink = WivraAudioFileSink(file: audioFile, sampleRate: format.sampleRate)
        // Install the tap only after explicit microphone consent and route check.
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            fileSink.append(buffer)
        }
        do {
            try audioEngine.start()
        } catch {
            input.removeTap(onBus: 0)
            _ = fileSink.close()
            try? FileManager.default.removeItem(at: fileURL)
            throw error
        }
        // AVAudioSession remains active while DAT camera continues.
        _ = session
        engine = audioEngine
        sink = fileSink
        destination = fileURL
    }

    func finish() throws -> WivraAudioResult {
        guard let audioEngine = engine, let fileSink = sink, let destination else {
            throw WivraAudioError.noFrames
        }
        audioEngine.inputNode.removeTap(onBus: 0)
        audioEngine.stop()
        let (first, count) = fileSink.close()
        engine = nil
        sink = nil
        self.destination = nil
        guard count > 0, let first,
              let size = try? FileManager.default.attributesOfItem(atPath: destination.path)[.size] as? NSNumber,
              size.int64Value > 0 else {
            try? FileManager.default.removeItem(at: destination)
            throw WivraAudioError.noFrames
        }
        return WivraAudioResult(url: destination, firstSampleUptime: first,
                                frames: count, sampleRate: fileSink.sampleRate)
    }
}
