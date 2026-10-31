package com.oswhgo.wivra;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Real APK bridge/verifier and synthetic HEVC; camera/start/stop and journal
 * storage are stubs. Does not certify hardware or background capture. — ChatGPT */
@RunWith(AndroidJUnit4.class)
public class WivraCaptureVerifierWebViewTest {
    private WebView find(View node) {
        if (node instanceof WebView) return (WebView) node;
        if (node instanceof ViewGroup) for (int i=0; i<((ViewGroup)node).getChildCount(); i++) {
            WebView found=find(((ViewGroup)node).getChildAt(i)); if(found!=null)return found;
        }
        return null;
    }
    private String eval(Instrumentation inst, WebView view, String script) throws Exception {
        CountDownLatch done=new CountDownLatch(1); AtomicReference<String> value=new AtomicReference<>();
        inst.runOnMainSync(()->view.evaluateJavascript(script, reply->{value.set(reply);done.countDown();}));
        assertTrue(done.await(20, TimeUnit.SECONDS)); return value.get();
    }
    @Test public void coordinatorUsesNativeFileVerificationBeforeFinalizationAndDirector() throws Exception {
        Instrumentation inst=InstrumentationRegistry.getInstrumentation();
        String id=UUID.randomUUID().toString().replace("-", "");
        String name="wivra_rayban_"+id+"_part0001.mp4";
        File root=new File(inst.getTargetContext().getFilesDir(),"wivra_pending_videos");
        assertTrue(root.isDirectory() || root.mkdirs());
        File file=new File(root,name);
        try(InputStream in=inst.getContext().getAssets().open("capture-hevc.mp4"); FileOutputStream out=new FileOutputStream(file)) {
            byte[] buf=new byte[8192]; int n; while((n=in.read(buf))!=-1)out.write(buf,0,n);
        }
        Activity activity=inst.startActivitySync(new Intent(inst.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        inst.waitForIdleSync();
        try {
            WebView editor=find(activity.getWindow().getDecorView()); assertNotNull(editor);
            boolean ready=false;
            for(int i=0;i<60;i++) {
                if("true".equals(eval(inst,editor,"typeof createNativeCaptureSession==='function'&&typeof WivraCaptureNative!=='undefined'"))) { ready=true;break; }
                Thread.sleep(250);
            }
            assertTrue("capture modules and bridge must be bundled",ready);
            String script="window.__captureProbe='pending';(async()=>{try{"+
                "const id="+JSONObject.quote(id)+",file="+JSONObject.quote(name)+";const files=new Map();"+
                "const storage={writeAtomic:async(n,v)=>files.set(n,v),read:async n=>files.get(n)??null,list:async()=>[...files.keys()]};"+
                "const host={capabilities:async()=>({rayban:true,lockedScreen:true}),start:async()=>{},"+
                "stop:async()=>({finalFile:file,segments:[{file,startMs:0,endMs:1000,confirmed:true}]})};"+
                "const s=createNativeCaptureSession({host,storage});await s.start({id,platform:'android'});await s.stop(id);"+
                "const receipt=await s.directorHandoff(id);const verify=detectNativeCaptureFileVerifier();"+
                "const wrong=await verify({id:'0'.repeat(32),file});"+
                "window.__captureProbe=JSON.stringify({state:(await s.snapshot(id)).state,file:receipt.file,wrong});"+
                "}catch(e){window.__captureProbe='error:'+e.message}})();";
            eval(inst,editor,script);
            String result="\"pending\"";
            for(int i=0;i<160 && "\"pending\"".equals(result);i++) {Thread.sleep(250);result=eval(inst,editor,"window.__captureProbe");}
            Object value=new JSONTokener(result).nextValue();
            assertTrue("capture bridge failed: "+result,value instanceof String && ((String)value).startsWith("{"));
            JSONObject parsed=new JSONObject((String)value);
            assertEquals("finalized",parsed.getString("state"));
            assertEquals(name,parsed.getString("file"));
            assertFalse(parsed.getBoolean("wrong"));
        } finally {file.delete();inst.runOnMainSync(activity::finish);}
    }
}
