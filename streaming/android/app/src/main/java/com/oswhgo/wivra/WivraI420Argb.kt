package com.oswhgo.wivra

/**
 * Ray-Ban LIVE: decoded DAT frames (packed I420, `.raw`) to ARGB pixels for the LIVE encoder, without the
 * JPEG round trip of the 6 FPS preview. Full-range BT.601 (JFIF), the same colours as that preview's
 * NV21 → JPEG path; the exact DAT colour range is not documented by Meta (verify on glasses).
 * Fixed point ×1024; vectors in streaming/contracts/rayban-live.json. Pure Kotlin, JVM-tested. — Claude
 */
object WivraI420Argb {
    fun convert(src: ByteArray, width: Int, height: Int, out: IntArray): Boolean {
        if (width <= 0 || height <= 0 || width % 2 != 0 || height % 2 != 0) return false
        val luma = width.toLong() * height
        if (luma > 1280L * 1920L || src.size.toLong() != luma * 3 / 2 || out.size < luma) return false
        val ySize = luma.toInt()
        val chromaWidth = width / 2
        val uBase = ySize
        val vBase = ySize + ySize / 4
        for (row in 0 until height) {
            val chromaRow = (row shr 1) * chromaWidth
            var index = row * width
            for (column in 0 until width) {
                val y = src[index].toInt() and 255
                val c = chromaRow + (column shr 1)
                val u = (src[uBase + c].toInt() and 255) - 128
                val v = (src[vBase + c].toInt() and 255) - 128
                val r = clamp(y + ((1436 * v) shr 10))
                val g = clamp(y - ((352 * u + 731 * v) shr 10))
                val b = clamp(y + ((1815 * u) shr 10))
                out[index] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
                index++
            }
        }
        return true
    }

    private fun clamp(x: Int) = if (x < 0) 0 else if (x > 255) 255 else x
}
