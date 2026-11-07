package com.oswhgo.wivra

import java.nio.ByteBuffer

/**
 * Bounded hand-over of decoded Ray-Ban frames to the LIVE encoder: two reused buffers, the newest frame wins
 * and older undrawn frames are counted as dropped. Memory never grows with the stream length. — Claude
 */
class WivraLatestFrameSlot {
    private val lock = Any()
    private var back = ByteArray(0)
    private var front = ByteArray(0)
    private var backWidth = 0
    private var backHeight = 0
    private var fresh = false
    var offered = 0L; private set
    var dropped = 0L; private set

    /** Copies the frame (the caller's buffer may be reused by DAT right after). False for a bad size. */
    fun offer(frame: ByteBuffer, width: Int, height: Int): Boolean {
        if (width <= 0 || height <= 0 || width % 2 != 0 || height % 2 != 0 ||
            width.toLong() * height > 1280L * 1920L) return false
        val bytes = width * height * 3 / 2
        val source = frame.duplicate()
        if (source.remaining() != bytes) return false
        synchronized(lock) {
            if (fresh) dropped++
            if (back.size != bytes) back = ByteArray(bytes)
            source.get(back)
            backWidth = width
            backHeight = height
            fresh = true
            offered++
        }
        return true
    }

    /** Hands the newest frame to [use] on the caller's thread; false when nothing new arrived. */
    fun take(use: (ByteArray, Int, Int) -> Unit): Boolean {
        val width: Int
        val height: Int
        val frame: ByteArray
        synchronized(lock) {
            if (!fresh) return false
            val t = front; front = back; back = t
            fresh = false
            width = backWidth; height = backHeight
            frame = front
        }
        use(frame, width, height)
        return true
    }
}
