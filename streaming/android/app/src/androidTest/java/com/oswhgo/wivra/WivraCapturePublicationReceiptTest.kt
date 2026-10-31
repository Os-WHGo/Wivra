package com.oswhgo.wivra

import android.content.ContentValues
import android.provider.MediaStore
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class WivraCapturePublicationReceiptTest {
    @Test fun restartReusesOnlyAnOwnedByteIdenticalPendingOrPublishedCopy() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val resolver = context.contentResolver
        val source = File.createTempFile("wivra_rayban_", ".mp4", context.cacheDir)
        val uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, "Wivra_RayBan_receipt_" + UUID.randomUUID() + ".mp4")
            put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
            put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/Wivra/")
            put(MediaStore.Video.Media.IS_PENDING, 1)
        })!!
        try {
            source.writeBytes(ByteArray(280_000) { (it % 251).toByte() })
            val original = source.readBytes()
            val digest = WivraMediaCopy.copyAndVerify(resolver, source, uri)
            WivraCapturePublicationReceipt.stage(source, uri, digest)
            assertEquals(uri, WivraCapturePublicationReceipt.recover(context, source))
            resolver.update(uri, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null)
            val reopened = context.createPackageContext(context.packageName, 0)
            assertEquals(uri, WivraCapturePublicationReceipt.recover(reopened, source))
            assertArrayEquals(original, source.readBytes())
            source.writeBytes(original.copyOf(original.size - 1))
            assertNull(WivraCapturePublicationReceipt.recover(context, source))
            source.writeBytes(original)
            resolver.openOutputStream(uri, "wt")!!.use { it.write(byteArrayOf(1, 2, 3)) }
            assertNull(WivraCapturePublicationReceipt.recover(context, source))
            assertArrayEquals(original, source.readBytes())
        } finally {
            WivraCapturePublicationReceipt.clear(source)
            source.delete()
            resolver.delete(uri, null, null)
        }
    }
}
