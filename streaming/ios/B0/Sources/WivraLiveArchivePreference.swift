// W95 (Claude), issue #95: the remembered choice about the local MP4 copy of a LIVE, independent of any
// platform VOD. ASK (default) keeps the per-LIVE toggle; ALWAYS / NEVER set it and lock it.
// The store writes ONLY the mode name ("always" / "ask" / "never"); never an address or stream key.
import Foundation

enum WivraLiveArchivePreference: String, CaseIterable, Sendable {
    case always, ask, never

    var initiallyOn: Bool { self != .never }
    var toggleEditable: Bool { self == .ask }
}

enum WivraLiveArchiveStore {
    private static let mode = "wivra.live.archive_mode"
    static func load() -> WivraLiveArchivePreference {
        WivraLiveArchivePreference(rawValue: UserDefaults.standard.string(forKey: mode) ?? "") ?? .ask
    }
    static func save(_ value: WivraLiveArchivePreference) {
        UserDefaults.standard.set(value.rawValue, forKey: mode)
    }
}
