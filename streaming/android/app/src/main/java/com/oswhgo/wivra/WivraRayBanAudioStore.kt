package com.oswhgo.wivra

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.provider.MediaStore
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile

/**
 * Ray-Ban «solo vídeo» + independent microphone: private audio next to the HEVC parts. — Claude
 *
 * During capture: one continuous 48 kHz PCM16 mono WAV (WivraPhoneWavRecorder) and a sync manifest with the
 * monotonic timing of every video part and of the audio (WivraRayBanSync). Nothing is re-encoded.
 * On «Conservar»: each part gets the exact PCM frames that belong to it (a byte copy with a new header), is
 * published to Music/Wivra/ with the same name as its MP4, and a private association lets the editor import
 * the pair. If a part cannot get its slice, the complete WAV is published instead: audio is never lost.
 * On «Descartar» (already confirmed twice by the person): the audio of the discarded parts goes with them.
 * The glasses' own microphone is never used here (WivraRayBanSync.eligible).
 */
object WivraRayBanAudioStore {
    private const val WAV_HEADER = 44L
    private val partName = Regex("""^(wivra_rayban_[0-9a-f]{32})_part[0-9]{4}$""")
    private val sessionName = Regex("""^wivra_rayban_[0-9a-f]{32}$""")

    fun dir(context: Context): File = File(context.filesDir, "wivra_rayban_audio").apply {
        if (!exists() && !mkdirs()) throw IOException("Cannot create Ray-Ban audio folder")
    }

    fun wavFor(context: Context, sessionKey: String): File = File(dir(context), "wivra_rayban_$sessionKey.wav")
    private fun syncFor(context: Context, session: String): File = File(dir(context), "$session.sync.json")
    private fun sliceFor(context: Context, partStem: String): File = File(dir(context), "$partStem.wav")
    private fun associationFor(context: Context, partStem: String): File = File(dir(context), "$partStem.wivra.json")

    private fun atomicWrite(target: File, text: String) {
        val tmp = File(target.parentFile, target.name + ".tmp")
        try {
            tmp.writeText(text)
            if (!tmp.renameTo(target)) throw IOException("Could not persist " + target.name)
        } finally { tmp.delete() }
    }

    /** Written by the capture service when the recorder and the WAV have both closed. */
    fun writeSync(
        context: Context, sessionKey: String, choice: WivraRayBanSync.Choice, sourceTag: String?,
        inputName: String?, hfpClosedAtStart: Boolean, audio: WivraPhoneWavRecorder.Result?, audioIssue: String?,
        parts: List<Pair<File, WivraRayBanSync.PartClock>>
    ) {
        val json = JSONObject()
            .put("schema", "wivra-rayban-sync").put("schemaVersion", 1)
            .put("captureID", "android-rayban:$sessionKey").put("cameraSource", "android-rayban-dat")
            .put("timebase", "elapsedRealtimeNanos")
            .put("glassesMicrophoneUsed", false)
            .put("hfpClosedAtStart", hfpClosedAtStart)
            // The Bluetooth delay between the glasses' sensor and the phone is not exposed by DAT 1.0.1.
            .put("videoLinkLatencyMs", JSONObject.NULL)
            .put("audioChoice", choice.id)
        val list = JSONArray()
        for ((file, clock) in parts) list.put(JSONObject().put("file", file.name).put("startNs", clock.startNs)
            .put("durationUs", clock.durationUs).put("firstPtsUs", clock.firstPtsUs).put("samples", clock.samples)
            .put("ptsMonotonic", clock.ptsMonotonic))
        json.put("parts", list)
        if (audio != null) {
            val clock = WivraRayBanSync.AudioClock(audio.estimatedFirstReadElapsedRealtimeNs, audio.firstChunkFrames,
                audio.lastReadElapsedRealtimeNs, audio.bytesWritten / 2)
            json.put("audio", JSONObject().put("file", audio.file.name).put("source", sourceTag ?: "android-system-mic")
                .put("inputName", inputName ?: JSONObject.NULL)
                .put("status", WivraRayBanSync.audioStatus(audio.bytesWritten, audio.error))
                .put("error", audio.error ?: JSONObject.NULL).put("bytes", audio.bytesWritten)
                .put("frames", clock.totalFrames).put("sampleRateHz", audio.sampleRateHz)
                .put("firstReadNs", clock.firstReadNs).put("firstChunkFrames", clock.firstChunkFrames)
                .put("lastReadNs", clock.lastReadNs).put("firstSampleNs", clock.firstSampleNs)
                .put("driftPpm", clock.driftPpm ?: JSONObject.NULL).put("driftCorrected", clock.driftCorrected))
        } else json.put("audio", JSONObject.NULL)
        json.put("audioIssue", audioIssue ?: JSONObject.NULL)
        atomicWrite(syncFor(context, "wivra_rayban_$sessionKey"), json.toString(2))
    }

    data class Prepared(val sliced: Int, val parts: Int, val hadAudio: Boolean)

    /** Cut one WAV slice per part BEFORE any part is published (publishing removes the private MP4). */
    internal fun prepare(context: Context, recording: WivraHevcMp4Recorder.PendingRecording): Prepared {
        val none = Prepared(0, recording.parts.size, false)
        if (!sessionName.matches(recording.id)) return none
        val sync = try { JSONObject(syncFor(context, recording.id).readText()) } catch (_: Exception) { return none }
        val audio = sync.optJSONObject("audio") ?: return none
        val full = File(dir(context), audio.optString("file"))
        if (full.parentFile?.canonicalFile != dir(context).canonicalFile || !full.isFile || full.length() <= WAV_HEADER) return none
        if (audio.optString("status") == "failed") return none
        val clock = WivraRayBanSync.AudioClock(audio.optLong("firstReadNs"), audio.optLong("firstChunkFrames"),
            audio.optLong("lastReadNs"), minOf(audio.optLong("frames"), (full.length() - WAV_HEADER) / 2))
        val timing = sync.optJSONArray("parts") ?: JSONArray()
        val byName = (0 until timing.length()).map { timing.getJSONObject(it) }.associateBy { it.optString("file") }
        var sliced = 0
        for (part in recording.parts) {
            val stem = part.nameWithoutExtension
            if (!partName.matches(stem)) continue
            val association = associationFor(context, stem)
            if (association.isFile) { sliced++; continue }
            val t = byName[part.name] ?: continue
            val slice = WivraRayBanSync.slice(clock, t.optLong("startNs"), t.optLong("durationUs")) ?: continue
            try {
                val out = sliceFor(context, stem)
                copyFrames(full, out, slice.startFrame, slice.endFrame)
                atomicWrite(association, JSONObject()
                    .put("schemaVersion", 2).put("cameraSource", "android-rayban-dat")
                    .put("audioSource", audio.optString("source", "android-system-mic"))
                    .put("selectedInputName", audio.opt("inputName") ?: JSONObject.NULL)
                    .put("originalVideoFile", part.name).put("originalAudioFile", out.name)
                    .put("audioFormat", "pcm16-48000-mono-wav")
                    .put("audioStatus", if (audio.optString("status") == "ready") "ready" else "partial")
                    .put("audioBytes", out.length() - WAV_HEADER)
                    .put("timebase", "elapsedRealtimeNanos")
                    .put("audioStartOffsetSeconds", slice.offsetSeconds)
                    .put("driftPpm", audio.opt("driftPpm") ?: JSONObject.NULL)
                    .put("driftCorrected", audio.optBoolean("driftCorrected"))
                    .put("videoLinkLatencyMs", JSONObject.NULL)
                    .put("timestampPrecision", "phone monotonic clock; video anchored on least-delayed DAT sample; glasses link delay unmeasured")
                    .toString(2))
                sliced++
            } catch (_: Exception) {
                sliceFor(context, stem).delete()
            }
        }
        return Prepared(sliced, recording.parts.size, true)
    }

    private fun copyFrames(full: File, out: File, startFrame: Long, endFrame: Long) {
        val bytes = (endFrame - startFrame) * 2
        val tmp = File(out.parentFile, out.name + ".tmp")
        try {
            RandomAccessFile(full, "r").use { input ->
                RandomAccessFile(tmp, "rw").use { wav ->
                    wav.setLength(0L)
                    wav.write(wavHeader(bytes))
                    input.seek(WAV_HEADER + startFrame * 2)
                    val buffer = ByteArray(256 * 1024)
                    var left = bytes
                    while (left > 0) {
                        val n = input.read(buffer, 0, minOf(buffer.size.toLong(), left).toInt())
                        if (n <= 0) throw IOException("WAV ended early")
                        wav.write(buffer, 0, n)
                        left -= n
                    }
                }
            }
            if (!tmp.renameTo(out)) throw IOException("Could not keep audio slice")
        } finally { tmp.delete() }
    }

    private fun wavHeader(dataBytes: Long): ByteArray {
        val b = java.nio.ByteBuffer.allocate(44).order(java.nio.ByteOrder.LITTLE_ENDIAN)
        b.put("RIFF".toByteArray()).putInt((36 + dataBytes).toInt()).put("WAVEfmt ".toByteArray())
            .putInt(16).putShort(1.toShort()).putShort(1.toShort()).putInt(48_000).putInt(96_000)
            .putShort(2.toShort()).putShort(16.toShort())
            .put("data".toByteArray()).putInt(dataBytes.toInt())
        return b.array()
    }

    private fun displayName(context: Context, uri: Uri): String? = try {
        context.contentResolver.query(uri, arrayOf(MediaStore.MediaColumns.DISPLAY_NAME), null, null, null)
            ?.use { if (it.moveToFirst()) it.getString(0) else null }
    } catch (_: Exception) { null }

    /**
     * After the part's MP4 is public: record its URI first, then publish the slice with the same name.
     * A failure leaves the slice private for a retry; the video is already safe either way.
     */
    fun attach(context: Context, part: File, videoUri: Uri): Boolean {
        val stem = part.nameWithoutExtension
        val association = associationFor(context, stem)
        if (!partName.matches(stem) || !association.isFile) return false
        return try {
            val data = JSONObject(association.readText())
            data.put("publishedVideoUri", videoUri.toString())
            atomicWrite(association, data.toString(2))
            publishSlice(context, stem, data)
        } catch (_: Exception) { false }
    }

    private fun publishSlice(context: Context, stem: String, data: JSONObject): Boolean {
        if (data.has("publishedAudioUri")) return true
        val slice = sliceFor(context, stem)
        val video = Uri.parse(data.optString("publishedVideoUri"))
        if (!slice.isFile) return false
        val name = (displayName(context, video) ?: return false).removeSuffix(".mp4") + ".wav"
        val resolver = context.contentResolver
        val uri = resolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, "audio/wav")
            put(MediaStore.MediaColumns.RELATIVE_PATH, "Music/Wivra/")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }) ?: return false
        return try {
            WivraMediaCopy.copyAndVerify(resolver, slice, uri)
            data.put("publishedAudioUri", uri.toString())
            atomicWrite(associationFor(context, stem), data.toString(2))
            if (resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null) != 1)
                throw IOException("Audio could not be published")
            slice.delete()
            true
        } catch (_: Exception) {
            resolver.delete(uri, null, null)
            data.remove("publishedAudioUri")
            runCatching { atomicWrite(associationFor(context, stem), data.toString(2)) }
            false
        }
    }

    /** Publish the complete original WAV (used when some part could not get its own slice). */
    fun publishComplete(context: Context, session: String): Boolean {
        if (!sessionName.matches(session)) return false
        val syncFile = syncFor(context, session)
        val sync = try { JSONObject(syncFile.readText()) } catch (_: Exception) { return false }
        if (sync.has("publishedCompleteAudioUri")) return true
        val full = File(dir(context), sync.optJSONObject("audio")?.optString("file") ?: return false)
        if (!full.isFile || full.length() <= WAV_HEADER) return false
        val resolver = context.contentResolver
        val uri = resolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, "Wivra_RayBan_" + System.currentTimeMillis() + "_" +
                session.removePrefix("wivra_rayban_") + "_audio_completo.wav")
            put(MediaStore.MediaColumns.MIME_TYPE, "audio/wav")
            put(MediaStore.MediaColumns.RELATIVE_PATH, "Music/Wivra/")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }) ?: return false
        return try {
            WivraMediaCopy.copyAndVerify(resolver, full, uri)
            if (resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null) != 1)
                throw IOException("Audio could not be published")
            sync.put("publishedCompleteAudioUri", uri.toString())
            atomicWrite(syncFile, sync.toString(2))
            true
        } catch (_: Exception) {
            resolver.delete(uri, null, null)
            false
        }
    }

    /**
     * Retry unpublished slices of saved parts, and remove the complete private WAV only when no part of its
     * session is still pending AND its audio is already public (every part's slice, or the complete file),
     * or the capture produced no video part at all. Never deletes audio of a kept recording otherwise.
     */
    fun cleanup(context: Context) {
        val folder = try { dir(context) } catch (_: IOException) { return }
        val pendingNames = WivraHevcMp4Recorder.listPending(context).map { it.name }.toSet()
        val files = folder.listFiles()?.filter { it.isFile } ?: return
        for (association in files.filter { it.name.endsWith(".wivra.json") }) {
            val stem = association.name.removeSuffix(".wivra.json")
            if (!partName.matches(stem)) continue
            val data = try { JSONObject(association.readText()) } catch (_: Exception) { continue }
            if (data.has("publishedVideoUri") && !data.has("publishedAudioUri")) publishSlice(context, stem, data)
        }
        for (sync in files.filter { it.name.endsWith(".sync.json") }) {
            val session = sync.name.removeSuffix(".sync.json")
            if (!sessionName.matches(session) || pendingNames.any { it.startsWith(session + "_part") }) continue
            val data = try { JSONObject(sync.readText()) } catch (_: Exception) { continue }
            val parts = data.optJSONArray("parts") ?: JSONArray()
            val allPublished = (0 until parts.length()).all { i ->
                val stem = parts.getJSONObject(i).optString("file").removeSuffix(".mp4")
                runCatching { JSONObject(associationFor(context, stem).readText()).has("publishedAudioUri") }.getOrDefault(false)
            }
            if (parts.length() == 0 || data.has("publishedCompleteAudioUri") || allPublished) deleteOriginal(folder, sync, data)
        }
    }

    private fun deleteOriginal(folder: File, sync: File, data: JSONObject?) {
        data?.optJSONObject("audio")?.optString("file")?.takeIf { it.isNotEmpty() }?.let { File(folder, it) }
            ?.takeIf { it.parentFile?.canonicalFile == folder.canonicalFile }?.delete()
        sync.delete()
    }

    /**
     * The person confirmed «Descartar» for this recording: its private audio goes with the discarded parts.
     * Audio already attached to a SAVED part (published) is not touched.
     */
    fun discardSession(context: Context, session: String) {
        if (!sessionName.matches(session)) return
        val folder = try { dir(context) } catch (_: IOException) { return }
        if (WivraHevcMp4Recorder.listPending(context).any { it.name.startsWith(session + "_part") }) return
        val files = folder.listFiles()?.filter { it.isFile } ?: return
        var keptSaved = false
        for (association in files.filter { it.name.startsWith(session + "_part") && it.name.endsWith(".wivra.json") }) {
            val stem = association.name.removeSuffix(".wivra.json")
            val saved = runCatching { JSONObject(association.readText()).has("publishedVideoUri") }.getOrDefault(true)
            if (saved) keptSaved = true else { sliceFor(context, stem).delete(); association.delete() }
        }
        val sync = syncFor(context, session)
        if (!keptSaved) deleteOriginal(folder, sync, runCatching { JSONObject(sync.readText()) }.getOrNull())
        else cleanup(context)
    }

    /** Saved Ray-Ban parts whose audio slice is public too, for the editor's capture import. */
    fun associations(context: Context): List<Pair<String, JSONObject>> {
        val folder = try { dir(context) } catch (_: IOException) { return emptyList() }
        return folder.listFiles()?.filter { it.isFile && it.name.endsWith(".wivra.json") && it.length() in 1L..32768L }
            ?.sortedByDescending { it.lastModified() }
            ?.mapNotNull { f ->
                val stem = f.name.removeSuffix(".wivra.json")
                if (!partName.matches(stem)) return@mapNotNull null
                val data = runCatching { JSONObject(f.readText()) }.getOrNull() ?: return@mapNotNull null
                if (data.has("publishedVideoUri") && data.has("publishedAudioUri")) stem to data else null
            } ?: emptyList()
    }

    /** Owned, public display name of a MediaStore item this app published; null otherwise. */
    fun ownedName(context: Context, uri: Uri): String? = try {
        context.contentResolver.query(uri, arrayOf(MediaStore.MediaColumns.DISPLAY_NAME,
            MediaStore.MediaColumns.IS_PENDING, MediaStore.MediaColumns.OWNER_PACKAGE_NAME), null, null, null)?.use {
            if (it.moveToFirst() && it.getInt(1) == 0 && it.getString(2) == context.packageName) it.getString(0) else null
        }
    } catch (_: Exception) { null }
}
