package com.oswhgo.wivra

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class WivraDirectorSaveJournalTest {
    @Test fun aRetriedPartialPublicationCannotIssueAFreshDirectorReceipt() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val id = "wivra_rayban_" + UUID.randomUUID().toString().replace("-", "")
        try {
            assertTrue(WivraDirectorSaveJournal.begin(context, id))
            // A new Android Context still reads the durable journal. This does
            // not simulate OS process death; it tests persisted state, not RAM.
            val reopened = context.createPackageContext(context.packageName, 0)
            assertFalse(WivraDirectorSaveJournal.begin(reopened, id))
            assertFalse(WivraDirectorSaveJournal.begin(context, id))
            assertTrue(WivraDirectorSaveJournal.completed(context, id))
            assertTrue(WivraDirectorSaveJournal.begin(context, id))
        } finally { WivraDirectorSaveJournal.completed(context, id) }
    }
}
