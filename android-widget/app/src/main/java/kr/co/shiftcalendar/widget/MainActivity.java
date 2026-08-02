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
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.File;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String CALENDAR_URL =
            "https://makag1122-hub.github.io/shift-calendar/?androidWidget=1";
    private static final String SHARE_SCHEME = "shiftcalendar";
    private static final String SHARE_HOST = "share";
    private static final String KAKAO_SHARE_SCHEME =
            "kakaoe9f15b01b136223f0f0d7b2e00b94281";
    private static final String KAKAO_SHARE_HOST = "kakaolink";
    private static final String PLAY_STORE_URL =
            "https://play.google.com/store/apps/details?id=kr.co.shiftcalendar.widget";

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

        FrameLayout appRoot = new FrameLayout(this);
        appRoot.setBackgroundColor(Color.rgb(238, 241, 246));

        webView = new WebView(this);
        appRoot.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        applySystemBarInsets(appRoot);
        setContentView(appRoot);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(settings.getUserAgentString() + " ShiftCalendarWidget/1.0");

        webView.addJavascriptInterface(new WidgetBridge(this), "AndroidWidget");

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
                String appVersion = BuildConfig.VERSION_NAME;
                view.evaluateJavascript(
                        "(function(){"
                                + "document.querySelectorAll('.app-version').forEach(function(el){"
                                + "el.textContent='ver " + appVersion + "';});"
                                + "document.querySelectorAll('.set-foot').forEach(function(el){"
                                + "el.textContent='교대캘린더 · ver " + appVersion + "';});"
                                + "})();",
                        null
                );
            }
        });
        webView.loadUrl(launchUrl(getIntent()));

        checkForUpdate();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (webView != null) {
            webView.loadUrl(launchUrl(intent));
        }
    }

    private static String launchUrl(Intent intent) {
        String token = shareToken(intent == null ? null : intent.getData());
        return token.isEmpty()
                ? CALENDAR_URL
                : CALENDAR_URL + "#share=" + Uri.encode(token);
    }

    private static String shareToken(Uri uri) {
        if (uri == null) {
            return "";
        }
        String token = "";
        if (SHARE_SCHEME.equalsIgnoreCase(uri.getScheme())
                && SHARE_HOST.equalsIgnoreCase(uri.getHost())) {
            token = uri.getQueryParameter("token");
        } else if (KAKAO_SHARE_SCHEME.equalsIgnoreCase(uri.getScheme())
                && KAKAO_SHARE_HOST.equalsIgnoreCase(uri.getHost())) {
            token = uri.getQueryParameter("token");
        } else {
            String fragment = uri.getFragment();
            if (fragment != null && fragment.startsWith("share=")) {
                token = fragment.substring("share=".length());
            }
        }
        if (token == null || !token.matches("[A-Za-z0-9_-]{8,1800}")) {
            return "";
        }
        return token;
    }

    private void applySystemBarInsets(ViewGroup appRoot) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            appRoot.setFitsSystemWindows(true);
            return;
        }
        getWindow().setDecorFitsSystemWindows(false);
        int safeTypes = WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout();
        appRoot.setOnApplyWindowInsetsListener((view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(safeTypes);
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            /*
             * 루트가 안전 영역을 소비합니다. 그대로 WebView에 전달하면 CSS의
             * safe-area-inset과 합쳐져 기기별로 여백이 두 번 생길 수 있습니다.
             */
            return new WindowInsets.Builder(windowInsets)
                    .setInsets(safeTypes, Insets.NONE)
                    .build();
        });
        appRoot.post(appRoot::requestApplyInsets);
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
                .setPositiveButton(
                        BuildConfig.SELF_UPDATE_ENABLED
                                ? R.string.update_action
                                : R.string.update_play_action,
                        (ignored, which) -> {
                            if (BuildConfig.SELF_UPDATE_ENABLED) {
                                startUpdate(release);
                            } else {
                                openPlayStore();
                            }
                        }
                )
                /*
                 * 나중에를 눌러도 이 버전을 영구히 숨기지 않습니다.
                 * 다음에 앱을 새로 열면 다시 최신 버전을 확인합니다.
                 */
                .setNegativeButton(R.string.update_later, null)
                .show();
    }

    private void openPlayStore() {
        Intent market = new Intent(
                Intent.ACTION_VIEW,
                Uri.parse("market://details?id=" + getPackageName())
        ).setPackage("com.android.vending");
        try {
            startActivity(market);
        } catch (RuntimeException error) {
            openInBrowser(
                    "https://play.google.com/store/apps/details?id=" + getPackageName()
            );
        }
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

    private static final class WidgetBridge {
        private final MainActivity activity;
        private final Context context;
        private final Handler toastHandler = new Handler(Looper.getMainLooper());

        WidgetBridge(MainActivity activity) {
            this.activity = activity;
            this.context = activity.getApplicationContext();
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
            ComponentName weekComponent =
                    new ComponentName(context, FourGroupWeekWidgetProvider.class);
            FourGroupWeekWidgetProvider.updateWidgets(
                    context,
                    manager,
                    manager.getAppWidgetIds(weekComponent)
            );
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

            String token = shareToken(Uri.parse(safeUrl));
            if (token.isEmpty()) {
                return;
            }
            String appLink = new Uri.Builder()
                    .scheme(SHARE_SCHEME)
                    .authority(SHARE_HOST)
                    .appendQueryParameter("token", token)
                    .build()
                    .toString();

            activity.runOnUiThread(() -> KakaoShareManager.shareInvitation(
                    activity,
                    safeTitle,
                    safeText,
                    token,
                    () -> shareWithAndroid(safeTitle, safeText, appLink)
            ));
        }

        private void shareWithAndroid(String safeTitle, String safeText, String appLink) {
            StringBuilder message = new StringBuilder();
            if (!safeText.isEmpty()) {
                message.append(safeText).append("\n\n");
            }
            message.append("교대캘린더 앱에서 근무표 열기\n")
                    .append(appLink)
                    .append("\n\n앱이 없다면 먼저 설치한 뒤 초대 링크를 다시 눌러주세요.\n")
                    .append(PLAY_STORE_URL);
            Intent share = new Intent(Intent.ACTION_SEND)
                    .setType("text/plain")
                    .putExtra(Intent.EXTRA_SUBJECT, safeTitle)
                    .putExtra(Intent.EXTRA_TEXT, message.toString())
                    .setPackage("com.kakao.talk");
            try {
                activity.startActivity(share);
            } catch (ActivityNotFoundException error) {
                Intent fallback = new Intent(Intent.ACTION_SEND)
                        .setType("text/plain")
                        .putExtra(Intent.EXTRA_SUBJECT, safeTitle)
                        .putExtra(Intent.EXTRA_TEXT, message.toString());
                Intent chooser = Intent.createChooser(
                        fallback,
                        context.getString(R.string.share_chooser_title)
                );
                activity.startActivity(chooser);
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
