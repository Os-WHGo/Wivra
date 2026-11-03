package com.oswhgo.wivra

/** Strict JSON primitive reader for native export bridge values. */
internal object WivraStrictJsonNumber {
    private val integerToken = Regex("""-?(0|[1-9][0-9]*)""")
    fun requireLong(value: Any?, field: String,
                    minimum: Long = Long.MIN_VALUE,
                    maximum: Long = Long.MAX_VALUE): Long {
        val number = value as? Number
            ?: throw IllegalArgumentException("$field must be a JSON integer.")
        val token = number.toString()
        if (!integerToken.matches(token))
            throw IllegalArgumentException("$field must be an exact JSON integer.")
        val parsed = token.toLongOrNull()
            ?: throw IllegalArgumentException("$field is outside the 64-bit range.")
        if (parsed < minimum || parsed > maximum)
            throw IllegalArgumentException("$field is outside the permitted range.")
        return parsed
    }
    fun requireInt(value: Any?, field: String,
                   minimum: Int = Int.MIN_VALUE,
                   maximum: Int = Int.MAX_VALUE): Int =
        requireLong(value, field, minimum.toLong(), maximum.toLong()).toInt()
    fun requireBoolean(value: Any?, field: String): Boolean =
        value as? Boolean
            ?: throw IllegalArgumentException("$field must be a JSON boolean.")
}
