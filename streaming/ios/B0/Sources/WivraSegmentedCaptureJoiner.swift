// Wivra P0: merge a confirmed Meta HEVC-only take into ONE local MOV.
// This does not replace the independent, recoverable source checkpoints.
// No network, cloud, new codec, or external dependency is required.
import AVFoundation
import CoreMedia
import Foundation

enum WivraSegmentJoinError: LocalizedError {
    case invalidGroup, missingPart, unsupportedFormats, insufficientSpace
    case exportUnavailable, outputInvalid

    var errorDescription: String? {
        switch self {
        case .invalidGroup: return "La toma contiene fragmentos incompatibles o fuera de orden."
        case .missingPart: return "Falta o no se puede leer un fragmento MOV original."
        case .unsupportedFormats: return "Los fragmentos cambiaron de formato; conserva los originales."
        case .insufficientSpace: return "No hay espacio para crear un video completo adicional; conserva las partes."
        case .exportUnavailable: return "iOS no pudo preparar la unión MOV sin recodificación."
        case .outputInvalid: return "El video unido no superó la comprobación de reproducción y duración."
        }
    }
}

enum WivraSegmentedCaptureJoiner {
    // Match the Director import ceiling; this is NOT a promise of uninterrupted
    // capture for that many files or that long on physical hardware.
    static let maximumParts = 1440

    static func joinConfirmed(_ sources: [URL]) async throws -> URL {
        guard (2...maximumParts).contains(sources.count) else {
            throw WivraSegmentJoinError.invalidGroup
        }
        let folder = FileManager.default.urls(
            for: .documentDirectory, in: .userDomainMask
        )[0].appendingPathComponent("WivraRecordings", isDirectory: true)
            .standardizedFileURL
        let ordered = sources.sorted {
            $0.lastPathComponent < $1.lastPathComponent
        }
        let first = ordered[0].lastPathComponent
        guard first.range(of: #"^Wivra_Meta_[a-z0-9]+_part0001\.mov$"#,
                          options: .regularExpression) != nil else {
            throw WivraSegmentJoinError.invalidGroup
        }
        let prefix = String(first.dropLast("_part0001.mov".count))
        var sourceBytes: Int64 = 0
        for (index, url) in ordered.enumerated() {
            let expected = prefix + "_part" + String(format: "%04d", index + 1) + ".mov"
            guard url.isFileURL,
                  url.standardizedFileURL.deletingLastPathComponent() == folder,
                  url.lastPathComponent == expected else {
                throw WivraSegmentJoinError.invalidGroup
            }
            let values = try? url.resourceValues(forKeys: [
                .isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey
            ])
            guard values?.isRegularFile == true,
                  values?.isSymbolicLink != true,
                  let size = values?.fileSize, size > 0 else {
                throw WivraSegmentJoinError.missingPart
            }
            let (sum, overflow) = sourceBytes.addingReportingOverflow(Int64(size))
            guard !overflow else { throw WivraSegmentJoinError.insufficientSpace }
            sourceBytes = sum
        }

        let destination = folder.appendingPathComponent(prefix + "_complete.mov")
        let fm = FileManager.default
        // Keep a previous successfully built take rather than overwriting it.
        if fm.fileExists(atPath: destination.path) {
            guard let media = await WivraMp4Repair.inspect(destination),
                  media.video && media.durationMs > 0 else {
                throw WivraSegmentJoinError.outputInvalid
            }
            _ = try WivraCaptureManifest.write(
                videoURL: destination, tracks: [], mergedURL: nil,
                cameraSource: "meta-dat-hevc-joined"
            )
            return destination
        }

        // Pass-through remux still writes a second full video. It MUST NOT
        // consume the space reserved for iOS or safe MOV finalization.
        let (needed, overflow) = sourceBytes.addingReportingOverflow(
            WivraCaptureStorageGuard.minimumStartBytes
        )
        guard !overflow,
              let free = WivraCaptureStorageGuard.availableBytes(),
              free > needed else {
            throw WivraSegmentJoinError.insufficientSpace
        }
        let composition = AVMutableComposition()
        guard let outputTrack = composition.addMutableTrack(
            withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid
        ) else { throw WivraSegmentJoinError.exportUnavailable }

        var cursor = CMTime.zero
        var initialDimensions: CGSize?
        var initialTransform: CGAffineTransform?
        for url in ordered {
            let asset = AVURLAsset(url: url)
            guard let inputTrack = try await asset.loadTracks(withMediaType: .video).first
            else { throw WivraSegmentJoinError.missingPart }
            let duration = try await asset.load(.duration)
            guard duration.isValid && duration > .zero else {
                throw WivraSegmentJoinError.missingPart
            }
            let dimensions = try await inputTrack.load(.naturalSize)
            let transform = try await inputTrack.load(.preferredTransform)
            guard dimensions.width > 0 && dimensions.height > 0 else {
                throw WivraSegmentJoinError.missingPart
            }
            if let initialDimensions, let initialTransform {
                // Do not silently distort mixed adaptive DAT resolutions.
                guard dimensions == initialDimensions && transform == initialTransform
                else { throw WivraSegmentJoinError.unsupportedFormats }
            } else {
                initialDimensions = dimensions
                initialTransform = transform
                outputTrack.preferredTransform = transform
            }
            try outputTrack.insertTimeRange(
                CMTimeRange(start: .zero, duration: duration),
                of: inputTrack, at: cursor
            )
            cursor = CMTimeAdd(cursor, duration)
        }

        let temporary = folder.appendingPathComponent(prefix + "_joining.mov")
        // Only our own incomplete DERIVED output may be replaced on retry.
        if fm.fileExists(atPath: temporary.path) {
            let values = try temporary.resourceValues(forKeys: [.isSymbolicLinkKey])
            guard values.isSymbolicLink != true else {
                throw WivraSegmentJoinError.outputInvalid
            }
            try fm.removeItem(at: temporary)
        }
        defer { try? fm.removeItem(at: temporary) }
        guard let exporter = AVAssetExportSession(
            asset: composition, presetName: AVAssetExportPresetPassthrough
        ) else { throw WivraSegmentJoinError.exportUnavailable }
        exporter.outputURL = temporary
        exporter.outputFileType = .mov
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            exporter.exportAsynchronously { continuation.resume() }
        }
        guard exporter.status == .completed,
              let media = await WivraMp4Repair.inspect(temporary),
              media.video && media.durationMs > 0 else {
            throw exporter.error ?? WivraSegmentJoinError.outputInvalid
        }
        let expectedMs = CMTimeGetSeconds(cursor) * 1000
        guard expectedMs.isFinite && expectedMs > 0,
              abs(Double(media.durationMs) - expectedMs) <= max(2000, expectedMs * 0.02)
        else { throw WivraSegmentJoinError.outputInvalid }

        // A same-volume move publishes only a fully verified derived MOV.
        guard !fm.fileExists(atPath: destination.path) else {
            throw WivraSegmentJoinError.outputInvalid
        }
        try fm.moveItem(at: temporary, to: destination)
        _ = try WivraCaptureManifest.write(
            videoURL: destination, tracks: [], mergedURL: nil,
            cameraSource: "meta-dat-hevc-joined"
        )
        return destination
    }
}
