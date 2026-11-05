package com.oswhgo.wivra

/**
 * Pure model of the "Pantalla + cámara" LIVE (no Android imports, JVM-tested).
 * The screen is the base video of WivraScreenLiveService; the phone camera is
 * an optional layer. Approved by the owner on 05-11-2026: camera and
 * microphone foreground-service types, only when the owner opts in. — Claude
 */
object WivraScreenScene {
    enum class Mode { SCREEN_ONLY, SCREEN_CAMERA, CAMERA_ONLY, ENDED }

    data class State(
        val mode: Mode,
        val cameraWanted: Boolean,
        val screenActive: Boolean,
        val corner: WivraMulticamPolicy.Corner = WivraMulticamPolicy.Corner.BOTTOM_RIGHT,
        val rotation: Int = 90,
        val notice: String? = null
    )

    data class CameraLayer(val visible: Boolean, val rect: WivraLiveScenes.Rect, val rotation: Int)

    // Same portrait frame as WivraScreenLiveService.prepareVideo(640, 480, rotation = 90).
    const val FRAME_W = 480
    const val FRAME_H = 640

    fun start(withCamera: Boolean, frontCamera: Boolean): State = State(
        mode = if (withCamera) Mode.SCREEN_CAMERA else Mode.SCREEN_ONLY,
        cameraWanted = withCamera, screenActive = true,
        // Sensor orientation differs by phone: this is only the starting guess;
        // "Girar cámara" cycles it on the device.
        rotation = if (frontCamera) 270 else 90
    )

    /**
     * Foreground-service types for startForeground: media projection always;
     * camera and microphone only when chosen AND their runtime permission is
     * granted at that moment (Android 14 rejects anything else).
     */
    fun serviceTypes(
        mediaProjection: Int, camera: Int, microphone: Int,
        withCamera: Boolean, cameraGranted: Boolean,
        withMic: Boolean, micGranted: Boolean
    ): Int {
        var types = mediaProjection
        if (withCamera && cameraGranted) types = types or camera
        if (withMic && micGranted) types = types or microphone
        return types
    }

    /** The camera layer for the current mode (camera frames are 640x480 landscape). */
    fun cameraLayer(state: State): CameraLayer {
        val portrait = state.rotation % 180 != 0
        val media = if (portrait) 480 to 640 else 640 to 480
        return when (state.mode) {
            Mode.SCREEN_CAMERA -> {
                val pip = WivraMulticamPolicy.pipRect(state.corner, 0.35, 0.04, FRAME_W, FRAME_H)
                CameraLayer(true, WivraLiveScenes.contain(WivraLiveScenes.Rect(pip.x, pip.y, pip.w, pip.h),
                    media.first, media.second, FRAME_W, FRAME_H), state.rotation)
            }
            Mode.CAMERA_ONLY -> CameraLayer(true, WivraLiveScenes.contain(WivraLiveScenes.Rect(0.0, 0.0, 1.0, 1.0),
                media.first, media.second, FRAME_W, FRAME_H), state.rotation)
            else -> CameraLayer(false, WivraLiveScenes.Rect(0.0, 0.0, 0.0, 0.0), state.rotation)
        }
    }

    /** Owner shows or hides the camera; never possible once the screen stopped and no camera. */
    fun toggleCamera(state: State): State = when {
        !state.cameraWanted || state.mode == Mode.ENDED -> state
        state.mode == Mode.SCREEN_CAMERA -> state.copy(mode = Mode.SCREEN_ONLY, notice = null)
        state.mode == Mode.SCREEN_ONLY -> state.copy(mode = Mode.SCREEN_CAMERA, notice = null)
        else -> state // camera only: hiding it would leave nothing on air
    }

    fun nextCorner(state: State) = state.copy(corner = state.corner.next())
    fun nextRotation(state: State) = state.copy(rotation = (state.rotation + 90) % 360)

    /**
     * Owner stops sharing the screen: the camera continues full frame when it
     * was chosen; otherwise the whole LIVE ends (nothing would be on air).
     */
    fun screenStoppedByOwner(state: State): State =
        if (state.cameraWanted && state.mode != Mode.ENDED)
            state.copy(mode = Mode.CAMERA_ONLY, screenActive = false,
                notice = "Pantalla detenida. Sigue la cámara.")
        else state.copy(mode = Mode.ENDED, screenActive = false, notice = "Pantalla detenida. LIVE terminado.")

    /** Android revoked the projection: the screen can only come back with a new consent. */
    fun screenRevoked(state: State): State = screenStoppedByOwner(state).copy(
        notice = if (state.cameraWanted && state.mode != Mode.ENDED)
            "Android canceló la captura de pantalla. Sigue la cámara; para volver a compartir hace falta un permiso nuevo."
        else "Android canceló la captura de pantalla. Para reanudar debes conceder un nuevo permiso."
    )

    /** The camera failed or was taken by another app: the screen continues. */
    fun cameraFailed(state: State): State = when (state.mode) {
        Mode.SCREEN_CAMERA, Mode.SCREEN_ONLY -> state.copy(mode = Mode.SCREEN_ONLY, cameraWanted = false,
            notice = "La cámara no está disponible. Sigue solo la pantalla.")
        Mode.CAMERA_ONLY -> state.copy(mode = Mode.ENDED, cameraWanted = false,
            notice = "La cámara no está disponible y la pantalla ya estaba detenida. LIVE terminado.")
        Mode.ENDED -> state
    }
}
