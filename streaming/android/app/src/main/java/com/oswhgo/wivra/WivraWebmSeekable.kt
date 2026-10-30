package com.oswhgo.wivra

import java.io.IOException
import java.io.OutputStream
import java.nio.ByteBuffer
import java.util.zip.CRC32

/**
 * Streaming port of app/media-container.mjs `webmMakeSeekable` (pure JVM, no Android).
 *
 * MediaRecorder WebM has no Duration and no Cues, so galleries show no length and cannot seek.
 * This rewrites ONLY the headers: Duration (from the blocks themselves), a Cues index, a SeekHead
 * and known sizes. Every SimpleBlock/BlockGroup is copied byte for byte; a CRC-32 over those
 * copied blocks lets the caller prove the media payload is unchanged. Memory use is bounded by
 * the number of clusters (a few per second of video), never by the file size.
 * Output is byte-identical to the JS implementation (checked by unit test). — Claude
 */
object WivraWebmSeekable {
    interface Source {
        val size: Long
        /** Reads exactly [len] bytes at [position] (throws on short read). */
        fun readFully(position: Long, dst: ByteArray, off: Int = 0, len: Int = dst.size)
    }

    class ArraySource(private val bytes: ByteArray) : Source {
        override val size: Long get() = bytes.size.toLong()
        override fun readFully(position: Long, dst: ByteArray, off: Int, len: Int) {
            if (position < 0 || position + len > bytes.size) throw IOException("Lectura fuera del archivo.")
            System.arraycopy(bytes, position.toInt(), dst, off, len)
        }
    }

    class Range(val start: Long, val end: Long) { val length: Long get() = end - start }
    class Child(val id: Long, val start: Long, val bodyStart: Long, val end: Long)
    class Cluster(val start: Long, val children: List<Child>) {
        var time: Long? = null
        var keyframeVideo = false
        var videoTrack: Long? = null
        val bodyLength: Long get() = children.sumOf { it.end - it.start }
    }
    class Analysis(
        val ebml: Range, val info: Range, val infoBodyStart: Long, val tracks: Range, val extras: List<Range>,
        val clusters: List<Cluster>, val timecodeScale: Long, val trackTypes: Map<Long, String>,
        val durationTicks: Long, val truncated: Boolean, val hasDuration: Boolean, val hasCues: Boolean,
    ) {
        val durationMs: Double get() = durationTicks * timecodeScale / 1e6
    }
    class Result(val durationMs: Double, val cues: Int, val clusters: Int, val bytesWritten: Long, val blocksCrc32: Long)

    private const val EBML = 0x1A45DFA3L
    private const val SEGMENT = 0x18538067L
    private const val SEEK_HEAD = 0x114D9B74L
    private const val SEEK = 0x4DBBL
    private const val SEEK_ID = 0x53ABL
    private const val SEEK_POSITION = 0x53ACL
    private const val INFO = 0x1549A966L
    private const val TIMECODE_SCALE = 0x2AD7B1L
    private const val DURATION = 0x4489L
    private const val TRACKS = 0x1654AE6BL
    private const val TRACK_ENTRY = 0xAEL
    private const val TRACK_NUMBER = 0xD7L
    private const val TRACK_TYPE = 0x83L
    private const val CLUSTER = 0x1F43B675L
    private const val TIMECODE = 0xE7L
    private const val SIMPLE_BLOCK = 0xA3L
    private const val BLOCK_GROUP = 0xA0L
    private const val BLOCK = 0xA1L
    private const val REFERENCE_BLOCK = 0xFBL
    private const val CUES = 0x1C53BB6BL
    private const val CUE_POINT = 0xBBL
    private const val CUE_TIME = 0xB3L
    private const val CUE_TRACK_POSITIONS = 0xB7L
    private const val CUE_TRACK = 0xF7L
    private const val CUE_CLUSTER_POSITION = 0xF1L
    private const val VOID = 0xECL
    private const val UNKNOWN = -1L
    private val TOP_LEVEL = setOf(SEEK_HEAD, INFO, TRACKS, CLUSTER, CUES, 0x1254C367L, 0x1043A770L, 0x1941A469L, VOID)

    private class Header(val id: Long, val idLength: Int, val size: Long, val sizeLength: Int) {
        val headerLength: Int get() = idLength + sizeLength
    }

    private fun header(src: Source, p: Long): Header {
        val avail = minOf(12L, src.size - p).toInt()
        if (avail < 2) throw IOException("WebM: cabecera cortada en $p.")
        val b = ByteArray(avail); src.readFully(p, b)
        val first = b[0].toInt() and 0xFF
        val idLen = when { first >= 0x80 -> 1; first >= 0x40 -> 2; first >= 0x20 -> 3; first >= 0x10 -> 4; else -> 0 }
        if (idLen == 0 || idLen >= avail) throw IOException("WebM: identificador inválido en $p.")
        var id = 0L; for (i in 0 until idLen) id = (id shl 8) or (b[i].toLong() and 0xFF)
        val s0 = b[idLen].toInt() and 0xFF
        var len = 1; var mask = 0x80
        while (len <= 8 && (s0 and mask) == 0) { len++; mask = mask shr 1 }
        if (len > 8 || idLen + len > avail) throw IOException("WebM: tamaño inválido en $p.")
        var v = (s0 and (mask - 1)).toLong(); var allOnes = v == (mask - 1).toLong()
        for (i in 1 until len) { val x = b[idLen + i].toInt() and 0xFF; v = (v shl 8) or x.toLong(); if (x != 0xFF) allOnes = false }
        return Header(id, idLen, if (allOnes) UNKNOWN else v, len)
    }

    private fun readUint(src: Source, p: Long, n: Int): Long { val b = ByteArray(n); src.readFully(p, b); var v = 0L; for (x in b) v = (v shl 8) or (x.toLong() and 0xFF); return v }

    fun analyze(src: Source): Analysis {
        val head = header(src, 0); if (head.id != EBML) throw IOException("No empieza como WebM (falta EBML).")
        val ebmlEnd = head.headerLength + head.size
        val seg = header(src, ebmlEnd); if (seg.id != SEGMENT) throw IOException("WebM sin Segment.")
        val dataStart = ebmlEnd + seg.headerLength
        val segEnd = if (seg.size == UNKNOWN) src.size else minOf(src.size, dataStart + seg.size)
        var info: Range? = null; var infoBody = 0L; var tracks: Range? = null; var tracksBody = 0L
        val extras = mutableListOf<Range>(); val clusters = mutableListOf<Cluster>()
        var truncated = false; var hasCues = false
        var p = dataStart
        while (p < segEnd) {
            val h = header(src, p); val bodyStart = p + h.headerLength
            if (h.id == CLUSTER) {
                var q = bodyStart
                var end = if (h.size == UNKNOWN) segEnd else minOf(segEnd, bodyStart + h.size)
                val children = mutableListOf<Child>()
                while (q < end) {
                    if (end - q < 2) { end = q; truncated = true; break }
                    val c = try { header(src, q) } catch (e: IOException) { end = q; truncated = true; break }
                    if (h.size == UNKNOWN && c.id in TOP_LEVEL) { end = q; break }
                    if (c.size == UNKNOWN) throw IOException("WebM: bloque de tamaño desconocido.")
                    val cEnd = q + c.headerLength + c.size
                    if (cEnd > src.size) { end = q; truncated = true; break }
                    children += Child(c.id, q, q + c.headerLength, cEnd)
                    q = cEnd
                }
                clusters += Cluster(p, children)
                if (truncated) break
                p = end; continue
            }
            if (h.size == UNKNOWN) throw IOException("WebM: elemento de nivel superior sin tamaño.")
            val end = bodyStart + h.size; if (end > src.size) throw IOException("WebM truncado.")
            when (h.id) {
                INFO -> { info = Range(p, end); infoBody = bodyStart }
                TRACKS -> { tracks = Range(p, end); tracksBody = bodyStart }
                CUES -> hasCues = true
                SEEK_HEAD, VOID -> {}
                else -> extras += Range(p, end)
            }
            p = end
        }
        val infoR = info ?: throw IOException("WebM sin Info."); val tracksR = tracks ?: throw IOException("WebM sin Tracks.")
        var scale = 1_000_000L; var hasDuration = false
        var q = infoBody
        while (q < infoR.end) { val c = header(src, q); val body = q + c.headerLength; if (c.id == TIMECODE_SCALE) scale = readUint(src, body, c.size.toInt()); if (c.id == DURATION) hasDuration = true; q = body + c.size }
        val trackTypes = linkedMapOf<Long, String>()
        q = tracksBody
        while (q < tracksR.end) {
            val c = header(src, q); val body = q + c.headerLength
            if (c.id == TRACK_ENTRY) {
                var num = 0L; var type = 0L; var r = body
                while (r < body + c.size) { val e = header(src, r); val eb = r + e.headerLength; if (e.id == TRACK_NUMBER) num = readUint(src, eb, e.size.toInt()) else if (e.id == TRACK_TYPE) type = readUint(src, eb, e.size.toInt()); r = eb + e.size }
                trackTypes[num] = when (type) { 1L -> "video"; 2L -> "audio"; else -> "other" }
            }
            q = body + c.size
        }
        val lastTimes = HashMap<Long, Long>(); val deltas = HashMap<Long, Long>()
        for (cl in clusters) {
            var firstVideoSeen = false
            for (ch in cl.children) {
                if (ch.id == TIMECODE) { cl.time = readUint(src, ch.bodyStart, (ch.end - ch.bodyStart).toInt()); continue }
                if ((ch.id != SIMPLE_BLOCK && ch.id != BLOCK_GROUP) || cl.time == null) continue
                var blk = ch.bodyStart; var key = false
                if (ch.id == BLOCK_GROUP) {
                    blk = -1; key = true; var r = ch.bodyStart
                    while (r < ch.end) { val e = header(src, r); val eb = r + e.headerLength; if (e.id == BLOCK) blk = eb; if (e.id == REFERENCE_BLOCK) key = false; r = eb + e.size }
                    if (blk < 0) continue
                }
                val hb = ByteArray(minOf(12L, ch.end - blk).toInt()); src.readFully(blk, hb)
                val t0 = hb[0].toInt() and 0xFF
                var tl = 1; var mask = 0x80; while (tl <= 8 && (t0 and mask) == 0) { tl++; mask = mask shr 1 }
                var track = (t0 and (mask - 1)).toLong(); for (i in 1 until tl) track = (track shl 8) or (hb[i].toLong() and 0xFF)
                val rel = ((hb[tl].toInt() shl 8) or (hb[tl + 1].toInt() and 0xFF)).toShort().toLong()
                if (ch.id == SIMPLE_BLOCK) key = (hb[tl + 2].toInt() and 0x80) != 0
                val t = cl.time!! + rel; val prev = lastTimes[track]
                if (prev != null && t > prev) deltas[track] = t - prev
                lastTimes[track] = if (prev == null) t else maxOf(prev, t)
                if (trackTypes[track] == "video" && !firstVideoSeen) { firstVideoSeen = true; cl.keyframeVideo = key; cl.videoTrack = track }
            }
        }
        var endTicks = 0L
        for ((track, t) in lastTimes) endTicks = maxOf(endTicks, t + (deltas[track] ?: 0))
        return Analysis(Range(0, ebmlEnd), infoR, infoBody, tracksR, extras, clusters, scale, trackTypes, endTicks, truncated, hasDuration, hasCues)
    }

    // ---------- writing (same encoding as JS: 8-byte EBML sizes, 8-byte uints) ----------
    private fun idBytes(id: Long): ByteArray { val out = ArrayList<Byte>(); var v = id; while (v > 0) { out.add(0, (v and 0xFF).toByte()); v = v shr 8 }; return out.toByteArray() }
    private fun size8(n: Long): ByteArray = ByteBuffer.allocate(8).putLong(n).array().also { it[0] = 0x01 }
    private fun uint8(n: Long): ByteArray = ByteBuffer.allocate(8).putLong(n).array()
    private fun element(id: Long, payload: ByteArray): ByteArray = idBytes(id) + size8(payload.size.toLong()) + payload
    private fun uintElement(id: Long, n: Long) = element(id, uint8(n))
    private fun seekEntry(id: Long, pos: Long) = element(SEEK, element(SEEK_ID, idBytes(id)) + uintElement(SEEK_POSITION, pos))

    private fun copy(src: Source, start: Long, end: Long, out: OutputStream, crc: CRC32?, buffer: ByteArray) {
        var p = start
        while (p < end) { val n = minOf(buffer.size.toLong(), end - p).toInt(); src.readFully(p, buffer, 0, n); out.write(buffer, 0, n); crc?.update(buffer, 0, n); p += n }
    }

    /** CRC-32 over every copied block (SimpleBlock/BlockGroup) in order: identical before and after a rewrite. */
    fun blocksCrc(src: Source, analysis: Analysis = analyze(src)): Long {
        val crc = CRC32(); val buffer = ByteArray(256 * 1024)
        val sink = object : OutputStream() { override fun write(b: Int) {} ; override fun write(b: ByteArray, off: Int, len: Int) {} }
        for (cl in analysis.clusters) for (ch in cl.children) if (ch.id == SIMPLE_BLOCK || ch.id == BLOCK_GROUP) copy(src, ch.start, ch.end, sink, crc, buffer)
        return crc.value
    }

    fun rewrite(src: Source, out: OutputStream): Result {
        val a = analyze(src)
        if (a.clusters.isEmpty()) throw IOException("WebM sin clusters: no hay audio ni video.")
        val buffer = ByteArray(256 * 1024)
        // Info without any previous Duration/Void, plus the measured Duration (float64 ticks).
        val infoBody = java.io.ByteArrayOutputStream()
        var q = a.infoBodyStart
        while (q < a.info.end) { val c = header(src, q); val end = q + c.headerLength + c.size; if (c.id != DURATION && c.id != VOID) copy(src, q, end, infoBody, null, buffer); q = end }
        infoBody.write(element(DURATION, ByteBuffer.allocate(8).putDouble(a.durationTicks.toDouble()).array()))
        val info = element(INFO, infoBody.toByteArray())
        val extrasLen = a.extras.sumOf { it.length }
        val cueClusters = a.clusters.filter { it.time != null && (it.keyframeVideo || it.videoTrack == null) }
        val cueTrack = a.trackTypes.entries.firstOrNull { it.value == "video" }?.key ?: a.trackTypes.keys.firstOrNull() ?: 1L
        val cuePointLen = element(CUE_POINT, uintElement(CUE_TIME, 0) + element(CUE_TRACK_POSITIONS, uintElement(CUE_TRACK, 0) + uintElement(CUE_CLUSTER_POSITION, 0))).size
        val cuesLen = idBytes(CUES).size + 8L + cuePointLen.toLong() * cueClusters.size
        val seekHeadLen = element(SEEK_HEAD, seekEntry(INFO, 0) + seekEntry(TRACKS, 0) + seekEntry(CUES, 0)).size
        val infoPos = seekHeadLen.toLong(); val tracksPos = infoPos + info.size; val cuesPos = tracksPos + a.tracks.length + extrasLen
        var pos = cuesPos + cuesLen
        val clusterPos = HashMap<Cluster, Long>(); val clusterHeadLen = idBytes(CLUSTER).size + 8L
        for (cl in a.clusters) { clusterPos[cl] = pos; pos += clusterHeadLen + cl.bodyLength }
        val cuesBody = java.io.ByteArrayOutputStream()
        for (cl in cueClusters) cuesBody.write(element(CUE_POINT, uintElement(CUE_TIME, cl.time!!) +
            element(CUE_TRACK_POSITIONS, uintElement(CUE_TRACK, cl.videoTrack ?: cueTrack) + uintElement(CUE_CLUSTER_POSITION, clusterPos[cl]!!))))
        val cues = element(CUES, cuesBody.toByteArray())
        val seekHead = element(SEEK_HEAD, seekEntry(INFO, infoPos) + seekEntry(TRACKS, tracksPos) + seekEntry(CUES, cuesPos))
        if (seekHead.size != seekHeadLen || cues.size.toLong() != cuesLen) throw IOException("Índice WebM inconsistente.")
        var written = 0L
        fun put(bytes: ByteArray) { out.write(bytes); written += bytes.size }
        copy(src, a.ebml.start, a.ebml.end, out, null, buffer); written += a.ebml.length
        put(idBytes(SEGMENT) + size8(pos)); put(seekHead); put(info)
        copy(src, a.tracks.start, a.tracks.end, out, null, buffer); written += a.tracks.length
        for (e in a.extras) { copy(src, e.start, e.end, out, null, buffer); written += e.length }
        put(cues)
        val crc = CRC32()
        for (cl in a.clusters) {
            put(idBytes(CLUSTER) + size8(cl.bodyLength))
            for (ch in cl.children) {
                val isBlock = ch.id == SIMPLE_BLOCK || ch.id == BLOCK_GROUP
                copy(src, ch.start, ch.end, out, if (isBlock) crc else null, buffer); written += ch.end - ch.start
            }
        }
        val expected = a.ebml.length + idBytes(SEGMENT).size + 8 + pos
        if (written != expected) throw IOException("Tamaño WebM inconsistente.")
        return Result(a.durationMs, cueClusters.size, a.clusters.size, written, crc.value)
    }
}
