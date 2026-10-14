// Wivra B1C: versioned local metadata for a single capture with multiple audio tracks.
// Tracks describe files/channels ACTUALLY recorded, not merely connected devices.
// No media is moved, uploaded or duplicated. -- ChatGPT
import Foundation

struct WivraCaptureTrack: Codable {
    let id: String
    let kind: String                 // "audio"; video stays in originalVideoFile for v2
    let role: String                 // voice_primary, voice_guest, music, scratch, ambience, other
    let source: String               // e.g. ios-bluetooth-hfp, usb-dji-receiver, usb-external-mixer
    let file: String                 // safe relative filename, may be shared for separate channels
    let channelIndex: Int?           // zero-based; nil means all channels in file
    let sampleRateHz: Double?        // measured at capture, NOT assumed by hardware brand
    let channelCount: Int?           // measured channels in the underlying file
    let inputName: String?           // human-readable iOS route; not a verified hardware model
    let startOffsetSeconds: Double?  // estimated relative to originalVideoFile first frame
}

enum WivraManifestError: LocalizedError {
    case invalidTrack, duplicateTrack, invalidMuxReference

    var errorDescription: String? {
        switch self {
        case .invalidTrack: "Una pista no tiene nombre de archivo/canal válido."
        case .duplicateTrack: "Hay pistas duplicadas en el manifiesto."
        case .invalidMuxReference: "El video combinado referencia una pista inexistente."
        }
    }
}

struct WivraCaptureManifest: Codable {
    let schemaVersion: Int
    let captureID: String
    let cameraSource: String
    // Compatibility fields retained for existing readers of the B1B prototype.
    // For v2, tracks is authoritative: legacy fields represent at most one primary audio file.
    let audioSource: String
    let selectedInputName: String?
    let originalVideoFile: String
    let originalAudioFile: String?
    let muxedVideoFile: String?
    let audioStartOffsetSeconds: Double?
    let createdAtISO8601: String

    let tracks: [WivraCaptureTrack]
    let muxedFromTrackIDs: [String]   // prevents editor from double-playing muxed + sidecar

    // Canonical v2 writer for future USB/DJI/mixer capture adapters.
    static func write(videoURL: URL, tracks: [WivraCaptureTrack],
                      mergedURL: URL?, muxedFromTrackIDs: [String] = []) throws -> URL {
        var ids = Set<String>()
        var recordedChannels = Set<String>()
        for track in tracks {
            guard track.kind == "audio", !track.id.isEmpty,
                  !track.file.isEmpty, track.file == URL(fileURLWithPath: track.file).lastPathComponent,
                  track.file != ".", track.file != "..",
                  track.channelIndex.map({ $0 >= 0 }) ?? true,
                  track.channelCount.map({ $0 > 0 }) ?? true,
                  track.sampleRateHz.map({ $0.isFinite && $0 > 0 }) ?? true,
                  track.startOffsetSeconds.map({ $0.isFinite }) ?? true,
                  (track.channelIndex == nil || (track.channelCount.map { track.channelIndex! < $0 } ?? true))
            else { throw WivraManifestError.invalidTrack }
            let key = track.file + "#" + (track.channelIndex.map(String.init) ?? "all")
            guard ids.insert(track.id).inserted,
                  recordedChannels.insert(key).inserted else {
                throw WivraManifestError.duplicateTrack
            }
        }
        guard (mergedURL != nil || muxedFromTrackIDs.isEmpty),
              muxedFromTrackIDs.allSatisfy({ ids.contains($0) }),
              Set(muxedFromTrackIDs).count == muxedFromTrackIDs.count else {
            throw WivraManifestError.invalidMuxReference
        }
        let legacy = tracks.first
        let record = WivraCaptureManifest(
            schemaVersion: 2, captureID: UUID().uuidString,
            cameraSource: "meta-dat-hevc",
            audioSource: legacy?.source ?? "none",
            selectedInputName: legacy?.inputName,
            originalVideoFile: videoURL.lastPathComponent,
            originalAudioFile: legacy?.file,
            muxedVideoFile: mergedURL?.lastPathComponent,
            audioStartOffsetSeconds: legacy?.startOffsetSeconds,
            createdAtISO8601: ISO8601DateFormatter().string(from: Date()),
            tracks: tracks, muxedFromTrackIDs: muxedFromTrackIDs
        )
        let result = videoURL.deletingPathExtension().appendingPathExtension("wivra.json")
        let data = try JSONEncoder().encode(record)
        try data.write(to: result, options: .atomic)
        return result
    }

    // Existing B1B capture only writes one actual HFP CAF recording.
    // Do not invent DJI tracks or a second HFP backup on the USB route.
    static func write(videoURL: URL, audioURL: URL?,
                      mergedURL: URL?, audioOffsetSeconds: Double?,
                      audioPortName: String?, audioSource: String = "ios-bluetooth-hfp",
                      audioSampleRateHz: Double? = nil,
                      audioChannelCount: Int? = nil) throws -> URL {
        let tracks: [WivraCaptureTrack]
        if let audioURL {
            tracks = [WivraCaptureTrack(
                id: "audio-1", kind: "audio", role: "voice_primary",
                source: audioSource, file: audioURL.lastPathComponent,
                channelIndex: nil, sampleRateHz: audioSampleRateHz,
                channelCount: audioChannelCount, inputName: audioPortName,
                startOffsetSeconds: audioOffsetSeconds
            )]
        } else {
            tracks = []
        }
        return try write(videoURL: videoURL, tracks: tracks, mergedURL: mergedURL,
                         muxedFromTrackIDs: mergedURL == nil ? [] : tracks.map(\.id))
    }
}
