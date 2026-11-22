package com.oswhgo.wivra

import java.io.File
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WivraExportIntentJournalTest {
    private fun tempDir(): File = Files.createTempDirectory("wivra-intent").toFile()

    @Test
    fun absentJournalIsCleanAndArmedIntentSurvivesANewInstance() {
        val root = tempDir()
        val dir = File(root, "intents")
        assertFalse(WivraExportIntentJournal(dir).interrupted(emptySet()))
        assertTrue(WivraExportIntentJournal(dir).arm(42))
        // Same process, live session: not interrupted.
        assertFalse(WivraExportIntentJournal(dir).interrupted(setOf(42)))
        // New process (no live sessions): the armed intent is an interruption.
        assertTrue(WivraExportIntentJournal(dir).interrupted(emptySet()))
        assertEquals(listOf("intent-42"), dir.list()!!.toList())
        root.deleteRecursively()
    }

    @Test
    fun clearAfterPublishOrAbortLeavesAClean() {
        val dir = tempDir()
        val journal = WivraExportIntentJournal(dir)
        assertTrue(journal.arm(7))
        assertTrue(journal.arm(8))
        assertTrue(journal.clear(7))
        assertTrue(journal.interrupted(emptySet()))
        assertTrue(journal.clear(8))
        assertTrue(journal.clear(8))
        assertFalse(journal.interrupted(emptySet()))
        assertFalse(journal.arm(0))
        assertFalse(journal.clear(-1))
        dir.deleteRecursively()
    }

    @Test
    fun unexpectedOrUnreadableJournalIsNeverAClean() {
        val dir = tempDir()
        File(dir, "intent-notanumber").writeText("x")
        assertTrue(WivraExportIntentJournal(dir).interrupted(emptySet()))
        File(dir, "intent-notanumber").delete()
        File(dir, "intent-99999999999").writeText("x")
        assertTrue(WivraExportIntentJournal(dir).interrupted(emptySet()))
        dir.deleteRecursively()
        val file = Files.createTempFile("wivra-intent", ".file").toFile()
        assertTrue(WivraExportIntentJournal(file).interrupted(emptySet()))
        assertFalse(WivraExportIntentJournal(file).arm(3))
        assertFalse(WivraExportIntentJournal(file).acknowledge(emptySet()))
        file.delete()
    }

    @Test
    fun incompleteArmTempFileIsIgnoredButAcknowledgeRemovesIt() {
        val dir = tempDir()
        File(dir, ".intent-5.tmp").writeText("1")
        assertFalse(WivraExportIntentJournal(dir).interrupted(emptySet()))
        assertTrue(WivraExportIntentJournal(dir).acknowledge(emptySet()))
        assertEquals(0, dir.list()!!.size)
        dir.deleteRecursively()
    }

    @Test
    fun acknowledgeKeepsLiveSessionsAndForgetsInterruptedOnes() {
        val dir = tempDir()
        val journal = WivraExportIntentJournal(dir)
        assertTrue(journal.arm(1))
        assertTrue(journal.arm(2))
        File(dir, "intent-garbage").writeText("x")
        assertTrue(journal.acknowledge(setOf(2)))
        assertEquals(listOf("intent-2"), dir.list()!!.toList())
        assertFalse(journal.interrupted(setOf(2)))
        assertTrue(journal.interrupted(emptySet()))
        dir.deleteRecursively()
    }

    @Test
    fun symlinkedJournalDirectoryIsRejected() {
        val root = tempDir()
        val real = File(root, "real").apply { mkdirs() }
        val link = File(root, "link")
        Files.createSymbolicLink(link.toPath(), real.toPath())
        assertFalse(WivraExportIntentJournal(link).arm(9))
        assertTrue(WivraExportIntentJournal(link).interrupted(emptySet()))
        assertEquals(0, real.list()!!.size)
        root.deleteRecursively()
    }
}
