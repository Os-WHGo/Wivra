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
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * Emulator/device: the SAME bundled editor JS (export-sink) talks to the real
 * WivraExportBridge through AndroidX WebMessageListener and writes a gallery item.
 * Synthetic WebM-shaped bytes only: proves the channel, ordering, CRC and cleanup,
 * not MediaRecorder, codecs, a physical phone, a locked screen or Ray-Ban glasses.
 */
@RunWith(AndroidJUnit4.class)
public class WivraExportBridgeWebViewTest {
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
        instrumentation.runOnMainSync(() -> webView.evaluateJavascript(source, value -> {
            result.set(value);
            latch.countDown();
        }));
        assertTrue("WebView JS did not answer within 20 seconds", latch.await(20, TimeUnit.SECONDS));
        return result.get();
    }

    private static List<Uri> rows(ContentResolver resolver, String name, int matchPending) {
        Uri collection = MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
        Bundle args = new Bundle();
        args.putInt(MediaStore.QUERY_ARG_MATCH_PENDING, matchPending);
        args.putString(ContentResolver.QUERY_ARG_SQL_SELECTION, MediaStore.MediaColumns.DISPLAY_NAME + " = ?");
        args.putStringArray(ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, new String[]{name});
        List<Uri> out = new ArrayList<>();
        try (Cursor cursor = resolver.query(collection, new String[]{MediaStore.MediaColumns._ID}, args, null)) {
            while (cursor != null && cursor.moveToNext()) out.add(ContentUris.withAppendedId(collection, cursor.getLong(0)));
        }
        return out;
    }

    @Test
    public void bundledEditorStreamsChunksIntoOneVerifiedGalleryVideo() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Activity activity = instrumentation.startActivitySync(
            new Intent(instrumentation.getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        assertNotNull(activity);
        instrumentation.waitForIdleSync();
        ContentResolver resolver = instrumentation.getTargetContext().getContentResolver();
        Uri published = null;
        try {
            WebView editor = findEditor(activity.getWindow().getDecorView());
            assertNotNull(editor);
            String ready = "not-run";
            for (int retry = 0; retry < 45; retry++) {
                ready = eval(instrumentation, editor, "(function(){return document.readyState!=='loading'&&" +
                    "typeof detectExportHost==='function'&&typeof createProgressiveExportSink==='function'?" +
                    "(nativeExportAvailable()?'native':'no-native'):'loading'})()");
                if (!"\"loading\"".equals(ready)) break;
                Thread.sleep(350);
            }
            assertEquals("Editor must see the WivraExportNative channel", "\"native\"", ready);

            eval(instrumentation, editor, "(function(){window.__wivraExportProbe='running';(async()=>{try{" +
                "const host=detectExportHost();" +
                "const sink=createProgressiveExportSink(host,{mime:'video/webm;codecs=vp8,opus',ext:'webm',estimatedBytes:2000000});" +
                "await sink.begin();" +
                "for(let i=0;i<6;i++){const b=new Uint8Array(150000+i);" +
                "for(let k=0;k<b.length;k++)b[k]=(k*7+i)&255;" +
                "if(i===0)b.set([0x1A,0x45,0xDF,0xA3],0);sink.push(new Blob([b]));}" +
                "const r=await sink.finish();" +
                "const other=createProgressiveExportSink(host,{mime:'video/webm',ext:'webm'});" +
                "const begun=await other.begin();other.push(new Blob([new Uint8Array([0x1A,0x45,0xDF,0xA3,1,2,3])]));" +
                "await new Promise(res=>setTimeout(res,300));await other.abort('test');" +
                "window.__wivraExportProbe=JSON.stringify({ok:true,binary:host.binary,name:r.displayName," +
                "bytes:r.bytes,crc32:r.crc32,chunks:r.chunks,aborted:begun.displayName});" +
                "}catch(e){window.__wivraExportProbe='error:'+e.message}})();return 'started';})()");

            String state = "\"running\"";
            for (int retry = 0; retry < 80 && "\"running\"".equals(state); retry++) {
                Thread.sleep(250);
                state = eval(instrumentation, editor, "window.__wivraExportProbe");
            }
            Object decoded = new JSONTokener(state).nextValue();
            assertTrue("Bridge export failed: " + state, decoded instanceof String && ((String) decoded).startsWith("{"));
            JSONObject result = new JSONObject((String) decoded);
            assertTrue(result.getBoolean("ok"));
            assertEquals(6, result.getInt("chunks"));
            long expectedBytes = 0;
            for (int i = 0; i < 6; i++) expectedBytes += 150000 + i;
            assertEquals(expectedBytes, result.getLong("bytes"));

            List<Uri> visible = rows(resolver, result.getString("name"), MediaStore.MATCH_EXCLUDE);
            assertEquals("Exactly one published gallery item, binary=" + result.optBoolean("binary"), 1, visible.size());
            published = visible.get(0);
            kotlin.Pair<Long, Long> measured = WivraProgressiveExportSession.measure(resolver.openInputStream(published));
            assertEquals(expectedBytes, (long) measured.getFirst());
            assertEquals(result.getLong("crc32"), (long) measured.getSecond());
            assertEquals("Aborted export must leave no row", 0,
                rows(resolver, result.getString("aborted"), MediaStore.MATCH_INCLUDE).size());
        } finally {
            if (published != null) resolver.delete(published, null, null);
            instrumentation.runOnMainSync(activity::finish);
        }
    }
}
