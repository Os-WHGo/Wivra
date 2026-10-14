// Wivra B1B: local metadata contract for future editor MediaAsset import.
// Does not move the footage or upload audio to any remote server.
import Foundation

struct WivraCaptureManifest: Codable {
    let schemaVersion: Int
    let captureID: String
    let cameraSource: String
    let audioSource: String
    let selectedInputName: String?
    let originalVideoFile: String
    let originalAudioFile: String?
    let muxedVideoFile: String?
    let audioStartOffsetSeconds: Double?
    let createdAtISO8601: String

    static func write(videoURL: URL, audioURL: URL?,
                      mergedURL: URL?, audioOffsetSeconds: Double?,
                      audioPortName: String?) throws -> URL {
        let record = WivraCaptureManifest(
            schemaVersion: 1, captureID: UUID().uuidString,
            cameraSource: "meta-dat-hevc",
            audioSource: audioURL == nil ? "none" : "ios-bluetooth-hfp",
            selectedInputName: audioPortName,
            originalVideoFile: videoURL.lastPathComponent,
            originalAudioFile: audioURL?.lastPathComponent,
            muxedVideoFile: mergedURL?.lastPathComponent,
            audioStartOffsetSeconds: audioOffsetSeconds,
            createdAtISO8601: ISO8601DateFormatter().string(from: Date())
        )
        let result = videoURL.deletingPathExtension().appendingPathExtension("wivra.json")
        let data = try JSONEncoder().encode(record)
        try data.write(to: result, options: .atomic)
        return result
    }
}
