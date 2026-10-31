// Wivra Ray-Ban iOS: explicit consent before keeping completed recordings.
// These markers are app-private and have no network or editor dependency.
// A dismissed choice is NOT an instruction to delete captured media.
import Foundation
import AVFoundation

struct WivraPendingRecording: Codable, Identifiable, Sendable {
    let id: String              // original .mov or audio-only .caf filename
    let createdAt: Date
    let files: [String]         // exact app-generated filenames, never arbitrary paths
}

enum WivraPendingRecordingError: LocalizedError {
    case invalidPath, invalidSelection, missingVideo, missingAudio

    var errorDescription: String? {
        switch self {
        case .invalidPath: "La grabación contiene una ruta de archivo no permitida."
        case .invalidSelection: "No se pudo verificar la decisión de esta grabación."
        case .missingVideo: "El video pendiente no está disponible."
        case .missingAudio: "No hay una pista CAF válida para recuperar."
        }
    }
}

enum WivraPendingRecordingStore {
    private static let suffix = ".wivra.pending.json"
    private static let keptAudioSuffix = ".wivra.kept.json"

    private static func directory() throws -> URL {
        let folder = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("WivraRecordings", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder.standardizedFileURL
    }

    private static func safeName(_ name: String) -> Bool {
        guard !name.isEmpty, name.count <= 255, name != ".", name != "..",
              !name.contains("/"), !name.contains("\\"),
              !name.contains("\n"), !name.contains("\r"), !name.contains("\0") else {
            return false
        }
        return name.hasPrefix("Wivra_Meta_") || name.hasPrefix("Wivra_Audio_")
    }

    private static func checkedURL(_ url: URL, in folder: URL) throws -> URL {
        let candidate = url.standardizedFileURL
        let exists = FileManager.default.fileExists(atPath: candidate.path)
        let isLink = exists
            ? ((try? candidate.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) ?? true)
            : false // Expected manifest may not yet have been written.
        guard candidate.isFileURL, candidate.deletingLastPathComponent() == folder,
              safeName(candidate.lastPathComponent), !isLink
        else { throw WivraPendingRecordingError.invalidPath }
        return candidate
    }

    private static func ticketURL(videoName: String, folder: URL) -> URL {
        folder.appendingPathComponent(videoName + suffix)
    }

    /** Stage already finalized source video plus any actual CAF/MOV/manifest outputs. */
    @discardableResult
    static func stage(videoURL: URL, related: [URL]) throws -> WivraPendingRecording {
        let folder = try directory()
        let video = try checkedURL(videoURL, in: folder)
        guard video.pathExtension.lowercased() == "mov",
              FileManager.default.fileExists(atPath: video.path) else {
            throw WivraPendingRecordingError.missingVideo
        }
        let files = try [videoURL].addingUnique(related).map {
            try checkedURL($0, in: folder).lastPathComponent
        }
        let entry = WivraPendingRecording(
            id: video.lastPathComponent, createdAt: Date(), files: files
        )
        try JSONEncoder().encode(entry).write(
            to: ticketURL(videoName: entry.id, folder: folder), options: [.atomic]
        )
        return entry
    }

    /** Stage a real, non-empty CAF when no usable Ray-Ban video was produced. */
    @discardableResult
    static func stageAudio(_ audioURL: URL) throws -> WivraPendingRecording {
        let folder = try directory()
        let audio = try checkedURL(audioURL, in: folder)
        guard audio.lastPathComponent.range(
            of: #"^Wivra_Audio_[0-9A-Fa-f-]{36}\.caf$"#,
            options: .regularExpression
        ) != nil, FileManager.default.fileExists(atPath: audio.path),
        let caf = try? AVAudioFile(forReading: audio), caf.length > 0 else {
            throw WivraPendingRecordingError.missingAudio
        }
        let entry = WivraPendingRecording(
            id: audio.lastPathComponent, createdAt: Date(), files: [audio.lastPathComponent]
        )
        try JSONEncoder().encode(entry).write(
            to: ticketURL(videoName: entry.id, folder: folder), options: [.atomic]
        )
        return entry
    }

    /**
     * A process may stop after the CAF has closed but before its video was
     * finalized. Recover only standalone, readable audio with no existing
     * decision ticket and no reference in an already-kept v2 manifest.
     * Never delete or reinterpret an in-progress video as a saved clip.
     */
    @discardableResult
    static func recoverOrphanedAudio() -> Int {
        guard let folder = try? directory(),
              let urls = try? FileManager.default.contentsOfDirectory(
                at: folder, includingPropertiesForKeys: nil
              ) else { return 0 }
        let claimed = Set(pending().flatMap(\.files))
        var usedByVideo = Set<String>()
        for json in urls where json.lastPathComponent.hasSuffix(".wivra.json") {
            guard let data = try? Data(contentsOf: json),
                  let manifest = try? JSONDecoder().decode(
                    WivraCaptureManifest.self, from: data
                  ) else { continue }
            if let name = manifest.originalAudioFile { usedByVideo.insert(name) }
            for track in manifest.tracks { usedByVideo.insert(track.file) }
        }
        var count = 0
        for url in urls {
            let name = url.lastPathComponent
            guard name.range(
                of: #"^Wivra_Audio_[0-9A-Fa-f-]{36}\.caf$"#,
                options: .regularExpression
            ) != nil, !claimed.contains(name), !usedByVideo.contains(name),
            !FileManager.default.fileExists(atPath:
                folder.appendingPathComponent(name + keptAudioSuffix).path),
            (try? checkedURL(url, in: folder)) != nil,
            (try? stageAudio(url)) != nil else { continue }
            count += 1
        }
        return count
    }

    /** Kept audio-only captures can be shared from Wivra's native catalog. */
    static func savedAudioOnlyURLs() -> [URL] {
        guard let folder = try? directory(),
              let urls = try? FileManager.default.contentsOfDirectory(
                at: folder, includingPropertiesForKeys: nil
              ) else { return [] }
        let claimed = Set(pending().flatMap(\.files))
        let manifests = urls.compactMap { url -> WivraCaptureManifest? in
            guard url.lastPathComponent.hasSuffix(".wivra.json"),
                let data = try? Data(contentsOf: url) else { return nil }
            return try? JSONDecoder().decode(WivraCaptureManifest.self, from: data)
        }
        let linked = Set(manifests.flatMap { m -> [String] in
            (m.originalAudioFile.map { [$0] } ?? []) + m.tracks.map(\.file)
        })
        return urls.filter { url in
            let name = url.lastPathComponent
            guard name.range(of: #"^Wivra_Audio_[0-9A-Fa-f-]{36}\.caf$"#,
                             options: .regularExpression) != nil,
                  !claimed.contains(name), !linked.contains(name),
                  FileManager.default.fileExists(atPath:
                    folder.appendingPathComponent(name + keptAudioSuffix).path),
                  (try? checkedURL(url, in: folder)) != nil,
                  let caf = try? AVAudioFile(forReading: url), caf.length > 0
            else { return false }
            return true
        }.sorted { $0.lastPathComponent < $1.lastPathComponent }
    }

    /** Existing files can be listed after process restart without deleting them. */
    static func pending() -> [WivraPendingRecording] {
        guard let folder = try? directory(),
              let contents = try? FileManager.default.contentsOfDirectory(
                  at: folder, includingPropertiesForKeys: nil
              ) else { return [] }
        return contents
            .filter { $0.lastPathComponent.hasSuffix(suffix) }
            .compactMap { marker -> WivraPendingRecording? in
                guard let data = try? Data(contentsOf: marker),
                      let entry = try? JSONDecoder().decode(WivraPendingRecording.self, from: data),
                      safeName(entry.id),
                      (entry.id.hasSuffix(".mov") || entry.id.hasSuffix(".caf")),
                      marker.lastPathComponent == entry.id + suffix,
                      entry.files.contains(entry.id),
                      entry.files.allSatisfy(safeName)
                else { return nil }
                return entry
            }
            .sorted { $0.createdAt < $1.createdAt }
    }

    static func isPendingVideo(_ videoURL: URL) -> Bool {
        guard let folder = try? directory(),
              let url = try? checkedURL(videoURL, in: folder) else { return false }
        // Grouped checkpoints share ONE decision ticket. All video segments
        // must remain hidden from the editor until that decision is resolved.
        return pending().contains { $0.files.contains(url.lastPathComponent) }
    }

    /**
     * Recovery on app relaunch: discover only finalized, specifically named
     * MOV checkpoints which have no complete manifest set and no pending ticket.
     * Never offer a partial *.writing.mov as completed video. No files deleted.
     */
    @discardableResult
    static func recoverUnstagedCheckpoints() -> Int {
        guard let folder = try? directory(),
              let urls = try? FileManager.default.contentsOfDirectory(
                  at: folder, includingPropertiesForKeys: nil
              ) else { return 0 }
        let segmentPattern = #"^Wivra_Meta_[0-9a-f]{32}_part[0-9]{4}\.mov$"#
        let candidates = urls.filter {
            $0.lastPathComponent.range(of: segmentPattern, options: .regularExpression) != nil &&
            !((try? $0.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) ?? true)
        }
        let existing = pending()
        let groups = Dictionary(grouping: candidates) {
            String($0.lastPathComponent.dropLast("_part0001.mov".count))
        }
        var recovered = 0
        for (_, files) in groups {
            let sorted = files.sorted { $0.lastPathComponent < $1.lastPathComponent }
            guard let first = sorted.first,
                  !existing.contains(where: { $0.files.contains(first.lastPathComponent) })
            else { continue }
            // If every part already has its capture manifest, the user
            // previously chose Keep. Never start questioning it again.
            let allManifested = sorted.allSatisfy {
                FileManager.default.fileExists(atPath:
                    $0.deletingPathExtension().appendingPathExtension("wivra.json").path)
            }
            if allManifested { continue }
            let related = sorted.flatMap {
                [$0, $0.deletingPathExtension().appendingPathExtension("wivra.json")]
            }
            if (try? stage(videoURL: first, related: related)) != nil {
                recovered += 1
            }
        }
        return recovered
    }

    private static func verifiedTicket(_ entry: WivraPendingRecording) throws -> (URL, WivraPendingRecording) {
        let folder = try directory()
        guard safeName(entry.id),
              (entry.id.hasSuffix(".mov") || entry.id.hasSuffix(".caf")) else {
            throw WivraPendingRecordingError.invalidSelection
        }
        let marker = ticketURL(videoName: entry.id, folder: folder)
        let stored = try JSONDecoder().decode(
            WivraPendingRecording.self, from: Data(contentsOf: marker)
        )
        guard stored.id == entry.id, stored.files == entry.files,
              stored.files.contains(entry.id), stored.files.allSatisfy(safeName) else {
            throw WivraPendingRecordingError.invalidSelection
        }
        return (marker, stored)
    }

    /**
     * Review is read-only and local. The editor and Photos gallery remain
     * unavailable until the user explicitly chooses Keep.
     *
     * Never trust unchecked filenames from a JSON ticket, including symlinks.
     * Video chunks may be viewed independently; they are NOT one merged movie.
     */
    static func previewVideoURLs(_ entry: WivraPendingRecording) throws -> [URL] {
        let (_, stored) = try verifiedTicket(entry)
        let folder = try directory()
        var clips: [URL] = []
        for name in stored.files.sorted() where name.lowercased().hasSuffix(".mov") {
            let url = try checkedURL(folder.appendingPathComponent(name), in: folder)
            guard FileManager.default.fileExists(atPath: url.path),
                  !name.hasSuffix(".writing.mov"),
                  let metadata = try? FileManager.default.attributesOfItem(atPath: url.path),
                  let size = metadata[.size] as? NSNumber,
                  size.int64Value > 0 else { continue }
            clips.append(url)
        }
        return clips
    }

    /** Preview only an explicitly staged CAF; never publish audio to the editor. */
    static func previewAudioURLs(_ entry: WivraPendingRecording) throws -> [URL] {
        let (_, stored) = try verifiedTicket(entry)
        let folder = try directory()
        return try stored.files.filter { $0.hasSuffix(".caf") }.compactMap { name in
            let url = try checkedURL(folder.appendingPathComponent(name), in: folder)
            guard FileManager.default.fileExists(atPath: url.path),
                let caf = try? AVAudioFile(forReading: url), caf.length > 0 else {
                return nil
            }
            return url
        }
    }

    /** Save means keep existing files in Wivra; it does NOT upload to iCloud/Photos. */
    static func keep(_ entry: WivraPendingRecording) async throws {
        let (marker, stored) = try verifiedTicket(entry)
        let folder = marker.deletingLastPathComponent()
        guard FileManager.default.fileExists(
            atPath: folder.appendingPathComponent(stored.id).path
        ) else { throw WivraPendingRecordingError.missingVideo }
        // Verify every referenced MOV/CAF before releasing the grouped ticket.
        // Any missing/corrupt segment leaves the decision and ALL originals intact.
        for name in stored.files {
            let url = try checkedURL(folder.appendingPathComponent(name), in: folder)
            if name.hasSuffix(".mov") {
                guard !name.hasSuffix(".writing.mov"),
                      await WivraCaptureMediaVerifier.verifyFile(url, in: folder) else {
                    throw WivraPendingRecordingError.missingVideo
                }
            } else if name.hasSuffix(".caf") {
                guard WivraCaptureMediaVerifier.verifyAudioFile(url, in: folder) else {
                    throw WivraPendingRecordingError.missingAudio
                }
            }
        }
        // Validation suspends: ensure the decision ticket did not change meanwhile.
        _ = try verifiedTicket(entry)
        if stored.id.hasSuffix(".caf") {
            // Publish explicit user consent before removing the pending ticket.
            // An orphaned CAF without this marker must never appear as "kept".
            let kept = folder.appendingPathComponent(stored.id + keptAudioSuffix)
            try Data("{\"decision\":\"keep\"}".utf8).write(to: kept, options: [.atomic])
        }
        try FileManager.default.removeItem(at: marker)
    }

    /** Called ONLY after an additional destructive-action confirmation. */
    static func discardConfirmed(_ entry: WivraPendingRecording) throws {
        let (marker, stored) = try verifiedTicket(entry)
        let folder = marker.deletingLastPathComponent()
        for name in stored.files {
            let url = try checkedURL(folder.appendingPathComponent(name), in: folder)
            if FileManager.default.fileExists(atPath: url.path) {
                try FileManager.default.removeItem(at: url)
            }
        }
        // If a deletion fails, the marker and remaining originals stay available.
        try FileManager.default.removeItem(at: marker)
    }
}

private extension Array where Element == URL {
    func addingUnique(_ other: [URL]) -> [URL] {
        var seen = Set<String>()
        return (self + other).filter { seen.insert($0.standardizedFileURL.path).inserted }
    }
}
