package com.oswhgo.wivra

import android.content.Context
import android.media.AudioDeviceInfo
import java.io.File
import java.nio.ByteBuffer

/**
 * Ray-Ban → LIVE through the EXISTING LIVE engine (RootEncoder, full package only): decoded DAT frames are
 * encoded to H.264 by the phone, the chosen phone/USB/external Bluetooth microphone to AAC (never the
 * glasses' HFP microphone), sent over RTMP/RTMPS, optionally with a simultaneous private MP4.
 * No second engine: the implementation (WivraRayBanLivePublisher) lives next to the phone LIVE. — Claude
 */
interface WivraRayBanLive {
    interface Listener {
        /** status: connecting, on_air, reconnect (a = attempt, b = of, c = seconds), failed, disconnected, auth. */
        fun onLiveStatus(status: String, a: Int = 0, b: Int = 0, c: Int = 0)
    }

    data class Stats(val offered: Long, val dropped: Long, val drawn: Long, val repeated: Long, val convertMs: Double)

    /** address null = local copy only (used by tests). The address is never stored, logged or shown. */
    fun start(context: Context, address: String?, plan: WivraRayBanLivePlan.Plan, microphone: AudioDeviceInfo?,
              copy: File?, listener: Listener, look: WivraRayBanLook = WivraRayBanLook.DEFAULT): Boolean

    /** Light GPU look on the transmitted image only (the glasses' original is never filtered). No restart. */
    fun setLook(look: WivraRayBanLook)

    /** Latest frame wins: a bounded slot that drops older frames instead of queueing them. */
    fun offerI420(frame: ByteBuffer, width: Int, height: Int)

    /** Confirmation text (server host + network/data use), or null if the address is invalid or offline. */
    fun confirmation(context: Context, address: String, bps: Long): String?

    fun muteMicrophone()
    /** Stops LIVE and the copy; true when the local MP4 was closed by its muxer. */
    fun stop(): Boolean
    val isLive: Boolean
    fun stats(): Stats
}

object WivraRayBanLiveFactory {
    /** Null in the package without LIVE (no RootEncoder). */
    fun create(): WivraRayBanLive? = try {
        Class.forName("com.oswhgo.wivra.WivraRayBanLivePublisher").getDeclaredConstructor().newInstance() as WivraRayBanLive
    } catch (_: ReflectiveOperationException) { null } catch (_: ClassCastException) { null }
}

/**
 * Output size and bitrate for each glasses profile: the frame size the glasses send (never up-scaled), and a
 * 16-aligned, slightly smaller fallback for encoders that refuse 8-aligned widths. Vectors in
 * streaming/contracts/rayban-live.json.
 */
object WivraRayBanLivePlan {
    data class Plan(val width: Int, val height: Int, val fallbackWidth: Int, val fallbackHeight: Int, val fps: Int,
                    val videoBitrate: Int, val keyframeSeconds: Int, val audioSampleRate: Int, val audioBitrate: Int)

    fun forProfile(profile: WivraDatProfile, withAudio: Boolean): Plan {
        val bitrate = when (profile.height) {
            640 -> 800_000
            896 -> if (profile.fps >= 30) 2_000_000 else 1_600_000
            else -> if (profile.fps >= 30) 3_000_000 else 2_500_000
        }
        val (fw, fh) = when (profile.height) { 640 -> 352 to 624; 896 -> 480 to 848; else -> 720 to 1280 }
        return Plan(profile.width, profile.height, fw, fh, profile.fps, bitrate, 2, 44_100, if (withAudio) 96_000 else 0)
    }

    /** Bits per second announced before going live (network line of the confirmation). */
    fun totalBps(plan: Plan): Long = plan.videoBitrate.toLong() + plan.audioBitrate
}
