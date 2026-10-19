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
            // Exercise the ACTUAL JS audio safety contract inside the bundled
            // Android WebView. This does not impersonate a physical microphone.
            String shortWavProbe = "(function(){try{" +
                "if(typeof exportAudioPreflight!=='function')return 'no-preflight';" +
                "const m={v:{kind:'video'},a:{kind:'audio'}};" +
                "const p={clips:[{id:'v1',asset_id:'v',start:0,in:0,out:9}]," +
                "audioClips:[{id:'voice1',asset_id:'a',role:'voice_primary'," +
                "start:0,in:0,out:4}]};" +
                "const opts={hasAudio:true,decodedAudioIds:['a']," +
                "decodedAudioDurations:{a:2}};" +
                "const r=exportAudioPreflight(p,m,opts);" +
                "const ok=exportAudioPreflight(p,m,{...opts,decodedAudioDurations:{a:4}});" +
                "return r.needsConfirmation&&r.missingAudio.length===0&&" +
                "r.shortAudio.length===1&&r.shortAudio[0].secondsLost===2&&" +
                "!ok.needsConfirmation&&ok.shortAudio.length===0?" +
                "'short-wav-safely-blocked':'short-wav-not-detected';" +
                "}catch(e){return 'exception:'+String(e.message).slice(0,100);}})()";
            String audioContract = eval(instrumentation, editor, shortWavProbe);
            assertTrue("Wivra bundled WebView must reject truncated voice WAV: " + audioContract,
                    "\"short-wav-safely-blocked\"".equals(audioContract));
            // Check the same source-video EOF contract in the ACTUAL offline
            // HTML embedded in Android, not a second exported JS implementation.
            String videoProbe = "(function(){try{" +
                "if(typeof videoSourceShortfall!=='function')return 'no-video-eof-guard';" +
                "const over=videoSourceShortfall({in:0,out:5,speed:2},2);" +
                "const exact=videoSourceShortfall({in:0,out:5,speed:1},5);" +
                "const unknown=videoSourceShortfall({in:0,out:5,speed:1},Infinity);" +
                "return over===1.5&&exact===0&&unknown===0?" +
                "'source-eof-safely-detected':'bad-eof-result:'+over;" +
                "}catch(e){return 'exception:'+String(e.message).slice(0,100);}})()";
            String videoContract = eval(instrumentation, editor, videoProbe);
            assertTrue("Wivra offline editor must reject video source EOF: " + videoContract,
                    "\"source-eof-safely-detected\"".equals(videoContract));
            // An overlapping main video lane would export the two clips
            // sequentially and shift independent microphone/subtitle timing.
            // Verify rejection in the ACTUAL bundled Android WebView.
            String overlapProbe = "(function(){try{" +
                "if(typeof validateMainVideoExport!=='function')return 'no-main-video-guard';" +
                "const p={clips:[{id:'one',start:0,in:0,out:4}," +
                "{id:'two',start:3,in:0,out:2}],overlayClips:[]," +
                "audioClips:[{id:'mic',start:0,in:0,out:5}]};" +
                "const before=JSON.stringify(p);" +
                "const bad=validateMainVideoExport(p);" +
                "const good=validateMainVideoExport({clips:[{id:'one',start:0,in:0,out:4}," +
                "{id:'two',start:4,in:0,out:2}]});" +
                "return bad.reason==='overlap'&&bad.seconds===1&&good.ok===true&&" +
                "before===JSON.stringify(p)?'main-overlap-safely-blocked':" +
                "'bad-overlap-contract';" +
                "}catch(e){return 'exception:'+String(e.message).slice(0,100);}})()";
            String overlapContract = eval(instrumentation, editor, overlapProbe);
            assertTrue("Wivra offline Android editor must reject overlapping main video: " + overlapContract,
                    "\"main-overlap-safely-blocked\"".equals(overlapContract));
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }
}
