package com.oswhgo.wivra

import android.content.Context

/** Durable fail-closed receipt gate for interrupted multipart publication.
 * A retry may finish saving, but cannot certify that its remaining subset is
 * the complete Director take. No media, paths, scripts or credentials stored.
 * — ChatGPT
 */
internal object WivraDirectorSaveJournal {
    private const val PREFS = "wivra_director_save_journal"
    private const val KEY = "publishing_sessions"
    private val lock = Any()

    fun begin(context: Context, sessionId: String): Boolean = synchronized(lock) {
        require(sessionId.length in 1..240 && sessionId.all { it.isLetterOrDigit() || it in "_-." })
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val pending = prefs.getStringSet(KEY, emptySet()).orEmpty().toMutableSet()
        if (sessionId in pending) return@synchronized false
        pending.add(sessionId)
        // A receipt is permitted only after the intent survived a durable write.
        prefs.edit().putStringSet(KEY, pending).commit()
    }

    fun completed(context: Context, sessionId: String) = synchronized(lock) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val pending = prefs.getStringSet(KEY, emptySet()).orEmpty().toMutableSet()
        pending.remove(sessionId)
        prefs.edit().putStringSet(KEY, pending).commit()
    }
}
