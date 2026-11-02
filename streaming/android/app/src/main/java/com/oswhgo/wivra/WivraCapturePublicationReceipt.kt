package com.oswhgo.wivra

import android.content.Context
import android.net.Uri
import android.provider.MediaStore
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.nio.file.AtomicMoveNotSupportedException

/** Persist the verified destination BEFORE publishing/deleting a private source.
 * A restart can reuse its own matching hidden/visible row instead of duplicating
 * a clip when the previous copy succeeded but private cleanup was interrupted.
 * Every reuse rechecks owner, folder, name and SHA-256 of both files. — ChatGPT
 */
internal object WivraCapturePublicationReceipt {
    private fun marker(source: File) = File(source.parentFile, source.name + ".publication.json")

    fun stage(source: File, uri: Uri, digest: WivraVerifiedCopy.Digest) {
        val receipt = marker(source)
        val data = JSONObject().put("version", 1).put("source", source.name)
            .put("uri", uri.toString()).put("bytes", digest.bytes).put("sha256", digest.sha256)
            .toString().toByteArray(Charsets.UTF_8)
        val tmp = Files.createTempFile(source.parentFile!!.toPath(), "publication-", ".tmp")
        try {
            FileOutputStream(tmp.toFile()).use { it.write(data); it.fd.sync() }
            try { Files.move(tmp, receipt.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING) }
            catch (_: AtomicMoveNotSupportedException) { Files.move(tmp, receipt.toPath(), StandardCopyOption.REPLACE_EXISTING) }
        } finally { Files.deleteIfExists(tmp) }
    }

    fun recover(context: Context, source: File): Uri? = try {
        val file = marker(source)
        if (!file.isFile || Files.isSymbolicLink(file.toPath()) || file.length() !in 1L..8192L) null
        else {
            val data = JSONObject(file.readText())
            val uri = Uri.parse(data.getString("uri"))
            if (data.optInt("version") != 1 || data.optString("source") != source.name ||
                uri.scheme != "content" || uri.authority != "media" ||
                uri.lastPathSegment?.toLongOrNull() == null) null
            else {
                val resolver = context.contentResolver
                val columns = arrayOf(MediaStore.MediaColumns.OWNER_PACKAGE_NAME, MediaStore.MediaColumns.RELATIVE_PATH,
                    MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.MIME_TYPE)
                val owned = resolver.query(uri, columns, null, null, null)?.use { row ->
                    row.moveToFirst() && row.getString(0) == context.packageName &&
                        row.getString(1) == "Movies/Wivra/" &&
                        row.getString(2).startsWith("Wivra_RayBan_") && row.getString(3) == "video/mp4"
                } ?: false
                if (!owned) null else {
                    val digest = WivraVerifiedCopy.Digest(data.getLong("bytes"), data.getString("sha256"))
                    source.inputStream().use { WivraVerifiedCopy.verify(it, digest) }
                    resolver.openInputStream(uri)?.use { WivraVerifiedCopy.verify(it, digest) }
                        ?: throw java.io.IOException("Saved capture is unavailable")
                    uri
                }
            }
        }
    } catch (_: Exception) { null }

    fun clear(source: File) { marker(source).delete() }
}
