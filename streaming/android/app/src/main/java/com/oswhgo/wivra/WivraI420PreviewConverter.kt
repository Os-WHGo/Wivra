package com.oswhgo.wivra

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import java.io.ByteArrayOutputStream

/**
 * Private, strictly bounded preview-only conversion.
 *
 * DAT 1.0.1 provides decoded YUV 4:2:0 buffers when compressVideo=false.
 * The packed I420 (Y then U then V) layout is an observed Android convention,
 * NOT an explicit row-stride guarantee from Meta. Reject unexpected buffer sizes
 * instead of trying to render potentially corrupted chroma. Verify on hardware.
 *
 * JPEG conversion is deliberately throttled by the caller to ~6 FPS.
 * Do NOT use this preview converter for archival footage or video recording.
 */
internal object WivraI420PreviewConverter {
    fun decode(bytes: ByteArray, width: Int, height: Int): Bitmap? {
        if (width <= 0 || height <= 0 || width % 2 != 0 || height % 2 != 0) return null
        val lumaLong = width.toLong() * height.toLong()
        if (lumaLong <= 0 || lumaLong > 1280L * 1920L) return null
        val expectedLong = lumaLong * 3 / 2
        if (expectedLong != bytes.size.toLong()) return null

        val ySize = lumaLong.toInt()
        val chromaSize = ySize / 4
        val nv21 = ByteArray(bytes.size)
        System.arraycopy(bytes, 0, nv21, 0, ySize)
        val uStart = ySize
        val vStart = ySize + chromaSize
        for (index in 0 until chromaSize) {
            // Android NV21 expects VU interleaved, while I420 stores U then V.
            nv21[ySize + index * 2] = bytes[vStart + index]
            nv21[ySize + index * 2 + 1] = bytes[uStart + index]
        }
        val encoded = ByteArrayOutputStream()
        if (!YuvImage(nv21, ImageFormat.NV21, width, height, null)
                .compressToJpeg(Rect(0, 0, width, height), 75, encoded)) {
            return null
        }
        val jpeg = encoded.toByteArray()
        return BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size)
    }
}
