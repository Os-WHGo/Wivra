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
    private ValueCallback<Uri[]> pendingFilePicker;
    private WebView editor;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
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
                boolean acceptsImage = false;
                boolean acceptsVideo = false;
                for (String accept : params.getAcceptTypes()) {
                    if (accept == null) continue;
                    if (accept.contains("image/")) acceptsImage = true;
                    if (accept.contains("video/")) acceptsVideo = true;
                }
                Uri recent = acceptsImage
                    ? WivraMetaPhotoStore.latestCapturedPhoto(MainActivity.this)
                    : null;
                java.util.List<String> labels = new java.util.ArrayList<>();
                java.util.List<Uri> choices = new java.util.ArrayList<>();
                if (recent != null) {
                    labels.add(getString(R.string.picker_last_photo));
                    choices.add(recent);
                }
                if (acceptsImage) {
                    for (WivraPhoneMediaStore.SavedMedia photo :
                            WivraPhoneMediaStore.latestSavedPhotos(MainActivity.this)) {
                        labels.add(getString(R.string.picker_phone_photo_named, photo.getTitle()));
                        choices.add(photo.getUri());
                    }
                }
                if (acceptsVideo) {
                    for (WivraSavedRayBanVideos.SavedVideo video :
                            WivraSavedRayBanVideos.latestSaved(MainActivity.this)) {
                        labels.add(getString(R.string.picker_wivra_video_named, video.getTitle()));
                        choices.add(video.getUri());
                    }
                    for (WivraPhoneMediaStore.SavedMedia video :
                            WivraPhoneMediaStore.latestSavedVideos(MainActivity.this)) {
                        labels.add(getString(R.string.picker_phone_video_named, video.getTitle()));
                        choices.add(video.getUri());
                    }
                }
                if (!choices.isEmpty()) {
                    labels.add(getString(R.string.picker_browse_files));
                    new AlertDialog.Builder(MainActivity.this)
                        .setTitle(R.string.picker_wivra_media_title)
                        .setItems(labels.toArray(new String[0]), (dialog, item) -> {
                            if (item >= 0 && item < choices.size()) {
                                ValueCallback<Uri[]> completion = pendingFilePicker;
                                pendingFilePicker = null;
                                if (completion != null) completion.onReceiveValue(
                                    new Uri[]{choices.get(item)});
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
        glasses.setContentDescription("Conectar gafas Ray-Ban Meta");
        glasses.setOnClickListener(v -> startActivity(
            new Intent(this, WivraMetaPreviewActivity.class)));
        shell.addView(glasses, new LinearLayout.LayoutParams(
            0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        Button phone = new Button(this);
        phone.setText(R.string.phone_camera_open);
        phone.setContentDescription(getString(R.string.phone_camera_open));
        phone.setOnClickListener(v -> startActivity(
            new Intent(this, WivraPhoneCameraActivity.class)));
        // These are two capture sources feeding the same one-and-only editor.
        LinearLayout sources = new LinearLayout(this);
        sources.setOrientation(LinearLayout.HORIZONTAL);
        sources.addView(glasses);
        sources.addView(phone, new LinearLayout.LayoutParams(
            0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        shell.addView(sources, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT));
        shell.addView(editor, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(shell);
        editor.loadUrl("file:///android_asset/agentcut.html");
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
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
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
