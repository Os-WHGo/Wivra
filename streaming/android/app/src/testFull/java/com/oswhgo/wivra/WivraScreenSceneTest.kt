package com.oswhgo.wivra

import com.oswhgo.wivra.WivraScreenScene.Mode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** "Pantalla + cámara" decisions. — Claude */
class WivraScreenSceneTest {
    private val MP = 32; private val CAM = 64; private val MIC = 128

    @Test fun serviceTypesOnlyForChosenAndGrantedSources() {
        assertEquals(MP, WivraScreenScene.serviceTypes(MP, CAM, MIC, false, true, false, true))
        assertEquals(MP or CAM, WivraScreenScene.serviceTypes(MP, CAM, MIC, true, true, false, true))
        assertEquals(MP, WivraScreenScene.serviceTypes(MP, CAM, MIC, true, false, true, false))
        assertEquals(MP or CAM or MIC, WivraScreenScene.serviceTypes(MP, CAM, MIC, true, true, true, true))
    }

    @Test fun cameraLayerKeepsShapeAndStaysInFrame() {
        val s = WivraScreenScene.start(withCamera = true, frontCamera = false)
        assertEquals(Mode.SCREEN_CAMERA, s.mode)
        assertEquals(90, s.rotation)
        val pip = WivraScreenScene.cameraLayer(s)
        assertTrue(pip.visible)
        val r = pip.rect
        assertTrue(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1.0 + 1e-9 && r.y + r.h <= 1.0 + 1e-9)
        // Portrait 3:4 camera in a 3:4 portrait frame: inset keeps 3:4.
        assertEquals(r.w * 480 / (r.h * 640), 0.75, 0.01)
        val full = WivraScreenScene.cameraLayer(s.copy(mode = Mode.CAMERA_ONLY))
        assertEquals(WivraLiveScenes.Rect(0.0, 0.0, 1.0, 1.0), full.rect)
        assertFalse(WivraScreenScene.cameraLayer(WivraScreenScene.start(false, false)).visible)
        assertEquals(270, WivraScreenScene.start(true, true).rotation)
        assertEquals(0, WivraScreenScene.nextRotation(s.copy(rotation = 270)).rotation)
    }

    @Test fun stoppingTheScreenKeepsTheCameraOrEnds() {
        val withCam = WivraScreenScene.start(true, false)
        val camOnly = WivraScreenScene.screenStoppedByOwner(withCam)
        assertEquals(Mode.CAMERA_ONLY, camOnly.mode)
        assertFalse(camOnly.screenActive)
        assertEquals(Mode.ENDED, WivraScreenScene.screenStoppedByOwner(WivraScreenScene.start(false, false)).mode)
        val revoked = WivraScreenScene.screenRevoked(withCam)
        assertEquals(Mode.CAMERA_ONLY, revoked.mode)
        assertEquals(WivraScreenScene.Notice.REVOKED_CAMERA_CONTINUES, revoked.notice)
        // Hiding the camera is impossible when it is the only thing on air.
        assertEquals(Mode.CAMERA_ONLY, WivraScreenScene.toggleCamera(camOnly).mode)
        assertEquals(Mode.SCREEN_ONLY, WivraScreenScene.toggleCamera(withCam).mode)
        assertEquals(Mode.SCREEN_CAMERA, WivraScreenScene.toggleCamera(WivraScreenScene.toggleCamera(withCam)).mode)
    }

    @Test fun cameraFailureLeavesTheScreenOrEnds() {
        val failed = WivraScreenScene.cameraFailed(WivraScreenScene.start(true, false))
        assertEquals(Mode.SCREEN_ONLY, failed.mode)
        assertFalse(failed.cameraWanted)
        assertEquals(Mode.SCREEN_ONLY, WivraScreenScene.toggleCamera(failed).mode)
        val camOnly = WivraScreenScene.screenStoppedByOwner(WivraScreenScene.start(true, false))
        assertEquals(Mode.ENDED, WivraScreenScene.cameraFailed(camOnly).mode)
    }
}
