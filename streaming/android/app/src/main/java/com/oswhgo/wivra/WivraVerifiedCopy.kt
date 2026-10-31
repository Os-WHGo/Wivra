package com.oswhgo.wivra

import java.io.InputStream
import java.io.OutputStream
import java.io.IOException
import java.security.MessageDigest

/** Bounded-memory copy/readback integrity primitive, independent of Android. — ChatGPT */
internal object WivraVerifiedCopy {
    data class Digest(val bytes: Long, val sha256: String)

    fun measure(input: InputStream, output: OutputStream? = null): Digest {
        val hash = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(128 * 1024)
        var size = 0L
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            if (count == 0) throw IOException("Source stopped providing media bytes")
            output?.write(buffer, 0, count)
            hash.update(buffer, 0, count)
            size += count
        }
        return Digest(size, hash.digest().joinToString("") { "%02x".format(it) })
    }

    fun verify(input: InputStream, expected: Digest) {
        if (expected.bytes <= 0 || measure(input) != expected) throw IOException("Media copy readback differs from original")
    }
}
