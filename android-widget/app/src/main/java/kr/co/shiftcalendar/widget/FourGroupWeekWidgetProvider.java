package kr.co.shiftcalendar.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.RemoteViews;

import java.util.Calendar;
import java.util.Locale;

public class FourGroupWeekWidgetProvider extends AppWidgetProvider {
    private static final String ACTION_PREVIOUS =
            "kr.co.shiftcalendar.widget.action.WEEK_PREVIOUS";
    private static final String ACTION_NEXT =
            "kr.co.shiftcalendar.widget.action.WEEK_NEXT";
    private static final String ACTION_TODAY =
            "kr.co.shiftcalendar.widget.action.WEEK_TODAY";
    private static final String EXTRA_WIDGET_ID = "widget_id";

    @Override
    public void onUpdate(
            Context context,
            AppWidgetManager appWidgetManager,
            int[] appWidgetIds
    ) {
        updateWidgets(context, appWidgetManager, appWidgetIds);
    }

    @Override
    public void onAppWidgetOptionsChanged(
            Context context,
            AppWidgetManager appWidgetManager,
            int appWidgetId,
            Bundle newOptions
    ) {
        updateWidgets(context, appWidgetManager, new int[]{appWidgetId});
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (!ACTION_PREVIOUS.equals(action)
                && !ACTION_NEXT.equals(action)
                && !ACTION_TODAY.equals(action)) {
            return;
        }
        int widgetId = intent.getIntExtra(
                EXTRA_WIDGET_ID,
                AppWidgetManager.INVALID_APPWIDGET_ID
        );
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            return;
        }

        SharedPreferences preferences = context.getSharedPreferences(
                CalendarWidgetProvider.PREFS_NAME,
                Context.MODE_PRIVATE
        );
        String key = offsetKey(widgetId);
        if (ACTION_TODAY.equals(action)) {
            preferences.edit().putInt(key, 0).apply();
        } else {
            int change = ACTION_PREVIOUS.equals(action) ? -1 : 1;
            int next = Math.max(-78, Math.min(78, preferences.getInt(key, 0) + change));
            preferences.edit().putInt(key, next).apply();
        }
        updateWidgets(
                context,
                AppWidgetManager.getInstance(context),
                new int[]{widgetId}
        );
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        SharedPreferences.Editor editor = context.getSharedPreferences(
                CalendarWidgetProvider.PREFS_NAME,
                Context.MODE_PRIVATE
        ).edit();
        for (int widgetId : appWidgetIds) {
            editor.remove(offsetKey(widgetId));
        }
        editor.apply();
    }

    public static void updateWidgets(
            Context context,
            AppWidgetManager manager,
            int[] widgetIds
    ) {
        if (widgetIds == null) {
            return;
        }
        for (int widgetId : widgetIds) {
            updateWidget(context, manager, widgetId);
        }
    }

    private static void updateWidget(
            Context context,
            AppWidgetManager manager,
            int widgetId
    ) {
        SharedPreferences preferences = context.getSharedPreferences(
                CalendarWidgetProvider.PREFS_NAME,
                Context.MODE_PRIVATE
        );
        int offset = preferences.getInt(offsetKey(widgetId), 0);
        Calendar weekStart = startOfWeek(Calendar.getInstance());
        weekStart.add(Calendar.WEEK_OF_YEAR, offset);

        Bundle options = manager.getAppWidgetOptions(widgetId);
        int widgetWidthDp = WidgetSize.widthDp(context, options, 320);
        int widgetHeightDp = WidgetSize.heightDp(context, options, 180);
        CalendarWidgetRenderer.Result result = CalendarWidgetRenderer.renderWeek(
                context,
                weekStart,
                CalendarWidgetRenderer.activeGroup(context),
                widgetWidthDp,
                widgetHeightDp
        );

        RemoteViews views = new RemoteViews(
                context.getPackageName(),
                R.layout.widget_four_groups_week
        );
        views.setTextViewText(R.id.week_widget_title, rangeTitle(weekStart));
        views.setImageViewBitmap(R.id.week_widget_image, result.bitmap);

        views.setOnClickPendingIntent(
                R.id.week_widget_previous,
                broadcastIntent(context, widgetId, ACTION_PREVIOUS, 1)
        );
        views.setOnClickPendingIntent(
                R.id.week_widget_next,
                broadcastIntent(context, widgetId, ACTION_NEXT, 2)
        );
        views.setOnClickPendingIntent(
                R.id.week_widget_title,
                broadcastIntent(context, widgetId, ACTION_TODAY, 3)
        );
        Intent openIntent = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openApp = PendingIntent.getActivity(
                context,
                widgetId + 100_000,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.week_widget_image, openApp);
        manager.updateAppWidget(widgetId, views);
    }

    private static Calendar startOfWeek(Calendar source) {
        Calendar result = (Calendar) source.clone();
        result.set(Calendar.HOUR_OF_DAY, 12);
        result.set(Calendar.MINUTE, 0);
        result.set(Calendar.SECOND, 0);
        result.set(Calendar.MILLISECOND, 0);
        int distance = result.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY;
        result.add(Calendar.DAY_OF_MONTH, -distance);
        return result;
    }

    private static String rangeTitle(Calendar start) {
        Calendar end = (Calendar) start.clone();
        end.add(Calendar.DAY_OF_MONTH, 6);
        if (start.get(Calendar.YEAR) != end.get(Calendar.YEAR)) {
            return String.format(
                    Locale.KOREA,
                    "%d. %d. %d.–%d. %d. %d.",
                    start.get(Calendar.YEAR),
                    start.get(Calendar.MONTH) + 1,
                    start.get(Calendar.DAY_OF_MONTH),
                    end.get(Calendar.YEAR),
                    end.get(Calendar.MONTH) + 1,
                    end.get(Calendar.DAY_OF_MONTH)
            );
        }
        if (start.get(Calendar.MONTH) != end.get(Calendar.MONTH)) {
            return String.format(
                    Locale.KOREA,
                    "%d월 %d일–%d월 %d일",
                    start.get(Calendar.MONTH) + 1,
                    start.get(Calendar.DAY_OF_MONTH),
                    end.get(Calendar.MONTH) + 1,
                    end.get(Calendar.DAY_OF_MONTH)
            );
        }
        return String.format(
                Locale.KOREA,
                "%d년 %d월 %d–%d일",
                start.get(Calendar.YEAR),
                start.get(Calendar.MONTH) + 1,
                start.get(Calendar.DAY_OF_MONTH),
                end.get(Calendar.DAY_OF_MONTH)
        );
    }

    private static PendingIntent broadcastIntent(
            Context context,
            int widgetId,
            String action,
            int actionCode
    ) {
        Intent intent = new Intent(context, FourGroupWeekWidgetProvider.class)
                .setAction(action)
                .putExtra(EXTRA_WIDGET_ID, widgetId);
        return PendingIntent.getBroadcast(
                context,
                widgetId * 10 + actionCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static String offsetKey(int widgetId) {
        return "week_offset_" + widgetId;
    }
}
