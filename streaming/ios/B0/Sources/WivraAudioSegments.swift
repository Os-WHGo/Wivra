// W98 (Claude): automatic subtitles for long videos. The editor asks for the sound of ONE short piece
// (≤ 35 s) of a file the person chose for it, already as 16 kHz mono 16-bit PCM, so the whole sound is
// never in memory. Permission scope: only files handed to the editor through its file chooser (by name
// and size) are readable here; never an arbitrary path, never the file itself. Nothing is written or sent.
import AVFoundation
import Foundation

enum WivraAudioSegments {
    static let rate = 16_000
    static let maxSeconds = 35.0
    private static let lock = NSLock()
    nonisolated(unsafe) private static var granted: [String: URL] = [:]      // guarded by `lock`

    private static func key(_ name: String, _ size: Int64) -> String { "\(size)|\(name)" }

    /// Remember the files the person gave the editor (called from the file chooser result).
    static func remember(_ urls: [URL]?) {
        for url in urls ?? [] {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            if let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize {
                lock.lock(); granted[key(url.lastPathComponent, Int64(size))] = url; lock.unlock()
            }
        }
    }

    static func lookup(name: String, size: Int64) -> URL? { lock.lock(); defer { lock.unlock() }; return granted[key(name, size)] }

    /// Sound of [from, to) of the file as 16 kHz mono 16-bit little-endian PCM, exact length.
    static func extract(url: URL, from: Double, to: Double) async throws -> Data {
        guard from >= 0, to > from, to - from <= 35 else { throw CocoaError(.featureUnsupported) }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let want = Int((to - from) * 16_000) * 2
        let asset = AVURLAsset(url: url)
        guard let track = try await asset.loadTracks(withMediaType: .audio).first else { return Data(count: want) }   // no sound: silence
        let reader = try AVAssetReader(asset: asset)
        reader.timeRange = CMTimeRange(start: CMTime(seconds: from, preferredTimescale: 48_000), end: CMTime(seconds: to, preferredTimescale: 48_000))
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
            AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 16_000, AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false,
        ])
        reader.add(output)
        guard reader.startReading() else { throw reader.error ?? CocoaError(.fileReadUnknown) }
        var data = Data()
        while let sample = output.copyNextSampleBuffer() {
            guard let block = CMSampleBufferGetDataBuffer(sample) else { continue }
            let length = CMBlockBufferGetDataLength(block)
            var chunk = Data(count: length)
            chunk.withUnsafeMutableBytes { raw in
                if let base = raw.baseAddress { _ = CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: length, destination: base) }
            }
            data.append(chunk)
            if data.count >= want { reader.cancelReading(); break }
        }
        if reader.status == .failed { throw reader.error ?? CocoaError(.fileReadUnknown) }
        if data.count > want { data = data.prefix(want) } else if data.count < want { data.append(Data(count: want - data.count)) }
        return data
    }
}
