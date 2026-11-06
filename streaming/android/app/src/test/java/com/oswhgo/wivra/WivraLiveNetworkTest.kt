package com.oswhgo.wivra

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WivraLiveNetworkTest {
    @Test fun dataUseOfThePhoneLiveProfile() {
        val bps = 1_200_000L + 64_000L
        assertEquals(10, WivraLiveNetwork.mbPerMinute(bps))      // 9.48 MB → 10
        assertEquals(570, WivraLiveNetwork.mbPerHour(bps))       // 568.8 MB → 570
    }

    @Test fun warnsOnMobileDataOrMeteredNetworks() {
        assertTrue(WivraLiveNetwork.warnsAboutData(WivraLiveNetwork.Route.CELLULAR, false))
        assertTrue(WivraLiveNetwork.warnsAboutData(WivraLiveNetwork.Route.WIFI, true))
        assertFalse(WivraLiveNetwork.warnsAboutData(WivraLiveNetwork.Route.WIFI, false))
        assertFalse(WivraLiveNetwork.warnsAboutData(WivraLiveNetwork.Route.OFFLINE, true))
    }
}
