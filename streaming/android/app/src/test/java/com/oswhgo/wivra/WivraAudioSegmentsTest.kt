package com.oswhgo.wivra

import android.media.AudioFormat
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.junit.Test

class WivraAudioSegmentsTest {
    @Test fun stereo48kBecomes16kMonoAverage() {
        val frames = 4800                                   // 0.1 s at 48 kHz
        val inter = ShortArray(frames * 2) { i -> if (i % 2 == 0) 1000 else 3000 }
        val out = WivraAudioSegments.toMono16k(inter, 2, 48_000)
        assertEquals(1600, out.size)                        // 0.1 s at 16 kHz
        assertEquals(2000, out[10].toInt())                 // (1000 + 3000) / 2
    }

    @Test fun emptyOrInvalidInputGivesNothing() {
        assertEquals(0, WivraAudioSegments.toMono16k(ShortArray(0), 2, 48_000).size)
        assertEquals(0, WivraAudioSegments.toMono16k(ShortArray(10), 0, 48_000).size)
    }

    // W104: some phones' decoders give float (or 8/24/32-bit) samples instead of 16-bit.
    private fun le(size: Int, fill: (ByteBuffer) -> Unit): ByteArray =
        ByteBuffer.allocate(size).order(ByteOrder.LITTLE_ENDIAN).also(fill).array()

    @Test fun every16BitAndFloatSampleBecomesTheSame16BitValue() {
        val s16 = le(6) { it.putShort(0).putShort(16384).putShort(-32768) }
        assertEquals(listOf<Short>(0, 16384, -32768), WivraAudioSegments.pcmToShorts(s16, AudioFormat.ENCODING_PCM_16BIT).toList())
        val f = le(16) { it.putFloat(0f).putFloat(0.5f).putFloat(-1f).putFloat(2f) }
        assertEquals(listOf<Short>(0, 16383, -32767, 32767), WivraAudioSegments.pcmToShorts(f, AudioFormat.ENCODING_PCM_FLOAT).toList())
        val nan = le(4) { it.putFloat(Float.NaN) }
        assertEquals(0, WivraAudioSegments.pcmToShorts(nan, AudioFormat.ENCODING_PCM_FLOAT)[0].toInt())
    }

    @Test fun otherWidthsKeepTheMostSignificantPart() {
        val i32 = le(8) { it.putInt(16384 shl 16).putInt(-1 shl 31) }
        assertEquals(listOf<Short>(16384, -32768), WivraAudioSegments.pcmToShorts(i32, AudioFormat.ENCODING_PCM_32BIT).toList())
        val u8 = byteArrayOf(128.toByte(), 255.toByte(), 0)
        assertEquals(listOf<Short>(0, 32512, -32768), WivraAudioSegments.pcmToShorts(u8, AudioFormat.ENCODING_PCM_8BIT).toList())
        val p24 = byteArrayOf(0x11, 0x00, 0x40, 0x00, 0x00, 0x80.toByte())       // 0x400011 and -0x800000
        assertEquals(listOf<Short>(0x4000, -32768), WivraAudioSegments.pcmToShorts(p24, AudioFormat.ENCODING_PCM_24BIT_PACKED).toList())
        assertEquals(3, WivraAudioSegments.bytesPerSample(AudioFormat.ENCODING_PCM_24BIT_PACKED))
    }

    @Test fun anUnknownEncodingIsRefusedNotTurnedIntoNoise() {
        assertEquals(0, WivraAudioSegments.bytesPerSample(12345))
        assertThrows(IllegalArgumentException::class.java) { WivraAudioSegments.pcmToShorts(ByteArray(4), 12345) }
    }
}
