package com.oswhgo.wivra

import android.content.Context
import com.pedro.encoder.input.gl.render.filters.`object`.ImageObjectFilterRender
import com.pedro.encoder.input.gl.render.filters.`object`.SurfaceFilterRender
import com.pedro.encoder.input.sources.video.Camera2Source
import com.pedro.encoder.input.video.CameraHelper
import com.pedro.library.view.GlStreamInterface

/**
 * The phone camera as a layer over the shared screen (RootEncoder object
 * filter fed by a second Camera2Source). Used only when the owner chose
 * "Mostrar mi cámara" and granted the camera permission; the service runs
 * with the camera foreground-service type in that case. — Claude
 */
class WivraScreenCameraLayer(
    private val context: Context,
    private val frontCamera: Boolean,
    private val onCameraFailed: () -> Unit
) {
    private var layer: SurfaceFilterRender? = null
    private var backdrop: ImageObjectFilterRender? = null
    private var camera: Camera2Source? = null
    private var pending: WivraScreenScene.CameraLayer? = null
    private var released = false

    /** Adds the layer to the stream; the camera opens when the GL surface exists. */
    fun attach(gl: GlStreamInterface) {
        // A black backdrop hides the screen when the camera fills the frame
        // after the owner stopped sharing (no stale last screen frame on air).
        val black = android.graphics.Bitmap.createBitmap(2, 2, android.graphics.Bitmap.Config.ARGB_8888)
            .apply { eraseColor(android.graphics.Color.BLACK) }
        backdrop = ImageObjectFilterRender().apply { setImage(black); alpha = 0f }
        layer = SurfaceFilterRender { texture ->
            if (released) return@SurfaceFilterRender
            try {
                val source = Camera2Source(context.applicationContext)
                if (frontCamera && source.getCameraFacing() != CameraHelper.Facing.FRONT) source.switchCamera()
                check(source.init(640, 480, 24, 0)) { "camera init" }
                source.start(texture)
                camera = source
            } catch (_: Exception) {
                camera = null
                onCameraFailed()
            }
        }.apply { alpha = 0f }
        gl.addFilter(backdrop!!)
        gl.addFilter(layer!!)
        pending?.let { place(it, backdropVisible = false) }
    }

    /** Applies WivraScreenScene.cameraLayer(); `backdropVisible` for camera-only. */
    fun place(spec: WivraScreenScene.CameraLayer, backdropVisible: Boolean) {
        pending = spec
        backdrop?.let { b ->
            b.setScale(100f, 100f); b.setPosition(0f, 0f)
            b.alpha = if (backdropVisible) 1f else 0f
        }
        val l = layer ?: return
        if (!spec.visible) { l.alpha = 0f; return }
        l.setScale((spec.rect.w * 100).toFloat(), (spec.rect.h * 100).toFloat())
        l.setPosition((spec.rect.x * 100).toFloat(), (spec.rect.y * 100).toFloat())
        l.rotation = spec.rotation
        l.alpha = 1f
    }

    fun isCameraRunning(): Boolean = camera?.isRunning() == true

    fun release() {
        released = true
        runCatching { camera?.stop() }
        runCatching { camera?.release() }
        camera = null
    }
}
