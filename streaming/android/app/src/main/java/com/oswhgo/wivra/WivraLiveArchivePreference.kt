package com.oswhgo.wivra

/**
 * W95 (Claude), issue #95: the remembered choice about the local MP4 copy of a LIVE, independent of
 * any platform VOD. ASK (default) keeps the per-LIVE checkbox; ALWAYS / NEVER set it and lock it.
 * Only this mode name is stored; never an address or stream key.
 */
enum class WivraLiveArchivePreference(val stored: String) {
    ALWAYS("always"), ASK("ask"), NEVER("never");

    /** State of the «save a local copy» checkbox when the LIVE screen opens. */
    val initiallyChecked: Boolean get() = this != NEVER
    /** Whether the person can change the checkbox for this LIVE. */
    val checkboxEditable: Boolean get() = this == ASK

    companion object {
        fun from(stored: String?): WivraLiveArchivePreference = entries.firstOrNull { it.stored == stored } ?: ASK
    }
}

/** Stores ONLY the mode name ("always" / "ask" / "never") of [WivraLiveArchivePreference]. Nothing else is written here. */
object WivraLiveArchiveStore {
    private const val FILE = "wivra_live_archive"
    private const val MODE = "archive_mode"
    fun load(context: android.content.Context): WivraLiveArchivePreference =
        WivraLiveArchivePreference.from(context.getSharedPreferences(FILE, android.content.Context.MODE_PRIVATE).getString(MODE, null))
    fun save(context: android.content.Context, mode: WivraLiveArchivePreference) {
        context.getSharedPreferences(FILE, android.content.Context.MODE_PRIVATE).edit().putString(MODE, mode.stored).apply()
    }
}
