package com.oswhgo.wivra

import android.content.res.ColorStateList
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.InsetDrawable
import android.util.TypedValue
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.CompoundButton

/**
 * W83 (Claude): one Wivra button look for every native Android screen, as in
 * the owner's mockups. Primary = magenta/violet gradient pill; the rest = dark
 * pill. Only looks change: texts, listeners and enabled states stay untouched.
 */
object WivraUi {
    @JvmStatic
    fun primary(button: Button) = style(button, true)

    @JvmStatic
    fun secondary(button: Button) = style(button, false)

    /** Dark pill for every plain Button under [view] (check boxes and switches are left alone). */
    @JvmStatic
    fun styleAll(view: View) {
        if (view is Button && view !is CompoundButton) secondary(view)
        if (view is ViewGroup) for (i in 0 until view.childCount) styleAll(view.getChildAt(i))
    }

    private fun style(button: Button, primary: Boolean) {
        val c = button.context
        val d = c.resources.displayMetrics.density
        val bg = if (primary) GradientDrawable(
            GradientDrawable.Orientation.LEFT_RIGHT,
            intArrayOf(c.getColor(R.color.wivra_violet), c.getColor(R.color.wivra_pink))
        ) else GradientDrawable().apply {
            setColor(c.getColor(R.color.wivra_card_high))
            setStroke(Math.round(d), c.getColor(R.color.wivra_line))
        }
        bg.cornerRadius = 22 * d
        button.background = InsetDrawable(bg, Math.round(4 * d), Math.round(3 * d), Math.round(4 * d), Math.round(3 * d))
        button.setTextColor(ColorStateList(
            arrayOf(intArrayOf(-android.R.attr.state_enabled), intArrayOf()),
            intArrayOf(c.getColor(R.color.wivra_muted), c.getColor(R.color.wivra_text))
        ))
        button.isAllCaps = false
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
        button.minHeight = Math.round(44 * d)
        button.minimumHeight = Math.round(44 * d)
        button.stateListAnimator = null
    }
}
