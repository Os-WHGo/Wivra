package com.oswhgo.wivra

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.nio.file.Files

/**
 * W74. JVM filesystem tests only, not Android camera/WebView/MediaStore QA.
 * These files are synthetic byte fixtures; their names and ordering are the
 * evidence. Real sealed AVC/AAC media is independently verified on devices.
 */
class WivraRandomExportRecoveryCatalogTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun touch(name: String, modified: Long = 1_700_000_000_000L): File {
        val file = tmp.newFile(name)
        file.writeBytes(byteArrayOf(1, 2, 3, 4))
        assertTrue(file.setLastModified(modified))
        return file
    }

    @Test fun unrelatedFilesCannotHideValidSealedVideo() {
        val target = touch("Wivra_Fast_real12345.mp4", 1_700_000_000_000L)
        for (i in 0 until 240) touch("unrelated-${i.toString().padStart(4,'0')}.mp4")
        for (i in 0 until 35) touch("Wivra_Fast_bad${i.toString().padStart(3,'0')}.mp4.partial")
        val selected = WivraRandomExportStore.recoveryCandidates(tmp.root)
        assertEquals(1, selected.size)
        assertEquals(target.canonicalFile, selected.first().canonicalFile)
    }

    @Test fun mostRecentlyModifiedCandidatesAreSelectedFirst() {
        val old = touch("Wivra_Fast_old12345.mp4", 1_700_000_000_000L)
        val newest = touch("Wivra_Fast_new12345.webm", 1_700_000_100_000L)
        val sorted = WivraRandomExportStore.recoveryCandidates(tmp.root)
        assertEquals(listOf(newest.name, old.name), sorted.map { it.name })
        assertEquals(listOf(newest), WivraRandomExportStore.recoveryCandidates(tmp.root, 1))
    }

    @Test fun ignoresEmptyAndSymlinkAndWronglyNamedFiles() {
        val good = touch("Wivra_Fast_good12345.mp4")
        tmp.newFile("Wivra_Fast_empty12345.mp4")
        touch("Other_Fast_abcdef123.mp4")
        val alias = File(tmp.root, "Wivra_Fast_link12345.mp4")
        Files.createSymbolicLink(alias.toPath(), good.toPath())
        val selected = WivraRandomExportStore.recoveryCandidates(tmp.root)
        assertEquals(listOf(good), selected)
        assertFalse(selected.contains(alias))
    }

    @Test fun boundedLimitCannotBeExpandedByCaller() {
        touch("Wivra_Fast_abcdef12.mp4")
        for (limit in listOf(-1, 0, 101, Int.MAX_VALUE)) {
            try {
                WivraRandomExportStore.recoveryCandidates(tmp.root, limit)
                throw AssertionError("Accepted unsafe limit $limit")
            } catch (_: IllegalArgumentException) { }
        }
    }
}
