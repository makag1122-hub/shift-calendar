package kr.co.shiftcalendar.widget;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.graphics.Color;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final String CALENDAR_URL =
            "https://makag1122-hub.github.io/shift-calendar/?androidWidget=1";

    private WebView webView;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(247, 248, 250));
        getWindow().setNavigationBarColor(Color.WHITE);

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
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidWidget");
            webView.destroy();
        }
        super.onDestroy();
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
