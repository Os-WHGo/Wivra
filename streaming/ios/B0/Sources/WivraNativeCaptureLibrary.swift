// Wivra B1L: discover only the app's own completed capture manifests and media.
// This screen is a local catalog, not an editor import or a cloud library.
import Foundation
import SwiftUI

struct WivraStoredCapture: Identifiable {
    let id: String
    let recordedAt: Date
    let source: String
    let manifestURL: URL
    let videoURL: URL?
    // If both original and combined MOV exist, provide a playback fallback.
    let alternateVideoURL: URL?
    let audioURLs: [URL]
    let missing: [String]

    // Segment index is a filename fact, NOT evidence that more files exist.
    // A short take can have only _part0001.mov and already be complete.
    // Derive the index without changing or publishing the local media.
    var segmentNumber: Int? {
        guard let name = videoURL?.lastPathComponent,
              name.range(of: #"_part[0-9]{4}\.mov$"#, options: .regularExpression) != nil
        else { return nil }
        return Int(String(name.dropLast(".mov".count).suffix(4)))
    }
}

struct WivraStoredCaptureDay: Identifiable {
    let id: Date
    let ordinal: Int
    let captures: [WivraStoredCapture]
}

enum WivraLocalCaptureScanner {
    private static func safeName(_ name: String) -> Bool {
        !name.isEmpty && name != "." && name != ".." && name.count <= 255 &&
        !name.contains("/") && !name.contains("\\") &&
        !name.contains("\n") && !name.contains("\r") && !name.contains("\0")
    }

    // A safe basename alone is insufficient: a symlink inside the recording
    // directory could point outside the app's private capture folder.
    private static func regularCaptureFile(_ url: URL, in folder: URL) -> Bool {
        let rawProperties = try? url.resourceValues(forKeys: [.isSymbolicLinkKey])
        guard rawProperties?.isSymbolicLink != true else { return false }
        let resolvedFolder = folder.resolvingSymlinksInPath().standardizedFileURL
        let resolvedFile = url.resolvingSymlinksInPath().standardizedFileURL
        guard resolvedFile.deletingLastPathComponent() == resolvedFolder else { return false }
        let values = try? resolvedFile.resourceValues(
            forKeys: [.isRegularFileKey, .fileSizeKey]
        )
        // A zero-byte MP4/MOV/CAF (or manifest) is not an importable capture.
        return values?.isRegularFile == true && (values?.fileSize ?? 0) > 0
    }

    static func read() -> (days: [WivraStoredCaptureDay], rejected: Int) {
        let fm = FileManager.default
        let root = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dateFormat = ISO8601DateFormatter()
        let fractionalDateFormat = ISO8601DateFormatter()
        fractionalDateFormat.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var items: [WivraStoredCapture] = []
        var seen = Set<String>()
        var rejected = 0

        // These are the existing, app-local camera recording folders.
        for folderName in ["WivraRecordings", "WivraIPhoneMedia"] {
            let folder = root.appendingPathComponent(folderName, isDirectory: true)
            guard let urls = try? fm.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil) else { continue }
            for manifestURL in urls where manifestURL.lastPathComponent.hasSuffix(".wivra.json") {
                guard regularCaptureFile(manifestURL, in: folder),
                      let manifestBytes = try? manifestURL.resourceValues(forKeys: [.fileSizeKey]).fileSize,
                      manifestBytes <= 128 * 1024 else {
                        rejected += 1
                        continue
                    }
                do {
                    let data = try Data(contentsOf: manifestURL)
                    let m = try JSONDecoder().decode(WivraCaptureManifest.self, from: data)
                    // Disk manifests are untrusted until their format and
                    // references have been checked. Never offer malformed
                    // channel indexes or nonexistent mux references as ready.
                    let trackIds = Set(m.tracks.map(\.id))
                    let muxIds = Set(m.muxedFromTrackIDs)
                    guard m.schemaVersion == 2,
                          !m.captureID.isEmpty, m.captureID.count <= 200,
                          !seen.contains(m.captureID),
                          !m.cameraSource.isEmpty,
                          safeName(m.originalVideoFile),
                          m.muxedVideoFile.map(safeName) ?? true,
                          m.tracks.count <= 32,
                          trackIds.count == m.tracks.count,
                          muxIds.count == m.muxedFromTrackIDs.count,
                          muxIds.isSubset(of: trackIds),
                          m.muxedVideoFile != nil || muxIds.isEmpty,
                          m.tracks.allSatisfy({
                              $0.kind == "audio" && !$0.id.isEmpty &&
                              safeName($0.file) &&
                              ($0.channelIndex.map { $0 >= 0 } ?? true) &&
                              ($0.channelCount.map { $0 > 0 } ?? true) &&
                              ($0.channelIndex == nil || $0.channelCount == nil ||
                                  $0.channelIndex! < $0.channelCount!) &&
                              ($0.sampleRateHz.map { $0.isFinite && $0 > 0 } ?? true) &&
                              ($0.startOffsetSeconds.map { $0.isFinite } ?? true)
                          }) else {
                        rejected += 1
                        continue
                    }
                    guard let date = fractionalDateFormat.date(from: m.createdAtISO8601)
                        ?? dateFormat.date(from: m.createdAtISO8601) else {
                        rejected += 1
                        continue
                    }
                    // Never offer an undecided recording to Claude's editor.
                    // User may choose Keep, Discard (double confirmed), or Later.
                    let candidateVideo = folder.appendingPathComponent(m.originalVideoFile)
                    if WivraPendingRecordingStore.isPendingVideo(candidateVideo) {
                        continue
                    }
                    seen.insert(m.captureID)
                    let original = folder.appendingPathComponent(m.originalVideoFile)
                    let combined = m.muxedVideoFile.map { folder.appendingPathComponent($0) }
                    let video = regularCaptureFile(original, in: folder) ? original :
                        (combined.flatMap { regularCaptureFile($0, in: folder) ? $0 : nil })
                    let alternateVideoURL = video == original && combined != nil &&
                        regularCaptureFile(combined!, in: folder) ? combined : nil
                    let audio = Set(m.tracks.map(\.file)).sorted()
                    let audioURLs = audio.compactMap { name -> URL? in
                        let url = folder.appendingPathComponent(name)
                        return regularCaptureFile(url, in: folder) ? url : nil
                    }
                    var names = Set(audio)
                    names.insert(m.originalVideoFile)
                    if let muxed = m.muxedVideoFile { names.insert(muxed) }
                    let missing = names.sorted().filter {
                        !regularCaptureFile(folder.appendingPathComponent($0), in: folder)
                    }
                    items.append(WivraStoredCapture(
                        id: m.captureID, recordedAt: date,
                        source: m.cameraSource == "iphone-avfoundation" ? "iPhone" : "Ray-Ban Meta",
                        manifestURL: manifestURL, videoURL: video,
                        alternateVideoURL: alternateVideoURL,
                        audioURLs: audioURLs, missing: missing
                    ))
                } catch {
                    rejected += 1
                }
            }
        }

        items.sort { $0.recordedAt == $1.recordedAt ? $0.id < $1.id : $0.recordedAt < $1.recordedAt }
        let cal = Calendar.current
        let dates = Array(Set(items.map { cal.startOfDay(for: $0.recordedAt) })).sorted()
        let days = dates.enumerated().map { number, date in
            WivraStoredCaptureDay(
                id: date, ordinal: number + 1,
                captures: items.filter { cal.isDate($0.recordedAt, inSameDayAs: date) }
            )
        }
        return (days, rejected)
    }
}

struct WivraNativeCaptureLibraryScreen: View {
    @Environment(\.dismiss) private var dismiss
    @State private var days: [WivraStoredCaptureDay] = []
    @State private var rejected = 0
    @State private var recoveredAudio: [URL] = []
    @State private var photosSavingCaptureID: String?
    @State private var photosSavedCaptureIDs = Set<String>()
    @State private var photosSavedOriginalOnly = Set<String>()
    @State private var photosError: String?
    @State private var confirmedPartGroups: [String: [URL]] = [:]
    @State private var joinedPartGroups = Set<String>()
    @State private var joiningGroup: String?
    @State private var joinFailure: String?

    // Read only previously confirmed files from WivraLocalCaptureScanner.
    // Never discover or join undecided recordings by scanning raw MOV names.
    private func groupKey(for url: URL) -> String? {
        let filename = url.lastPathComponent
        guard let range = filename.range(
            of: #"_part[0-9]{4}\.mov$"#, options: .regularExpression
        ) else { return nil }
        let prefix = String(filename[..<range.lowerBound])
        return url.deletingLastPathComponent()
            .appendingPathComponent(prefix).standardizedFileURL.path
    }

    private func refresh() {
        let result = WivraLocalCaptureScanner.read()
        days = result.days
        rejected = result.rejected
        recoveredAudio = WivraPendingRecordingStore.savedAudioOnlyURLs()

        var groups: [String: [URL]] = [:]
        var joined = Set<String>()
        for capture in result.days.flatMap(\.captures) {
            guard let url = capture.videoURL, capture.source == "Ray-Ban Meta"
            else { continue }
            if let key = groupKey(for: url) {
                groups[key, default: []].append(url)
            } else if url.lastPathComponent.hasSuffix("_complete.mov") {
                let prefix = String(url.lastPathComponent.dropLast("_complete.mov".count))
                joined.insert(url.deletingLastPathComponent()
                    .appendingPathComponent(prefix).standardizedFileURL.path)
            }
        }
        confirmedPartGroups = groups.mapValues { $0.sorted {
            $0.lastPathComponent < $1.lastPathComponent
        } }
        joinedPartGroups = joined
    }

    // Keep the user's Photos gallery to ONE complete movie per take.
    // Parts remain shareable locally for recovery, but a multi-part take
    // cannot publish any individual _partNNNN.mov through the Photos button.
    // A short complete single-part take (_part0001.mov) remains eligible.
    private func maySaveToPhotos(_ item: WivraStoredCapture, video: URL) -> Bool {
        // The iPhone camera's own media does not use Meta segment receipts.
        if item.source != "Ray-Ban Meta" { return item.segmentNumber == nil }
        guard WivraSegmentedTakeReceipt.verifiedComplete(for: video) else {
            return false
        }
        guard let segment = item.segmentNumber else { return true }
        guard segment == 1,
              let group = groupKey(for: video),
              let parts = confirmedPartGroups[group],
              parts.count == 1,
              !joinedPartGroups.contains(group) else { return false }
        return true
    }

    private func retryJoin(group key: String, parts: [URL]) {
        guard joiningGroup == nil else { return }
        joiningGroup = key
        joinFailure = nil
        Task { @MainActor in
            defer { joiningGroup = nil }
            do {
                _ = try await WivraSegmentedCaptureJoiner.joinConfirmed(parts)
                refresh()
            } catch {
                joinFailure = error.localizedDescription
            }
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("ios.library.intro")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    if rejected > 0 {
                        Text(String(format: NSLocalizedString("ios.library.rejected", comment: ""), rejected))
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                    if let joinFailure {
                        Text("ios.capture.join_failed")
                            .font(.caption)
                            .foregroundStyle(.orange)
                        Text(joinFailure)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                if days.isEmpty && recoveredAudio.isEmpty {
                    ContentUnavailableView("ios.library.empty", systemImage: "film.stack",
                                           description: Text("ios.library.empty_description"))
                }
                if !recoveredAudio.isEmpty {
                    Section {
                        Text("ios.library.recovered_audio_note")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        ForEach(recoveredAudio, id: \.absoluteString) { url in
                            ShareLink(item: url) {
                                Label("ios.library.share_recovered_audio", systemImage: "waveform")
                            }
                        }
                    } header: {
                        Text("ios.library.recovered_audio_title")
                    }
                }
                ForEach(days) { day in
                    Section(String(format: NSLocalizedString("ios.library.day", comment: ""), day.ordinal, day.id.formatted(date: .abbreviated, time: .omitted))) {
                        ForEach(day.captures) { item in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(item.source).font(.headline)
                                Text(item.recordedAt.formatted(date: .omitted, time: .shortened))
                                    .font(.caption).foregroundStyle(.secondary)
                                if let segmentNumber = item.segmentNumber {
                                    Text(String(format: NSLocalizedString("ios.capture.individual_segment",
                                                                          comment: ""),
                                                segmentNumber))
                                        .font(.caption)
                                        .foregroundStyle(.orange)
                                        .accessibilityIdentifier("wivra_library_segment_number")
                                }
                                if let video = item.videoURL {
                                    // If the app was closed, storage was insufficient, or
                                    // the join failed, the kept original parts remain in
                                    // Mis capturas and can be joined without recording again.
                                    if item.segmentNumber == 1,
                                       let group = groupKey(for: video),
                                       let parts = confirmedPartGroups[group],
                                       parts.count > 1 && !joinedPartGroups.contains(group) &&
                                       WivraSegmentedTakeReceipt.verifiedComplete(for: video) {
                                        Button {
                                            retryJoin(group: group, parts: parts)
                                        } label: {
                                            Label("ios.capture.retry_join", systemImage: "square.stack.3d.up")
                                        }
                                        .disabled(joiningGroup != nil)
                                        .accessibilityIdentifier("wivra_library_retry_join")
                                        if joiningGroup == group {
                                            Text("ios.capture.joining")
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                    ShareLink(item: video) {
                                        // A computed String is not an implicit
                                        // LocalizedStringKey in SwiftUI.
                                        Label(item.segmentNumber == nil
                                              ? NSLocalizedString("ios.library.share_video", comment: "")
                                              : NSLocalizedString("ios.capture.share_segment_only", comment: ""),
                                              systemImage: "square.and.arrow.up")
                                    }
                                    if maySaveToPhotos(item, video: video) {
                                        // Photos is add-only and explicit. For multipart takes
                                        // only the validated _complete.mov catalog item offers
                                        // this action. The originals stay in Wivra.
                                        let preferredPhotosURL = item.alternateVideoURL ?? video
                                        Button {
                                            photosSavingCaptureID = item.id
                                            Task { @MainActor in
                                                defer { photosSavingCaptureID = nil }
                                                do {
                                                    let originalOnly = try await WivraPhotosLibrary.savePreferredVideo(
                                                        preferredPhotosURL,
                                                        fallback: item.alternateVideoURL == nil ? nil : video
                                                    )
                                                    photosSavedCaptureIDs.insert(item.id)
                                                    if originalOnly { photosSavedOriginalOnly.insert(item.id) }
                                                } catch {
                                                    photosError = error.localizedDescription
                                                }
                                            }
                                        } label: {
                                            Label(photosSavedCaptureIDs.contains(item.id)
                                                  ? "ios.exports.saved_photos" : "ios.exports.save_photos",
                                                  systemImage: "square.and.arrow.down")
                                        }
                                        .disabled(photosSavingCaptureID != nil ||
                                                  photosSavedCaptureIDs.contains(item.id))
                                        .accessibilityIdentifier("wivra_capture_library_save_photos")
                                        if photosSavedOriginalOnly.contains(item.id) {
                                            Text("ios.library.photos_original_only")
                                                .font(.caption)
                                                .foregroundStyle(.orange)
                                        }
                                    } else if item.segmentNumber != nil {
                                        if !WivraSegmentedTakeReceipt.verifiedComplete(for: video) {
                                            Text("ios.capture.take_not_finalized")
                                                .font(.caption)
                                                .foregroundStyle(.orange)
                                                .accessibilityIdentifier("wivra_library_incomplete_take")
                                        }
                                        Text("ios.capture.parts_private_gallery")
                                            .font(.caption)
                                            .foregroundStyle(.orange)
                                            .accessibilityIdentifier("wivra_library_parts_private_notice")
                                    }
                                } else {
                                    Text("ios.library.video_missing")
                                        .font(.caption).foregroundStyle(.orange)
                                }
                                ForEach(item.audioURLs, id: \.absoluteString) { url in
                                    ShareLink(item: url) { Label(String(format: NSLocalizedString("ios.library.share_audio", comment: ""), url.lastPathComponent), systemImage: "waveform") }
                                }
                                ShareLink(item: item.manifestURL) {
                                    Label("ios.library.share_manifest", systemImage: "doc")
                                }
                                if !item.missing.isEmpty {
                                    Text(String(format: NSLocalizedString("ios.library.pending_files", comment: ""), item.missing.joined(separator: ", ")))
                                        .font(.caption).foregroundStyle(.orange)
                                }
                            }
                            .accessibilityElement(children: .contain)
                        }
                    }
                }
            }
            .navigationTitle("ios.library.title")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("ios.library.close") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("ios.library.refresh", systemImage: "arrow.clockwise") { refresh() }
                }
            }
            .onAppear { refresh() }
            .alert("ios.exports.photos_error", isPresented: Binding(
                get: { photosError != nil },
                set: { if !$0 { photosError = nil } }
            )) {
                Button("OK", role: .cancel) { photosError = nil }
            } message: {
                Text(photosError ?? "")
            }
        }
    }
}
