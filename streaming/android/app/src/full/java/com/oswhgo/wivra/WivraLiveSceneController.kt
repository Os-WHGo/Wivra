package com.oswhgo.wivra

import android.app.AlertDialog
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.ImageDecoder
import android.media.MediaPlayer
import android.net.Uri
import android.widget.Button
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import com.pedro.encoder.input.gl.render.filters.`object`.BaseObjectFilterRender
import com.pedro.encoder.input.gl.render.filters.`object`.ImageObjectFilterRender
import com.pedro.encoder.input.gl.render.filters.`object`.SurfaceFilterRender
import com.pedro.encoder.input.sources.audio.MicrophoneSource
import com.pedro.library.rtmp.RtmpStream

/**
 * LIVE scene selector for the phone-camera publisher (RootEncoder).
 *
 * The camera is the base video; a black backdrop, a local video and a local
 * image are RootEncoder object filters drawn on top. A scene only changes
 * their position, size and visibility, so switching never restarts the
 * stream. Videos and images are chosen BEFORE going live: leaving the LIVE
 * screen (the system file picker) stops the broadcast by design.
 *
 * - Nothing is uploaded except the RTMP stream itself; picked files are read
 *   once from the system picker and their URIs are not persisted.
 * - The video's own sound goes into the LIVE: its audio track is decoded
 *   (WivraVideoAudioFeed) and mixed into the LIVE microphone buffer through
 *   RootEncoder's CustomAudioEffect. No extra permission and no screen or
 *   internal-audio capture. It needs the LIVE audio (microphone) enabled,
 *   because that buffer is the stream's only audio track. On the phone the
 *   video plays silent (no speaker echo into the microphone).
 * - Before going live the video preview is silent; when the LIVE starts in a
 *   video scene the video restarts from the beginning with its sound.
 * - Filters are released by RootEncoder whenever the preview stops, so they
 *   are recreated in reattach() each time the preview starts again.
 * Not verified on a physical phone. — Claude
 */
class WivraLiveSceneController(
    private val activity: ComponentActivity,
    private val isLive: () -> Boolean
) {
    private val frameW = 480   // WivraPhoneLiveActivity: 640x480 with rotation 90
    private val frameH = 640
    private var stream: RtmpStream? = null
    private var backdrop: ImageObjectFilterRender? = null
    private var videoLayer: SurfaceFilterRender? = null
    private var imageLayer: ImageObjectFilterRender? = null
    private var player: MediaPlayer? = null
    private var playerReady = false
    private var videoSize: Pair<Int, Int>? = null
    private var image: Bitmap? = null
    private var current = "camera"
    private var corner = WivraMulticamPolicy.Corner.BOTTOM_RIGHT
    private var videoSoundToLive = true
    private var videoUri: Uri? = null
    private var videoEnded = false
    private var feed: WivraVideoAudioFeed? = null
    private val effect = WivraSceneAudioEffect()
    private val buttons = mutableMapOf<String, Button>()
    private val note = TextView(activity).apply { textSize = 13f }

    private val pickVideo = activity.registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) loadVideo(uri)
    }
    private val pickImage = activity.registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) loadImage(uri)
    }

    val panel: LinearLayout = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        addView(TextView(activity).apply { text = "Escenas del LIVE"; textSize = 15f })
        val row = LinearLayout(activity).apply { orientation = LinearLayout.HORIZONTAL }
        for (p in WivraLiveScenes.PRESETS) {
            val b = Button(activity).apply {
                text = p.label
                setOnClickListener { select(p.id) }
            }
            buttons[p.id] = b
            row.addView(b)
        }
        addView(HorizontalScrollView(activity).apply { addView(row) })
        addView(Button(activity).apply {
            text = "Fuentes: elegir video o imagen…"
            setOnClickListener { showSources() }
        })
        addView(note)
    }

    init { refresh() }

    fun bind(publisher: RtmpStream) {
        stream = publisher
    }

    /** Recreate the layers after every startPreview (RootEncoder released them). */
    fun reattach() {
        val gl = stream?.getGlInterface() ?: return
        runCatching { gl.clearFilters() }
        val black = Bitmap.createBitmap(2, 2, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.BLACK) }
        backdrop = ImageObjectFilterRender().apply { setImage(black); alpha = 0f }
        videoLayer = SurfaceFilterRender { _ ->
            // Main thread (RootEncoder posts it). Attach the player to the new surface.
            val surface = videoLayer?.surface
            if (surface != null) runCatching { player?.setSurface(surface) }
        }.apply { alpha = 0f }
        imageLayer = ImageObjectFilterRender().apply { image?.let { setImage(it) }; alpha = 0f }
        gl.addFilter(backdrop!!)
        gl.addFilter(videoLayer!!)
        gl.addFilter(imageLayer!!)
        apply(current)
    }

    private fun available() = WivraLiveScenes.available(videoLoaded = playerReady, imageLoaded = image != null)

    fun select(id: String) {
        if (id == current) return
        if (id !in available()) {
            note.text = "Esa escena necesita una fuente: elige un video o una imagen antes de iniciar el LIVE."
            return
        }
        val before = WivraLiveScenes.preset(current)
        val after = WivraLiveScenes.preset(id) ?: return
        current = id
        apply(id)
        val wantsVideo = WivraLiveScenes.Slot.VIDEO in after.show
        val hadVideo = before?.show?.containsKey(WivraLiveScenes.Slot.VIDEO) == true
        if (wantsVideo && !hadVideo) startVideo(fromStart = false)
        if (!wantsVideo && hadVideo) pauseVideo()
        refresh()
    }

    private fun mic(): MicrophoneSource? = stream?.audioSource as? MicrophoneSource

    /** A fresh decoder at the start of the file, in the LIVE audio format. */
    private fun newFeed() {
        feed?.stop()
        feed = null
        effect.feed = null
        val uri = videoUri ?: return
        val m = mic() ?: return // no LIVE audio track to mix into
        val f = WivraVideoAudioFeed(activity.applicationContext, uri,
            m.sampleRate.takeIf { it > 0 } ?: 44_100, if (m.isStereo) 2 else 1)
        feed = f
        effect.feed = f
    }

    private fun startVideo(fromStart: Boolean) {
        val mp = player ?: return
        if (fromStart || videoEnded) {
            runCatching { mp.seekTo(0) }
            videoEnded = false
            feed?.stop(); feed = null; effect.feed = null
        }
        runCatching { mp.start() }
        if (!isLive()) return
        if (mic() == null) {
            note.text = "El sonido del video necesita el audio del LIVE (micrófono) activado."
            return
        }
        if (feed == null) newFeed()
        feed?.play()
        effect.active = videoSoundToLive
    }

    private fun pauseVideo() {
        runCatching { player?.pause() }
        feed?.pause()
        effect.active = false
    }

    /** Called right after the LIVE starts (new audio source). */
    fun reapply() {
        apply(current)
        // Going live in a video scene: the video restarts with its sound.
        if (WivraLiveScenes.preset(current)?.show?.containsKey(WivraLiveScenes.Slot.VIDEO) == true) {
            startVideo(fromStart = true)
        }
    }

    private fun apply(id: String) {
        val layout = WivraLiveScenes.layout(id, frameW, frameH, videoSize,
            image?.let { it.width to it.height }, corner)
        place(backdrop, layout.layers.getValue(WivraLiveScenes.Slot.BACKDROP))
        place(videoLayer, layout.layers.getValue(WivraLiveScenes.Slot.VIDEO))
        place(imageLayer, layout.layers.getValue(WivraLiveScenes.Slot.IMAGE))
        // The pause scene silences the microphone; any other scene restores it.
        mic()?.let { m ->
            runCatching { m.setAudioEffect(effect) }
            runCatching { if (layout.micMuted) m.mute() else m.unMute() }
        }
    }

    private fun place(layer: BaseObjectFilterRender?, spec: WivraLiveScenes.Layer) {
        layer ?: return
        if (!spec.visible) { layer.alpha = 0f; return }
        // RootEncoder sprites: percent of the frame, origin top-left.
        layer.setScale((spec.rect.w * 100).toFloat(), (spec.rect.h * 100).toFloat())
        layer.setPosition((spec.rect.x * 100).toFloat(), (spec.rect.y * 100).toFloat())
        layer.alpha = 1f
    }

    private fun fallback(slot: WivraLiveScenes.Slot, message: String) {
        val to = WivraLiveScenes.fallbackFor(current, slot) ?: return
        current = to
        apply(to)
        pauseVideo()
        note.text = message
        refresh()
    }

    private fun showSources() {
        if (isLive()) {
            note.text = "Durante el LIVE solo se cambian escenas. Elige videos e imágenes antes de iniciar."
            return
        }
        val options = arrayOf(
            "Elegir video del teléfono",
            "Elegir imagen (logo, QR, pausa)",
            "Mover recuadro de esquina",
            if (videoSoundToLive) "Sonido del video: va al LIVE" else "Sonido del video: silencio",
            "Quitar video e imagen"
        )
        AlertDialog.Builder(activity)
            .setTitle("Fuentes de las escenas")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> pickVideo.launch(arrayOf("video/*"))
                    1 -> pickImage.launch(arrayOf("image/*"))
                    2 -> { corner = corner.next(); apply(current) }
                    3 -> { videoSoundToLive = !videoSoundToLive; effect.active = videoSoundToLive && feed != null }
                    4 -> removeSources()
                }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }


    private fun loadVideo(uri: Uri) {
        releasePlayer()
        val mp = MediaPlayer()
        player = mp
        try {
            mp.setDataSource(activity, uri) // read through the picker grant only
            videoUri = uri
            videoEnded = false
            videoLayer?.surface?.let { mp.setSurface(it) }
            mp.setOnPreparedListener {
                if (player !== mp) return@setOnPreparedListener
                playerReady = true
                videoSize = if (mp.videoWidth > 0 && mp.videoHeight > 0) mp.videoWidth to mp.videoHeight else null
                // Silent on the phone: the sound goes into the LIVE mix instead.
                runCatching { mp.setVolume(0f, 0f) }
                note.text = "Video listo. Elige una escena con video."
                apply(current)
                refresh()
            }
            mp.setOnCompletionListener {
                if (player === mp) {
                    videoEnded = true
                    feed?.stop(); feed = null; effect.feed = null; effect.active = false
                    fallback(WivraLiveScenes.Slot.VIDEO, "El video terminó: de vuelta a la cámara.")
                }
            }
            mp.setOnErrorListener { _, _, _ ->
                if (player === mp) {
                    playerReady = false
                    fallback(WivraLiveScenes.Slot.VIDEO, "El video no se pudo reproducir: de vuelta a la cámara.")
                    refresh()
                }
                true
            }
            mp.prepareAsync()
            note.text = "Preparando el video…"
        } catch (_: Exception) {
            releasePlayer()
            note.text = "No se pudo abrir ese video."
        }
    }

    private fun loadImage(uri: Uri) {
        val bitmap = try {
            val source = ImageDecoder.createSource(activity.contentResolver, uri)
            ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
                val longest = maxOf(info.size.width, info.size.height)
                if (longest > 1280) decoder.setTargetSampleSize((longest + 1279) / 1280)
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            }
        } catch (_: Exception) {
            note.text = "No se pudo abrir esa imagen."
            return
        }
        image = bitmap
        imageLayer?.setImage(bitmap)
        note.text = "Imagen lista. Elige una escena con imagen."
        apply(current)
        refresh()
    }

    private fun removeSources() {
        if (isLive()) return
        current = "camera"
        releasePlayer()
        // No recycle(): the GL thread may still be uploading the old bitmap.
        imageLayer?.setImage(null)
        image = null
        apply(current)
        note.text = "Fuentes quitadas."
        refresh()
    }

    private fun refresh() {
        val ok = available()
        for ((id, b) in buttons) {
            b.isEnabled = id in ok
            b.alpha = if (id == current) 1f else 0.75f
            b.text = (if (id == current) "● " else "") + (WivraLiveScenes.preset(id)?.label ?: id)
        }
    }

    /** Host screen stopped: the stream stops too; keep sources, pause playback. */
    fun onHostStop() {
        pauseVideo()
        if (WivraLiveScenes.preset(current)?.show?.containsKey(WivraLiveScenes.Slot.VIDEO) == true) {
            current = "camera"
            refresh()
        }
    }

    private fun releasePlayer() {
        feed?.stop()
        feed = null
        effect.feed = null
        effect.active = false
        videoUri = null
        val mp = player ?: return
        player = null
        playerReady = false
        videoSize = null
        runCatching { mp.reset() }
        runCatching { mp.release() }
    }

    fun release() {
        releasePlayer()
        image = null
        stream = null
    }
}
