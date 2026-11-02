package com.oswhgo.wivra

/**
 * Pure fail-closed guard for a Ray-Ban Director shot receipt.
 * No file URI, storage path, stream key, or user script ever enters the result.
 */
internal object WivraDirectorTakeReceipt {
    fun validShotId(shotId: String?): Boolean =
        shotId != null && shotId.length in 1..120 &&
            shotId.all { it >= ' ' && it.code != 127 }

    fun mayAcknowledge(
        shotId: String?,
        pendingBeforeCapture: Set<String>?,
        savedSessionId: String,
        successfulParts: Int,
        expectedParts: Int
    ): Boolean =
        validShotId(shotId) &&
            pendingBeforeCapture != null &&
            savedSessionId.isNotBlank() &&
            savedSessionId !in pendingBeforeCapture &&
            expectedParts > 0 &&
            successfulParts == expectedParts
}
