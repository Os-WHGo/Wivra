package com.oswhgo.wivra

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import java.io.File
import java.io.RandomAccessFile
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * Optional independent 48 kHz, PCM16 mono WAV for Android PHONE capture.
 *
 * AudioRecord and CameraX compete for input on some devices, so CameraX MP4
 * MUST be video-only while this exclusive sidecar mode is active. Never claim
 * integrated + separate mic recording or sample-accurate first-frame sync.
 * Android native AudioRecord, offline, no cloud/SDK/account required.
 */
class WivraPhoneWavRecorder(private val file: File) {
    data class Result(
        val file: File,
        val sampleRateHz: Int,
        val channels: Int,
        val bytesWritten: Long,
        val estimatedFirstReadElapsedRealtimeNs: Long,
        val error: String?
    ) {
        val usable get() = bytesWritten > 0L && error == null
    }

    companion object {
        const val SAMPLE_RATE = 48000
        private const val WAV_HEADER_BYTES = 44L
        private const val MAX_DATA_BYTES = 2_000_000_000L
        private const val CHANNELS = 1

        private fun putU16(wav: RandomAccessFile, number: Int) {
            wav.write(number and 0xff)
            wav.write((number ushr 8) and 0xff)
        }
        private fun putU32(wav: RandomAccessFile, number: Long) {
            for (shift in 0..24 step 8) wav.write((number ushr shift).toInt() and 0xff)
        }
        private fun header(wav: RandomAccessFile, length: Long) {
            wav.seek(0L)
            wav.writeBytes("RIFF")
            putU32(wav, 36L + length)
            wav.writeBytes("WAVEfmt ")
            putU32(wav, 16L)
            putU16(wav, 1) // PCM
            putU16(wav, CHANNELS)
            putU32(wav, SAMPLE_RATE.toLong())
            putU32(wav, SAMPLE_RATE.toLong() * CHANNELS * 2)
            putU16(wav, CHANNELS * 2)
            putU16(wav, 16)
            wav.writeBytes("data")
            putU32(wav, length)
        }
    }

    private val running = AtomicBoolean(false)
    private val stopped = AtomicBoolean(false)
    private val bytesWritten = AtomicLong(0L)
    private var input: AudioRecord? = null
    private var worker: Thread? = null
    private val ui = Handler(Looper.getMainLooper())
    private var completed: ((Result) -> Unit)? = null

    /** Requires owner-granted RECORD_AUDIO, checked by the caller at runtime. */
    @Throws(SecurityException::class, IllegalStateException::class)
    fun start(onComplete: (Result) -> Unit) {
        check(worker == null && !stopped.get()) { "WAV recording is not reusable" }
        val minBuffer = AudioRecord.getMinBufferSize(
            SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
        )
        check(minBuffer > 0) { "48 kHz PCM mic input unsupported" }
        val size = maxOf(minBuffer * 2, 8192)
        val record = AudioRecord(
            MediaRecorder.AudioSource.MIC, SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, size
        )
        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            throw IllegalStateException("Could not initialize WAV recorder")
        }
        try {
            record.startRecording()
            check(record.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
                "Input did not start recording"
            }
        } catch (error: Exception) {
            record.release()
            throw error
        }
        input = record
        completed = onComplete
        running.set(true)
        worker = Thread({
            var firstReadNs = 0L
            var failure: String? = null
            var written = 0L
            try {
                RandomAccessFile(file, "rw").use { wav ->
                    wav.setLength(0L)
                    header(wav, 0L)
                    wav.seek(WAV_HEADER_BYTES)
                    val buffer = ByteArray(size)
                    while (running.get()) {
                        val count = record.read(buffer, 0, buffer.size)
                        if (count < 0) {
                            if (running.get()) failure = "AudioRecord.read failed"
                            break
                        }
                        if (count == 0) continue
                        if (firstReadNs == 0L) {
                            // This is an approximate read-completion clock,
                            // NOT a hardware-verified first-sample timestamp.
                            firstReadNs = SystemClock.elapsedRealtimeNanos()
                        }
                        if (written + count > MAX_DATA_BYTES) {
                            failure = "WAV size reached safe limit"
                            break
                        }
                        wav.write(buffer, 0, count)
                        written += count
                    }
                    header(wav, written)
                }
            } catch (_: Exception) {
                failure = "Could not finalize private WAV audio"
            } finally {
                bytesWritten.set(written)
                running.set(false)
                try { if (record.recordingState == AudioRecord.RECORDSTATE_RECORDING) record.stop() }
                catch (_: Exception) {}
                record.release()
                input = null
                stopped.set(true)
                val result = Result(file, SAMPLE_RATE, CHANNELS, written, firstReadNs, failure)
                ui.post { completed?.invoke(result) }
            }
        }, "Wivra-Phone-WAV").apply { isDaemon = true; start() }
    }

    fun stop() {
        if (!stopped.compareAndSet(false, true)) return
        running.set(false)
        try { input?.stop() } catch (_: Exception) {}
        // Never block Android UI thread joining or closing large WAV files.
        // Worker finalizes RIFF lengths, then calls onComplete on main thread.
    }
}
