package com.oswhgo.wivra

import android.content.ContentResolver
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.File
import java.io.IOException
import java.nio.file.Files

/** Sync and re-read a hidden MediaStore copy before publishing or deleting its source. — ChatGPT */
internal object WivraMediaCopy {
    fun copyAndVerify(resolver: ContentResolver, source: File, destination: Uri): WivraVerifiedCopy.Digest {
        if (!source.isFile || Files.isSymbolicLink(source.toPath()) || source.length() <= 0)
            throw IOException("Capture source is not a regular non-empty file")
        val size = source.length()
        val modified = source.lastModified()
        val descriptor = resolver.openFileDescriptor(destination, "w") ?: throw IOException("Cannot open media destination")
        val digest = ParcelFileDescriptor.AutoCloseOutputStream(descriptor).use { output ->
            val copied = source.inputStream().use { WivraVerifiedCopy.measure(it, output) }
            output.fd.sync()
            copied
        }
        if (digest.bytes != size || source.length() != size || source.lastModified() != modified)
            throw IOException("Capture source changed while copying")
        resolver.openInputStream(destination)?.use { WivraVerifiedCopy.verify(it, digest) }
            ?: throw IOException("Cannot re-read saved capture")
        if (source.length() != size || source.lastModified() != modified)
            throw IOException("Capture source changed during readback")
        return digest
    }
}
