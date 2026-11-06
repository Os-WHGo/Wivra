// W100 (Claude, owner decision 1A): the Wivra app's side of iPhone screen recording.
// The ReplayKit extension leaves each recording in the App Group folder. Here the
// person chooses, per recording, "Pasar a Wivra" (checked, then moved into the
// app's own capture folder with a manifest v2, so it shows up in Mis capturas and
// in the editor's Import list) or "Eliminar" (after confirmation). Nothing is ever
// moved or deleted on its own, and nothing leaves the iPhone.
import Foundation

struct WivraScreenRecording: Identifiable, Equatable {
    let id: String
    let folder: URL
    let session: WivraScreenRecordShared.Session
    let startedAt: Date?
    let bytes: Int64
    /// Not closed cleanly (iOS ended the extension): the fragments written so far may still play.
    let interrupted: Bool
}

enum WivraScreenRecordInbox {
    private typealias Shared = WivraScreenRecordShared

    enum Failure: Error { case notReady, videoUnreadable, cannotMove }

    private static func regularFile(_ url: URL, in folder: URL) -> Bool {
        guard let v = try? url.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey, .fileSizeKey]),
              v.isSymbolicLink == false, v.isRegularFile == true, (v.fileSize ?? 0) > 0 else { return false }
        return url.resolvingSymlinksInPath().standardizedFileURL.deletingLastPathComponent() ==
            folder.resolvingSymlinksInPath().standardizedFileURL
    }

    /// Recordings waiting for a decision. One still being written (fresh session file,
    /// not finished) is left alone, so its files are never touched while in use.
    static func list(now: Date = Date()) -> [WivraScreenRecording] {
        guard let root = Shared.root(),
              let dirs = try? FileManager.default.contentsOfDirectory(
                at: root, includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey]) else { return [] }
        var found: [WivraScreenRecording] = []
        for dir in dirs {
            let name = dir.lastPathComponent
            guard Shared.safeID(name),
                  let v = try? dir.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey]),
                  v.isDirectory == true, v.isSymbolicLink == false else { continue }
            let sessionURL = dir.appendingPathComponent(Shared.sessionFile)
            guard regularFile(sessionURL, in: dir),
                  let size = try? sessionURL.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= 16 * 1024,
                  let data = try? Data(contentsOf: sessionURL),
                  let session = try? JSONDecoder().decode(Shared.Session.self, from: data),
                  session.id == name,
                  Shared.safeName(session.videoFile), Shared.safeName(session.appAudioFile),
                  Shared.safeName(session.micAudioFile) else { continue }
            let modified = (try? sessionURL.resourceValues(forKeys: [.contentModificationDateKey]))?
                .contentModificationDate ?? .distantPast
            let videoURL = dir.appendingPathComponent(session.videoFile)
            let videoModified = (try? videoURL.resourceValues(forKeys: [.contentModificationDateKey]))?
                .contentModificationDate ?? .distantPast
            let lastWrite = max(modified, videoModified)
            if !session.finished && now.timeIntervalSince(lastWrite) < Shared.staleSeconds { continue }
            guard regularFile(videoURL, in: dir) else { continue }
            var bytes: Int64 = 0
            for file in [session.videoFile, session.appAudioFile, session.micAudioFile].compactMap({ $0 }) {
                bytes += Int64((try? dir.appendingPathComponent(file).resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0)
            }
            found.append(WivraScreenRecording(
                id: name, folder: dir, session: session,
                startedAt: ISO8601DateFormatter().date(from: session.startedAtISO8601),
                bytes: bytes, interrupted: !session.finished))
        }
        return found.sorted { ($0.startedAt ?? .distantPast) > ($1.startedAt ?? .distantPast) }
    }

    /// Checks the video (and each sound file), moves them into Wivra's capture folder and
    /// writes a manifest v2 there. A sound file that does not pass the check is left out
    /// (the video is still imported); a video that does not pass stops everything.
    static func importRecording(_ item: WivraScreenRecording) async throws -> URL {
        guard await WivraCaptureMediaVerifier.verifyFile(
            item.folder.appendingPathComponent(item.session.videoFile), in: item.folder) else { throw Failure.videoUnreadable }
        let fm = FileManager.default
        let destination = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("WivraIPhoneMedia", isDirectory: true)
        try fm.createDirectory(at: destination, withIntermediateDirectories: true)

        var tracks: [WivraCaptureTrack] = []
        var toMove = [item.session.videoFile]
        let sounds: [(String?, Double?, String, String, String)] = [
            (item.session.micAudioFile, item.session.micAudioStart, "audio-1", "voice_primary", "ios-replaykit-mic"),
            (item.session.appAudioFile, item.session.appAudioStart, "audio-2", "other", "ios-replaykit-app"),
        ]
        for (file, start, id, role, source) in sounds {
            guard let file, WivraCaptureMediaVerifier.verifyAudioFile(item.folder.appendingPathComponent(file), in: item.folder)
            else { continue }
            toMove.append(file)
            tracks.append(WivraCaptureTrack(
                id: id, kind: "audio", role: role, source: source, file: file,
                channelIndex: nil, sampleRateHz: nil, channelCount: nil, inputName: nil,
                startOffsetSeconds: Shared.offset(audio: start, video: item.session.videoStart)))
        }
        // Never overwrite something already in the capture folder.
        guard toMove.allSatisfy({ !fm.fileExists(atPath: destination.appendingPathComponent($0).path) }) else {
            throw Failure.cannotMove
        }
        var moved: [String] = []
        do {
            for file in toMove {
                try fm.moveItem(at: item.folder.appendingPathComponent(file), to: destination.appendingPathComponent(file))
                moved.append(file)
            }
            let manifest = try WivraCaptureManifest.write(
                videoURL: destination.appendingPathComponent(item.session.videoFile),
                tracks: tracks, mergedURL: nil, cameraSource: "ios-replaykit-screen", writeOnce: true)
            // Only the now-empty session folder (and any sound left out) is removed.
            try? fm.removeItem(at: item.folder)
            return manifest
        } catch {
            // Put back what was moved: the recording stays reviewable where it was.
            for file in moved {
                try? fm.moveItem(at: destination.appendingPathComponent(file), to: item.folder.appendingPathComponent(file))
            }
            throw Failure.cannotMove
        }
    }

    /// Deletes one recording; the screen asks for confirmation first.
    static func discard(_ item: WivraScreenRecording) -> Bool {
        guard let root = Shared.root(),
              item.folder.standardizedFileURL.deletingLastPathComponent() == root.standardizedFileURL,
              Shared.safeID(item.folder.lastPathComponent) else { return false }
        return (try? FileManager.default.removeItem(at: item.folder)) != nil
    }
}
