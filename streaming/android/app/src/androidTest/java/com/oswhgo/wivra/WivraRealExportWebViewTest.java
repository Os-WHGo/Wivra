package com.oswhgo.wivra;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * Emulator/device: the editor's REAL export (recordProject) in the bundled Android System WebView,
 * through the progressive bridge into MediaStore, then container repair and Android's own
 * MediaMetadataRetriever. The source clip is synthetic (this WebView's MediaRecorder), not camera
 * footage; an emulator uses software codecs and is not a physical phone. Measurements are sent
 * as instrumentation status lines "wivra-export-measure=...".
 */
@RunWith(AndroidJUnit4.class)
public class WivraRealExportWebViewTest {
    private static WebView findEditor(View node) {
        if (node instanceof WebView) return (WebView) node;
        if (node instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) node;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView found = findEditor(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }

    private static String eval(Instrumentation instrumentation, WebView webView, String source) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> webView.evaluateJavascript(source, value -> { result.set(value); latch.countDown(); }));
        assertTrue("WebView JS did not answer", latch.await(20, TimeUnit.SECONDS));
        return result.get();
    }

    private static void report(String key, String value) {
        Bundle b = new Bundle();
        b.putString("wivra-export-measure", key + "=" + value);
        InstrumentationRegistry.getInstrumentation().sendStatus(0, b);
        Log.i("WivraExportMeasure", key + "=" + value);
    }

    private static JSONObject runProbe(Instrumentation instrumentation, WebView editor, String script, boolean requireGesture) throws Exception {
        instrumentation.runOnMainSync(() -> editor.getSettings().setMediaPlaybackRequiresUserGesture(requireGesture));
        eval(instrumentation, editor, script);
        String state = "\"running\"";
        for (int i = 0; i < 240 && "\"running\"".equals(state); i++) {
            Thread.sleep(500);
            state = eval(instrumentation, editor, "window.__wivraRealExport");
        }
        Object decoded = new JSONTokener(state).nextValue();
        assertTrue("Probe did not finish: " + state, decoded instanceof String);
        return new JSONObject((String) decoded);
    }

    private static void deleteByName(ContentResolver resolver, String name) {
        Uri collection = MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
        Bundle args = new Bundle();
        args.putInt(MediaStore.QUERY_ARG_MATCH_PENDING, MediaStore.MATCH_INCLUDE);
        args.putString(ContentResolver.QUERY_ARG_SQL_SELECTION, MediaStore.MediaColumns.DISPLAY_NAME + " = ?");
        args.putStringArray(ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, new String[]{name});
        try (Cursor c = resolver.query(collection, new String[]{MediaStore.MediaColumns._ID}, args, null)) {
            while (c != null && c.moveToNext()) resolver.delete(ContentUris.withAppendedId(collection, c.getLong(0)), null, null);
        } catch (RuntimeException ignored) { }
    }

    @Test
    public void editorExportsARepairedPlayableVideoThroughTheProgressiveBridge() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        String script;
        try (InputStream in = instrumentation.getContext().getAssets().open("wivra-real-export-probe.js")) {
            java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream(); byte[] chunk = new byte[8192]; int n;
            while ((n = in.read(chunk)) > 0) buffer.write(chunk, 0, n);
            script = new String(buffer.toByteArray(), StandardCharsets.UTF_8);
        }
        Activity activity = instrumentation.startActivitySync(
            new Intent(instrumentation.getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        instrumentation.waitForIdleSync();
        ContentResolver resolver = instrumentation.getTargetContext().getContentResolver();
        String savedName = null, gestureName = null;
        try {
            WebView editor = findEditor(activity.getWindow().getDecorView());
            assertNotNull(editor);
            String ready = "\"loading\"";
            for (int i = 0; i < 45 && "\"loading\"".equals(ready); i++) {
                ready = eval(instrumentation, editor, "(function(){return typeof recordProject==='function'&&nativeExportAvailable()?'ready':'loading'})()");
                if ("\"loading\"".equals(ready)) Thread.sleep(350);
            }
            assertEquals("\"ready\"", ready);

            // 1) Android WebView default (gesture required): measured, not asserted.
            JSONObject gesture = runProbe(instrumentation, editor, script, true);
            report("android.gestureRequired", gesture.toString());
            JSONObject gr = gesture.optJSONObject("result");
            JSONObject gs = gr == null ? null : gr.optJSONObject("saved");
            if (gs != null) gestureName = gs.optString("name");

            // 2) Wivra's setting (MainActivity): the export must play its hidden media programmatically.
            JSONObject probe = runProbe(instrumentation, editor, script, false);
            report("android.realExport", probe.toString());
            assertTrue("Export failed: " + probe, !probe.has("error"));
            JSONObject result = probe.getJSONObject("result");
            assertTrue("Must use the progressive native path: " + result, result.getBoolean("progressive"));
            JSONObject saved = result.getJSONObject("saved");
            savedName = saved.getString("name");
            String repair = saved.getString("repair");
            assertTrue("Container must be repaired: " + saved, repair.equals("webm-cues") || repair.equals("mp4-remux"));
            JSONObject media = saved.getJSONObject("media");
            double planned = probe.getDouble("planned");
            double seconds = media.getLong("durationMs") / 1000.0;
            assertTrue("Video track", media.getBoolean("video"));
            assertTrue("Android must report the real duration: " + seconds + " vs " + planned, Math.abs(seconds - planned) < 1.0);
            assertTrue(media.getBoolean("declaresDuration") && media.getBoolean("seekIndex"));
            assertTrue("Audio track expected when the WebView mixed audio", !result.optBoolean("hasAudio") || media.getBoolean("audio"));
        } finally {
            if (savedName != null) deleteByName(resolver, savedName);
            if (gestureName != null && !gestureName.isEmpty()) deleteByName(resolver, gestureName);
            instrumentation.runOnMainSync(activity::finish);
        }
    }
}
