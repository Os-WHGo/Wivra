package com.oswhgo.wivra

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException

class WivraVerifiedCopyTest {
    @Test fun copyMatchesPublishedSha256VectorAndVerifiesDiskReadback() {
        val original = "123456789".toByteArray()
        val output = ByteArrayOutputStream()
        val digest = WivraVerifiedCopy.measure(ByteArrayInputStream(original), output)
        assertEquals(9L, digest.bytes)
        assertEquals("15e2b0d3c33891ebb0f1ef609ec419420c20e320ce94c65fbc8c3312448eb225", digest.sha256)
        assertArrayEquals(original, output.toByteArray())
        WivraVerifiedCopy.verify(ByteArrayInputStream(output.toByteArray()), digest)
        for (bad in listOf(original.copyOf(8), "123456788".toByteArray(), byteArrayOf())) {
            try { WivraVerifiedCopy.verify(ByteArrayInputStream(bad), digest); fail("must reject corrupt copy") }
            catch (_: IOException) { }
        }
    }
}
