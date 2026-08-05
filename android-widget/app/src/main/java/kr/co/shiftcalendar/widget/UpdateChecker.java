package kr.co.shiftcalendar.widget;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/* 앱 화면과 같은 곳(Firebase Hosting)에 올려둔 widget-version.json을 읽어
   새 버전이 있는지 확인합니다. 달력 내용은 웹에서 바로 갱신되므로,
   이 확인은 위젯을 그리는 네이티브 코드가 바뀌었을 때만 의미가 있습니다. */
final class UpdateChecker {

    static final String VERSION_URL =
            "https://gyodae-calendar.web.app/widget-version.json";

    private static final int TIMEOUT_MS = 7000;
    private static final int MAX_BODY_BYTES = 16 * 1024;

    private UpdateChecker() {
    }

    static final class Release {
        final long versionCode;
        final String versionName;
        final String apkUrl;
        final String notes;

        Release(long versionCode, String versionName, String apkUrl, String notes) {
            this.versionCode = versionCode;
            this.versionName = versionName;
            this.apkUrl = apkUrl;
            this.notes = notes;
        }
    }

    /* 네트워크를 사용하므로 반드시 백그라운드 스레드에서 호출하세요.
       확인에 실패하면 null을 돌려주고 조용히 넘어갑니다. */
    static Release fetch() {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(VERSION_URL + "?t=" + System.currentTimeMillis());
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            connection.setRequestProperty("Cache-Control", "no-cache");

            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                return null;
            }

            JSONObject json = new JSONObject(readBody(connection.getInputStream()));
            String apkUrl = json.optString("apkUrl", "");
            long versionCode = json.optLong("versionCode", 0L);
            if (versionCode <= 0L || !apkUrl.startsWith("https://")) {
                return null;
            }

            return new Release(
                    versionCode,
                    json.optString("versionName", ""),
                    apkUrl,
                    json.optString("notes", "")
            );
        } catch (Exception ignored) {
            return null;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private static String readBody(InputStream stream) throws Exception {
        try (InputStream input = stream) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[4096];
            int read;
            while ((read = input.read(chunk)) != -1) {
                buffer.write(chunk, 0, read);
                if (buffer.size() > MAX_BODY_BYTES) {
                    throw new IllegalStateException("버전 파일이 너무 큽니다");
                }
            }
            return buffer.toString(StandardCharsets.UTF_8.name());
        }
    }

    static long installedVersionCode(Context context) {
        try {
            PackageInfo info = context.getPackageManager()
                    .getPackageInfo(context.getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                return info.getLongVersionCode();
            }
            return info.versionCode;
        } catch (PackageManager.NameNotFoundException ignored) {
            /* 알 수 없으면 업데이트 안내를 띄우지 않습니다. */
            return Long.MAX_VALUE;
        }
    }
}
