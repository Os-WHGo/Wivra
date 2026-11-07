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

/// Optional second camera of an iPhone MultiCam take (Claude). Old manifests
/// simply have no "multicam" key; the editor imports only the main camera
/// when this block is missing or invalid.
struct WivraCaptureMulticam: Codable, Equatable {
    var schema = "wivra-multicam-v1"
    let secondaryVideoFile: String
    let secondaryOffsetSeconds: Double?   // secondary first frame - main first frame
    let primaryPosition: String
    let secondaryPosition: String
    let corner: String
    let audio: String                      // "primary": only the main movie has sound

    /// Same rules as app/capture-manifest.mjs.
    func isValid(originalVideoFile: String, otherFiles: Set<String>) -> Bool {
        let name = secondaryVideoFile
        return schema == "wivra-multicam-v1" &&
            !name.isEmpty && name.count <= 255 && !name.hasPrefix(".") &&
            !name.contains("/") && !name.contains("\\") &&
            name != originalVideoFile && !otherFiles.contains(name) &&
            (secondaryOffsetSeconds.map { $0.isFinite && abs($0) <= 10 } ?? true) &&
            ["bottom-right", "bottom-left", "top-left", "top-right"].contains(corner) &&
            ["primary", "secondary", "none"].contains(audio)
    }
}

enum WivraManifestError: LocalizedError {
    case invalidTrack, duplicateTrack, invalidMuxReference, invalidMulticam

    var errorDescription: String? {
        switch self {
        case .invalidTrack: "Una pista no tiene nombre de archivo/canal válido."
        case .duplicateTrack: "Hay pistas duplicadas en el manifiesto."
        case .invalidMuxReference: "El video combinado referencia una pista inexistente."
        case .invalidMulticam: "Los datos de la segunda cámara no son válidos."
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
    var multicam: WivraCaptureMulticam? = nil

    // Canonical v2 writer for future USB/DJI/mixer capture adapters.
    static func write(videoURL: URL, tracks: [WivraCaptureTrack],
                      mergedURL: URL?, muxedFromTrackIDs: [String] = [],
                      cameraSource: String = "meta-dat-hevc",
                      multicam: WivraCaptureMulticam? = nil,
                      writeOnce: Bool = false) throws -> URL {
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
        if let multicam {
            var others = Set(tracks.map(\.file))
            if let mergedURL { others.insert(mergedURL.lastPathComponent) }
            guard multicam.isValid(originalVideoFile: videoURL.lastPathComponent, otherFiles: others) else {
                throw WivraManifestError.invalidMulticam
            }
        }
        let legacy = tracks.first
        let record = WivraCaptureManifest(
            schemaVersion: 2, captureID: UUID().uuidString,
            cameraSource: cameraSource,
            audioSource: legacy?.source ?? "none",
            selectedInputName: legacy?.inputName,
            originalVideoFile: videoURL.lastPathComponent,
            originalAudioFile: legacy?.file,
            muxedVideoFile: mergedURL?.lastPathComponent,
            audioStartOffsetSeconds: legacy?.startOffsetSeconds,
            createdAtISO8601: ISO8601DateFormatter().string(from: Date()),
            tracks: tracks, muxedFromTrackIDs: muxedFromTrackIDs,
            multicam: multicam
        )
        let result = videoURL.deletingPathExtension().appendingPathExtension("wivra.json")
        let data = try JSONEncoder().encode(record)
        if writeOnce {
            // W70: the recovery path must never replace a manifest created by
            // an active or competing finalizer. Atomic rename alone can overwrite.
            // Link a same-directory staged inode to the absent destination:
            // linkItem fails atomically when the destination already exists.
            let temporary = result.deletingLastPathComponent()
                .appendingPathComponent(".wivra-\(UUID().uuidString).staging")
            defer { try? FileManager.default.removeItem(at: temporary) }
            try data.write(to: temporary, options: .atomic)
            try FileManager.default.linkItem(at: temporary, to: result)
        } else {
            try data.write(to: result, options: .atomic)
        }
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
            if audioSource == "ios-usb-audio" && audioChannelCount == 2 {
                // Two *observed* PCM channels of one USB input, not an assumption
                // that the receiver has two people/transmitters connected.
                // They stay in the same CAF file; the editor may extract L/R
                // non-destructively after verifying the contents on hardware.
                tracks = (0..<2).map { channel in
                    WivraCaptureTrack(
                        id: "audio-\(channel + 1)", kind: "audio", role: "other",
                        source: audioSource, file: audioURL.lastPathComponent,
                        channelIndex: channel, sampleRateHz: audioSampleRateHz,
                        channelCount: audioChannelCount, inputName: audioPortName,
                        startOffsetSeconds: audioOffsetSeconds
                    )
                }
            } else {
                tracks = [WivraCaptureTrack(
                    id: "audio-1", kind: "audio", role: "voice_primary",
                    source: audioSource, file: audioURL.lastPathComponent,
                    channelIndex: nil, sampleRateHz: audioSampleRateHz,
                    channelCount: audioChannelCount, inputName: audioPortName,
                    startOffsetSeconds: audioOffsetSeconds
                )]
            }
        } else {
            tracks = []
        }
        return try write(videoURL: videoURL, tracks: tracks, mergedURL: mergedURL,
                         muxedFromTrackIDs: mergedURL == nil ? [] : tracks.map(\.id))
    }
}
