package com.oswhgo.wivra;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * Emulator/Android-device instrumentation. Opens the SAME actual WebView HTML
 * as the app, not a second editor or mocked browser.
 * Synthetic manifests only; no physical recording, glasses or mic hardware.
 */
@RunWith(AndroidJUnit4.class)
public class WivraEditorWebViewTest {
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

    private static String eval(Instrumentation instrumentation, WebView webView, String source)
            throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> webView.evaluateJavascript(source, value -> {
            result.set(value);
            latch.countDown();
        }));
        assertTrue("Embedded WebView JS did not answer", latch.await(8, TimeUnit.SECONDS));
        return result.get();
    }

    @Test
    public void bundledEditorLoadsOfflineAndPlansMP4WithIndependentWAV() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Intent launch = new Intent(instrumentation.getTargetContext(), MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        Activity activity = instrumentation.startActivitySync(launch);
        assertNotNull(activity);
        try {
            WebView editor = findEditor(activity.getWindow().getDecorView());
            assertNotNull("Native Wivra shell must use its embedded WebView editor", editor);
            // Android WebView getters are confined to its UI/main Looper too.
            // The instrumentation runner itself executes tests off that thread.
            AtomicBoolean secureFileSettings = new AtomicBoolean(false);
            instrumentation.runOnMainSync(() -> secureFileSettings.set(
                !editor.getSettings().getAllowFileAccessFromFileURLs() &&
                !editor.getSettings().getAllowUniversalAccessFromFileURLs()));
            assertTrue("Editor WebView must isolate local file URLs", secureFileSettings.get());

            final String probe = "(function(){try{" +
                "const input=document.getElementById('capFile');" +
                "if(document.readyState==='loading'||!input||" +
                "typeof parseManifest!=='function'||typeof captureSelectionPlan!=='function'||" +
                "typeof planImportOps!=='function')return 'loading';" +
                "if(!input.multiple||!input.accept.includes('.json'))return 'bad-input';" +
                "const m={schemaVersion:2,captureID:'android-emulator-synthetic'," +
                "cameraSource:'android-phone-camerax',audioSource:'android-usb-mic'," +
                "createdAtISO8601:'2026-10-17T13:00:00Z'," +
                "originalVideoFile:'Wivra_Phone_mock.mp4'," +
                "originalAudioFile:'Wivra_Phone_mock.wav',muxedVideoFile:null," +
                "tracks:[{id:'audio-1',kind:'audio',role:'voice_primary'," +
                "source:'android-usb-mic',file:'Wivra_Phone_mock.wav'," +
                "channelIndex:null,channelCount:1,sampleRateHz:48000," +
                "startOffsetSeconds:0.22}],muxedFromTrackIDs:[]};" +
                "const parsed=parseManifest(m);" +
                "if(!parsed.ok)return 'manifest-error';" +
                "const selected=captureSelectionPlan(parsed.manifest,[" +
                "{name:'Wivra_Phone_mock.mp4',size:12345}," +
                "{name:'Wivra_Phone_mock.wav',size:23456}]);" +
                "if(!selected.ok)return 'selection-error';" +
                "const op=planImportOps(importPlan(parsed.manifest),{videoStart:0," +
                "assets:{'Wivra_Phone_mock.mp4':{id:'v',duration:8}," +
                "'Wivra_Phone_mock.wav':{id:'a',duration:7}}});" +
                "return op.skipped.length===0&&op.ops.length===2&&" +
                "op.ops[1].op==='add_audio_clip'&&op.ops[1].start===0.22?" +
                "'ready':'plan-error';" +
                "}catch(e){return 'exception:'+String(e.message).slice(0,100);}})()";

            String state = "not-run";
            for (int retry = 0; retry < 45; retry++) {
                state = eval(instrumentation, editor, probe);
                if (!"\"loading\"".equals(state)) break;
                Thread.sleep(350);
            }
            assertTrue("Editor HTML/JS contract in Android WebView: " + state,
                    "\"ready\"".equals(state));
            String location = eval(instrumentation, editor, "location.href");
            assertTrue("Editor must run from offline Android APK assets: " + location,
                    location.contains("file:///android_asset/agentcut.html"));
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }
}
