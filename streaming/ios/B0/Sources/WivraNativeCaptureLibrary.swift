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
                do {
                    let data = try Data(contentsOf: manifestURL)
                    let m = try JSONDecoder().decode(WivraCaptureManifest.self, from: data)
                    guard m.schemaVersion == 2, !m.captureID.isEmpty,
                          !seen.contains(m.captureID),
                          safeName(m.originalVideoFile),
                          m.muxedVideoFile.map(safeName) ?? true,
                          m.tracks.allSatisfy({ safeName($0.file) }) else {
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
                    let video = fm.fileExists(atPath: original.path) ? original :
                        (combined.flatMap { fm.fileExists(atPath: $0.path) ? $0 : nil })
                    let alternateVideoURL = video == original && combined != nil &&
                        fm.fileExists(atPath: combined!.path) ? combined : nil
                    let audio = Set(m.tracks.map(\.file)).sorted()
                    let audioURLs = audio.compactMap { name -> URL? in
                        let url = folder.appendingPathComponent(name)
                        return fm.fileExists(atPath: url.path) ? url : nil
                    }
                    var names = Set(audio)
                    names.insert(m.originalVideoFile)
                    if let muxed = m.muxedVideoFile { names.insert(muxed) }
                    let missing = names.sorted().filter {
                        !fm.fileExists(atPath: folder.appendingPathComponent($0).path)
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

    private func refresh() {
        let result = WivraLocalCaptureScanner.read()
        days = result.days
        rejected = result.rejected
        recoveredAudio = WivraPendingRecordingStore.savedAudioOnlyURLs()
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
                                if let video = item.videoURL {
                                    ShareLink(item: video) { Label("ios.library.share_video", systemImage: "square.and.arrow.up") }
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
        }
    }
}
