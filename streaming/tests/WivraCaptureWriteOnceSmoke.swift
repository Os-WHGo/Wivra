import Foundation

@main
struct WivraCaptureWriteOnceSmoke {
    static func check(_ condition: Bool, _ reason: String) {
        guard condition else { fatalError("W70: " + reason) }
        print("PASS: " + reason)
    }

    static func main() throws {
        let fm = FileManager.default
        let folder = fm.temporaryDirectory.appendingPathComponent(
            "wivra-w70-write-once-\(UUID().uuidString)", isDirectory: true)
        try fm.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: folder) }
        let video = folder.appendingPathComponent(
            "Wivra_01234567-89AB-CDEF-0123-456789ABCDEF.mov")
        let manifest = video.deletingPathExtension().appendingPathExtension("wivra.json")
        let first = try WivraCaptureManifest.write(
            videoURL: video, tracks: [], mergedURL: nil,
            cameraSource: "iphone-avfoundation", writeOnce: true)
        check(first == manifest && fm.fileExists(atPath: manifest.path),
              "first verified recovery can publish")
        let original = try Data(contentsOf: manifest)
        var refusedDuplicate = false
        do {
            _ = try WivraCaptureManifest.write(
                videoURL: video, tracks: [], mergedURL: nil,
                cameraSource: "iphone-avfoundation", writeOnce: true)
        } catch { refusedDuplicate = true }
        check(refusedDuplicate && (try Data(contentsOf: manifest)) == original,
              "repeat publication cannot replace original capture manifest")

        let secondVideo = folder.appendingPathComponent(
            "Wivra_A1234567-89AB-CDEF-0123-456789ABCDEF.mov")
        let secondManifest = secondVideo.deletingPathExtension().appendingPathExtension("wivra.json")
        let malformed = Data("{bad manifest".utf8)
        try malformed.write(to: secondManifest)
        var refusedPreexisting = false
        do {
            _ = try WivraCaptureManifest.write(
                videoURL: secondVideo, tracks: [], mergedURL: nil,
                cameraSource: "iphone-avfoundation", writeOnce: true)
        } catch { refusedPreexisting = true }
        check(refusedPreexisting && (try Data(contentsOf: secondManifest)) == malformed,
              "preexisting malformed manifest is never overwritten")

        let entries = try fm.contentsOfDirectory(atPath: folder.path)
        check(!entries.contains(where: { $0.hasSuffix(".staging") }),
              "no orphaned staging manifest after success or refusal")
    }
}
