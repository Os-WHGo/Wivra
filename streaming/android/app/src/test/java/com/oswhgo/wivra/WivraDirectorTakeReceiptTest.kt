package com.oswhgo.wivra

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WivraDirectorTakeReceiptTest {
    @Test fun newCompleteExplicitlySavedRecordingCanAcknowledge() {
        assertTrue(WivraDirectorTakeReceipt.mayAcknowledge(
            "director-shot-1", setOf("prior-session"), "fresh-session", 2, 2))
    }

    @Test fun oldOrUnknownCaptureNeverAcknowledge() {
        assertFalse(WivraDirectorTakeReceipt.mayAcknowledge(
            "director-shot-1", setOf("prior-session"), "prior-session", 2, 2))
        assertFalse(WivraDirectorTakeReceipt.mayAcknowledge(
            "director-shot-1", null, "fresh-session", 1, 1))
    }

    @Test fun failedOrPartialPublicationNeverAcknowledge() {
        assertFalse(WivraDirectorTakeReceipt.mayAcknowledge(
            "director-shot-1", emptySet(), "fresh-session", 1, 2))
        assertFalse(WivraDirectorTakeReceipt.mayAcknowledge(
            "director-shot-1", emptySet(), "fresh-session", 0, 0))
    }

    @Test fun receiptRejectsMissingOrUntrustedShotIdentifiers() {
        for (id in listOf(null, "", "bad\nshot", "a".repeat(121))) {
            assertFalse(WivraDirectorTakeReceipt.mayAcknowledge(
                id, emptySet(), "fresh-session", 1, 1))
        }
    }
}
