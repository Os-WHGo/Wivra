package com.oswhgo.wivra

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WivraRandomExportStoreTest {
    private val app = "com.oswhgo.wivra"
    private val folder = "Movies/Wivra/"

    @Test fun acceptsOnlyWivraPendingRowsWithMatchingMime() {
        assertTrue(WivraRandomExportStore.isOwnedPendingV2MediaRow(
            "Wivra_Fast_1700000000000_a12bc3.mp4", "video/mp4", folder, app, 1, app))
        assertTrue(WivraRandomExportStore.isOwnedPendingV2MediaRow(
            "Wivra_Fast_1700000000000_a12bc3.webm", "video/webm", folder, app, 1, app))
    }
    @Test fun preservesPublishedForeignAndMalformedRows() {
        val name = "Wivra_Fast_1700000000000_a12bc3.mp4"
        assertFalse(WivraRandomExportStore.isOwnedPendingV2MediaRow(name,"video/mp4",folder,app,0,app))
        assertFalse(WivraRandomExportStore.isOwnedPendingV2MediaRow(name,"video/mp4",folder,"else.app",1,app))
        assertFalse(WivraRandomExportStore.isOwnedPendingV2MediaRow(name,"video/mp4","Movies/Other/",app,1,app))
        assertFalse(WivraRandomExportStore.isOwnedPendingV2MediaRow(name,"video/webm",folder,app,1,app))
        assertFalse(WivraRandomExportStore.isOwnedPendingV2MediaRow(name+".partial","video/mp4",folder,app,1,app))
        assertFalse(WivraRandomExportStore.isOwnedPendingV2MediaRow("Wivra_Export_1_abcd.mp4","video/mp4",folder,app,1,app))
        assertFalse(WivraRandomExportStore.isOwnedPendingV2MediaRow(null,"video/mp4",folder,app,1,app))
    }
}
