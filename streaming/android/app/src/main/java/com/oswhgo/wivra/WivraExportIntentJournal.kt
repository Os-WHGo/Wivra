package com.oswhgo.wivra

import java.io.File
import java.io.FileOutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/**
 * Native write-ahead journal for accelerated (v2 random-write) exports. — Claude
 *
 * One tiny file per native token is armed BEFORE the export session exists and
 * removed only when that token's file was published to the gallery or the
 * session was explicitly aborted before finalization. Any other end (process
 * death, WebView crash, finishRandom failure after sealing a private copy,
 * cleared WebView localStorage) leaves the intent behind, so the editor asks
 * the person to review recoverable videos and the gallery before exporting again.
 *
 * It complements, never replaces, the editor's localStorage marker. The file
 * holds no project data, names or paths: only the random token in its name.
 * Unreadable or unexpected journal content is never treated as a clean exit.
 * Limitation: the parent directory is not fsynced (not portable on the JVM), so
 * an intent armed an instant before sudden power loss may still be lost.
 */
class WivraExportIntentJournal(private val dir: File) {
    companion object {
        private val NAME = Regex("""^intent-([1-9][0-9]{0,9})$""")
        private const val TMP_PREFIX = ".intent-"
    }

    private fun target(token: Int) = File(dir, "intent-$token")

    /** Durably record that [token] may produce a file. False means: do not start. */
    fun arm(token: Int): Boolean {
        if (token <= 0) return false
        return try {
            if (!dir.isDirectory && !dir.mkdirs() && !dir.isDirectory) return false
            if (Files.isSymbolicLink(dir.toPath())) return false
            val tmp = File(dir, "$TMP_PREFIX$token.tmp")
            FileOutputStream(tmp).use { out -> out.write('1'.code); out.fd.sync() }
            try {
                Files.move(tmp.toPath(), target(token).toPath(),
                    StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
            } catch (_: Exception) {
                tmp.delete()
                return false
            }
            target(token).isFile
        } catch (_: Exception) {
            false
        }
    }

    /** Remove [token]'s intent. True when no intent for that token remains. */
    fun clear(token: Int): Boolean {
        if (token <= 0) return false
        val file = target(token)
        return try { !file.exists() || file.delete() } catch (_: Exception) { false }
    }

    /**
     * True when an intent exists that no live session in this process owns,
     * or when the journal cannot be read. An absent journal is a clean state.
     */
    fun interrupted(activeTokens: Set<Int>): Boolean {
        if (!dir.exists()) return false
        if (!dir.isDirectory || Files.isSymbolicLink(dir.toPath())) return true
        val files = try { dir.listFiles() } catch (_: Exception) { null } ?: return true
        for (file in files) {
            // A temp file means arm() never completed, so begin() refused to
            // start and no output can exist for that token.
            if (file.name.startsWith(TMP_PREFIX)) continue
            val token = NAME.matchEntire(file.name)?.groupValues?.get(1)?.toIntOrNull()
                ?: return true
            if (token !in activeTokens) return true
        }
        return false
    }

    /**
     * After the person reviewed recovery and the gallery: forget every intent
     * that no live session owns. True only when none of them remains.
     */
    fun acknowledge(activeTokens: Set<Int>): Boolean {
        if (!dir.exists()) return true
        if (!dir.isDirectory || Files.isSymbolicLink(dir.toPath())) return false
        val files = try { dir.listFiles() } catch (_: Exception) { null } ?: return false
        var ok = true
        for (file in files) {
            val token = NAME.matchEntire(file.name)?.groupValues?.get(1)?.toIntOrNull()
            if (token != null && token in activeTokens) continue
            if (file.isDirectory || !file.delete()) ok = false
        }
        return ok && !interrupted(activeTokens)
    }
}
