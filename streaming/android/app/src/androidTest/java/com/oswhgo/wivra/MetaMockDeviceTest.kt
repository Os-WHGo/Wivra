package com.oswhgo.wivra

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.meta.wearable.dat.core.Wearables
import com.meta.wearable.dat.core.types.Permission
import com.meta.wearable.dat.core.types.PermissionStatus
import com.meta.wearable.dat.mockdevice.MockDeviceKit
import com.meta.wearable.dat.mockdevice.api.GlassesModel
import com.meta.wearable.dat.mockdevice.api.MockDeviceKitConfig
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Wivra: no real glasses, Meta account or remote AI required.
 * Hardware tests remain separate: compiling these tests is NOT running them.
 *
 * See Meta's official CameraAccess InstrumentationTest and MockDeviceKit docs.
 */
@RunWith(AndroidJUnit4::class)
class MetaMockDeviceTest {
    private val appContext
        get() = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext
    private val kit by lazy { MockDeviceKit.getInstance(appContext) }

    @Before fun prepare() {
        // Start unregistered: this lets tests prove registration is not silently assumed.
        kit.enable(MockDeviceKitConfig(initiallyRegistered = false))
    }

    @After fun cleanUp() {
        kit.disable()
    }

    @Test fun pairingSimulatesRayBanWithoutPhysicalGlasses() {
        val glasses = kit.pairGlasses(GlassesModel.RAYBAN_META).getOrThrow()
        glasses.powerOn()
        glasses.unfold()
        glasses.don()
        assertTrue(kit.isEnabled)
    }

    @Test fun cameraPermissionDenialRemainsVisibleToWivra() = runBlocking {
        kit.permissions.set(Permission.CAMERA, PermissionStatus.Denied)
        Wearables.checkPermissionStatus(Permission.CAMERA)
            .onSuccess { status ->
                assertEquals(PermissionStatus.Denied, status)
            }
            .onFailure { error, cause ->
                throw AssertionError("Mock permission query failed: " + error.description, cause)
            }
    }
}
