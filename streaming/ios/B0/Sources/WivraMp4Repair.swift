// Makes a MediaRecorder MP4 (fragmented, duration 0, no index) behave like a normal video in
// Photos/Files/players, WITHOUT re-encoding. Step 1 appends an mfra index in place (no sample
// moves; mvhd/tkhd/mdhd stay as the spec requires for fragmented files). Step 2 (AVFoundation
// passthrough) writes a regular MP4 with a full moov and real duration; the caller keeps the
// step-1 file if step 2 fails or does not verify. Same box arithmetic as app/media-container.mjs. Compiled and exercised on macOS CI by
// streaming/tests/WivraExportStoreSmoke.swift. — Claude
import AVFoundation
import Foundation

enum WivraMp4Repair {
    struct Media: Sendable {
        var container: String
        var durationMs: Int64
        var video: Bool
        var audio: Bool
        var declaresDuration: Bool
        var seekIndex: Bool
    }

    struct PatchResult: Sendable {
        var durationMs: Double
        var changed: Bool
        var indexAdded: Bool
        var reason: String
    }

    private struct Box { let type: String; let start: Int; let body: Int; let end: Int }

    private static func u32(_ d: Data, _ p: Int) -> UInt32 {
        let i = d.startIndex + p
        let b0: UInt32 = UInt32(d[i]) << 24
        let b1: UInt32 = UInt32(d[i + 1]) << 16
        let b2: UInt32 = UInt32(d[i + 2]) << 8
        let b3: UInt32 = UInt32(d[i + 3])
        return b0 | b1 | b2 | b3
    }
    private static func u64(_ d: Data, _ p: Int) -> UInt64 {
        let high: UInt64 = UInt64(u32(d, p)) << 32
        let low: UInt64 = UInt64(u32(d, p + 4))
        return high | low
    }
    private static func type4(_ d: Data, _ p: Int) -> String { String(decoding: d[(d.startIndex + p)..<(d.startIndex + p + 4)], as: UTF8.self) }

    /// Boxes of `d` between relative offsets [start, end). `d` must be zero-based (Data(...)).
    private static func boxes(_ d: Data, _ start: Int, _ end: Int) throws -> [Box] {
        var out: [Box] = []; var p = start
        while p + 8 <= end {
            var size = Int(u32(d, p)); var hdr = 8
            if size == 1 { size = Int(u64(d, p + 8)); hdr = 16 } else if size == 0 { size = end - p }
            guard size >= hdr, p + size <= end else { throw WivraExportError.integrity("MP4: caja inválida o truncada.") }
            out.append(Box(type: type4(d, p + 4), start: p, body: p + hdr, end: p + size)); p += size
        }
        return out
    }

    private static func read(_ h: FileHandle, _ offset: UInt64, _ count: Int) throws -> Data {
        try h.seek(toOffset: offset)
        let d = try h.read(upToCount: count) ?? Data()
        guard d.count == count else { throw WivraExportError.integrity("MP4: lectura incompleta.") }
        return Data(d)
    }

    private static func be32(_ v: UInt32) -> [UInt8] {
        let a = UInt8(truncatingIfNeeded: v >> 24), b = UInt8(truncatingIfNeeded: v >> 16)
        let c = UInt8(truncatingIfNeeded: v >> 8), d = UInt8(truncatingIfNeeded: v)
        return [a, b, c, d]
    }
    private static func be64(_ v: UInt64) -> [UInt8] {
        var out = be32(UInt32(truncatingIfNeeded: v >> 32))
        out.append(contentsOf: be32(UInt32(truncatingIfNeeded: v)))
        return out
    }
    private static func box(_ type: String, _ payload: [UInt8]) -> [UInt8] {
        var out = be32(UInt32(8 + payload.count))
        out.append(contentsOf: Array(type.utf8))
        out.append(contentsOf: payload)
        return out
    }

    /// Step 1, in place: durations + mfra. Never moves sample data; refuses absolute offsets.
    static func patchFragmented(at url: URL) throws -> PatchResult {
        let h = try FileHandle(forUpdating: url)
        defer { try? h.close() }
        let size = try h.seekToEnd()
        // Top-level boxes (headers only).
        var top: [(type: String, start: UInt64, hdr: UInt64, end: UInt64)] = []
        var p: UInt64 = 0
        while p + 8 <= size {
            let head = try read(h, p, Int(min(16, size - p)))
            var boxSize = UInt64(u32(head, 0)); var hdr: UInt64 = 8
            if boxSize == 1, head.count >= 16 { boxSize = u64(head, 8); hdr = 16 } else if boxSize == 0 { boxSize = size - p }
            guard boxSize >= hdr, p + boxSize <= size else { throw WivraExportError.integrity("MP4: caja de nivel superior inválida.") }
            top.append((type4(head, 4), p, hdr, p + boxSize)); p += boxSize
        }
        guard top.first?.type == "ftyp", let moovRef = top.first(where: { $0.type == "moov" }) else {
            return PatchResult(durationMs: 0, changed: false, indexAdded: false, reason: "no es un MP4 con moov")
        }
        let moofRefs = top.filter { $0.type == "moof" }
        guard !moofRefs.isEmpty else { return PatchResult(durationMs: 0, changed: false, indexAdded: false, reason: "MP4 no fragmentado") }
        let moov = try read(h, moovRef.start, Int(moovRef.end - moovRef.start))
        let moovKids = try boxes(moov, Int(moovRef.hdr), moov.count)
        guard let mvhd = moovKids.first(where: { $0.type == "mvhd" }) else { throw WivraExportError.integrity("MP4 sin mvhd.") }
        let mvhdV1 = moov[mvhd.body] == 1
        let movieScale = u32(moov, mvhd.body + (mvhdV1 ? 20 : 12))
        struct Track { var id: UInt32; var scale: UInt32; var tkhd: Int; var tkhdV1: Bool; var mdhd: Int; var mdhdV1: Bool; var defDur: UInt32; var defFlags: UInt32; var end: UInt64 = 0; var entries: [(time: UInt64, moof: UInt64)] = [] }
        var tracks: [UInt32: Track] = [:]
        var trex: [UInt32: (UInt32, UInt32)] = [:]
        if let mvex = moovKids.first(where: { $0.type == "mvex" }) {
            for t in try boxes(moov, mvex.body, mvex.end) where t.type == "trex" { trex[u32(moov, t.body + 4)] = (u32(moov, t.body + 12), u32(moov, t.body + 20)) }
        }
        for trak in moovKids where trak.type == "trak" {
            let kids = try boxes(moov, trak.body, trak.end)
            guard let tkhd = kids.first(where: { $0.type == "tkhd" }), let mdia = kids.first(where: { $0.type == "mdia" }),
                  let mdhd = try boxes(moov, mdia.body, mdia.end).first(where: { $0.type == "mdhd" }) else { continue }
            let tkV1 = moov[tkhd.body] == 1, mdV1 = moov[mdhd.body] == 1
            let id = u32(moov, tkhd.body + (tkV1 ? 20 : 12))
            let d = trex[id] ?? (0, 0)
            tracks[id] = Track(id: id, scale: u32(moov, mdhd.body + (mdV1 ? 20 : 12)), tkhd: tkhd.body, tkhdV1: tkV1, mdhd: mdhd.body, mdhdV1: mdV1, defDur: d.0, defFlags: d.1)
        }
        for moofRef in moofRefs {
            let moof = try read(h, moofRef.start, Int(moofRef.end - moofRef.start))
            for traf in try boxes(moof, Int(moofRef.hdr), moof.count) where traf.type == "traf" {
                let kids = try boxes(moof, traf.body, traf.end)
                guard let tfhd = kids.first(where: { $0.type == "tfhd" }) else { continue }
                let flags = u32(moof, tfhd.body) & 0xFFFFFF, id = u32(moof, tfhd.body + 4)
                guard var tr = tracks[id] else { continue }
                if flags & 0x01 != 0 { return PatchResult(durationMs: 0, changed: false, indexAdded: false, reason: "desplazamientos absolutos: no se reescribe") }
                var q = tfhd.body + 8; if flags & 0x02 != 0 { q += 4 }
                var defDur = tr.defDur, defFlags = tr.defFlags
                if flags & 0x08 != 0 { defDur = u32(moof, q); q += 4 }
                if flags & 0x10 != 0 { q += 4 }
                if flags & 0x20 != 0 { defFlags = u32(moof, q) }
                var t: UInt64 = tr.end
                if let tfdt = kids.first(where: { $0.type == "tfdt" }) { t = moof[tfdt.body] == 1 ? u64(moof, tfdt.body + 4) : UInt64(u32(moof, tfdt.body + 4)) }
                let start = t; var firstSync: Bool?
                for trun in kids where trun.type == "trun" {
                    let tf = u32(moof, trun.body) & 0xFFFFFF, count = Int(u32(moof, trun.body + 4)); var r = trun.body + 8
                    if tf & 0x01 != 0 { r += 4 }
                    var firstFlags: UInt32?; if tf & 0x04 != 0 { firstFlags = u32(moof, r); r += 4 }
                    for i in 0..<count {
                        var dur = defDur; var sf = (i == 0 && firstFlags != nil) ? firstFlags! : defFlags
                        if tf & 0x100 != 0 { dur = u32(moof, r); r += 4 }
                        if tf & 0x200 != 0 { r += 4 }
                        if tf & 0x400 != 0 { let v = u32(moof, r); r += 4; if !(i == 0 && firstFlags != nil) { sf = v } }
                        if tf & 0x800 != 0 { r += 4 }
                        if firstSync == nil { firstSync = sf & 0x0001_0000 == 0 }
                        t += UInt64(dur)
                    }
                }
                if firstSync != false { tr.entries.append((start, moofRef.start)) }
                tr.end = max(tr.end, t); tracks[id] = tr
            }
        }
        var durationMs = 0.0
        for tr in tracks.values where tr.scale > 0 { durationMs = max(durationMs, Double(tr.end) / Double(tr.scale) * 1000) }
        let movieDur = UInt64((durationMs * Double(movieScale) / 1000).rounded())
        guard movieDur < UInt64(UInt32.max) else { return PatchResult(durationMs: durationMs, changed: false, indexAdded: false, reason: "duración demasiado larga") }
        // ISO/IEC 14496-12: mvhd/tkhd/mdhd of a fragmented file describe only the samples in moov.
        // Writing the full duration there made AVFoundation count it twice (2.0 s read as 4.0 s on
        // macOS CI). The duration is left to the passthrough copy (full moov); here only an index.
        _ = mvhdV1
        var indexAdded = false
        if !top.contains(where: { $0.type == "mfra" || $0.type == "sidx" }) {
            var tfras: [UInt8] = []
            for tr in tracks.values.sorted(by: { $0.id < $1.id }) {
                // tfra v1: 64-bit time and moof offset; 1-byte traf/trun/sample numbers.
                var body: [UInt8] = [1, 0, 0, 0]
                body.append(contentsOf: be32(tr.id))
                body.append(contentsOf: [0, 0, 0, 0])
                body.append(contentsOf: be32(UInt32(tr.entries.count)))
                for e in tr.entries {
                    body.append(contentsOf: be64(e.time))
                    body.append(contentsOf: be64(e.moof))
                    body.append(contentsOf: [1, 1, 1])
                }
                tfras.append(contentsOf: box("tfra", body))
            }
            var mfroBody: [UInt8] = [0, 0, 0, 0]
            mfroBody.append(contentsOf: be32(UInt32(8 + tfras.count + 16)))
            var mfraBody = tfras
            mfraBody.append(contentsOf: box("mfro", mfroBody))
            try h.seekToEnd(); try h.write(contentsOf: Data(box("mfra", mfraBody)))
            indexAdded = true
        }
        try h.synchronize()
        return PatchResult(durationMs: durationMs, changed: indexAdded, indexAdded: indexAdded,
                           reason: indexAdded ? "" : "ya tenía índice")
    }

    /// Step 2: regular MP4 (full moov, fast start) via AVFoundation passthrough. No re-encoding.
    static func passthrough(from source: URL, to destination: URL) async throws {
        try? FileManager.default.removeItem(at: destination)
        let asset = AVURLAsset(url: source)
        guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetPassthrough) else {
            throw WivraExportError.io("AVFoundation no puede copiar este video sin recodificar.")
        }
        session.shouldOptimizeForNetworkUse = true
        if #available(iOS 18.0, macOS 15.0, *) {
            try await session.export(to: destination, as: .mp4)
        } else {
            session.outputURL = destination
            session.outputFileType = .mp4
            await session.export()
            if session.status != .completed {
                throw WivraExportError.io("Copia sin recodificar fallida: \(session.error?.localizedDescription ?? "estado \(session.status.rawValue)")")
            }
        }
    }

    /// What Photos/AVPlayer will see: duration and tracks, from AVFoundation itself.
    static func inspect(_ url: URL) async -> Media? {
        let asset = AVURLAsset(url: url)
        guard let duration = try? await asset.load(.duration) else { return nil }
        let video = (try? await asset.loadTracks(withMediaType: .video).isEmpty == false) ?? false
        let audio = (try? await asset.loadTracks(withMediaType: .audio).isEmpty == false) ?? false
        let seconds = duration.isNumeric ? duration.seconds : 0
        let declares = seconds > 0; var seek = true
        if let h = try? FileHandle(forReadingFrom: url) {
            defer { try? h.close() }
            if let head = try? h.read(upToCount: 4096), head.count >= 8, type4(Data(head), 4) == "ftyp" {
                // Fragmented files are seekable for players only with an index (mfra/sidx).
                let size = (try? h.seekToEnd()) ?? 0
                var p: UInt64 = 0; var fragmented = false, indexed = false
                while p + 8 <= size, let hd = try? read(h, p, Int(min(16, size - p))) {
                    var s = UInt64(u32(hd, 0)); if s == 1, hd.count >= 16 { s = u64(hd, 8) } else if s == 0 { s = size - p }
                    let t = type4(hd, 4); if t == "moof" { fragmented = true }; if t == "mfra" || t == "sidx" { indexed = true }
                    if s < 8 { break }; p += s
                }
                seek = !fragmented || indexed
            }
        }
        return Media(container: url.pathExtension.lowercased() == "webm" ? "webm" : "mp4",
                     durationMs: Int64((seconds * 1000).rounded()), video: video, audio: audio,
                     declaresDuration: declares, seekIndex: seek)
    }
}
