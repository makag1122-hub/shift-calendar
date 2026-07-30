package kr.co.shiftcalendar.widget;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.appwidget.AppWidgetManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.provider.Settings;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String CALENDAR_URL =
            "https://makag1122-hub.github.io/shift-calendar/?androidWidget=1";

    private static final String KEY_SKIPPED_VERSION = "skipped_version_code";
    private static final String APK_FILE_NAME = "shift-calendar-widget.apk";
    private static final long POLL_INTERVAL_MS = 500L;
    private static final int REQUEST_PICK_BACKUP = 1001;

    private ValueCallback<Uri[]> fileChooserCallback;
    private WebView webView;
    private ExecutorService executor;
    private Handler handler;
    private AlertDialog dialog;
    private Runnable downloadPoll;
    private long downloadId = -1L;
    private UpdateChecker.Release pendingRelease;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(247, 248, 250));
        getWindow().setNavigationBarColor(Color.WHITE);

        handler = new Handler(Looper.getMainLooper());
        executor = Executors.newSingleThreadExecutor();

        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        setContentView(webView);
        applySystemBarInsets();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(settings.getUserAgentString() + " ShiftCalendarWidget/1.0");

        webView.addJavascriptInterface(new WidgetBridge(getApplicationContext()), "AndroidWidget");

        /* 설정 > 백업 불러오기가 쓰는 <input type="file">은 이 처리가 있어야 열립니다. */
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params
            ) {
                return openBackupPicker(callback);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                view.evaluateJavascript(
                        "window.publishAndroidWidgetSnapshot && window.publishAndroidWidgetSnapshot();",
                        null
                );
            }
        });
        webView.loadUrl(CALENDAR_URL);

        if (BuildConfig.SELF_UPDATE_ENABLED) {
            checkForUpdate();
        }
    }

    private void applySystemBarInsets() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return;
        }
        getWindow().setDecorFitsSystemWindows(false);
        webView.setOnApplyWindowInsetsListener((view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()
            );
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return windowInsets;
        });
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        cancelPoll();
        dismissDialog();
        if (executor != null) {
            executor.shutdownNow();
        }
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidWidget");
            webView.destroy();
        }
        super.onDestroy();
    }

    /* ---------- 새 버전 확인 ----------
       달력 내용은 웹에서 바로 갱신되므로, 위젯을 그리는 네이티브 코드가
       바뀐 경우에만 여기서 안내가 뜹니다. */

    private boolean openBackupPicker(ValueCallback<Uri[]> callback) {
        /* 앞선 요청이 남아 있으면 비워야 파일 입력이 다시 열립니다. */
        if (fileChooserCallback != null) {
            fileChooserCallback.onReceiveValue(null);
        }
        fileChooserCallback = callback;

        /* accept="application/json"을 그대로 쓰면 파일 관리자에 따라 백업이
           안 보이는 경우가 있어 모든 파일을 보여줍니다. */
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");

        try {
            startActivityForResult(
                    Intent.createChooser(intent, getString(R.string.backup_pick_title)),
                    REQUEST_PICK_BACKUP
            );
            return true;
        } catch (RuntimeException error) {
            fileChooserCallback = null;
            Toast.makeText(this, R.string.backup_pick_failed, Toast.LENGTH_LONG).show();
            return false;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQUEST_PICK_BACKUP) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }
        if (fileChooserCallback == null) {
            return;
        }

        /* 취소했더라도 null을 돌려줘야 다음에 버튼이 다시 동작합니다. */
        Uri[] picked = null;
        if (resultCode == RESULT_OK && data != null && data.getData() != null) {
            picked = new Uri[]{data.getData()};
        }
        fileChooserCallback.onReceiveValue(picked);
        fileChooserCallback = null;
    }

    private void checkForUpdate() {
        executor.execute(() -> {
            UpdateChecker.Release release = UpdateChecker.fetch();
            if (release == null || release.versionCode <= UpdateChecker.installedVersionCode(this)) {
                return;
            }
            if (release.versionCode == prefs().getLong(KEY_SKIPPED_VERSION, -1L)) {
                return;
            }
            handler.post(() -> showUpdateDialog(release));
        });
    }

    private void showUpdateDialog(UpdateChecker.Release release) {
        if (isFinishing() || isDestroyed()) {
            return;
        }
        pendingRelease = release;
        String message = release.notes.isEmpty()
                ? getString(R.string.update_message_default)
                : release.notes;

        dismissDialog();
        dialog = new AlertDialog.Builder(this)
                .setTitle(getString(R.string.update_title, release.versionName))
                .setMessage(message)
                .setPositiveButton(R.string.update_action, (ignored, which) -> startUpdate(release))
                .setNegativeButton(R.string.update_later, (ignored, which) ->
                        prefs().edit().putLong(KEY_SKIPPED_VERSION, release.versionCode).apply())
                .show();
    }

    private void startUpdate(UpdateChecker.Release release) {
        if (!getPackageManager().canRequestPackageInstalls()) {
            showInstallPermissionDialog(release);
            return;
        }
        enqueueDownload(release);
    }

    /* Android 8부터는 앱마다 '알 수 없는 앱 설치' 허용을 따로 받아야 합니다. */
    private void showInstallPermissionDialog(UpdateChecker.Release release) {
        if (isFinishing() || isDestroyed()) {
            return;
        }
        dismissDialog();
        dialog = new AlertDialog.Builder(this)
                .setTitle(R.string.update_permission_title)
                .setMessage(R.string.update_permission_message)
                .setPositiveButton(R.string.update_permission_action, (ignored, which) -> {
                    Intent intent = new Intent(
                            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + getPackageName())
                    );
                    try {
                        startActivity(intent);
                    } catch (RuntimeException error) {
                        openInBrowser(release.apkUrl);
                    }
                })
                .setNegativeButton(R.string.update_cancel, null)
                .show();
    }

    private void enqueueDownload(UpdateChecker.Release release) {
        DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
        File downloadDir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (manager == null || downloadDir == null) {
            openInBrowser(release.apkUrl);
            return;
        }

        /* 받다 만 파일이 남아 있으면 지우고 새로 받습니다. */
        File stale = new File(downloadDir, APK_FILE_NAME);
        if (stale.exists()) {
            stale.delete();
        }

        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(release.apkUrl));
            request.setTitle(getString(R.string.update_download_title));
            request.setDescription(release.versionName);
            request.setMimeType("application/vnd.android.package-archive");
            request.setDestinationInExternalFilesDir(
                    this, Environment.DIRECTORY_DOWNLOADS, APK_FILE_NAME);
            request.setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            downloadId = manager.enqueue(request);
        } catch (RuntimeException error) {
            openInBrowser(release.apkUrl);
            return;
        }

        Toast.makeText(this, R.string.update_downloading, Toast.LENGTH_SHORT).show();
        pollDownload(manager);
    }

    private void pollDownload(DownloadManager manager) {
        cancelPoll();
        downloadPoll = new Runnable() {
            @Override
            public void run() {
                int status = downloadStatus(manager);
                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    launchInstaller(manager);
                } else if (status == DownloadManager.STATUS_FAILED) {
                    downloadId = -1L;
                    fallbackToBrowser();
                } else {
                    handler.postDelayed(this, POLL_INTERVAL_MS);
                }
            }
        };
        handler.postDelayed(downloadPoll, POLL_INTERVAL_MS);
    }

    private int downloadStatus(DownloadManager manager) {
        try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(downloadId))) {
            if (cursor == null || !cursor.moveToFirst()) {
                return DownloadManager.STATUS_FAILED;
            }
            return cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
        } catch (RuntimeException error) {
            return DownloadManager.STATUS_FAILED;
        }
    }

    private void launchInstaller(DownloadManager manager) {
        Uri apk = manager.getUriForDownloadedFile(downloadId);
        downloadId = -1L;
        if (apk == null) {
            fallbackToBrowser();
            return;
        }

        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(apk, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(intent);
        } catch (RuntimeException error) {
            fallbackToBrowser();
        }
    }

    /* 앱에서 바로 설치하지 못하면 브라우저로 넘겨 직접 내려받게 합니다. */
    private void fallbackToBrowser() {
        if (pendingRelease != null) {
            openInBrowser(pendingRelease.apkUrl);
        }
    }

    private void openInBrowser(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (RuntimeException ignored) {
            Toast.makeText(this, R.string.update_failed, Toast.LENGTH_LONG).show();
        }
    }

    private void cancelPoll() {
        if (handler != null && downloadPoll != null) {
            handler.removeCallbacks(downloadPoll);
        }
        downloadPoll = null;
    }

    private void dismissDialog() {
        if (dialog != null && dialog.isShowing()) {
            dialog.dismiss();
        }
        dialog = null;
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(CalendarWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE);
    }

    private static final class WidgetBridge {
        private final Context context;
        private final Handler toastHandler = new Handler(Looper.getMainLooper());

        WidgetBridge(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public void updateCalendar(String payload) {
            if (payload == null || payload.length() < 20 || payload.length() > 900_000) {
                return;
            }
            context.getSharedPreferences(
                            CalendarWidgetProvider.PREFS_NAME,
                            Context.MODE_PRIVATE
                    )
                    .edit()
                    .putString(CalendarWidgetProvider.KEY_PAYLOAD, payload)
                    .apply();

            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            ComponentName component = new ComponentName(context, CalendarWidgetProvider.class);
            CalendarWidgetProvider.updateWidgets(context, manager, manager.getAppWidgetIds(component));
        }

        /* 앱에서는 안드로이드 공유창을 한 번 더 거치지 않고 카카오톡을 먼저 엽니다.
           카카오톡이 없으면 문자·메일 등을 고를 수 있는 기본 공유창으로 전환합니다. */
        @JavascriptInterface
        public void shareToKakao(String title, String text, String url) {
            String safeTitle = cleanShareText(title, 80);
            String safeText = cleanShareText(text, 300);
            String safeUrl = cleanShareText(url, 2_000);
            if (safeUrl.isEmpty() || !safeUrl.startsWith("https://")) {
                return;
            }

            String message = safeText.isEmpty() ? safeUrl : safeText + "\n" + safeUrl;
            Intent share = new Intent(Intent.ACTION_SEND)
                    .setType("text/plain")
                    .putExtra(Intent.EXTRA_SUBJECT, safeTitle)
                    .putExtra(Intent.EXTRA_TEXT, message)
                    .setPackage("com.kakao.talk")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                context.startActivity(share);
            } catch (ActivityNotFoundException error) {
                Intent fallback = new Intent(Intent.ACTION_SEND)
                        .setType("text/plain")
                        .putExtra(Intent.EXTRA_SUBJECT, safeTitle)
                        .putExtra(Intent.EXTRA_TEXT, message);
                Intent chooser = Intent.createChooser(
                        fallback,
                        context.getString(R.string.share_chooser_title)
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(chooser);
            }
        }

        /* 설정 > 백업 내보내기. WebView는 blob: 다운로드를 처리하지 못하므로
           웹에서 JSON 문자열을 그대로 넘겨받아 다운로드 폴더에 저장합니다. */
        @JavascriptInterface
        public void saveBackup(String fileName, String json) {
            if (json == null || json.isEmpty() || json.length() > 4_000_000) {
                return;
            }
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                toast(R.string.backup_save_unsupported);
                return;
            }

            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, safeFileName(fileName));
            values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
            values.put(MediaStore.Downloads.IS_PENDING, 1);

            ContentResolver resolver = context.getContentResolver();
            Uri target = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (target == null) {
                toast(R.string.backup_save_failed);
                return;
            }

            try (OutputStream out = resolver.openOutputStream(target)) {
                if (out == null) {
                    throw new IllegalStateException("저장 위치를 열 수 없습니다");
                }
                out.write(json.getBytes(StandardCharsets.UTF_8));
            } catch (Exception error) {
                resolver.delete(target, null, null);
                toast(R.string.backup_save_failed);
                return;
            }

            values.clear();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(target, values, null, null);
            toast(R.string.backup_saved);
        }

        private static String safeFileName(String raw) {
            String name = raw == null ? "" : raw.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
            if (name.isEmpty()) {
                name = "shift-calendar-backup.json";
            }
            return name.endsWith(".json") ? name : name + ".json";
        }

        private static String cleanShareText(String raw, int maxLength) {
            if (raw == null) {
                return "";
            }
            String cleaned = raw.replace("\u0000", "").trim();
            return cleaned.length() > maxLength
                    ? cleaned.substring(0, maxLength)
                    : cleaned;
        }

        private void toast(int messageId) {
            toastHandler.post(() -> Toast.makeText(context, messageId, Toast.LENGTH_LONG).show());
        }
    }
}
