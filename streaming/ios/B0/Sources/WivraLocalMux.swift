// Wivra B1B: mux separate video + audio while keeping originals for editing.
// Offset derives from host clock when first samples were accepted. Needs
// hardware clap/echo tests before production sync claims.
import AVFoundation
import CoreMedia
import Foundation

enum WivraMuxError: LocalizedError {
    case noVideo, noAudio, cannotCreateExport, exportedFileInvalid
    var errorDescription: String? {
        switch self {
        case .noVideo: "El archivo no contiene pista de video."
        case .noAudio: "El audio independiente no contiene pista reproducible."
        case .cannotCreateExport: "iOS no permite exportar este formato de proyecto."
        case .exportedFileInvalid: "No se generó un video combinado válido."
        }
    }
}

enum WivraLocalMux {
    // audioStartOffset = audio first-sample host time - video first-frame host time.
    // A negative value trims the early audio; a positive value delays it.
    static func merge(videoURL: URL, audioURL: URL, audioStartOffset: Double) async throws -> URL {
        let video = AVURLAsset(url: videoURL)
        let audio = AVURLAsset(url: audioURL)
        guard let sourceVideo = try await video.loadTracks(withMediaType: .video).first else {
            throw WivraMuxError.noVideo
        }
        guard let sourceAudio = try await audio.loadTracks(withMediaType: .audio).first else {
            throw WivraMuxError.noAudio
        }
        let videoDuration = try await video.load(.duration)
        let audioDuration = try await audio.load(.duration)
        guard videoDuration > .zero, audioDuration > .zero else {
            throw WivraMuxError.exportedFileInvalid
        }
        let composition = AVMutableComposition()
        guard let destVideo = composition.addMutableTrack(withMediaType: .video,
                       preferredTrackID: kCMPersistentTrackID_Invalid) else {
            throw WivraMuxError.noVideo
        }
        try destVideo.insertTimeRange(CMTimeRange(start: .zero, duration: videoDuration),
                                      of: sourceVideo, at: .zero)
        destVideo.preferredTransform = try await sourceVideo.load(.preferredTransform)
        guard let destAudio = composition.addMutableTrack(withMediaType: .audio,
                       preferredTrackID: kCMPersistentTrackID_Invalid) else {
            throw WivraMuxError.noAudio
        }

        let safeOffset = audioStartOffset.isFinite ? audioStartOffset : 0
        let trimSeconds = max(0, -safeOffset)
        let insertSeconds = max(0, safeOffset)
        let trim = CMTime(seconds: trimSeconds, preferredTimescale: 600)
        let insert = CMTime(seconds: insertSeconds, preferredTimescale: 600)
        guard trim < audioDuration, insert < videoDuration else {
            throw WivraMuxError.exportedFileInvalid
        }
        let availableAudio = CMTimeSubtract(audioDuration, trim)
        let availableVideo = CMTimeSubtract(videoDuration, insert)
        let length = CMTimeMinimum(availableAudio, availableVideo)
        guard length > .zero else { throw WivraMuxError.exportedFileInvalid }
        try destAudio.insertTimeRange(CMTimeRange(start: trim, duration: length),
                                      of: sourceAudio, at: insert)

        let output = videoURL.deletingPathExtension()
            .appendingPathExtension("synced.mov")
        try? FileManager.default.removeItem(at: output)
        guard let exporter = AVAssetExportSession(asset: composition,
                          presetName: AVAssetExportPresetPassthrough) else {
            throw WivraMuxError.cannotCreateExport
        }
        exporter.outputURL = output
        exporter.outputFileType = .mov
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            exporter.exportAsynchronously { continuation.resume() }
        }
        guard exporter.status == .completed,
            let size = try? FileManager.default.attributesOfItem(atPath: output.path)[.size] as? NSNumber,
            size.int64Value > 0 else {
            try? FileManager.default.removeItem(at: output)
            throw exporter.error ?? WivraMuxError.exportedFileInvalid
        }
        return output
    }
}
