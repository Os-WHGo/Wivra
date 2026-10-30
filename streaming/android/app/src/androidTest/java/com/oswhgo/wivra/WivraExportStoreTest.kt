package com.oswhgo.wivra

import android.content.ContentValues
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import java.util.zip.CRC32

/**
 * Emulator/device: progressive export into the REAL MediaStore (Movies/Wivra).
 * Synthetic WebM-shaped bytes only; not a camera, codec or physical-phone claim.
 */
@RunWith(AndroidJUnit4::class)
class WivraExportStoreTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private val webmHead = byteArrayOf(0x1A, 0x45, 0xDF.toByte(), 0xA3.toByte())
    private fun chunk(size: Int, seed: Int) = ByteArray(size) { ((it * 13 + seed) and 0xFF).toByte() }

    /** While recording, the pending row carries "_rec"; the delivered video gets the returned name. */
    private fun rec(name: String) = name.replace(Regex("\\.(webm|mp4)$"), "_rec.$1")

    private fun rowsNamed(name: String, pending: Boolean): List<Uri> {
        val collection = MediaStore.Video.Media.EXTERNAL_CONTENT_URI
        val args = Bundle().apply {
            putInt(MediaStore.QUERY_ARG_MATCH_PENDING, if (pending) MediaStore.MATCH_INCLUDE else MediaStore.MATCH_EXCLUDE)
            putString(android.content.ContentResolver.QUERY_ARG_SQL_SELECTION, "${MediaStore.MediaColumns.DISPLAY_NAME} = ?")
            putStringArray(android.content.ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, arrayOf(name))
        }
        val out = mutableListOf<Uri>()
        context.contentResolver.query(collection, arrayOf(MediaStore.MediaColumns._ID), args, null)?.use { c ->
            while (c.moveToNext()) out += android.content.ContentUris.withAppendedId(collection, c.getLong(0))
        }
        return out
    }

    @Test fun chunksBecomeOneVerifiedGalleryVideoOnlyAfterFinish() {
        val (token, name) = WivraExportStore.begin(context, "video/webm;codecs=vp8,opus", 1_000_000)
        var saved: WivraExportStore.Saved? = null
        try {
            assertTrue(name.startsWith(WivraExportStore.PREFIX) && name.endsWith(".webm"))
            val parts = listOf(webmHead + chunk(400_000, 1), chunk(350_000, 2), chunk(123_457, 3))
            val crc = CRC32()
            var total = 0L
            parts.forEachIndexed { seq, part ->
                total = WivraExportStore.append(context, token, seq, part, 0, part.size)
                crc.update(part)
            }
            // While recording, the item exists only as a pending row, invisible to the gallery.
            assertEquals(0, rowsNamed(rec(name), pending = false).size)
            assertEquals(1, rowsNamed(rec(name), pending = true).size)
            saved = WivraExportStore.finish(context, token, total, crc.value, parts.size)
            assertEquals(total, saved.bytes)
            assertEquals(crc.value, saved.crc32)
            assertEquals(listOf(saved.uri), rowsNamed(name, pending = false))
            val (diskBytes, diskCrc) = WivraProgressiveExportSession.measure(
                context.contentResolver.openInputStream(saved.uri)!!)
            assertEquals(total, diskBytes)
            assertEquals(crc.value, diskCrc)
            assertEquals(saved, WivraExportStore.savedExport(token))
        } finally {
            saved?.let { context.contentResolver.delete(it.uri, null, null) }
            WivraExportStore.abort(context, token)
        }
    }

    @Test fun abortDeletesThePendingRow() {
        val (token, name) = WivraExportStore.begin(context, "video/webm", 0)
        WivraExportStore.append(context, token, 0, webmHead + chunk(10_000, 4), 0, 10_004)
        WivraExportStore.abort(context, token)
        WivraExportStore.abort(context, token)
        assertEquals(0, rowsNamed(rec(name), pending = true).size + rowsNamed(name, pending = true).size)
    }

    @Test fun wrongTotalsOrOutOfOrderChunksNeverReachTheGallery() {
        val (token, name) = WivraExportStore.begin(context, "video/webm", 0)
        val data = webmHead + chunk(5_000, 5)
        WivraExportStore.append(context, token, 0, data, 0, data.size)
        try {
            WivraExportStore.finish(context, token, data.size.toLong(), 12345L, 1)
            fail("CRC mismatch must not publish")
        } catch (_: WivraProgressiveExportSession.IntegrityException) { }
        assertEquals(0, rowsNamed(rec(name), pending = true).size + rowsNamed(name, pending = true).size)

        val (second, secondName) = WivraExportStore.begin(context, "video/webm", 0)
        WivraExportStore.append(context, second, 0, data, 0, data.size)
        try {
            WivraExportStore.append(context, second, 5, data, 0, data.size)
            fail("out-of-order chunk must fail")
        } catch (_: WivraProgressiveExportSession.IntegrityException) { }
        assertEquals(0, rowsNamed(rec(secondName), pending = true).size)
    }

    @Test fun impossibleSpaceRequestCreatesNothing() {
        try {
            WivraExportStore.begin(context, "video/mp4", Long.MAX_VALUE / 4)
            fail("must refuse")
        } catch (_: WivraExportStore.InsufficientStorageException) { }
    }

    @Test fun orphanCleanupDeletesStalePendingExportsButNotOtherRows() {
        val resolver = context.contentResolver
        val name = WivraExportStore.PREFIX + "orphan_" + System.nanoTime() + ".webm"
        val orphan = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, name)
            put(MediaStore.Video.Media.MIME_TYPE, "video/webm")
            put(MediaStore.Video.Media.RELATIVE_PATH, WivraExportStore.FOLDER)
            put(MediaStore.Video.Media.IS_PENDING, 1)
        })!!
        val keepName = "Wivra_Phone_keep_" + System.nanoTime() + ".mp4"
        val keep = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, keepName)
            put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
            put(MediaStore.Video.Media.RELATIVE_PATH, WivraExportStore.FOLDER)
            put(MediaStore.Video.Media.IS_PENDING, 1)
        })!!
        val (active, activeName) = WivraExportStore.begin(context, "video/webm", 0)
        try {
            assertTrue(WivraExportStore.cleanupOrphans(context) >= 1)
            assertEquals(0, rowsNamed(name, pending = true).size)
            assertEquals(1, rowsNamed(keepName, pending = true).size)
            assertEquals("an export in progress is never treated as an orphan", 1, rowsNamed(rec(activeName), pending = true).size)
        } finally {
            WivraExportStore.abort(context, active)
            resolver.delete(keep, null, null)
            // Normally already deleted by cleanupOrphans; MediaStore answers a missing id
            // with SecurityException, so this fallback cleanup must not mask the result.
            try { resolver.delete(orphan, null, null) } catch (_: SecurityException) { }
        }
    }

    private fun asset(name: String): ByteArray =
        InstrumentationRegistry.getInstrumentation().context.assets.open(name).use { it.readBytes() }

    private fun exportBytes(mime: String, data: ByteArray, repair: Boolean): WivraExportStore.Saved {
        val (token, _) = WivraExportStore.begin(context, mime, data.size.toLong())
        val crc = CRC32(); var seq = 0; var off = 0
        while (off < data.size) { val n = minOf(64 * 1024, data.size - off); WivraExportStore.append(context, token, seq++, data, off, n); crc.update(data, off, n); off += n }
        return WivraExportStore.finish(context, token, data.size.toLong(), crc.value, seq, repair)
    }

    private fun report(key: String, value: String) {
        val b = android.os.Bundle(); b.putString("wivra-export-measure", "$key=$value")
        InstrumentationRegistry.getInstrumentation().sendStatus(0, b)
        android.util.Log.i("WivraExportMeasure", "$key=$value")
    }

    @Test fun realChromiumWebmGetsDurationAndSeekIndexWithoutReencoding() {
        val raw = asset("chromium-vp8-opus.webm")
        val before = exportBytes("video/webm;codecs=vp8,opus", raw, repair = false)
        val after = exportBytes("video/webm;codecs=vp8,opus", raw, repair = true)
        try {
            report("webm.before", before.media.toString()); report("webm.after", after.media.toString() + " repair=" + after.repair + " " + after.repairNote)
            assertEquals("webm-cues", after.repair)
            assertEquals(raw.size.toLong(), after.recordedBytes)
            val m = after.media!!
            assertTrue(m.declaresDuration && m.seekIndex && m.video && m.audio)
            assertTrue("Android must read a real duration: $m", m.durationMs in 1800..2600)
            assertEquals(0, rowsNamed(rec(after.displayName), pending = true).size)
        } finally {
            context.contentResolver.delete(before.uri, null, null); context.contentResolver.delete(after.uri, null, null)
        }
    }

    @Test fun fragmentedH264AacMp4IsRemuxedIntoARegularMp4() {
        val raw = asset("ffmpeg-h264-aac-fragmented.mp4")
        val saved = exportBytes("video/mp4;codecs=avc1.42E01E,mp4a.40.2", raw, repair = true)
        try {
            report("mp4aac.after", saved.media.toString() + " repair=" + saved.repair + " " + saved.repairNote)
            assertEquals("mp4-remux", saved.repair)
            val m = saved.media!!
            assertTrue(m.video && m.audio && m.durationMs in 1700..2400)
        } finally { context.contentResolver.delete(saved.uri, null, null) }
    }

    @Test fun chromiumH264OpusMp4IsRepairedOrDeliveredUnchangedNeverLost() {
        val raw = asset("chromium-avc1-opus-fragmented.mp4")
        val saved = exportBytes("video/mp4;codecs=avc1,opus", raw, repair = true)
        try {
            report("mp4opus.after", saved.media.toString() + " repair=" + saved.repair + " " + saved.repairNote)
            assertTrue(saved.repair == "mp4-remux" || (saved.repair == "none" && saved.repairNote.isNotEmpty()))
            if (saved.repair == "none") {
                val (bytes, crc) = WivraProgressiveExportSession.measure(context.contentResolver.openInputStream(saved.uri)!!)
                assertEquals(raw.size.toLong(), bytes); assertEquals(CRC32().apply { update(raw) }.value, crc)
            }
        } finally { context.contentResolver.delete(saved.uri, null, null) }
    }
}
