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
        // One chroma sample serves a 2×2 block: its three products are computed once (same integers as per pixel).
        for (cy in 0 until height / 2) {
            for (cx in 0 until chromaWidth) {
                val c = cy * chromaWidth + cx
                val u = (src[uBase + c].toInt() and 255) - 128
                val v = (src[vBase + c].toInt() and 255) - 128
                val rv = (1436 * v) shr 10
                val guv = (352 * u + 731 * v) shr 10
                val bu = (1815 * u) shr 10
                var index = (cy * 2) * width + cx * 2
                for (dy in 0..1) {
                    for (dx in 0..1) {
                        val y = src[index + dx].toInt() and 255
                        out[index + dx] = (0xFF shl 24) or (clamp(y + rv) shl 16) or (clamp(y - guv) shl 8) or clamp(y + bu)
                    }
                    index += width
                }
            }
        }
        return true
    }

    private fun clamp(x: Int) = if (x < 0) 0 else if (x > 255) 255 else x
}
