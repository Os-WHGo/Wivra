package com.oswhgo.wivra

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities

/**
 * W93/W94 (Claude). The phone's current network for a LIVE start confirmation, shared by the phone
 * LIVE and the screen LIVE. Reads only the system's own route and metered flag; sends nothing.
 */
object WivraLiveNetworkProbe {
    fun route(context: Context): Pair<WivraLiveNetwork.Route, Boolean> {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return WivraLiveNetwork.Route.OTHER to false
        val caps = try { cm.getNetworkCapabilities(cm.activeNetwork) } catch (_: SecurityException) { null }
            ?: return WivraLiveNetwork.Route.OFFLINE to false
        val route = when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> WivraLiveNetwork.Route.WIFI
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> WivraLiveNetwork.Route.CELLULAR
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> WivraLiveNetwork.Route.ETHERNET
            else -> WivraLiveNetwork.Route.OTHER
        }
        return route to cm.isActiveNetworkMetered
    }

    /** The line for the confirmation, or null when there is no Internet (the caller does not start). */
    fun confirmationLine(context: Context, totalBitsPerSecond: Long): String? {
        val (route, metered) = route(context)
        if (route == WivraLiveNetwork.Route.OFFLINE) return null
        return if (WivraLiveNetwork.warnsAboutData(route, metered))
            context.getString(if (route == WivraLiveNetwork.Route.CELLULAR) R.string.plive_network_cellular else R.string.plive_network_metered,
                WivraLiveNetwork.mbPerMinute(totalBitsPerSecond), WivraLiveNetwork.mbPerHour(totalBitsPerSecond))
        else context.getString(if (route == WivraLiveNetwork.Route.WIFI) R.string.plive_network_wifi else R.string.plive_network_other)
    }
}
