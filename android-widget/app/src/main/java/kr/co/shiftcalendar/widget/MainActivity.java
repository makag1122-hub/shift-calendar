package kr.co.shiftcalendar.widget;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String CALENDAR_URL =
            "https://makag1122-hub.github.io/shift-calendar/?androidWidget=1";

    private static final String KEY_SKIPPED_VERSION = "skipped_version_code";
    private static final String APK_FILE_NAME = "shift-calendar-widget.apk";
    private static final long POLL_INTERVAL_MS = 500L;

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

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(settings.getUserAgentString() + " ShiftCalendarWidget/1.0");

        webView.addJavascriptInterface(new WidgetBridge(getApplicationContext()), "AndroidWidget");
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

        checkForUpdate();
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
    }
}
