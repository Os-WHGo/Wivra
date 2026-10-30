package com.oswhgo.wivra;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Wivra's Android native shell for the very same offline Claude editor HTML.
 * B0 only: native DAT Android/camera and verified media handoff will be added
 * once the editor in WebView is proven on Android. No second editor project.
 * No telemetry, account gate, SDK tokens or paid services.
 */
public final class MainActivity extends Activity {
    private static final int PICK_FILES_REQUEST = 4207;
    private static final int DIRECTOR_CAPTURE_REQUEST = 4208;
    private String pendingDirectorShotId;
    private ValueCallback<Uri[]> pendingFilePicker;
    private WebView editor;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (savedInstanceState != null) {
            pendingDirectorShotId = savedInstanceState.getString("directorShotAwaitingSave");
        }
        editor = new WebView(this);
        final WebSettings settings = editor.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setAllowFileAccess(true); // Required to load signed-in-APK assets.
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        editor.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                return url == null || !"file".equals(url.getScheme()) ||
                    !"android_asset".equals(url.getAuthority()) &&
                    !url.toString().startsWith("file:///android_asset/");
            }
        });
        editor.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                WebView webView,
                ValueCallback<Uri[]> callback,
                FileChooserParams params
            ) {
                if (pendingFilePicker != null) {
                    pendingFilePicker.onReceiveValue(null);
                }
                pendingFilePicker = callback;
                // Only saved and published Wivra media are offered as shortcuts.
                // Pending Ray-Ban parts remain PRIVATE until "Guardar video".
                // Manual "Buscar en Archivos" remains available at all times.
                boolean acceptsJson = false;
                boolean acceptsImage = false;
                boolean acceptsVideo = false;
                boolean acceptsAudio = false;
                for (String accept : params.getAcceptTypes()) {
                    if (accept == null) continue;
                    if (accept.contains(".json") || accept.contains("application/json")) acceptsJson = true;
                    if (accept.contains("image/")) acceptsImage = true;
                    if (accept.contains("video/")) acceptsVideo = true;
                    if (accept.contains("audio/")) acceptsAudio = true;
                }
                boolean captureChooser = acceptsJson && params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;
                Uri recent = acceptsImage
                    ? WivraMetaPhotoStore.latestCapturedPhoto(MainActivity.this)
                    : null;
                java.util.List<String> labels = new java.util.ArrayList<>();
                java.util.List<Uri> choices = new java.util.ArrayList<>();
                java.util.List<Uri[]> multiChoices = new java.util.ArrayList<>();
                if (captureChooser) {
                    // Original editor receives JSON + MP4 + WAV as one FileList.
                    for (WivraCaptureImport.Bundle bundle : WivraCaptureImport.bundles(MainActivity.this)) {
                        labels.add(getString(R.string.picker_phone_capture_bundle, bundle.getTitle()));
                        choices.add(null);
                        multiChoices.add(bundle.getUris());
                    }
                }
                if (!captureChooser && recent != null) {
                    labels.add(getString(R.string.picker_last_photo));
                    choices.add(recent);
                    multiChoices.add(null);
                }
                if (!captureChooser && acceptsImage) {
                    for (WivraPhoneMediaStore.SavedMedia photo :
                            WivraPhoneMediaStore.latestSavedPhotos(MainActivity.this)) {
                        labels.add(getString(R.string.picker_phone_photo_named, photo.getTitle()));
                        choices.add(photo.getUri());
                        multiChoices.add(null);
                    }
                }
                if (!captureChooser && acceptsVideo) {
                    for (WivraSavedRayBanVideos.SavedVideo video :
                            WivraSavedRayBanVideos.latestSaved(MainActivity.this)) {
                        labels.add(getString(R.string.picker_wivra_video_named, video.getTitle()));
                        choices.add(video.getUri());
                        multiChoices.add(null);
                    }
                    for (WivraPhoneMediaStore.SavedMedia video :
                            WivraPhoneMediaStore.latestSavedVideos(MainActivity.this)) {
                        labels.add(getString(R.string.picker_phone_video_named, video.getTitle()));
                        choices.add(video.getUri());
                        multiChoices.add(null);
                    }
                }
                if (!captureChooser && acceptsAudio) {
                    for (WivraPhoneMediaStore.SavedMedia audio :
                            WivraPhoneMediaStore.latestSavedWav(MainActivity.this)) {
                        labels.add(getString(R.string.picker_phone_audio_named, audio.getTitle()));
                        choices.add(audio.getUri());
                        multiChoices.add(null);
                    }
                }
                if (!choices.isEmpty()) {
                    labels.add(getString(R.string.picker_browse_files));
                    new AlertDialog.Builder(MainActivity.this)
                        .setTitle(captureChooser ? R.string.picker_capture_title : R.string.picker_wivra_media_title)
                        .setItems(labels.toArray(new String[0]), (dialog, item) -> {
                            if (item >= 0 && item < choices.size()) {
                                ValueCallback<Uri[]> completion = pendingFilePicker;
                                pendingFilePicker = null;
                                if (completion != null) {
                                    if (multiChoices.get(item) != null) {
                                        completion.onReceiveValue(multiChoices.get(item));
                                    } else {
                                        completion.onReceiveValue(new Uri[]{choices.get(item)});
                                    }
                                }
                            } else {
                                launchSystemPicker(params);
                            }
                        })
                        .setOnCancelListener(dialog -> clearPendingPicker())
                        .show();
                    return true;
                }
                launchSystemPicker(params);
                return true;
            }
        });
        // A single native app: same Claude editor plus explicit Meta glasses entry.
        // Returning from the glasses diagnostics keeps this editor WebView instance.
        LinearLayout shell = new LinearLayout(this);
        shell.setOrientation(LinearLayout.VERTICAL);
        Button glasses = new Button(this);
        glasses.setText("Ray-Ban Meta");
        glasses.setContentDescription(getString(R.string.connect_glasses_accessibility));
        glasses.setOnClickListener(v -> launchRayBanCameraFromDirector());
        // A View can have only one parent. The glasses shortcut belongs to
        // the horizontal sources row; adding it to shell first crashes startup.
        Button phone = new Button(this);
        phone.setText(R.string.phone_camera_open);
        phone.setContentDescription(getString(R.string.phone_camera_open));
        phone.setOnClickListener(v -> launchPhoneCameraFromDirector());
        // These are two capture sources feeding the same one-and-only editor.
        LinearLayout sources = new LinearLayout(this);
        sources.setOrientation(LinearLayout.HORIZONTAL);
        sources.addView(glasses, new LinearLayout.LayoutParams(
            0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        sources.addView(phone, new LinearLayout.LayoutParams(
            0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        shell.addView(sources, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT));
        // Native RTMP publisher is installed ONLY in the full edition.
        // No reflection, third-party encoder or LIVE control in Wivra Capture.
        if ("com.oswhgo.wivra".equals(getPackageName())) {
            Button phoneLive = new Button(this);
            phoneLive.setText("LIVE · cámara del teléfono");
            phoneLive.setContentDescription("Transmitir LIVE con consentimiento");
            phoneLive.setOnClickListener(v -> {
                Intent live = new Intent();
                live.setClassName(this, "com.oswhgo.wivra.WivraPhoneLiveActivity");
                startActivity(live);
            });
            shell.addView(phoneLive);
        }
        shell.addView(editor, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(shell);
        editor.loadUrl("file:///android_asset/agentcut.html");
    }

    /**
     * Read ONLY the already-saved local Director checklist, on the user's
     * explicit "Phone camera" tap. No JavascriptInterface, HTTP, or upload.
     * The selected text is carried in an app-private non-exported Intent.
     */
    private void launchRayBanCameraFromDirector() {
        launchCameraFromDirector(WivraMetaPreviewActivity.class);
    }

    private void launchPhoneCameraFromDirector() {
        launchCameraFromDirector(WivraPhoneCameraActivity.class);
    }

    /** Same sanitized read-only Director checklist for both native cameras. */
    private void launchCameraFromDirector(Class<?> targetActivity) {
        if (editor == null ||
            !"file:///android_asset/agentcut.html".equals(editor.getUrl())) {
            startActivity(new Intent(this, targetActivity));
            return;
        }
        final String readOnly = "(function(){try{" +
            "const plan=JSON.parse(localStorage.getItem('agentcut-shoot-checklist-v1')||'null');" +
            "if(!plan||plan.schema!=='agentcut-shoot-plan-v0.1'||!Array.isArray(plan.shots))return '[]';" +
            "return JSON.stringify(plan.shots.filter(s=>(s.state==='todo'||s.state==='retry')" +
            "&&typeof s.id==='string'&&s.id.length>0&&s.id.length<=120)" +
            ".slice(0,30).map(s=>({id:s.id,title:String(s.title||'')," +
            "script:typeof s.script==='string'?s.script.slice(0,2200):''})));" +
            "}catch(e){return '[]';}})();";
        editor.evaluateJavascript(readOnly, encoded -> {
            org.json.JSONArray shots = new org.json.JSONArray();
            try {
                Object payload = new org.json.JSONTokener(encoded).nextValue();
                if (payload instanceof String) {
                    shots = new org.json.JSONArray((String) payload);
                }
            } catch (Exception ignored) {
                // A corrupt or missing checklist never blocks the phone camera.
            }
            if (shots.length() == 0) {
                startActivity(new Intent(this, targetActivity));
                return;
            }
            final org.json.JSONArray safeShots = shots;
            String[] options = new String[safeShots.length() + 1];
            options[0] = getString(R.string.phone_camera_without_script);
            for (int i = 0; i < safeShots.length(); i++) {
                org.json.JSONObject shot = safeShots.optJSONObject(i);
                String title = shot == null ? "" : shot.optString("title", "").trim();
                options[i + 1] = title.isEmpty() ?
                    getString(R.string.phone_camera_unnamed_shot, i + 1) :
                    title.substring(0, Math.min(75, title.length()));
            }
            new AlertDialog.Builder(this)
                .setTitle(R.string.phone_camera_choose_shot)
                .setItems(options, (dialog, index) -> {
                    Intent launch = new Intent(this, targetActivity);
                    if (index > 0) {
                        org.json.JSONObject shot = safeShots.optJSONObject(index - 1);
                        if (shot != null) {
                            String script = shot.optString("script", "");
                            if (script.length() <= 2200 && !script.trim().isEmpty()) {
                                launch.putExtra(WivraPhoneCameraActivity.EXTRA_SHOT_SCRIPT, script);
                            }
                            String id = shot.optString("id", "");
                            if (id.length() > 0 && id.length() <= 120) {
                                launch.putExtra(WivraPhoneCameraActivity.EXTRA_SHOT_ID, id);
                                pendingDirectorShotId = id;
                                startActivityForResult(launch, DIRECTOR_CAPTURE_REQUEST);
                                return;
                            }
                        }
                    }
                    startActivity(launch);
                })
                .show();
        });
    }

    private void launchSystemPicker(WebChromeClient.FileChooserParams params) {
        try {
            Intent picker = params.createIntent();
            picker.addCategory(Intent.CATEGORY_OPENABLE);
            startActivityForResult(picker, PICK_FILES_REQUEST);
        } catch (Exception unavailable) {
            clearPendingPicker();
        }
    }

    private void clearPendingPicker() {
        if (pendingFilePicker != null) {
            ValueCallback<Uri[]> completion = pendingFilePicker;
            pendingFilePicker = null;
            completion.onReceiveValue(null);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        state.putString("directorShotAwaitingSave", pendingDirectorShotId);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == DIRECTOR_CAPTURE_REQUEST) {
            final String expected = pendingDirectorShotId;
            pendingDirectorShotId = null;
            if (resultCode == RESULT_OK && expected != null && data != null &&
                expected.equals(data.getStringExtra(WivraPhoneCameraActivity.EXTRA_SHOT_ID)) &&
                editor != null && "file:///android_asset/agentcut.html".equals(editor.getUrl())) {
                // A successful, explicitly saved native capture marks the take
                // recorded. Never fabricate an editor assetId or expose media URIs.
                String id = org.json.JSONObject.quote(expected);
                String update = "(function(){try{" +
                    "if(!shootPlan||!Array.isArray(shootPlan.shots))return;" +
                    "const shot=shootPlan.shots.find(s=>s.id===" + id + ");" +
                    "if(!shot||(shot.state!=='todo'&&shot.state!=='retry'))return;" +
                    "shootPlan=updateShot(shootPlan," + id + ",{state:'done'});" +
                    "saveShootPlan();renderShootPlan();" +
                    "}catch(e){}})();";
                editor.evaluateJavascript(update, null);
            }
            return;
        }
        if (requestCode != PICK_FILES_REQUEST || pendingFilePicker == null) {
            return;
        }
        ValueCallback<Uri[]> completion = pendingFilePicker;
        pendingFilePicker = null;
        completion.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
    }

    @Override
    public void onBackPressed() {
        if (editor != null && editor.canGoBack()) {
            editor.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (pendingFilePicker != null) {
            pendingFilePicker.onReceiveValue(null);
            pendingFilePicker = null;
        }
        if (editor != null) {
            editor.destroy();
            editor = null;
        }
        super.onDestroy();
    }
}
