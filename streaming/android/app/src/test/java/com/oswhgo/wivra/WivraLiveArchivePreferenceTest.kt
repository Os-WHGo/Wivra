package com.oswhgo.wivra

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WivraLiveArchivePreferenceTest {
    @Test fun askIsTheDefaultAndKeepsTheCheckbox() {
        assertEquals(WivraLiveArchivePreference.ASK, WivraLiveArchivePreference.from(null))
        assertEquals(WivraLiveArchivePreference.ASK, WivraLiveArchivePreference.from("garbage"))
        assertTrue(WivraLiveArchivePreference.ASK.checkboxEditable)
        assertTrue(WivraLiveArchivePreference.ASK.initiallyChecked)
    }

    @Test fun alwaysAndNeverLockTheChoice() {
        assertTrue(WivraLiveArchivePreference.from("always").initiallyChecked)
        assertFalse(WivraLiveArchivePreference.from("always").checkboxEditable)
        assertFalse(WivraLiveArchivePreference.from("never").initiallyChecked)
        assertFalse(WivraLiveArchivePreference.from("never").checkboxEditable)
    }
}
