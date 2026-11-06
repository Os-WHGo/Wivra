package com.oswhgo.wivra

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint

/**
 * W91 (Claude). LIVE standby screens drawn by Wivra («Empezamos pronto», «Volvemos enseguida»,
 * «Gracias por ver»): a card with the Wivra colours, shown with the existing image scene (the
 * microphone is muted in that scene). Nothing is downloaded; the text comes from the app strings.
 */
object WivraStandbyCard {
    const val WIDTH = 720
    const val HEIGHT = 1280

    fun render(message: String, footer: String): Bitmap {
        val bmp = Bitmap.createBitmap(WIDTH, HEIGHT, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        val bg = Paint().apply {
            shader = LinearGradient(0f, 0f, WIDTH.toFloat(), HEIGHT.toFloat(),
                intArrayOf(Color.rgb(11, 10, 18), Color.rgb(59, 20, 80), Color.rgb(226, 56, 207)),
                floatArrayOf(0f, 0.65f, 1f), Shader.TileMode.CLAMP)
        }
        canvas.drawRect(0f, 0f, WIDTH.toFloat(), HEIGHT.toFloat(), bg)
        val text = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE; textSize = 76f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val layout = StaticLayout.Builder.obtain(message, 0, message.length, text, WIDTH - 120)
            .setAlignment(Layout.Alignment.ALIGN_CENTER).setLineSpacing(0f, 1.1f).build()
        canvas.save()
        canvas.translate(60f, (HEIGHT - layout.height) / 2f)
        layout.draw(canvas)
        canvas.restore()
        val small = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(200, 255, 255, 255); textSize = 34f; textAlign = Paint.Align.CENTER
        }
        canvas.drawText(footer, WIDTH / 2f, HEIGHT - 90f, small)
        return bmp
    }
}
