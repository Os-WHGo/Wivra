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

        JSONArray steps = full.getJSONArray("steps");
        for (int i = 0; i < steps.length(); i++) {
            JSONObject s = steps.getJSONObject(i);
            if ("download-end".equals(s.optString("name"))) assertTrue("Consent must be asked first", s.optBoolean("consentAsked"));
            if ("cancel".equals(s.optString("name"))) assertEquals("Cancel must add nothing", 0, s.optInt("textsAdded", -1));
        }
    }
}
