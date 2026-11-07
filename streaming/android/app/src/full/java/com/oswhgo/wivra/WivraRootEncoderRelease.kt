package com.oswhgo.wivra

import com.pedro.library.base.StreamBase

/**
 * RootEncoder 2.8.1: stopStream()/stopRecord() already stop the sources and GL, GL asynchronously on its own
 * executor. Calling release() right after stops GL a second time, synchronously, and both can free the
 * same EGL surfaces (native crash in eglDestroySurface seen in the emulator after the screen recording test).
 * This stops each part once, then releases only the sources. Returns stopRecord()'s result (muxer closed),
 * or false when nothing was recording. — Claude
 */
internal fun StreamBase.wivraStopOnce(): Boolean {
    val wasActive = isStreaming || isRecording || isOnPreview
    if (isStreaming) runCatching { stopStream() }
    val closed = if (isRecording) runCatching { stopRecord() }.getOrDefault(false) else false
    if (isOnPreview) runCatching { stopPreview() }
    // Never started: nothing was stopped above, so the full release is the only teardown.
    if (!wasActive) runCatching { release() } else {
        runCatching { videoSource.release() }
        runCatching { audioSource.release() }
    }
    return closed
}
