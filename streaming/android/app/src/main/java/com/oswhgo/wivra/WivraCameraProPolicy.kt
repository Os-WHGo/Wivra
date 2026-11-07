package com.oswhgo.wivra

import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * W88 (Claude). Pure rules for the Android camera «Pro» controls, parity with the iPhone camera:
 * exposure compensation (CameraX, any phone that reports it) and an experimental night photo
 * with a real long shutter (only phones that expose Camera2 MANUAL_SENSOR). No camera access here.
 */
object WivraCameraProPolicy {
    /** Below 1/4 s a manual exposure adds nothing over the automatic mode. */
    const val MIN_USEFUL_NIGHT_NS = 250_000_000L
    /** Cap: 1 s (on a tripod or a still surface); longer shutters time out on many CameraX devices. */
    const val MAX_NIGHT_NS = 1_000_000_000L
    const val NIGHT_ISO = 800

    data class NightPlan(val exposureNs: Long, val iso: Int)

    /** null when the phone cannot do a real long exposure (the button is then hidden and explained). */
    fun nightPlan(manualSensor: Boolean, maxExposureNs: Long?, isoMin: Int?, isoMax: Int?): NightPlan? {
        if (!manualSensor || maxExposureNs == null || maxExposureNs < MIN_USEFUL_NIGHT_NS) return null
        val lo = isoMin ?: 100
        val hi = isoMax ?: NIGHT_ISO
        if (hi < lo) return null
        return NightPlan(minOf(maxExposureNs, MAX_NIGHT_NS), NIGHT_ISO.coerceIn(lo, hi))
    }

    /** Next exposure index after a −/+ tap, kept inside the phone's range. */
    fun stepIndex(current: Int, delta: Int, lower: Int, upper: Int): Int = (current + delta).coerceIn(lower, upper)

    /** «+0.7 EV», «0 EV», «−1.3 EV» from CameraX's index × step (a rational number). */
    fun evLabel(index: Int, stepNumerator: Int, stepDenominator: Int): String {
        if (stepDenominator == 0) return "0 EV"
        val ev = index * stepNumerator.toDouble() / stepDenominator
        val tenths = (ev * 10).roundToInt()
        if (tenths == 0) return "0 EV"
        val sign = if (tenths > 0) "+" else "−"
        val a = abs(tenths)
        return "$sign${a / 10}.${a % 10} EV"
    }

    /** Shutter shown to the person: «1 s», «1/4 s». */
    fun shutterLabel(ns: Long): String =
        if (ns >= 1_000_000_000L) "${(ns / 1_000_000_000.0).roundToInt()} s"
        else "1/${(1_000_000_000.0 / ns).roundToInt()} s"
}
