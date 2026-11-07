package com.oswhgo.wivra

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager

/**
 * Android side of the Ray-Ban «solo vídeo» microphone choice (rules in WivraRayBanSync). — Claude
 * Only inputs Android itself reports; no Bluetooth scan, no private Meta audio endpoint, and never the
 * glasses' microphone (HFP/SCO). Wivra never starts SCO or sets a Bluetooth communication device here.
 */
object WivraRayBanAudioRoute {
    fun kind(device: AudioDeviceInfo): WivraRayBanSync.Kind = when (device.type) {
        AudioDeviceInfo.TYPE_BUILTIN_MIC -> WivraRayBanSync.Kind.BUILTIN
        AudioDeviceInfo.TYPE_WIRED_HEADSET -> WivraRayBanSync.Kind.WIRED
        AudioDeviceInfo.TYPE_USB_DEVICE, AudioDeviceInfo.TYPE_USB_HEADSET,
        AudioDeviceInfo.TYPE_USB_ACCESSORY -> WivraRayBanSync.Kind.USB
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_BLE_HEADSET -> WivraRayBanSync.Kind.BLUETOOTH
        else -> WivraRayBanSync.Kind.OTHER
    }

    private fun name(device: AudioDeviceInfo): String? =
        try { device.productName?.toString()?.trim()?.takeIf { it.isNotEmpty() } } catch (_: SecurityException) { null }

    fun inputs(context: Context): List<Pair<WivraRayBanSync.Input, AudioDeviceInfo>> =
        WivraPhoneAudioInputs.available(context).map { WivraRayBanSync.Input(it.id, kind(it), name(it)) to it }

    fun pick(context: Context, choice: WivraRayBanSync.Choice): AudioDeviceInfo? {
        val all = inputs(context)
        val chosen = WivraRayBanSync.pick(all.map { it.first }, choice) ?: return null
        return all.firstOrNull { it.first.id == chosen.id }?.second
    }

    fun alternatives(context: Context, missing: WivraRayBanSync.Choice): List<WivraRayBanSync.Choice> =
        WivraRayBanSync.alternatives(inputs(context).map { it.first }, missing)

    /**
     * True when no app has the Bluetooth call (HFP/SCO) channel open: neither SCO on, nor a Bluetooth
     * communication device selected. A call or another app can still open it; the WAV recorder checks on
     * every read that the routed input is the one the person chose.
     */
    @Suppress("DEPRECATION")
    fun hfpClosed(context: Context): Boolean {
        val manager = context.getSystemService(AudioManager::class.java) ?: return false
        return try {
            val device = manager.communicationDevice
            !manager.isBluetoothScoOn && (device == null || (device.type != AudioDeviceInfo.TYPE_BLUETOOTH_SCO &&
                device.type != AudioDeviceInfo.TYPE_BLE_HEADSET) || manager.mode == AudioManager.MODE_NORMAL)
        } catch (_: RuntimeException) { false }
    }
}

/** Display name of a Ray-Ban microphone choice (shared by the preview screen and the capture service). */
fun datAudioNameRes(choice: WivraRayBanSync.Choice): Int = when (choice) {
    WivraRayBanSync.Choice.OFF -> R.string.dat_audio_off
    WivraRayBanSync.Choice.PHONE -> R.string.dat_audio_phone
    WivraRayBanSync.Choice.WIRED_USB -> R.string.dat_audio_usb
    WivraRayBanSync.Choice.BLUETOOTH -> R.string.dat_audio_bluetooth
}
