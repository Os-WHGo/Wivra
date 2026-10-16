package com.oswhgo.wivra

import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Android device/emulator ONLY. In CI this test is compiled, not executed.
 * Uses made-up MP4 bytes, not the owner's video or the actual camera.
 */
@RunWith(AndroidJUnit4::class)
class WivraPhoneMediaStoreTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Test fun privatePhoneVideoRequiresExplicitPublication() {
        val privateVideo = WivraPhoneMediaStore.createPrivateVideo(context)
        var published: Uri? = null
        try {
            privateVideo.writeBytes(byteArrayOf(
                0,0,0,24, 0x66,0x74,0x79,0x70, 0x69,0x73,0x6f,0x6d,
                0,0,0,0, 0x69,0x73,0x6f,0x6d, 0x6d,0x70,0x34,0x32
            ))
            assertTrue(WivraPhoneMediaStore.pendingVideos(context).contains(privateVideo))
            assertFalse(WivraPhoneMediaStore.latestSavedVideos(context).any {
                it.title.contains(privateVideo.name)
            })
            published = WivraPhoneMediaStore.publish(context, privateVideo)
            assertFalse(privateVideo.exists())
            assertEquals("content", published.scheme)
            assertEquals("video/mp4", context.contentResolver.getType(published))
            assertTrue(WivraPhoneMediaStore.latestSavedVideos(context).any {
                it.uri == published
            })
        } finally {
            published?.let { context.contentResolver.delete(it, null, null) }
            privateVideo.delete()
        }
    }

    @Test fun pendingDeleteCannotActOnForeignFile() {
        val privateVideo = WivraPhoneMediaStore.createPrivateVideo(context)
        try {
            privateVideo.writeText("test")
            assertTrue(WivraPhoneMediaStore.discard(context, privateVideo))
            assertFalse(privateVideo.exists())
            val foreign = File(context.cacheDir, "pending-phone-foreign.mp4")
            foreign.writeText("do not delete")
            try {
                var refused = false
                try { WivraPhoneMediaStore.discard(context, foreign) }
                catch (_: IllegalArgumentException) { refused = true }
                assertTrue(refused)
                assertTrue(foreign.exists())
            } finally { foreign.delete() }
        } finally { privateVideo.delete() }
    }

    @Test fun wavRequiresValidManifestAndCompleteRiff() {
        val video = WivraPhoneMediaStore.createPrivateVideo(context)
        try {
            // Synthetic 4-byte PCM only: never touches a real microphone.
            video.writeText("synthetic MP4 placeholder")
            val wav = WivraPhoneMediaStore.privateWav(context, video)
            java.io.RandomAccessFile(wav, "rw").use { file ->
                fun u16(n: Int) {
                    file.write(n and 255)
                    file.write((n ushr 8) and 255)
                }
                fun u32(n: Long) {
                    for (shift in 0..24 step 8) file.write(((n ushr shift) and 255).toInt())
                }
                file.writeBytes("RIFF")
                u32(40L)
                file.writeBytes("WAVEfmt ")
                u32(16L)
                u16(1)
                u16(1)
                u32(48000L)
                u32(96000L)
                u16(2)
                u16(16)
                file.writeBytes("data")
                u32(4L)
                file.write(byteArrayOf(1, 2, 3, 4))
            }
            // A perfectly formed header alone cannot authenticate a track.
            assertFalse(WivraPhoneMediaStore.hasUsableWav(context, video))
            WivraPhoneMediaStore.saveSidecarTiming(
                context, video, 1_000_000_000L, 1_050_000_000L, 4L
            )
            assertTrue(WivraPhoneMediaStore.hasUsableWav(context, video))
            java.io.RandomAccessFile(wav, "rw").use { it.setLength(45L) }
            assertFalse(WivraPhoneMediaStore.hasUsableWav(context, video))
        } finally {
            WivraPhoneMediaStore.discard(context, video)
        }
    }
}
