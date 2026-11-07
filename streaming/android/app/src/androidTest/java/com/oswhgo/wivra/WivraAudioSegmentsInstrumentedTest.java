package com.oswhgo.wivra;

import android.content.Context;
import android.net.Uri;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * W98 (Claude). Emulator: the native piece reader used by long-video subtitles decodes a real AAC file
 * with MediaCodec into 16 kHz mono PCM of the exact requested length (silence-padded past the end).
 * An emulator is not a physical phone.
 */
@RunWith(AndroidJUnit4.class)
public class WivraAudioSegmentsInstrumentedTest {
    private static Uri fixture(Context test, Context target) throws Exception {
        File f = new File(target.getCacheDir(), "w98-aac.mp4");
        try (InputStream in = test.getAssets().open("ffmpeg-h264-aac-fragmented.mp4"); FileOutputStream out = new FileOutputStream(f)) {
            byte[] b = new byte[8192]; int n; while ((n = in.read(b)) > 0) out.write(b, 0, n);
        }
        return Uri.fromFile(f);
    }

    @Test
    public void decodesAPieceTo16kMonoWithTheExactLength() throws Exception {
        Context test = InstrumentationRegistry.getInstrumentation().getContext();
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Uri uri = fixture(test, target);
        short[] piece = WivraAudioSegments.INSTANCE.extract(target, uri, 0.5, 1.5);
        assertEquals(16000, piece.length);
        double sum = 0; for (short s : piece) sum += (double) s * s;
        assertTrue("the piece must carry sound", Math.sqrt(sum / piece.length) > 50);
        short[] past = WivraAudioSegments.INSTANCE.extract(target, uri, 1.5, 3.0);      // the file lasts ~2 s
        assertEquals(24000, past.length);
        long tail = 0; for (int i = 16000; i < past.length; i++) tail += Math.abs(past[i]);
        assertEquals("past the end is silence", 0, tail);
    }
}
