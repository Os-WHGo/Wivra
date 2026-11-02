package com.oswhgo.wivra

import android.graphics.Bitmap
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Run on Android emulator/device; packaging this test APK is NOT execution.
 * Tests our own bitmap->MediaStore path, not Ray-Ban DAT hardware.
 */
@RunWith(AndroidJUnit4::class)
class WivraMetaPhotoStoreTest {
    private val context
        get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Test fun capturedJpegAppearsInWivraMediaStoreAndCanBeRead() {
        val bitmap = Bitmap.createBitmap(8, 8, Bitmap.Config.ARGB_8888).apply {
            eraseColor(android.graphics.Color.CYAN)
        }
        val uri = try {
            WivraMetaPhotoStore.saveBitmap(context, bitmap)
        } finally {
            bitmap.recycle()
        }
        try {
            assertEquals("content", uri.scheme)
            assertEquals("image/jpeg", context.contentResolver.getType(uri))
            val data = context.contentResolver.openInputStream(uri)!!.use { it.readBytes() }
            assertTrue("image contains JPEG header", data.size > 4)
            assertEquals(0xff, data[0].toInt() and 0xff)
            assertEquals(0xd8, data[1].toInt() and 0xff)
            assertNotNull("our recent image remains available for editor picker",
                WivraMetaPhotoStore.latestCapturedPhoto(context))
        } finally {
            // Never leave synthetic test artifacts in the user's gallery.
            context.contentResolver.delete(uri, null, null)
        }
    }
}
