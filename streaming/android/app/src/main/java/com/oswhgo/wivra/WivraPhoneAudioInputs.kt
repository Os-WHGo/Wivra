package com.oswhgo.wivra

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import androidx.core.content.ContextCompat

/**
 * Input devices reported by Android itself. This does NOT expose a private
 * Meta Wearables audio endpoint or guarantee a Bluetooth headset supports
 * microphone capture. There is no Bluetooth scan, pairing, or upload.
 */
object WivraPhoneAudioInputs {
    private fun bluetooth(type: Int) = type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
        type == AudioDeviceInfo.TYPE_BLE_HEADSET

    private fun supported(type: Int) = when (type) {
        AudioDeviceInfo.TYPE_BUILTIN_MIC,
        AudioDeviceInfo.TYPE_WIRED_HEADSET,
        AudioDeviceInfo.TYPE_USB_DEVICE,
        AudioDeviceInfo.TYPE_USB_HEADSET,
        AudioDeviceInfo.TYPE_USB_ACCESSORY,
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
        AudioDeviceInfo.TYPE_BLE_HEADSET -> true
        else -> false
    }

    fun hasBluetoothPermission(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            ContextCompat.checkSelfPermission(
                context, Manifest.permission.BLUETOOTH_CONNECT
            ) == PackageManager.PERMISSION_GRANTED

    fun available(context: Context): List<AudioDeviceInfo> {
        val manager = context.getSystemService(AudioManager::class.java) ?: return emptyList()
        val includeBluetooth = hasBluetoothPermission(context)
        return try {
            manager.getDevices(AudioManager.GET_DEVICES_INPUTS)
                .filter { it.isSource && supported(it.type) &&
                    (includeBluetooth || !bluetooth(it.type)) }
                .distinctBy { it.id }
                .sortedWith(compareBy<AudioDeviceInfo> { it.type != AudioDeviceInfo.TYPE_BUILTIN_MIC }
                    .thenBy { it.id })
        } catch (_: SecurityException) {
            // No audio-route access when Android denies it. Never guess inputs.
            emptyList()
        }
    }

    fun resolve(context: Context, id: Int): AudioDeviceInfo? =
        available(context).firstOrNull { it.id == id }

    fun label(context: Context, device: AudioDeviceInfo): String {
        val category = when (device.type) {
            AudioDeviceInfo.TYPE_BUILTIN_MIC -> context.getString(R.string.phone_camera_source_built_in)
            AudioDeviceInfo.TYPE_WIRED_HEADSET -> context.getString(R.string.phone_camera_source_wired)
            AudioDeviceInfo.TYPE_USB_DEVICE,
            AudioDeviceInfo.TYPE_USB_HEADSET,
            AudioDeviceInfo.TYPE_USB_ACCESSORY -> context.getString(R.string.phone_camera_source_usb)
            AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
            AudioDeviceInfo.TYPE_BLE_HEADSET -> context.getString(R.string.phone_camera_source_bluetooth)
            else -> context.getString(R.string.phone_camera_source_external)
        }
        val name = try { device.productName?.toString()?.trim().orEmpty() }
            catch (_: SecurityException) { "" }
        return if (name.isEmpty() || name.equals(category, true)) category
            else "$category: ${name.take(65)}"
    }
}
