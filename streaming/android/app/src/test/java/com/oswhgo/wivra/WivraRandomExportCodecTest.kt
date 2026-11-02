package com.oswhgo.wivra

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** JVM-only codec policy test. No device/decoder/export claim. */
class WivraRandomExportCodecTest {
    @Test fun randomWriteCannotBypassFreeSpaceReservationWithZeroOrOversizedEstimates() {
        assertFalse(WivraRandomExportStore.validEstimatedBytes(0))
        assertFalse(WivraRandomExportStore.validEstimatedBytes(-1))
        assertFalse(WivraRandomExportStore.validEstimatedBytes(Long.MAX_VALUE))
        assertTrue(WivraRandomExportStore.validEstimatedBytes(1))
        assertTrue(WivraRandomExportStore.validEstimatedBytes(
            WivraRandomAccessExportSession.MAX_OUTPUT_BYTES))
    }

    @Test fun restoredGalleryVideoMustMatchExactShaDurationAndAudioBeforeDeduplication() {
        val hash = "ab".repeat(32)
        fun matches(
            actualBytes: Long = 4096L,
            actualSha: String = hash,
            actualDuration: Long = 60_000L,
            audio: Boolean = true,
            video: Boolean = true,
            webm: Boolean = false,
            durationFlag: Boolean = true,
            seekFlag: Boolean = true
        ) = WivraRandomExportStore.isVerifiedRecoveryCopy(
            4096L, actualBytes, hash, actualSha,
            60_000L, actualDuration, true, audio, video,
            webm, durationFlag, seekFlag
        )
        assertTrue(matches())
        assertTrue(matches(actualSha = hash.uppercase()))
        assertTrue(matches(actualDuration = 61_500L))
        assertFalse(matches(actualDuration = 61_501L))
        assertFalse(matches(actualBytes = 4095L))
        assertFalse(matches(actualSha = "cd".repeat(32)))
        assertFalse(matches(audio = false))
        assertFalse(matches(video = false))
        assertTrue(matches(webm = true))
        assertFalse(matches(webm = true, durationFlag = false))
        assertFalse(matches(webm = true, seekFlag = false))
    }

    @Test fun acceleratedMp4AcceptsOnlyH264AndAacTracks() {
        assertTrue(WivraRandomExportStore.compatibleAcceleratedTrack("video/mp4", "video/avc"))
        assertTrue(WivraRandomExportStore.compatibleAcceleratedTrack("video/mp4", "audio/mp4a-latm"))
        assertFalse(WivraRandomExportStore.compatibleAcceleratedTrack("video/mp4", "video/hevc"))
        assertFalse(WivraRandomExportStore.compatibleAcceleratedTrack("video/mp4", "video/x-vnd.on2.vp9"))
        assertFalse(WivraRandomExportStore.compatibleAcceleratedTrack("video/mp4", "audio/opus"))
        assertFalse(WivraRandomExportStore.compatibleAcceleratedTrack("video/mp4", "audio/vorbis"))
    }

    @Test fun nativeWebmKeepsItsOwnDecoderAndSeekChecks() {
        assertTrue(WivraRandomExportStore.compatibleAcceleratedTrack("video/webm", "video/x-vnd.on2.vp9"))
        assertTrue(WivraRandomExportStore.compatibleAcceleratedTrack("video/webm", "audio/opus"))
        assertTrue(WivraRandomExportStore.compatibleAcceleratedTrack("video/webm", "video/x-vnd.on2.vp8"))
    }
}
