package com.oswhgo.wivra

import kotlin.math.ceil

/**
 * W93 (Claude). What the person must know about the network before going LIVE: the route, and how
 * much of the data plan a stream uses on mobile data or a metered network. Pure, no Android types.
 */
object WivraLiveNetwork {
    enum class Route { WIFI, CELLULAR, ETHERNET, OTHER, OFFLINE }

    /** Megabytes per minute for a total bitrate (video + audio), rounded up. */
    fun mbPerMinute(totalBitsPerSecond: Long): Int = ceil(totalBitsPerSecond * 60.0 / 8.0 / 1_000_000.0).toInt()

    /** Megabytes per hour, rounded up to tens so the figure reads as an estimate. */
    fun mbPerHour(totalBitsPerSecond: Long): Int = (ceil(totalBitsPerSecond * 3600.0 / 8.0 / 1_000_000.0 / 10.0) * 10).toInt()

    /** Mobile data, or any network the system marks as metered, costs the person money: warn first. */
    fun warnsAboutData(route: Route, metered: Boolean): Boolean = route == Route.CELLULAR || (metered && route != Route.OFFLINE)
}
