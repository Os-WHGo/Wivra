package com.oswhgo.wivra;

import org.junit.Test;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public final class WivraDirectorProjectGuardTest {
    @Test public void receiptOfCurrentProjectAndShotMayComplete() {
        assertTrue(WivraDirectorProjectGuard.mayComplete(
            "pcurrent123", "pcurrent123", "shot-A", "shot-A"));
    }

    @Test public void sameShotIdInDifferentProjectNeverCompletes() {
        assertFalse(WivraDirectorProjectGuard.mayComplete(
            "pfirst", "psecond", "shot-A", "shot-A"));
    }

    @Test public void anotherShotOrMissingReceiptNeverCompletes() {
        assertFalse(WivraDirectorProjectGuard.mayComplete(
            "pcurrent", "pcurrent", "shot-A", "shot-B"));
        assertFalse(WivraDirectorProjectGuard.mayComplete(
            "pcurrent", "pcurrent", "shot-A", null));
    }

    @Test public void invalidOrUntrustedIdentifiersNeverComplete() {
        assertFalse(WivraDirectorProjectGuard.mayComplete(
            null, null, "shot-A", "shot-A"));
        assertFalse(WivraDirectorProjectGuard.mayComplete(
            "p?not-valid", "p?not-valid", "shot-A", "shot-A"));
        assertFalse(WivraDirectorProjectGuard.mayComplete(
            "pcurrent", "pcurrent", "bad\nshot", "bad\nshot"));
        assertFalse(WivraDirectorProjectGuard.mayComplete(
            "pcurrent", "pcurrent", "x".repeat(121), "x".repeat(121)));
    }
}
