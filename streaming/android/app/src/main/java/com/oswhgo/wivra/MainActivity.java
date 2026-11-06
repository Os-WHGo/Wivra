package com.oswhgo.wivra;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.ContentResolver;
import android.net.Uri;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.widget.Button;
import android.widget.LinearLayout;
import android.webkit.PermissionRequest;
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
    // W89: the editor's on-phone dictation (whisper.cpp) asks for the microphone through the WebView.
    private static final int REQUEST_EDITOR_MICROPHONE = 4189;
    private PermissionRequest pendingEditorMicrophone;
    private static final int PICK_FILES_REQUEST = 4207;
    // Keep native picker limits identical to the Editor's 40-file import limit.
    private static final int MAX_PICKER_FILES = 40;
    private static final int DIRECTOR_CAPTURE_REQUEST = 4208;
    private String pendingDirectorShotId;
    private String pendingDirectorProjectId;
    private java.util.Set<String> priorDirectorVideoIds;
    private Uri suggestedDirectorVideo;
    private Uri[] suggestedDirectorParts;
    private String suggestedDirectorShotId;
    private String suggestedDirectorProjectId;
    private boolean suggestedDirectorRayBan;
    private boolean pendingDirectorRayBan;
    private ValueCallback<Uri[]> pendingFilePicker;
    private CancellationSignal pendingPickerSignal;
    // Third-party content:// providers may block while opening cloud media.
    // Their verification must never block Android's UI thread.
    private final java.util.concurrent.ExecutorService pickerValidator =
        java.util.concurrent.Executors.newSingleThreadExecutor();
    private WebView editor;
    // Progressive export: editor chunks go straight to Movies/Wivra (AndroidX WebMessageListener).
    private WivraExportBridge exportBridge;
    // Separate experimental random-write protocol; not part of Capture edition.
    private WivraAcceleratedExportBridge acceleratedExportBridge;
    private WivraCaptureVerificationBridge captureVerificationBridge;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (savedInstanceState != null) {
            pendingDirectorShotId = savedInstanceState.getString("directorShotAwaitingSave");
            pendingDirectorProjectId = savedInstanceState.getString("directorProjectAwaitingSave");
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
        // Export plays hidden <video> elements of the user's own local clips programmatically,
        // after async steps (no tap in progress). WebView blocks that by default; measured in
        // WivraRealExportWebViewTest. Local offline editor only: no remote page is ever loaded.
        settings.setMediaPlaybackRequiresUserGesture(false);
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
            // W89: only AUDIO, only for the packaged editor (file:///android_asset), and only after
            // Android's own microphone permission. Camera or any other resource is always denied.
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                Uri origin = request.getOrigin();
                boolean packagedEditor = origin != null && "file".equals(origin.getScheme());
                boolean onlyAudio = request.getResources().length == 1 &&
                    PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(request.getResources()[0]);
                if (!packagedEditor || !onlyAudio) { request.deny(); return; }
                if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    return;
                }
                if (pendingEditorMicrophone != null) pendingEditorMicrophone.deny();
                pendingEditorMicrophone = request;
                requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO}, REQUEST_EDITOR_MICROPHONE);
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingEditorMicrophone == request) pendingEditorMicrophone = null;
            }

            @Override
            public boolean onShowFileChooser(
                WebView webView,
                ValueCallback<Uri[]> chosenFiles,
                FileChooserParams params
            ) {
                // W98: remember what the person gives the editor, so long-video subtitles can read
                // the sound of those files piece by piece (never other files).
                ValueCallback<Uri[]> callback = uris -> {
                    WivraAudioSegments.INSTANCE.remember(MainActivity.this, uris);
                    chosenFiles.onReceiveValue(uris);
                };
                // A newer selection must cancel an outstanding slow cloud
                // provider opening from the previous request.
                if (pendingPickerSignal != null) pendingPickerSignal.cancel();
                pendingPickerSignal = null;
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
                if (offerSavedRayBanParts(params, callback, acceptsVideo, acceptsImage, acceptsAudio, acceptsJson)) return true;
                if (offerSavedDirectorTake(params, callback, acceptsVideo, acceptsImage, acceptsAudio, acceptsJson)) return true;
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
        // The existing Editor/Director remains the only offline WebView.
        // Native capture and LIVE share one simple source-selection entry.
        // Opening a source is NOT evidence that it has working frames or RTMP.
        LinearLayout shell = new LinearLayout(this);
        shell.setOrientation(LinearLayout.VERTICAL);
        shell.setBackgroundColor(getColor(R.color.wivra_background));
        Button cameraSources = new Button(this);
        cameraSources.setText(R.string.source_camera_button);
        wivraStyle(cameraSources, true);
        cameraSources.setContentDescription(getString(R.string.source_camera_button));
        cameraSources.setOnClickListener(v -> showCameraSourceChooser());
        shell.addView(cameraSources, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT));
        // Wivra Capture remains camera-only. The LIVE implementation and
        // Screen MediaProjection are packaged only in the full edition.
        if ("com.oswhgo.wivra".equals(getPackageName())) {
            Button liveSources = new Button(this);
            liveSources.setText(R.string.source_live_button);
            wivraStyle(liveSources, true);
            liveSources.setContentDescription(getString(R.string.source_live_button));
            liveSources.setOnClickListener(v -> showLiveSourceChooser());
            shell.addView(liveSources, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));
            // Only the full editor offers recovery of isolated v2 sealed files.
            // Never expose an accelerated writer or a recovery picker in Capture.
            Button acceleratedRecovery = new Button(this);
            acceleratedRecovery.setText(R.string.accelerated_recovery_button);
            wivraStyle(acceleratedRecovery, false);
            acceleratedRecovery.setContentDescription(
                getString(R.string.accelerated_recovery_button));
            acceleratedRecovery.setOnClickListener(v -> showAcceleratedRecovery());
            shell.addView(acceleratedRecovery, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));
        }
        shell.addView(editor, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(shell);
        // Must be installed before loading so the bundled editor sees WivraExportNative.
        // Without it (old WebView) the editor keeps its previous in-memory export.
        exportBridge = new WivraExportBridge(this, editor);
        if (!exportBridge.install()) exportBridge = null;
        // Advertising a v2 storage bridge does not enable accelerated rendering:
        // the Editor's experimental opt-in is still guarded separately.
        if ("com.oswhgo.wivra".equals(getPackageName())) {
            acceleratedExportBridge = new WivraAcceleratedExportBridge(this, editor);
            if (!acceleratedExportBridge.install()) acceleratedExportBridge = null;
        }
        captureVerificationBridge = new WivraCaptureVerificationBridge(editor);
        captureVerificationBridge.install();
        // W98: sound of one short piece of a chosen file, for long-video subtitles.
        new WivraAudioSegmentBridge(this, editor).install();
        // W81 (Claude): Capturar / LIVE cards on the editor home only OPEN the
        // same native choosers as the buttons above. Nothing starts by itself.
        new WivraHomeBridge(editor, what -> {
            if ("live".equals(what) && "com.oswhgo.wivra".equals(getPackageName())) {
                showLiveSourceChooser();
            } else if ("capture".equals(what)) {
                showCameraSourceChooser();
            }
        }).install();
        editor.loadUrl("file:///android_asset/agentcut.html");
        applyScreenshotScene();
    }

    /**
     * W81 (Claude): CI-only screenshots in the Android emulator. Works ONLY in
     * debuggable builds; a release/beta APK ignores the extra completely.
     * The editor's own screens are reached by pressing its buttons, never by touching its data.
     */
    private void applyScreenshotScene() {
        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) == 0) return;
        String scene = getIntent() == null ? null : getIntent().getStringExtra("wivra_screenshot");
        if (scene == null) return;
        boolean full = "com.oswhgo.wivra".equals(getPackageName());
        if ("live".equals(scene) && full) {
            startActivity(new Intent().setClassName(this, "com.oswhgo.wivra.WivraPhoneLiveActivity"));
        } else if ("screen".equals(scene) && full) {
            startActivity(new Intent().setClassName(this, "com.oswhgo.wivra.WivraScreenLiveActivity"));
        } else if ("screenrec".equals(scene) && full) {
            startActivity(new Intent().setClassName(this, "com.oswhgo.wivra.WivraScreenRecordActivity"));
        } else if ("tour".equals(scene)) {
            // Press the editor's own buttons in order (language, Skip, Capturar),
            // exactly like a person would; no editor data is read or written.
            final String[] buttons = {"#langList button[data-l=\"es\"]", "#onbSkip", "#hCapture"};
            for (int i = 0; i < buttons.length; i++) {
                final String selector = buttons[i];
                editor.postDelayed(() -> editor.evaluateJavascript(
                    "(function(){var b=document.querySelector('" + selector + "');if(b)b.click();})()", null),
                    12000L + 9000L * i);
            }
        }
    }

    /** W81 (Claude): Wivra look for the native buttons above the editor (gradient or dark pill). */
    private void wivraStyle(Button button, boolean primary) {
        float d = getResources().getDisplayMetrics().density;
        android.graphics.drawable.GradientDrawable bg = primary
            ? new android.graphics.drawable.GradientDrawable(
                android.graphics.drawable.GradientDrawable.Orientation.LEFT_RIGHT,
                new int[]{getColor(R.color.wivra_violet), getColor(R.color.wivra_pink)})
            : new android.graphics.drawable.GradientDrawable();
        if (!primary) {
            bg.setColor(getColor(R.color.wivra_card_high));
            bg.setStroke(Math.round(d), getColor(R.color.wivra_line));
        }
        bg.setCornerRadius(22 * d);
        button.setBackground(new android.graphics.drawable.InsetDrawable(
            bg, Math.round(12 * d), Math.round(3 * d), Math.round(12 * d), Math.round(3 * d)));
        button.setTextColor(getColor(R.color.wivra_text));
        button.setAllCaps(false);
        button.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 14);
        // Compact: the editor home below already has big Capturar / LIVE cards.
        button.setMinHeight(Math.round(44 * d));
        button.setMinimumHeight(Math.round(44 * d));
        button.setPadding(Math.round(16 * d), 0, Math.round(16 * d), 0);
        button.setStateListAnimator(null);
    }

    // A platform camera feature is only an eligibility hint. CameraX/RootEncoder
    // must still acquire permissions, open the device and observe real frames.
    // Never treat this menu as runtime camera readiness or a multicamera test.
    private boolean hasPhoneCameraHardware() {
        return getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY);
    }

    private void showPhoneCameraUnsupported() {
        new AlertDialog.Builder(this)
            .setTitle(R.string.source_unavailable_title)
            .setMessage(R.string.source_unavailable_body)
            .setPositiveButton(android.R.string.ok, null)
            .show();
    }

    private void showCameraSourceChooser() {
        // W99 (Claude, owner decision 2A): local screen recording, FULL edition only
        // (MediaProjection is not packaged in Wivra Capture). Nothing is transmitted.
        final boolean screenRecord = "com.oswhgo.wivra".equals(getPackageName());
        final String[] options = screenRecord ? new String[] {
            getString(R.string.source_meta_option),
            getString(R.string.source_phone_option),
            getString(R.string.source_dual_option),
            getString(R.string.source_screen_record_option)
        } : new String[] {
            getString(R.string.source_meta_option),
            getString(R.string.source_phone_option),
            // Offered to every phone with a camera; the screen itself checks
            // this phone's concurrent pairs and falls back to one camera.
            getString(R.string.source_dual_option)
        };
        new AlertDialog.Builder(this)
            .setTitle(R.string.source_camera_title)
            // Android lists and messages share the same content area.
            // Keep setItems visible and move caveats to a separate dialog.
            .setItems(options, (dialog, selected) -> {
                if (selected == 3 && screenRecord) {
                    startActivity(new Intent().setClassName(this, "com.oswhgo.wivra.WivraScreenRecordActivity"));
                } else if (selected == 0) {
                    launchRayBanCameraFromDirector();
                } else if (selected == 2 && hasPhoneCameraHardware()) {
                    startActivity(new Intent(this, WivraDualCameraActivity.class));
                } else if (hasPhoneCameraHardware()) {
                    launchPhoneCameraFromDirector();
                } else {
                    showPhoneCameraUnsupported();
                }
            })
            .setNeutralButton(R.string.source_limits_button, (dialog, which) ->
                showSourceLimitations(false))
            .setNegativeButton(android.R.string.cancel, null)
            .show();
    }

    private void showSourceLimitations(boolean live) {
        final int explanation = live
            ? R.string.source_limits_live : R.string.source_limits_camera;
        new AlertDialog.Builder(this)
            .setTitle(R.string.source_limits_title)
            .setMessage(explanation)
            .setPositiveButton(android.R.string.ok, null)
            .show();
    }

    /**
     * Recovery is a deliberate native-only action, separate from editor JS.
     * Every listed private file is verified off the UI thread. A selected file
     * is verified AGAIN immediately before creating a new pending MediaStore
     * row. No path is accepted from WebView, and failures retain the source.
     */
    private void showAcceleratedRecovery() {
        if (!"com.oswhgo.wivra".equals(getPackageName())) return;
        try {
            pickerValidator.execute(() -> {
                final java.util.List<WivraRandomExportStore.Recovered> ready =
                    WivraRandomExportStore.recovered(this);
                runOnUiThread(() -> {
                    if (isFinishing() || isDestroyed()) return;
                    if (ready.isEmpty()) {
                        new AlertDialog.Builder(this)
                            .setTitle(R.string.accelerated_recovery_title)
                            .setMessage(R.string.accelerated_recovery_empty)
                            .setPositiveButton(android.R.string.ok, null).show();
                        return;
                    }
                    final String[] names = new String[ready.size()];
                    for (int i = 0; i < ready.size(); i++) {
                        WivraRandomExportStore.Recovered item = ready.get(i);
                        names[i] = item.getName() + " · " +
                            android.text.format.Formatter.formatShortFileSize(this, item.getBytes());
                    }
                    new AlertDialog.Builder(this)
                        .setTitle(R.string.accelerated_recovery_title)
                        .setItems(names, (dialog, selected) ->
                            confirmAcceleratedRecovery(ready.get(selected).getName()))
                        .setNegativeButton(android.R.string.cancel, null)
                        .show();
                });
            });
        } catch (java.util.concurrent.RejectedExecutionException ignored) {
            // Activity already closed; do not reopen a stale recovery sheet.
        }
    }

    private void confirmAcceleratedRecovery(String selectedName) {
        if (isFinishing() || isDestroyed()) return;
        new AlertDialog.Builder(this)
            .setTitle(R.string.accelerated_recovery_title)
            .setMessage(R.string.accelerated_recovery_confirm)
            .setPositiveButton(R.string.accelerated_recovery_save, (dialog, which) -> {
                try {
                    pickerValidator.execute(() -> {
                        boolean saved;
                        try {
                            WivraRandomExportStore.restore(this, selectedName);
                            saved = true;
                        } catch (Exception error) {
                            saved = false;
                        }
                        final boolean verified = saved;
                        runOnUiThread(() -> {
                            if (isFinishing() || isDestroyed()) return;
                            new AlertDialog.Builder(this)
                                .setTitle(R.string.accelerated_recovery_title)
                                .setMessage(verified ? R.string.accelerated_recovery_success :
                                    R.string.accelerated_recovery_failed)
                                .setPositiveButton(android.R.string.ok, null)
                                .show();
                        });
                    });
                } catch (java.util.concurrent.RejectedExecutionException ignored) {
                    // Screen destroyed; no user file was touched.
                }
            })
            .setNegativeButton(android.R.string.cancel, null)
            .show();
    }

    private void showLiveSourceChooser() {
        // Keep the same full-edition boundary as AndroidManifest.xml and
        // the existing LIVE buttons. Wivra Capture must not expose RTMP.
        if (!"com.oswhgo.wivra".equals(getPackageName())) return;
        final String[] options = {
            getString(R.string.source_live_phone_option),
            getString(R.string.source_live_screen_option)
        };
        new AlertDialog.Builder(this)
            .setTitle(R.string.source_live_title)
            .setItems(options, (dialog, selected) -> {
                if (selected == 0) {
                    if (!hasPhoneCameraHardware()) {
                        showPhoneCameraUnsupported();
                        return;
                    }
                    Intent live = new Intent();
                    live.setClassName(this, "com.oswhgo.wivra.WivraPhoneLiveActivity");
                    startActivity(live);
                } else {
                    Intent live = new Intent();
                    live.setClassName(this, "com.oswhgo.wivra.WivraScreenLiveActivity");
                    startActivity(live);
                }
            })
            .setNeutralButton(R.string.source_limits_button, (dialog, which) ->
                showSourceLimitations(true))
            .setNegativeButton(android.R.string.cancel, null)
            .show();
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
            !WivraExportBridge.isEditor(editor.getUrl())) {
            startActivity(new Intent(this, targetActivity));
            return;
        }
        // Read Director shots from the CURRENT editor project; a global
        // localStorage key may contain a different project's checklist.
        final String readOnly = "(function(){try{" +
            "const pid=typeof pzPid==='string'?pzPid:'';" +
            "const plan=typeof shootPlan==='object'?shootPlan:null;" +
            "if(!session||!plan||plan.schema!=='agentcut-shoot-plan-v0.1'||" +
            "!Array.isArray(plan.shots)||!(/^[A-Za-z0-9_-]{1,128}$/).test(pid))" +
            "return JSON.stringify({projectId:'',shots:[]});" +
            "return JSON.stringify({projectId:pid,shots:plan.shots.filter(s=>" +
            "(s.state==='todo'||s.state==='retry')" +
            "&&typeof s.id==='string'&&s.id.length>0&&s.id.length<=120" +
            "&&Array.from(s.id).every(ch=>ch.charCodeAt(0)>=32&&ch.charCodeAt(0)!==127))" +
            ".slice(0,30).map(s=>({id:s.id,title:String(s.title||'')," +
            "script:typeof s.script==='string'?s.script.slice(0,2200):''}))});" +
            "}catch(e){return JSON.stringify({projectId:'',shots:[]});}})();";
        editor.evaluateJavascript(readOnly, encoded -> {
            org.json.JSONObject payload = new org.json.JSONObject();
            try {
                Object value = new org.json.JSONTokener(encoded).nextValue();
                if (value instanceof String) {
                    payload = new org.json.JSONObject((String) value);
                }
            } catch (Exception ignored) {
                // Invalid editor state never selects a Director shot.
            }
            final String projectId = payload.optString("projectId", "");
            final org.json.JSONArray shots = payload.optJSONArray("shots");
            if (!projectId.matches("[A-Za-z0-9_-]{1,128}") ||
                shots == null || shots.length() == 0) {
                pendingDirectorShotId = null;
                pendingDirectorProjectId = null;
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
                    priorDirectorVideoIds = null;
                    clearDirectorVideoSuggestion();
                    Intent launch = new Intent(this, targetActivity);
                    pendingDirectorShotId = null;
                    pendingDirectorProjectId = null;
                    if (index > 0) {
                        org.json.JSONObject shot = safeShots.optJSONObject(index - 1);
                        if (shot != null) {
                            String script = shot.optString("script", "");
                            if (script.length() <= 2200 && !script.trim().isEmpty()) {
                                launch.putExtra(WivraPhoneCameraActivity.EXTRA_SHOT_SCRIPT, script);
                            }
                            String id = shot.optString("id", "");
                            if (id.length() > 0 && id.length() <= 120 &&
                                id.chars().allMatch(ch -> ch >= 32 && ch != 127)) {
                                launch.putExtra(WivraPhoneCameraActivity.EXTRA_SHOT_ID, id);
                                pendingDirectorShotId = id;
                                pendingDirectorProjectId = projectId;
                                pendingDirectorRayBan =
                                    targetActivity == WivraMetaPreviewActivity.class;
                                priorDirectorVideoIds = new java.util.HashSet<>(
                                    savedDirectorVideos(pendingDirectorRayBan));
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

    /**
     * Only published, nonempty MP4 rows owned by Wivra can be suggested.
     * If several captures appeared, fail closed instead of guessing a segment.
     */
    private java.util.List<String> savedDirectorVideos(boolean rayBan) {
        java.util.ArrayList<String> result = new java.util.ArrayList<>();
        if (rayBan) {
            for (WivraSavedRayBanVideos.SavedVideo item :
                    WivraSavedRayBanVideos.latestSaved(this)) {
                result.add(item.getUri().toString());
            }
        } else {
            for (WivraPhoneMediaStore.SavedMedia item :
                    WivraPhoneMediaStore.latestSavedVideos(this)) {
                result.add(item.getUri().toString());
            }
        }
        return result;
    }

    private Uri uniqueNewDirectorVideo(java.util.Set<String> before, boolean rayBan) {
        if (before == null) return null;
        String candidate = null;
        for (String id : savedDirectorVideos(rayBan)) {
            if (!before.contains(id)) {
                if (candidate != null) return null;
                candidate = id;
            }
        }
        return candidate == null ? null : Uri.parse(candidate);
    }

    /**
     * A multi-part Ray-Ban recording shares one random 128-bit session id.
     * All published rows must be new, app-owned, consecutive and from ONE
     * session. The bounded recent list cannot prove groups of 12+ parts:
     * those remain available via explicit system file selection.
     */
    private Uri[] uniqueNewRayBanParts(java.util.Set<String> before) {
        if (before == null) return null;
        java.util.List<WivraSavedRayBanVideos.SavedVideo> recent =
            WivraSavedRayBanVideos.latestSaved(this);
        java.util.List<WivraSavedRayBanVideos.SavedVideo> added =
            new java.util.ArrayList<>();
        for (WivraSavedRayBanVideos.SavedVideo item : recent) {
            if (!before.contains(item.getUri().toString())) added.add(item);
        }
        if (added.size() < 2 || added.size() >= 12) return null;
        java.util.regex.Pattern name = java.util.regex.Pattern.compile(
            "^Wivra_RayBan_[0-9]{10,16}_([0-9a-f]{32})_part([0-9]{4})\\.mp4$");
        String sessionId = null;
        java.util.TreeMap<Integer, Uri> ordered = new java.util.TreeMap<>();
        for (WivraSavedRayBanVideos.SavedVideo item : added) {
            java.util.regex.Matcher match = name.matcher(item.getTitle());
            if (!match.matches()) return null;
            if (sessionId == null) sessionId = match.group(1);
            else if (!sessionId.equals(match.group(1))) return null;
            int sequence = Integer.parseInt(match.group(2));
            if (sequence < 1 || ordered.put(sequence, item.getUri()) != null)
                return null;
        }
        int expected = 1;
        for (int actual : ordered.keySet()) if (actual != expected++) return null;
        return ordered.values().toArray(new Uri[0]);
    }

    private void clearDirectorVideoSuggestion() {
        suggestedDirectorVideo = null;
        suggestedDirectorParts = null;
        suggestedDirectorProjectId = null;
        suggestedDirectorShotId = null;
    }

    private boolean offerSavedRayBanParts(WebChromeClient.FileChooserParams params,
            ValueCallback<Uri[]> callback, boolean video, boolean image,
            boolean audio, boolean json) {
        if (!video || image || audio || json ||
            params.getMode() != WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE ||
            suggestedDirectorParts == null || editor == null) return false;
        Uri[] candidates = suggestedDirectorParts.clone();
        String shot = org.json.JSONObject.quote(suggestedDirectorShotId);
        String project = org.json.JSONObject.quote(suggestedDirectorProjectId);
        String check = "(function(){try{return !!(session&&shootPlan&&" +
            "pzPid===" + project + "&&selectedShootId===" + shot +
            "&&shootPlan.shots.some(s=>s.id===" + shot +
            "&&s.state==='done'&&!s.assetId));}catch(e){return false}})()";
        editor.evaluateJavascript(check, approved -> {
            if (pendingFilePicker != callback) return;
            java.util.List<String> published = savedDirectorVideos(true);
            boolean valid = "true".equals(approved) &&
                java.util.Arrays.equals(candidates, suggestedDirectorParts);
            for (Uri uri : candidates) {
                if (!published.contains(uri.toString())) valid = false;
            }
            clearDirectorVideoSuggestion();
            if (valid) {
                pendingFilePicker = null;
                callback.onReceiveValue(candidates);
            } else launchSystemPicker(params);
        });
        return true;
    }

    private boolean offerSavedDirectorTake(WebChromeClient.FileChooserParams params,
            ValueCallback<Uri[]> callback, boolean video, boolean image,
            boolean audio, boolean json) {
        if (!params.isCaptureEnabled() || !video || image || audio || json ||
            params.getMode() != WebChromeClient.FileChooserParams.MODE_OPEN ||
            suggestedDirectorVideo == null || editor == null) return false;
        final Uri candidate = suggestedDirectorVideo;
        final boolean fromRayBan = suggestedDirectorRayBan;
        final String shot = org.json.JSONObject.quote(suggestedDirectorShotId);
        final String project = org.json.JSONObject.quote(suggestedDirectorProjectId);
        final String check = "(function(){try{return !!(session&&shootPlan&&" +
            "pzPid===" + project + "&&selectedShootId===" + shot +
            "&&shootPlan.shots.some(s=>s.id===" + shot +
            "&&s.state==='done'&&!s.assetId));}catch(e){return false}})()";
        editor.evaluateJavascript(check, accepted -> {
            if (pendingFilePicker != callback) return;
            boolean valid = "true".equals(accepted) &&
                candidate.equals(suggestedDirectorVideo) &&
                savedDirectorVideos(fromRayBan).contains(candidate.toString());
            clearDirectorVideoSuggestion();
            if (valid) {
                pendingFilePicker = null;
                callback.onReceiveValue(new Uri[]{candidate});
            } else {
                launchSystemPicker(params);
            }
        });
        return true;
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

    /**
     * FileChooserParams.parseResult may expose URIs supplied by third-party
     * applications. Never let a forged file:// or our own private FileProvider
     * resource be read by the WebView. Native Wivra shortcuts are chosen
     * separately and never pass through this untrusted system picker result.
     */
    private Uri[] safeSystemPickerResult(Uri[] selected, CancellationSignal signal) {
        if (selected == null || selected.length == 0 || selected.length > MAX_PICKER_FILES) {
            return null;
        }
        java.util.HashSet<Uri> seen = new java.util.HashSet<>();
        for (Uri uri : selected) {
            if (signal.isCanceled()) return null;
            if (uri == null ||
                !ContentResolver.SCHEME_CONTENT.equals(uri.getScheme()) ||
                uri.getAuthority() == null ||
                uri.getAuthority().equals(getPackageName()) ||
                uri.getAuthority().equals(getPackageName() + ".captureimports") ||
                !seen.add(uri)) {
                return null;
            }
            // Check that the app can actually read what the picker supplied.
            // Do not copy bytes or gain broad photo-library permissions.
            try (ParcelFileDescriptor file =
                     getContentResolver().openFileDescriptor(uri, "r", signal)) {
                if (file == null) return null;
            } catch (Exception invalidOrRevoked) {
                return null;
            }
        }
        return selected;
    }

    private void clearPendingPicker() {
        if (pendingPickerSignal != null) pendingPickerSignal.cancel();
        pendingPickerSignal = null;
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
        state.putString("directorProjectAwaitingSave", pendingDirectorProjectId);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != REQUEST_EDITOR_MICROPHONE) return;
        PermissionRequest request = pendingEditorMicrophone;
        pendingEditorMicrophone = null;
        if (request == null) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            request.deny();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == DIRECTOR_CAPTURE_REQUEST) {
            final String expected = pendingDirectorShotId;
            final String expectedProject = pendingDirectorProjectId;
            final java.util.Set<String> before = priorDirectorVideoIds;
            final boolean rayBan = pendingDirectorRayBan;
            pendingDirectorShotId = null;
            pendingDirectorProjectId = null;
            priorDirectorVideoIds = null;
            clearDirectorVideoSuggestion();
            if (resultCode == RESULT_OK && data != null &&
                WivraDirectorProjectGuard.mayComplete(
                    expectedProject, expectedProject, expected,
                    data.getStringExtra(WivraPhoneCameraActivity.EXTRA_SHOT_ID)) &&
                editor != null && WivraExportBridge.isEditor(editor.getUrl())) {
                // A successful, explicitly saved native capture marks the take
                // recorded, but NOT imported into the editor. Never fabricate an
                // assetId or expose media URIs. Import remains a separate step.
                String id = org.json.JSONObject.quote(expected);
                String project = org.json.JSONObject.quote(expectedProject);
                String update = "(function(){try{" +
                    "if(!session||pzPid!==" + project + "||!shootPlan||!Array.isArray(shootPlan.shots))return;" +
                    "const shot=shootPlan.shots.find(s=>s.id===" + id + ");" +
                    "if(!shot||(shot.state!=='todo'&&shot.state!=='retry'))return;" +
                    "shootPlan=updateShot(shootPlan," + id + ",{state:'done'},{project:session.project});" +
                    "selectedShootId=" + id + ";" +
                    "saveShootPlan();renderShootPlan();" +
                    "refreshDirectorAssets();openSheet('sDirector');" +
                    "say('Toma guardada. Importa el video desde Director para asociarlo al proyecto.','ok');" +
                    "return true;}catch(e){return false;}})();";
                // A receipt means a successful user-approved native Save, but a
                // single eligible published MP4 is offered ONLY after the
                // current WebView accepts this project+shot identity.
                editor.evaluateJavascript(update, accepted -> {
                    if ("true".equals(accepted) && before != null) {
                        Uri published = uniqueNewDirectorVideo(before, rayBan);
                        if (published != null) {
                            suggestedDirectorVideo = published;
                            suggestedDirectorShotId = expected;
                            suggestedDirectorProjectId = expectedProject;
                            suggestedDirectorRayBan = rayBan;
                        } else if (rayBan) {
                            Uri[] grouped = uniqueNewRayBanParts(before);
                            if (grouped != null) {
                                suggestedDirectorParts = grouped;
                                suggestedDirectorShotId = expected;
                                suggestedDirectorProjectId = expectedProject;
                                suggestedDirectorRayBan = true;
                            }
                        }
                    }
                });
            }
            return;
        }
        if (requestCode != PICK_FILES_REQUEST || pendingFilePicker == null) {
            return;
        }
        final ValueCallback<Uri[]> completion = pendingFilePicker;
        final Uri[] selected;
        try {
            selected = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        } catch (RuntimeException malformed) {
            clearPendingPicker();
            return;
        }
        // A cloud-backed document provider can take seconds to open each URI.
        // Validate off the UI thread and deliver the WebView callback only if
        // this same Activity still owns the original pending file chooser.
        final CancellationSignal signal = new CancellationSignal();
        pendingPickerSignal = signal;
        try {
            pickerValidator.execute(() -> {
                Uri[] checked = safeSystemPickerResult(selected, signal);
                runOnUiThread(() -> {
                    if (pendingFilePicker != completion || pendingPickerSignal != signal ||
                        isFinishing() || isDestroyed()) {
                        return; // Superseded chooser or Activity was destroyed.
                    }
                    pendingFilePicker = null;
                    pendingPickerSignal = null;
                    completion.onReceiveValue(checked);
                });
            });
        } catch (RuntimeException unavailable) {
            if (pendingFilePicker == completion) clearPendingPicker();
        }
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
        if (pendingPickerSignal != null) pendingPickerSignal.cancel();
        pendingPickerSignal = null;
        pickerValidator.shutdownNow();
        if (pendingFilePicker != null) {
            pendingFilePicker.onReceiveValue(null);
            pendingFilePicker = null;
        }
        if (exportBridge != null) {
            // Leaving the editor mid-export deletes the partial gallery item.
            exportBridge.dispose();
            exportBridge = null;
        }
        if (acceleratedExportBridge != null) {
            acceleratedExportBridge.dispose();
            acceleratedExportBridge = null;
        }
        if (captureVerificationBridge != null) {
            captureVerificationBridge.dispose();
            captureVerificationBridge = null;
        }
        if (editor != null) {
            editor.destroy();
            editor = null;
        }
        super.onDestroy();
    }
}
