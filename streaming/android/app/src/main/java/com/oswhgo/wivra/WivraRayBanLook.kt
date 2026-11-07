package com.oswhgo.wivra

/**
 * Light, optional looks for the Ray-Ban LIVE image (streaming/contracts/rayban-looks.json). Applied on the
 * GPU to what is transmitted and to its private copy only; the glasses' original HEVC recording is never
 * filtered, and nothing invents resolution. No noise reduction: too costly for a phone in a pocket. — Claude
 */
enum class WivraRayBanLook(val id: String, val exposureEv: Float, val contrast: Float, val sharpen: Float) {
    OFF("off", 0f, 1f, 0f),
    CLEAR("clear", 0f, 1.05f, 0.2f),
    LOW_LIGHT("lowlight", 0.35f, 0.97f, 0f),
    VIVID("vivid", 0f, 1.12f, 0.1f);

    companion object {
        val DEFAULT = OFF
        fun from(id: String?): WivraRayBanLook = entries.firstOrNull { it.id == id } ?: DEFAULT

        /**
         * CPU reference of the GPU chain for one channel (0..1): exposure → contrast → 5-point sharpen,
         * clamped after each step like 8-bit textures. Used by tests to pin the parameters' meaning.
         */
        fun reference(look: WivraRayBanLook, center: Float, up: Float, left: Float, right: Float, down: Float): Float {
            fun clamp(v: Float) = v.coerceIn(0f, 1f)
            fun ec(v: Float): Float {
                val exposed = clamp(v * Math.pow(2.0, look.exposureEv.toDouble()).toFloat())
                return clamp((exposed - 0.5f) * look.contrast + 0.5f)
            }
            val x = ec(center)
            if (look.sharpen <= 0f) return x
            val k = look.sharpen
            return clamp((1f + 4f * k) * x - k * (ec(up) + ec(left) + ec(right) + ec(down)))
        }
    }
}
