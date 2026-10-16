package com.oswhgo.wivra

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

/** Only a synthetic YUV fixture. Real glasses layout/colors require physical QA. */
@RunWith(AndroidJUnit4::class)
class PreviewConverterTest {
    @Test fun planarGrayFrameRendersWithExpectedDimensions() {
        val width = 4
        val height = 4
        val data = ByteArray(width * height * 3 / 2)
        data.fill(190.toByte(), 0, width * height)
        data.fill(128.toByte(), width * height)
        val bitmap = WivraI420PreviewConverter.decode(data, width, height)
        assertNotNull(bitmap)
        assertEquals(width, bitmap!!.width)
        assertEquals(height, bitmap.height)
        bitmap.recycle()
    }

    @Test fun rejectsUnexpectedLayoutWithoutDecoding() {
        assertNull(WivraI420PreviewConverter.decode(ByteArray(10), 4, 4))
        assertNull(WivraI420PreviewConverter.decode(ByteArray(24), 3, 4))
        assertNull(WivraI420PreviewConverter.decode(ByteArray(24), 4, 0))
        assertNull(WivraI420PreviewConverter.decode(ByteArray(24), 4000, 4000))
    }
}
