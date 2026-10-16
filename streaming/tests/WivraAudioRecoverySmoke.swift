// macOS-only synthetic CAF lifecycle smoke test. No headset/device claims.
import AVFoundation
import Foundation

@main
struct WivraAudioRecoverySmoke {
    static func makeCAF(in folder: URL) throws -> URL {
        let url = folder.appendingPathComponent("Wivra_Audio_" + UUID().uuidString + ".caf")
        let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!
        do {
            let file = try AVAudioFile(forWriting: url, settings: format.settings)
            let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 2048)!
            buffer.frameLength = 2048
            if let samples = buffer.floatChannelData {
                for index in 0..<Int(buffer.frameLength) { samples[0][index] = 0 }
            }
            try file.write(from: buffer)
        }
        return url
    }

    static func main() throws {
        let folder = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("WivraRecordings", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var owned: [URL] = []
        defer {
            for url in owned {
                try? FileManager.default.removeItem(at: url)
                try? FileManager.default.removeItem(at: folder.appendingPathComponent(
                    url.lastPathComponent + ".wivra.pending.json"))
                try? FileManager.default.removeItem(at: folder.appendingPathComponent(
                    url.lastPathComponent + ".wivra.kept.json"))
            }
        }

        let saved = try makeCAF(in: folder)
        owned.append(saved)
        let pending = try WivraPendingRecordingStore.stageAudio(saved)
        precondition(WivraPendingRecordingStore.pending().contains { $0.id == pending.id })
        let previewed = try WivraPendingRecordingStore.previewAudioURLs(pending)
        precondition(previewed == [saved])
        precondition(!WivraPendingRecordingStore.savedAudioOnlyURLs().contains(saved))
        try WivraPendingRecordingStore.keep(pending)
        precondition(FileManager.default.fileExists(atPath: saved.path))
        precondition(WivraPendingRecordingStore.savedAudioOnlyURLs().contains(saved))

        let discarded = try makeCAF(in: folder)
        owned.append(discarded)
        let discardTicket = try WivraPendingRecordingStore.stageAudio(discarded)
        try WivraPendingRecordingStore.discardConfirmed(discardTicket)
        precondition(!FileManager.default.fileExists(atPath: discarded.path))

        let interrupted = try makeCAF(in: folder)
        owned.append(interrupted)
        precondition(!WivraPendingRecordingStore.savedAudioOnlyURLs().contains(interrupted))
        let recovered = WivraPendingRecordingStore.recoverOrphanedAudio()
        precondition(recovered > 0)
        guard let restored = WivraPendingRecordingStore.pending().first(where: {
            $0.id == interrupted.lastPathComponent
        }) else { fatalError("orphaned CAF not recovered") }
        precondition(FileManager.default.fileExists(atPath: interrupted.path))
        try WivraPendingRecordingStore.discardConfirmed(restored)
        precondition(!FileManager.default.fileExists(atPath: interrupted.path))
        print("Synthetic CAF consent/recovery smoke test passed; no real devices used.")
    }
}
