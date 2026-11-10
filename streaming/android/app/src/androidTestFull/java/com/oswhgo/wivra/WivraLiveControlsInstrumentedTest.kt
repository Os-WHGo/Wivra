package com.oswhgo.wivra

import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.BySelector
import androidx.test.uiautomator.Direction
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.Until
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Local controls regression: no RTMP server, broadcast or microphone recording. — Codex */
@RunWith(AndroidJUnit4::class)
class WivraLiveControlsInstrumentedTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private fun resource(id: Int) = By.res(context.resources.getResourceName(id))
    private fun text(id: Int) = By.text(context.getString(id))

    private fun vertical(device: UiDevice, target: BySelector): UiObject2 {
        device.wait(Until.findObject(target), 1_000)?.let { return it }
        for (direction in listOf(Direction.DOWN, Direction.UP)) repeat(10) {
            device.findObject(resource(R.id.live_controls_scroll))?.scroll(direction, 0.6f)
            device.findObject(target)?.let { return it }
        }
        throw AssertionError("Control unavailable after vertical navigation: $target")
    }

    private fun scene(device: UiDevice, id: Int): UiObject2 {
        vertical(device, resource(R.id.live_scene_scroll))
        for (direction in listOf(Direction.RIGHT, Direction.LEFT)) repeat(10) {
            device.findObject(resource(id))?.let { return it }
            device.findObject(resource(R.id.live_scene_scroll)).scroll(direction, 0.6f)
        }
        throw AssertionError("Scene unavailable after horizontal navigation: $id")
    }

    @Test fun scenesAndIndependentAudioControlsStayReachableInBothOrientations() {
        val device = UiDevice.getInstance(instrumentation)
        instrumentation.uiAutomation.executeShellCommand("pm grant ${context.packageName} android.permission.CAMERA").close()
        val before = WivraPhoneMediaStore.pendingVideos(context).map { it.name }.toSet()
        context.startActivity(Intent(context, WivraPhoneLiveActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        try {
            for (landscape in listOf(false, true)) {
                if (landscape) device.setOrientationLeft() else device.setOrientationNatural()
                device.waitForIdle()
                assertTrue("camera preview in this orientation", device.wait(Until.hasObject(text(R.string.plive_preview_ready)), 30_000) ||
                    runCatching { vertical(device, text(R.string.plive_preview_ready)); true }.getOrDefault(false))
                val mic = vertical(device, text(R.string.plive_mic_option))
                assertFalse("microphone initially opt-in", mic.isChecked)
                val audio = vertical(device, By.textStartsWith(context.getString(R.string.live_audio_select_button).substringBefore("%")))
                assertFalse("audio selector disabled without microphone", audio.isEnabled)
                vertical(device, text(R.string.plive_mic_option)).click()
                assertTrue("audio selection independent of camera scene", audio.isEnabled)
                audio.click()
                assertTrue(device.wait(Until.hasObject(text(R.string.live_audio_select_title)), 3_000))
                device.pressBack()
                vertical(device, text(R.string.plive_mic_option)).click()

                vertical(device, resource(R.id.live_scene_sources)).click()
                vertical(device, text(R.string.scene_standby)).click()
                vertical(device, text(R.string.scene_standby_brb)).click()
                val pause = scene(device, R.id.live_scene_image)
                assertTrue("standby selected at the right edge", pause.isSelected)
                assertTrue("scene has a TalkBack name and state", pause.contentDescription.isNotBlank())
                // Scroll fully left to recover the camera button, including its selected-dot label.
                val camera = scene(device, R.id.live_scene_camera)
                camera.click()
                assertTrue("camera selected again", camera.isSelected)
                assertTrue("camera button stays enabled", camera.isEnabled)
            }
            assertEquals("preview and scenes do not create recordings", before,
                WivraPhoneMediaStore.pendingVideos(context).map { it.name }.toSet())
        } finally {
            device.unfreezeRotation()
            device.pressBack()
        }
    }
}
