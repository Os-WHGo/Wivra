package com.oswhgo.wivra;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * W86 (Claude). Emulator: automatic subtitles with whisper.cpp WebAssembly inside Wivra's REAL
 * editor WebView (Android System WebView), driven by the same in-page driver as the Chromium and
 * iOS checks (tools/whisper-wasm/e2e-driver.js). It downloads the pinned multilingual pack from
 * huggingface.co after the consent dialog, verifies it, cancels once, recognizes with network
 * blocked, then reopens the editor and recognizes again from the kept pack. An emulator is not a
 * physical phone. Runs only when the CI provided input.json (otherwise skipped).
 */
@RunWith(AndroidJUnit4.class)
public class WivraWhisperWebViewTest {
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

    private static String eval(Instrumentation inst, WebView webView, String source) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        inst.runOnMainSync(() -> webView.evaluateJavascript(source, value -> { result.set(value); latch.countDown(); }));
        assertTrue("WebView JS did not answer", latch.await(60, TimeUnit.SECONDS));
        return result.get();
    }

    private static String asset(Instrumentation inst, String name) {
        try (InputStream in = inst.getContext().getAssets().open(name)) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream(); byte[] chunk = new byte[65536]; int n;
            while ((n = in.read(chunk)) > 0) buffer.write(chunk, 0, n);
            return new String(buffer.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception missing) { return null; }
    }

    private static byte[] assetBytes(Instrumentation inst, String name) {
        try (InputStream in = inst.getContext().getAssets().open(name)) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream(); byte[] chunk = new byte[65536]; int n;
            while ((n = in.read(chunk)) > 0) buffer.write(chunk, 0, n);
            return buffer.toByteArray();
        } catch (Exception missing) { return null; }
    }

    private static void report(String key, String value) {
        // Instrumentation status lines are size-limited: send the result in pieces.
        for (int i = 0, part = 0; i < value.length(); i += 3000, part++) {
            Bundle b = new Bundle();
            b.putString("wivra-whisper", key + "#" + part + "=" + value.substring(i, Math.min(value.length(), i + 3000)));
            InstrumentationRegistry.getInstrumentation().sendStatus(0, b);
        }
        Log.i("WivraWhisper", key + "=" + value);
    }

    private static JSONObject runDriver(Instrumentation inst, String input, String driver, String overrides) throws Exception {
        Activity activity = inst.startActivitySync(new Intent(inst.getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        inst.waitForIdleSync();
        try {
            WebView editor = findEditor(activity.getWindow().getDecorView());
            assertNotNull(editor);
            String ready = "\"loading\"";
            for (int i = 0; i < 90 && !"\"ready\"".equals(ready); i++) {
                ready = eval(inst, editor, "(function(){return typeof wvGetPack==='function'&&!!window.WivraEditorImport?'ready':'loading'})()");
                if (!"\"ready\"".equals(ready)) Thread.sleep(500);
            }
            assertEquals("\"ready\"", ready);
            eval(inst, editor, "window.__wvE2EIn = Object.assign(" + input + ", " + overrides + "); 'set'");
            eval(inst, editor, driver + "\n;'started'");
            String state = "\"running\"";
            for (int i = 0; i < 900 && "\"running\"".equals(state); i++) {    // up to 30 min on a slow emulator
                Thread.sleep(2000);
                state = eval(inst, editor, "String(window.__wvE2EOut)");
            }
            Object decoded = new JSONTokener(state).nextValue();
            assertTrue("Driver did not finish: " + state, decoded instanceof String && !"running".equals(decoded));
            return new JSONObject((String) decoded);
        } finally {
            inst.runOnMainSync(activity::finish);
            inst.waitForIdleSync();
        }
    }

    /**
     * W106 (Claude): an 11-minute video (voice at 60 s and at 630 s, silence elsewhere) given to the editor through
     * the app's real permission path (FileProvider URI → WivraAudioSegments.remember, as after the file chooser),
     * then subtitled in long mode: every piece is read by MediaCodec through the native bridge, with the pack kept
     * by the earlier phases. Skipped when the CI did not provide long.webm.
     */
    private static JSONObject runLong(Instrumentation inst, byte[] video) throws Exception {
        android.content.Context ctx = inst.getTargetContext();
        java.io.File dir = new java.io.File(ctx.getCacheDir(), "wivra-capture-import");
        assertTrue(dir.isDirectory() || dir.mkdirs());
        java.io.File file = new java.io.File(dir, "Wivra_Long.webm");
        try (java.io.FileOutputStream out = new java.io.FileOutputStream(file)) { out.write(video); }
        android.net.Uri uri = androidx.core.content.FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".captureimports", file);
        WivraAudioSegments.INSTANCE.remember(ctx, new android.net.Uri[]{uri});
        Activity activity = inst.startActivitySync(new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        inst.waitForIdleSync();
        try {
            WebView editor = findEditor(activity.getWindow().getDecorView());
            assertNotNull(editor);
            String ready = "\"loading\"";
            for (int i = 0; i < 90 && !"\"ready\"".equals(ready); i++) {
                ready = eval(inst, editor, "(function(){return typeof wvGetPack==='function'&&!!window.WivraEditorImport?'ready':'loading'})()");
                if (!"\"ready\"".equals(ready)) Thread.sleep(500);
            }
            assertEquals("\"ready\"", ready);
            String b64 = android.util.Base64.encodeToString(video, android.util.Base64.NO_WRAP);
            eval(inst, editor, "window.__wvLongB64 = []; 'ok'");
            for (int i = 0; i < b64.length(); i += 1_000_000) {
                eval(inst, editor, "window.__wvLongB64.push('" + b64.substring(i, Math.min(b64.length(), i + 1_000_000)) + "'); 'ok'");
            }
            eval(inst, editor, "window.__wvLongOut = 'running'; (async () => { try {"
                + "const bin = atob(window.__wvLongB64.join('')); delete window.__wvLongB64; const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);"
                + "window.confirm = () => true; const says = []; const o = window.say; window.say = (m, k) => { says.push(String(m)); return o(m, k); };"
                + "const mf = JSON.stringify({ schemaVersion: 2, captureID: 'w106', cameraSource: 'emulator', audioSource: 'none', selectedInputName: null, originalVideoFile: 'Wivra_Long.webm', originalAudioFile: null, muxedVideoFile: null, audioStartOffsetSeconds: null, createdAtISO8601: '2026-11-06T12:00:00Z', tracks: [], muxedFromTrackIDs: [] });"
                + "await window.WivraEditorImport.importFiles([new File([mf], 'Wivra_Long.wivra.json'), new File([bytes], 'Wivra_Long.webm', { type: 'video/webm' })]);"
                + "const duration = totalDuration(session.project), native = !!(window.WivraAudioPcm && typeof window.WivraAudioPcm.extract === 'function');"
                + "$('wvModel').value = 'base'; $('wvLang').value = 'es'; if (!(await wvGetPack('base'))) throw new Error('no kept pack');"
                + "const t0 = performance.now(); await $('wvRun').onclick();"
                + "window.__wvLongOut = JSON.stringify({ ok: true, duration, native, ms: Math.round(performance.now() - t0), run: window.wvLastRun || null, askedAgain: $('wvRegrant').style.display !== 'none',"
                + "  texts: session.project.texts.map((x) => ({ start: x.start, end: x.end, text: x.text })), says: says.slice(-3) });"
                + "} catch (e) { window.__wvLongOut = JSON.stringify({ ok: false, error: String(e && e.message || e) }); } })(); 'started'");
            String state = "\"running\"";
            for (int i = 0; i < 600 && "\"running\"".equals(state); i++) {    // up to 20 min on a slow emulator
                Thread.sleep(2000);
                state = eval(inst, editor, "String(window.__wvLongOut)");
            }
            Object decoded = new JSONTokener(state).nextValue();
            assertTrue("Long run did not finish: " + state, decoded instanceof String && !"running".equals(decoded));
            return new JSONObject((String) decoded);
        } finally {
            inst.runOnMainSync(activity::finish);
            inst.waitForIdleSync();
            file.delete();
        }
    }

    @Test
    public void recognizesSpeechOnThePhoneAndKeepsThePackOffline() throws Exception {
        Instrumentation inst = InstrumentationRegistry.getInstrumentation();
        String driver = asset(inst, "e2e-driver.js"), input = asset(inst, "input.json");
        Assume.assumeTrue("CI did not provide the whisper e2e input", driver != null && input != null);

        JSONObject full = runDriver(inst, input, driver, "{phase:'full',cancel:true}");
        report("android.full", full.toString());
        assertTrue("Full run failed: " + full.optString("error") + " " + full.optJSONArray("says"), full.optBoolean("ok"));

        JSONObject kept = runDriver(inst, input, driver, "{phase:'offline',cancel:false}");
        report("android.kept", kept.toString());
        assertTrue("Run from the kept pack failed: " + kept.optString("error") + " " + kept.optJSONArray("says"), kept.optBoolean("ok"));

        byte[] longVideo = assetBytes(inst, "long.webm");
        if (longVideo != null) {
            JSONObject lng = runLong(inst, longVideo);
            report("android.long", lng.toString());
            assertTrue("Long run failed: " + lng.optString("error") + " " + lng.optJSONArray("says"), lng.optBoolean("ok"));
            assertTrue("native piece reader present", lng.optBoolean("native"));
            assertTrue("longer than the 10-minute single-decode limit", lng.optDouble("duration") > 600);
            assertTrue("the chooser permission was enough (no second request)", !lng.optBoolean("askedAgain"));
            JSONArray texts = lng.getJSONArray("texts");
            boolean volcan = false;
            for (int i = 0; i < texts.length(); i++) {
                JSONObject t = texts.getJSONObject(i);
                if (t.optString("text").toLowerCase().contains("volc") && Math.abs(t.optDouble("start") - 631) < 12) volcan = true;
            }
            assertTrue("«volcán» recognized near 631 s: " + texts, volcan);
        }

        JSONArray steps = full.getJSONArray("steps");
        for (int i = 0; i < steps.length(); i++) {
            JSONObject s = steps.getJSONObject(i);
            if ("download-end".equals(s.optString("name"))) assertTrue("Consent must be asked first", s.optBoolean("consentAsked"));
            if ("cancel".equals(s.optString("name"))) assertEquals("Cancel must add nothing", 0, s.optInt("textsAdded", -1));
        }
    }
}
