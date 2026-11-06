// W99-iOS (Claude, owner decision 1A): what the screen-recording extension and the
// Wivra app share. Pure values only (compiled into BOTH targets): the App Group
// folder, the per-recording session record and the small pure rules.
// Nothing here sends anything anywhere; the recording never leaves the iPhone.
import Foundation

enum WivraScreenRecordShared {
    static let appGroup = "group.com.oswhgo.WivraMetaB0"
    static let folderName = "WivraScreenRecordings"
    static let sessionFile = "session.json"
    /// Always leave this much space for the iPhone itself.
    static let reserveBytes: Int64 = 300 * 1024 * 1024
    /// A session file untouched for this long, and not finished, is an interrupted recording.
    static let staleSeconds: TimeInterval = 20

    static func root() -> URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appendingPathComponent(folderName, isDirectory: true)
    }

    /// One recording = one folder named after its id, with this record inside.
    struct Session: Codable, Equatable {
        var id: String
        var startedAtISO8601: String
        var videoFile: String
        var appAudioFile: String?
        var micAudioFile: String?
        /// Presentation time (seconds, host clock) of the first sample written to each file.
        var videoStart: Double?
        var appAudioStart: Double?
        var micAudioStart: Double?
        /// True only after every file was closed cleanly.
        var finished: Bool
        var stopReason: String?
    }

    static func safeID(_ id: String) -> Bool {
        !id.isEmpty && id.count <= 64 &&
            id.unicodeScalars.allSatisfy { CharacterSet.alphanumerics.contains($0) || $0 == "-" || $0 == "_" }
    }

    static func safeName(_ name: String?) -> Bool {
        guard let name else { return true }
        return !name.isEmpty && name.count <= 128 && name != "." && name != ".." &&
            !name.contains("/") && !name.contains("\\") && !name.contains("\0") && name.hasPrefix("Wivra_Screen_")
    }

    /// Where an audio file sits on the video's timeline (nil = unknown, never invented).
    static func offset(audio: Double?, video: Double?) -> Double? {
        guard let a = audio, let v = video, a.isFinite, v.isFinite, abs(a - v) < 3600 else { return nil }
        return (a - v).rounded(toPlaces: 3)
    }

    /// Stop before the iPhone runs out of space (the recording made so far is kept).
    static func mustStop(freeBytes: Int64) -> Bool { freeBytes < reserveBytes }

    /// About 0.13 bits per pixel at 30 fps, between 3 and 12 Mbps.
    static func videoBitrate(width: Int, height: Int) -> Int {
        let raw = Double(max(1, width) * max(1, height)) * 30 * 0.13
        return Int(min(12_000_000, max(3_000_000, raw)))
    }

    enum Message: String { case noStorage, lowSpace, writeFailed }

    /// The only texts the extension shows (through iOS when it ends a recording), in the 8 app languages.
    static func message(_ m: Message, languages: [String] = Locale.preferredLanguages) -> String {
        let table: [String: [Message: String]] = [
            "es": [.noStorage: "Wivra no puede guardar la grabación en este iPhone.", .lowSpace: "Grabación detenida: queda poco espacio. Lo grabado se conserva en Wivra.", .writeFailed: "La grabación se detuvo por un error al escribir el video. Abre Wivra para revisar lo grabado."],
            "en": [.noStorage: "Wivra cannot save the recording on this iPhone.", .lowSpace: "Recording stopped: storage is running low. What was recorded is kept in Wivra.", .writeFailed: "Recording stopped because the video could not be written. Open Wivra to review what was recorded."],
            "pt": [.noStorage: "O Wivra não consegue salvar a gravação neste iPhone.", .lowSpace: "Gravação parada: pouco espaço. O que foi gravado fica no Wivra.", .writeFailed: "A gravação parou por um erro ao gravar o vídeo. Abra o Wivra para revisar o que foi gravado."],
            "fr": [.noStorage: "Wivra ne peut pas enregistrer la vidéo sur cet iPhone.", .lowSpace: "Enregistrement arrêté : espace insuffisant. Ce qui a été enregistré est conservé dans Wivra.", .writeFailed: "Enregistrement arrêté : la vidéo n’a pas pu être écrite. Ouvrez Wivra pour vérifier ce qui a été enregistré."],
            "de": [.noStorage: "Wivra kann die Aufnahme auf diesem iPhone nicht speichern.", .lowSpace: "Aufnahme gestoppt: wenig Speicher. Das Aufgenommene bleibt in Wivra.", .writeFailed: "Aufnahme gestoppt: Das Video konnte nicht geschrieben werden. Öffne Wivra, um die Aufnahme zu prüfen."],
            "it": [.noStorage: "Wivra non può salvare la registrazione su questo iPhone.", .lowSpace: "Registrazione fermata: poco spazio. Ciò che è stato registrato resta in Wivra.", .writeFailed: "Registrazione fermata: impossibile scrivere il video. Apri Wivra per controllare ciò che è stato registrato."],
            "ja": [.noStorage: "Wivra はこの iPhone に録画を保存できません。", .lowSpace: "空き容量が少ないため録画を停止しました。録画済みの部分は Wivra に残ります。", .writeFailed: "動画を書き込めなかったため録画を停止しました。Wivra を開いて録画を確認してください。"],
            "zh": [.noStorage: "Wivra 无法在这部 iPhone 上保存录制。", .lowSpace: "空间不足，录制已停止。已录制的内容保留在 Wivra 中。", .writeFailed: "视频写入失败，录制已停止。请打开 Wivra 查看已录制的内容。"],
        ]
        for language in languages {
            let code = String(language.prefix(2))
            if let text = table[code]?[m] { return text }
        }
        return table["es"]![m]!
    }
}

private extension Double {
    func rounded(toPlaces places: Int) -> Double {
        let f = pow(10.0, Double(places))
        return (self * f).rounded() / f
    }
}
