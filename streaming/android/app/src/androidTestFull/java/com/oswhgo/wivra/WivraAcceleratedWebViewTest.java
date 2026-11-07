package com.oswhgo.wivra;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * MU V4 (Claude): the accelerated export (WebCodecs + Mediabunny) inside Wivra's REAL editor WebView on the
 * Android emulator, through the real native v2 random-access writer — the same call as the editor's
 * «Exportar con WebCodecs» control. Two H.264/AAC clips + a title are rendered by the Android System WebView's
 * own encoders and the native side verifies the finished file (duration, picture, sound) before handing a
 * receipt. An emulator is not a physical phone (software codecs, no thermal limits).
 */
@RunWith(AndroidJUnit4.class)
public class WivraAcceleratedWebViewTest {
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

    private static byte[] asset(Instrumentation inst, String name) throws Exception {
        try (InputStream in = inst.getContext().getAssets().open(name)) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream(); byte[] chunk = new byte[65536]; int n;
            while ((n = in.read(chunk)) > 0) buffer.write(chunk, 0, n);
            return buffer.toByteArray();
        }
    }

    private static void report(String value) {
        for (int i = 0, part = 0; i < value.length(); i += 3000, part++) {
            Bundle b = new Bundle();
            b.putString("WIVRA-ACCEL", part + "=" + value.substring(i, Math.min(value.length(), i + 3000)));
            InstrumentationRegistry.getInstrumentation().sendStatus(0, b);
        }
    }

    @Test
    public void acceleratedExportInTheRealEditorWritesAVerifiedFile() throws Exception {
        Instrumentation inst = InstrumentationRegistry.getInstrumentation();
        String clip = Base64.encodeToString(asset(inst, "ffmpeg-h264-aac-fragmented.mp4"), Base64.NO_WRAP);
        Activity activity = inst.startActivitySync(new Intent(inst.getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        inst.waitForIdleSync();
        try {
            WebView editor = findEditor(activity.getWindow().getDecorView());
            assertNotNull(editor);
            String ready = "\"loading\"";
            for (int i = 0; i < 90 && !"\"ready\"".equals(ready); i++) {
                ready = eval(inst, editor, "(function(){return window.WivraEditorImport&&window.WivraAcceleratedQA?'ready':'loading'})()");
                if (!"\"ready\"".equals(ready)) Thread.sleep(500);
            }
            assertEquals("\"ready\"", ready);
            eval(inst, editor, "window.__accClip = '" + clip + "'; 'ok'");
            eval(inst, editor, "window.__accOut = 'running'; (async () => { try {"
                + "const host = WivraAcceleratedQA.nativeHost(); if (!host) throw new Error('no native v2 host');"
                + "const bytes = Uint8Array.from(atob(window.__accClip), (c) => c.charCodeAt(0)); delete window.__accClip;"
                + "const man = (id, f) => JSON.stringify({ schemaVersion: 2, captureID: id, cameraSource: 'emulator', audioSource: 'none', selectedInputName: null, originalVideoFile: f, originalAudioFile: null, muxedVideoFile: null, audioStartOffsetSeconds: null, createdAtISO8601: '2026-11-06T12:00:00Z', tracks: [], muxedFromTrackIDs: [] });"
                + "for (const n of ['A', 'B']) await window.WivraEditorImport.importFiles([new File([man('acc-' + n, 'Wivra_' + n + '.mp4')], 'Wivra_' + n + '.wivra.json'), new File([bytes], 'Wivra_' + n + '.mp4', { type: 'video/mp4' })]);"
                + "const t = edit([{ op: 'add_text', text: 'WIVRA', start: 0.2, duration: 1.5 }], { ripple: false }); if (!t.ok) throw new Error(t.message);"
                + "const total = totalDuration(session.project); const t0 = performance.now();"
                + "const r = await WivraAcceleratedQA.recordOnNative({ project: session.project, media, expectAudio: true, experimentalAccelerated: true, longForm: false });"
                + "window.__accOut = JSON.stringify({ ok: true, platform: host.platform, total, ms: Math.round(performance.now() - t0), mime: r.mime,"
                + "  verifiedNative: r.verifiedNative, verifiedOnDevice: r.verifiedOnDevice, saved: { verified: r.saved.verified, bytes: r.saved.bytes, durationMs: r.saved.durationMs, displayName: r.saved.displayName },"
                + "  render: { container: r.render.container, videoCodec: r.render.videoCodec, audioCodec: r.render.audioCodec, videoFrames: r.render.videoFrames } });"
                + "} catch (e) { window.__accOut = JSON.stringify({ ok: false, error: String(e && e.message || e) }); } })(); 'started'");
            String state = "\"running\"";
            for (int i = 0; i < 300 && "\"running\"".equals(state); i++) {
                Thread.sleep(1000);
                state = eval(inst, editor, "String(window.__accOut)");
            }
            Object decoded = new JSONTokener(state).nextValue();
            assertTrue("Accelerated export did not finish: " + state, decoded instanceof String && !"running".equals(decoded));
            JSONObject out = new JSONObject((String) decoded);
            report(out.toString());
            assertTrue("Accelerated export failed: " + out.optString("error"), out.optBoolean("ok"));
            assertEquals("android", out.getString("platform"));
            assertTrue("native verified the file", out.getBoolean("verifiedNative") && out.getJSONObject("saved").getBoolean("verified"));
            assertTrue("never claims a physical-device validation", !out.getBoolean("verifiedOnDevice"));
            assertTrue("a real file was written", out.getJSONObject("saved").getLong("bytes") > 1000);
        } finally {
            inst.runOnMainSync(activity::finish);
            inst.waitForIdleSync();
        }
    }
}
