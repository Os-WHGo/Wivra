package com.oswhgo.wivra

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.SurfaceTexture
import android.os.SystemClock
import android.view.Surface
import com.pedro.encoder.input.sources.OrientationConfig
import com.pedro.encoder.input.sources.OrientationForced
import com.pedro.encoder.input.sources.video.VideoSource
import java.nio.ByteBuffer

/**
 * RootEncoder video source fed by decoded Ray-Ban frames (DAT `.raw`). A render thread draws the newest
 * frame at the stream's frame rate (repeating the last one if the glasses are late, so the encoder keeps
 * its cadence); older frames are dropped, never queued. The picture is fitted, never stretched or
 * up-scaled into a fake resolution. Orientation: like RootEncoder's VideoFileSource, no camera rotation. — Claude
 */
class WivraRayBanVideoSource : VideoSource() {
    private val slot = WivraLatestFrameSlot()
    @Volatile private var running = false
    private var thread: Thread? = null
    private var surface: Surface? = null
    private var bitmap: Bitmap? = null
    private var pixels = IntArray(0)
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
    @Volatile var drawn = 0L; private set
    @Volatile var repeated = 0L; private set
    @Volatile var convertMs = 0.0; private set
    val offered get() = slot.offered
    val dropped get() = slot.dropped

    fun offer(frame: ByteBuffer, width: Int, height: Int) { slot.offer(frame, width, height) }

    override fun create(width: Int, height: Int, fps: Int, rotation: Int): Boolean = width > 0 && height > 0 && fps > 0

    override fun getOrientationConfig() = OrientationConfig(forced = OrientationForced.LANDSCAPE)

    override fun start(surfaceTexture: SurfaceTexture) {
        this.surfaceTexture = surfaceTexture
        if (running) return
        surfaceTexture.setDefaultBufferSize(width, height)
        val target = Surface(surfaceTexture)
        surface = target
        running = true
        thread = Thread({ renderLoop(target) }, "Wivra-RayBan-LIVE").apply { start() }
    }

    private fun renderLoop(target: Surface) {
        val interval = 1_000_000_000L / fps.coerceAtLeast(1)
        var next = System.nanoTime()
        val dst = Rect()
        while (running) {
            val fresh = slot.take { frame, w, h ->
                val started = SystemClock.elapsedRealtimeNanos()
                if (pixels.size != w * h) pixels = IntArray(w * h)
                if (WivraI420Argb.convert(frame, w, h, pixels)) {
                    val b = bitmap?.takeIf { it.width == w && it.height == h }
                        ?: Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also { bitmap?.recycle(); bitmap = it }
                    b.setPixels(pixels, 0, w, 0, 0, w, h)
                }
                val ms = (SystemClock.elapsedRealtimeNanos() - started) / 1e6
                convertMs = if (convertMs == 0.0) ms else convertMs * 0.9 + ms * 0.1
            }
            val picture = bitmap
            if (picture != null) {
                try {
                    val canvas = target.lockCanvas(null)
                    try {
                        canvas.drawColor(Color.BLACK)
                        // Fit inside the encoder frame, centred; never stretched.
                        val scale = minOf(width.toFloat() / picture.width, height.toFloat() / picture.height)
                        val w = (picture.width * scale).toInt()
                        val h = (picture.height * scale).toInt()
                        dst.set((width - w) / 2, (height - h) / 2, (width - w) / 2 + w, (height - h) / 2 + h)
                        canvas.drawBitmap(picture, null, dst, paint)
                    } finally { target.unlockCanvasAndPost(canvas) }
                    if (fresh) drawn++ else repeated++
                } catch (_: Exception) {
                    // A surface being torn down: the loop ends with running = false.
                }
            }
            next += interval
            val wait = next - System.nanoTime()
            if (wait > 0) Thread.sleep(wait / 1_000_000L, (wait % 1_000_000L).toInt()) else next = System.nanoTime()
        }
    }

    override fun stop() {
        running = false
        thread?.join(1_000L)
        thread = null
        surface?.release()
        surface = null
    }

    override fun release() {
        bitmap?.recycle()
        bitmap = null
    }

    override fun isRunning(): Boolean = running
}
