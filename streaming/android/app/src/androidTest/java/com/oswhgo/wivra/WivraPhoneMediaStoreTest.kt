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
}
