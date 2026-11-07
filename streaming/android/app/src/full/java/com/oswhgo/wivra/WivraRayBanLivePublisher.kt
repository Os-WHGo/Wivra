package com.oswhgo.wivra

import android.content.Context
import android.media.AudioDeviceInfo
import android.os.Handler
import android.os.Looper
import com.pedro.common.ConnectChecker
import com.pedro.encoder.input.sources.audio.MicrophoneSource
import com.pedro.encoder.input.sources.audio.NoAudioSource
import com.pedro.library.base.recording.RecordController
import com.pedro.library.rtmp.RtmpStream
import java.io.File
import java.nio.ByteBuffer

/**
 * Ray-Ban → LIVE on the existing RootEncoder engine (same RtmpStream, H.264/AAC, RTMP/RTMPS, reconnection
 * policy and private MP4 copy as the phone LIVE). Audio only from the microphone the person chose, set as
 * the preferred device of RootEncoder's own AudioRecord; if Android refuses it, LIVE does not start with
 * another one. The address (with its stream key) is never stored, logged or shown. — Claude
 */
class WivraRayBanLivePublisher : WivraRayBanLive, ConnectChecker {
    private val main = Handler(Looper.getMainLooper())
    private var stream: RtmpStream? = null
    private var source: WivraRayBanVideoSource? = null
    private var microphone: MicrophoneSource? = null
    private var listener: WivraRayBanLive.Listener? = null
    private var reconnect = WivraLiveReconnect()
    @Volatile private var live = false
    @Volatile private var stopping = false

    override val isLive: Boolean get() = live

    override fun start(context: Context, address: String?, plan: WivraRayBanLivePlan.Plan, microphone: AudioDeviceInfo?,
                       copy: File?, listener: WivraRayBanLive.Listener): Boolean {
        if (stream != null || (address == null && copy == null)) return false
        if (address != null && !WivraLiveEndpoint.valid(address)) return false
        this.listener = listener
        val video = WivraRayBanVideoSource()
        val mic = if (microphone != null) MicrophoneSource() else null
        val publisher = RtmpStream(context.applicationContext, this, video, mic ?: NoAudioSource())
        try {
            // The glasses' own size first; a 16-aligned, slightly smaller size if the encoder refuses it.
            val ready = publisher.prepareVideo(plan.width, plan.height, plan.videoBitrate, fps = plan.fps,
                iFrameInterval = plan.keyframeSeconds, rotation = 0) ||
                publisher.prepareVideo(plan.fallbackWidth, plan.fallbackHeight, plan.videoBitrate, fps = plan.fps,
                    iFrameInterval = plan.keyframeSeconds, rotation = 0)
            if (!ready || !publisher.prepareAudio(plan.audioSampleRate, false, maxOf(plan.audioBitrate, 64_000))) {
                publisher.release(); return false
            }
            // Never fall back to another microphone (and never to the glasses').
            if (mic != null && !mic.setPreferredDevice(microphone)) { publisher.release(); return false }
            publisher.getGlInterface().setForceRender(true, plan.fps)
            stream = publisher; source = video; this.microphone = mic
            stopping = false
            if (copy != null) publisher.startRecord(copy.absolutePath,
                if (mic != null) RecordController.RecordTracks.ALL else RecordController.RecordTracks.VIDEO) { }
            if (address != null) {
                reconnect = WivraLiveReconnect()
                runCatching { publisher.getStreamClient().setReTries(WivraLiveReconnect.DELAYS_S.size) }
                live = true
                publisher.startStream(address)
            }
            return true
        } catch (_: Exception) {
            runCatching { publisher.wivraStopOnce() }
            stream = null; source = null; this.microphone = null; live = false
            return false
        }
    }

    override fun offerI420(frame: ByteBuffer, width: Int, height: Int) { source?.offer(frame, width, height) }

    override fun confirmation(context: Context, address: String, bps: Long): String? {
        val host = WivraLiveEndpoint.displayHost(address) ?: return null
        val network = WivraLiveNetworkProbe.confirmationLine(context, bps) ?: return null
        return host + "\n" + network
    }

    override fun muteMicrophone() { runCatching { microphone?.mute() } }

    override fun stop(): Boolean {
        val publisher = stream ?: return false
        stopping = true
        live = false
        val closed = publisher.wivraStopOnce()
        stream = null; source = null; microphone = null
        return closed
    }

    override fun stats(): WivraRayBanLive.Stats = source?.let {
        WivraRayBanLive.Stats(it.offered, it.dropped, it.drawn, it.repeated, it.convertMs)
    } ?: WivraRayBanLive.Stats(0, 0, 0, 0, 0.0)

    private fun say(status: String, a: Int = 0, b: Int = 0, c: Int = 0) {
        main.post { listener?.onLiveStatus(status, a, b, c) }
    }

    // The url and reason may contain the stream key: never shown, logged or forwarded.
    override fun onConnectionStarted(url: String) { say("connecting") }
    override fun onConnectionSuccess() { if (!stopping) { reconnect.connected(); say("on_air") } }
    override fun onConnectionFailed(reason: String) {
        if (stopping || !live) return
        val delay = reconnect.nextDelayMs()
        if (delay != null && runCatching { stream?.getStreamClient()?.reTry(delay, reason) == true }.getOrDefault(false)) {
            say("reconnect", reconnect.attempt, WivraLiveReconnect.DELAYS_S.size, (delay / 1000).toInt())
            return
        }
        live = false
        runCatching { if (stream?.isStreaming == true) stream?.stopStream() }
        say("failed")
    }
    override fun onDisconnect() { if (!stopping) say("disconnected") }
    override fun onAuthError() {
        if (stopping) return
        live = false
        runCatching { if (stream?.isStreaming == true) stream?.stopStream() }
        say("auth")
    }
    override fun onAuthSuccess() {}
}
