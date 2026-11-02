package com.oswhgo.wivra

import android.content.ContentValues
import android.provider.MediaStore
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Emulator/device-only MediaStore test, NOT a test of HEVC playback or
 * Ray-Ban DAT hardware. Compilation in CI does not mean it was executed.
 */
@RunWith(AndroidJUnit4::class)
class WivraSavedRayBanVideosTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Test fun onlyPublishedAppOwnedRayBanMp4AppearsInPicker() {
        val resolver = context.contentResolver
        val filename = "Wivra_RayBan_SyntheticPicker_${System.currentTimeMillis()}.mp4"
        val entry = ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, filename)
            put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
            put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/Wivra/")
            put(MediaStore.Video.Media.IS_PENDING, 1)
        }
        val uri = requireNotNull(resolver.insert(
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI, entry
        )) { "Cannot create synthetic MediaStore entry" }

        try {
            // Deliberately synthetic, non-playable media metadata. No user video is read.
            resolver.openOutputStream(uri, "w")!!.use { it.write(
                byteArrayOf(
                    0,0,0,24, 0x66,0x74,0x79,0x70,
                    0x69,0x73,0x6f,0x6d, 0,0,0,0,
                    0x69,0x73,0x6f,0x6d, 0x6d,0x70,0x34,0x32
                )
            ) }
            assertFalse(WivraSavedRayBanVideos.latestSaved(context).any {
                it.uri == uri
            })
            val published = ContentValues().apply {
                put(MediaStore.Video.Media.IS_PENDING, 0)
            }
            assertTrue(resolver.update(uri, published, null, null) > 0)
            assertTrue(WivraSavedRayBanVideos.latestSaved(context).any {
                it.uri == uri && it.title == filename
            })
        } finally {
            resolver.delete(uri, null, null)
        }
    }
}
