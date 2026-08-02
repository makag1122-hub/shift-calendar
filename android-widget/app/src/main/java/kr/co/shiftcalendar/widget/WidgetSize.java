package kr.co.shiftcalendar.widget;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.res.Configuration;
import android.os.Bundle;

/** 현재 화면 방향과 같은 축의 AppWidget 크기 옵션을 선택합니다. */
final class WidgetSize {
    private WidgetSize() {
    }

    static int widthDp(Context context, Bundle options, int fallback) {
        boolean landscape = context.getResources().getConfiguration().orientation
                == Configuration.ORIENTATION_LANDSCAPE;
        String primary = landscape
                ? AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH
                : AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH;
        String secondary = landscape
                ? AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH
                : AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH;
        return positiveOption(options, primary, secondary, fallback);
    }

    static int heightDp(Context context, Bundle options, int fallback) {
        boolean landscape = context.getResources().getConfiguration().orientation
                == Configuration.ORIENTATION_LANDSCAPE;
        String primary = landscape
                ? AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT
                : AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT;
        String secondary = landscape
                ? AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT
                : AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT;
        return positiveOption(options, primary, secondary, fallback);
    }

    private static int positiveOption(
            Bundle options,
            String primary,
            String secondary,
            int fallback
    ) {
        int value = options == null ? 0 : options.getInt(primary, 0);
        if (value <= 0 && options != null) {
            value = options.getInt(secondary, 0);
        }
        return value > 0 ? value : fallback;
    }
}
