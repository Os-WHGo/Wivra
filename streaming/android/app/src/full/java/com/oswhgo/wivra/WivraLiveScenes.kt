package com.oswhgo.wivra

/**
 * Pure LIVE scene model for Android (no Android imports, JVM-tested).
 * Mirrors core/live-scenes.mjs. On Android the camera is RootEncoder's base
 * source and always fills the frame, so scenes that need the camera as a
 * small layer are not offered here. — Claude
 */
object WivraLiveScenes {
    // File pickers leave this foreground-only publisher. Internal scene changes do not.
    enum class SourceAction { PICK_VIDEO, PICK_IMAGE, STANDBY, MOVE_INSET, VIDEO_SOUND, REMOVE }
    fun sourceActions(live: Boolean): List<SourceAction> = SourceAction.entries.filter {
        !live || it in setOf(SourceAction.STANDBY, SourceAction.MOVE_INSET, SourceAction.VIDEO_SOUND)
    }

    enum class Slot { BACKDROP, VIDEO, IMAGE }
    enum class Place { FULL, PIP, TOP_HALF, BOTTOM_HALF }

    data class Rect(val x: Double, val y: Double, val w: Double, val h: Double)
    data class Layer(val visible: Boolean, val rect: Rect)
    data class Layout(val scene: String, val layers: Map<Slot, Layer>, val micMuted: Boolean, val usesVideo: Boolean)
    data class Preset(val id: String, val label: String, val show: Map<Slot, Place>, val micMuted: Boolean = false)

    // Same order and ids as SCENE_PRESETS (minus "video-camera": camera as a layer).
    val PRESETS = listOf(
        Preset("camera", "Cámara", emptyMap()),
        Preset("camera-video", "Cámara + video", mapOf(Slot.VIDEO to Place.PIP)),
        // The camera stays visible in the top half; the bottom half is covered.
        Preset("split", "Cámara arriba, video abajo", mapOf(Slot.BACKDROP to Place.BOTTOM_HALF, Slot.VIDEO to Place.BOTTOM_HALF)),
        Preset("video", "Solo video", mapOf(Slot.BACKDROP to Place.FULL, Slot.VIDEO to Place.FULL)),
        Preset("camera-image", "Cámara + imagen", mapOf(Slot.IMAGE to Place.PIP)),
        Preset("image", "Imagen (pausa)", mapOf(Slot.BACKDROP to Place.FULL, Slot.IMAGE to Place.FULL), micMuted = true)
    )

    private fun round6(v: Double) = Math.round(v * 1_000_000.0) / 1_000_000.0
    private fun r6(r: Rect) = Rect(round6(r.x), round6(r.y), round6(r.w), round6(r.h))

    fun preset(id: String): Preset? = PRESETS.firstOrNull { it.id == id }

    fun available(videoLoaded: Boolean, imageLoaded: Boolean): List<String> = PRESETS.filter { p ->
        (Slot.VIDEO !in p.show || videoLoaded) && (Slot.IMAGE !in p.show || imageLoaded)
    }.map { it.id }

    fun contain(region: Rect, mediaW: Int, mediaH: Int, frameW: Int, frameH: Int): Rect {
        if (mediaW <= 0 || mediaH <= 0 || frameW <= 0 || frameH <= 0) return r6(region)
        val rw = region.w * frameW
        val rh = region.h * frameH
        val a = mediaW.toDouble() / mediaH
        val (pw, ph) = if (rw / rh > a) rh * a to rh else rw to rw / a
        return r6(Rect(region.x + (rw - pw) / 2 / frameW, region.y + (rh - ph) / 2 / frameH, pw / frameW, ph / frameH))
    }

    fun layout(
        sceneId: String, frameW: Int, frameH: Int,
        videoSize: Pair<Int, Int>? = null, imageSize: Pair<Int, Int>? = null,
        corner: WivraMulticamPolicy.Corner = WivraMulticamPolicy.Corner.BOTTOM_RIGHT, pipScale: Double = 0.35
    ): Layout {
        val p = preset(sceneId) ?: throw IllegalArgumentException("Unknown scene")
        val pip = WivraMulticamPolicy.pipRect(corner, pipScale, 0.04, frameW, frameH)
        val layers = Slot.values().associateWith { slot ->
            val place = p.show[slot] ?: return@associateWith Layer(false, Rect(0.0, 0.0, 0.0, 0.0))
            val region = when (place) {
                Place.FULL -> Rect(0.0, 0.0, 1.0, 1.0)
                Place.PIP -> Rect(pip.x, pip.y, pip.w, pip.h)
                Place.TOP_HALF -> Rect(0.0, 0.0, 1.0, 0.5)
                Place.BOTTOM_HALF -> Rect(0.0, 0.5, 1.0, 0.5)
            }
            val size = when (slot) { Slot.VIDEO -> videoSize; Slot.IMAGE -> imageSize; Slot.BACKDROP -> null }
            Layer(true, if (size != null) contain(region, size.first, size.second, frameW, frameH) else r6(region))
        }
        return Layout(p.id, layers, p.micMuted, Slot.VIDEO in p.show)
    }

    /** Where to go when a source ends, fails or is removed: plain camera. */
    fun fallbackFor(current: String, lostSlot: Slot): String? =
        if (preset(current)?.show?.containsKey(lostSlot) == true) "camera" else null
}
