// macOS AVFoundation integration; synthetic fixture, never physical capture. — ChatGPT
import AVFoundation
import Foundation

@main
struct WivraCaptureVerificationSmoke {
    static func main() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = URL(fileURLWithPath: "app/tests/fixtures/mediarecorder/ffmpeg-h264-aac-fragmented.mp4")
        let original = try Data(contentsOf: fixture)
        let video = root.appendingPathComponent("capture.mov")
        try original.write(to: video)
        let valid = await WivraCaptureMediaVerifier.verifyFile(video, in: root, diagnostic: { message in
            FileHandle.standardError.write(Data(("Capture verifier: " + message + "\n").utf8))
        })
        precondition(valid, "real samples and boundary decode must pass")
        precondition(await WivraCaptureMediaVerifier.verifyFile(
            video, in: root, requireAudio: true),
            "fixture has video plus nonempty AAC samples")

        // Deliberately tiny, locally generated H264-only synthetic MP4,
        // not Ray-Ban footage or a physical-camera recording.
        let videoOnly = root.appendingPathComponent("video-only.mp4")
        guard let videoOnlyBytes = Data(base64Encoded: "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAPgbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAABXgAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAwt0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAABXgAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAACAAAAAgAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAV4AAAIAAABAAAAAAKDbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAAOABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAACLm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAe5zdGJsAAAAvnN0c2QAAAAAAAAAAQAAAK5hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAACAAIABIAAAASAAAAAAAAAABFUxhdmM2MS4xOS4xMDEgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAANGF2Y0MBZAAK/+EAF2dkAAqs2UlsBEAAAAMAQAAABQPEiWWAAQAGaOvjyyLA/fj4AAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAABQiAAAAAAAAABhzdHRzAAAAAAAAAAEAAAAOAAAEAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAgGN0dHMAAAAAAAAADgAAAAEAAAgAAAAAAQAAFAAAAAABAAAIAAAAAAEAAAAAAAAAAQAABAAAAAABAAAUAAAAAAEAAAgAAAAAAQAAAAAAAAABAAAEAAAAAAEAABQAAAAAAQAACAAAAAABAAAAAAAAAAEAAAQAAAAAAQAACAAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAA4AAAABAAAATHN0c3oAAAAAAAAAAAAAAA4AAALRAAAADQAAAAwAAAAMAAAADAAAABMAAAAOAAAADAAAAAwAAAATAAAADgAAAAwAAAAMAAAAEgAAABRzdGNvAAAAAAAAAAEAAAQQAAAAYXVkdGEAAABZbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAsaWxzdAAAACSpdG9vAAAAHGRhdGEAAAABAAAAAExhdmY2MS43LjEwMwAAAAhmcmVlAAADjm1kYXQAAAKuBgX//6rcRem95tlIt5Ys2CDZI+7veDI2NCAtIGNvcmUgMTY0IHIzMTA4IDMxZTE5ZjkgLSBILjI2NC9NUEVHLTQgQVZDIGNvZGVjIC0gQ29weWxlZnQgMjAwMy0yMDIzIC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MSByZWY9MyBkZWJsb2NrPTE6MDowIGFuYWx5c2U9MHgzOjB4MTEzIG1lPWhleCBzdWJtZT03IHBzeT0xIHBzeV9yZD0xLjAwOjAuMDAgbWl4ZWRfcmVmPTEgbWVfcmFuZ2U9MTYgY2hyb21hX21lPTEgdHJlbGxpcz0xIDh4OGRjdD0xIGNxbT0wIGRlYWR6b25lPTIxLDExIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0PS0yIHRocmVhZHM9MSBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTMgYl9weXJhbWlkPTIgYl9hZGFwdD0xIGJfYmlhcz0wIGRpcmVjdD0xIHdlaWdodGI9MSBvcGVuX2dvcD0wIHdlaWdodHA9MiBrZXlpbnQ9MjUwIGtleWludF9taW49MTAgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD00MCByYz1jcmYgbWJ0cmVlPTEgY3JmPTIzLjAgcWNvbXA9MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MToxLjAwAIAAAAAbZYiEABH//ufj/ApptasTi41QCrqm12z78G+BAAAACUGaJGxBH/61wAAAAAhBnkJ4h39GwQAAAAgBnmF0Q39MQAAAAAgBnmNqQ39MQQAAAA9BmmhJqEFomUwIIf/+q4EAAAAKQZ6GRREsO/9GwQAAAAgBnqV0Q39MQQAAAAgBnqdqQ39MQAAAAA9BmqxJqEFsmUwId//+q4AAAAAKQZ7KRRUsO/9GwQAAAAgBnul0Q39MQAAAAAgBnutqQ39MQAAAAA5Bmu1JqEFsmUwIb//+qw==") else {
            preconditionFailure("invalid video-only fixture encoding")
        }
        try videoOnlyBytes.write(to: videoOnly)
        precondition(await WivraCaptureMediaVerifier.verifyFile(videoOnly, in: root),
                     "video-only file must remain valid for optional-mic sessions")
        precondition(!(await WivraCaptureMediaVerifier.verifyFile(
            videoOnly, in: root, requireAudio: true)),
            "mic-requested LIVE must reject an MP4 with no audio track")
        let after = try Data(contentsOf: video)
        precondition(after == original)
        let bad = root.appendingPathComponent("broken.mov")
        try original.prefix(80).write(to: bad)
        let invalid = await WivraCaptureMediaVerifier.verifyFile(bad, in: root)
        precondition(!invalid)
        let escaped = await WivraCaptureMediaVerifier.verifyFile(video, in: root.deletingLastPathComponent())
        precondition(!escaped)
        let link = root.appendingPathComponent("link.mov")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: video)
        let linked = await WivraCaptureMediaVerifier.verifyFile(link, in: root)
        precondition(!linked)

        let audioURL = root.appendingPathComponent("capture.caf")
        let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!
        do {
            let output = try AVAudioFile(forWriting: audioURL, settings: format.settings)
            let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 8192)!
            buffer.frameLength = 8192
            for i in 0..<8192 { buffer.floatChannelData![0][i] = Float(sin(Double(i) * 0.02)) * 0.1 }
            try output.write(from: buffer)
        }
        precondition(WivraCaptureMediaVerifier.verifyAudioFile(audioURL, in: root))
        let audioBytes = try Data(contentsOf: audioURL)
        let damagedAudio = root.appendingPathComponent("truncated.caf")
        try audioBytes.prefix(32).write(to: damagedAudio)
        precondition(!WivraCaptureMediaVerifier.verifyAudioFile(damagedAudio, in: root))

        let pendingRoot = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("WivraRecordings")
        try FileManager.default.createDirectory(at: pendingRoot, withIntermediateDirectories: true)
        let goodPart = pendingRoot.appendingPathComponent("Wivra_Meta_\(UUID().uuidString).mov")
        let badPart = pendingRoot.appendingPathComponent("Wivra_Meta_\(UUID().uuidString).mov")
        defer {
            for url in [goodPart, badPart, goodPart.appendingPathExtension("wivra.pending.json")] {
                try? FileManager.default.removeItem(at: url)
            }
        }
        try original.write(to: goodPart)
        try original.prefix(80).write(to: badPart)
        let ticket = try WivraPendingRecordingStore.stage(videoURL: goodPart, related: [badPart])
        do {
            try await WivraPendingRecordingStore.keep(ticket)
            preconditionFailure("must refuse a grouped take with one corrupt segment")
        } catch { }
        precondition(WivraPendingRecordingStore.pending().contains { $0.id == ticket.id })
        precondition(FileManager.default.fileExists(atPath: goodPart.path))
        precondition(FileManager.default.fileExists(atPath: badPart.path))
        try original.write(to: badPart)
        try await WivraPendingRecordingStore.keep(ticket)
        precondition(!WivraPendingRecordingStore.pending().contains { $0.id == ticket.id })
        precondition(FileManager.default.fileExists(atPath: goodPart.path))
        print("Capture verification smoke OK (video samples/decode, CAF full read, truncation, scope, symlink, grouped keep/retry; no physical device)")
    }
}
