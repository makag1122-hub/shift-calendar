package kr.co.shiftcalendar.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.widget.RemoteViews;

import java.util.Calendar;
import java.util.Locale;

public class CalendarWidgetProvider extends AppWidgetProvider {
    public static final String PREFS_NAME = "shift_calendar_widget";
    public static final String KEY_PAYLOAD = "calendar_payload";

    private static final String ACTION_PREVIOUS =
            "kr.co.shiftcalendar.widget.action.PREVIOUS";
    private static final String ACTION_NEXT =
            "kr.co.shiftcalendar.widget.action.NEXT";
    private static final String ACTION_TODAY =
            "kr.co.shiftcalendar.widget.action.TODAY";
    private static final String ACTION_GROUP =
            "kr.co.shiftcalendar.widget.action.GROUP";
    private static final String ACTION_MODE =
            "kr.co.shiftcalendar.widget.action.MODE";

    private static final String EXTRA_WIDGET_ID = "widget_id";
    private static final String[] GROUPS = {"A", "B", "C", "D"};

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
            android.os.Bundle newOptions
    ) {
        updateWidgets(context, appWidgetManager, new int[]{appWidgetId});
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (!ACTION_PREVIOUS.equals(action)
                && !ACTION_NEXT.equals(action)
                && !ACTION_TODAY.equals(action)
                && !ACTION_GROUP.equals(action)
                && !ACTION_MODE.equals(action)) {
            return;
        }

        int widgetId = intent.getIntExtra(
                EXTRA_WIDGET_ID,
                AppWidgetManager.INVALID_APPWIDGET_ID
        );
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            return;
        }

        SharedPreferences preferences =
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String offsetKey = offsetKey(widgetId);
        String groupKey = groupKey(widgetId);

        if (ACTION_TODAY.equals(action)) {
            preferences.edit().putInt(offsetKey, 0).apply();
        } else if (ACTION_PREVIOUS.equals(action)) {
            int offset = Math.max(-18, preferences.getInt(offsetKey, 0) - 1);
            preferences.edit().putInt(offsetKey, offset).apply();
        } else if (ACTION_NEXT.equals(action)) {
            int offset = Math.min(18, preferences.getInt(offsetKey, 0) + 1);
            preferences.edit().putInt(offsetKey, offset).apply();
        } else if (ACTION_GROUP.equals(action)) {
            String current = preferences.getString(
                    groupKey,
                    CalendarWidgetRenderer.activeGroup(context)
            );
            int index = 0;
            for (int i = 0; i < GROUPS.length; i++) {
                if (GROUPS[i].equals(current)) {
                    index = i;
                    break;
                }
            }
            preferences.edit()
                    .putString(groupKey, GROUPS[(index + 1) % GROUPS.length])
                    .apply();
        } else {
            String modeKey = modeKey(widgetId);
            preferences.edit()
                    .putBoolean(modeKey, !preferences.getBoolean(modeKey, false))
                    .apply();
        }

        updateWidgets(
                context,
                AppWidgetManager.getInstance(context),
                new int[]{widgetId}
        );
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        SharedPreferences.Editor editor =
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit();
        for (int widgetId : appWidgetIds) {
            editor.remove(offsetKey(widgetId));
            editor.remove(groupKey(widgetId));
            editor.remove(modeKey(widgetId));
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
        SharedPreferences preferences =
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        int offset = preferences.getInt(offsetKey(widgetId), 0);
        String group = preferences.getString(
                groupKey(widgetId),
                CalendarWidgetRenderer.activeGroup(context)
        );
        boolean allGroups = preferences.getBoolean(modeKey(widgetId), false);

        Calendar target = Calendar.getInstance();
        target.set(Calendar.DAY_OF_MONTH, 1);
        target.add(Calendar.MONTH, offset);
        int year = target.get(Calendar.YEAR);
        int month = target.get(Calendar.MONTH);

        Bundle options = manager.getAppWidgetOptions(widgetId);
        int widgetWidthDp = options.getInt(
                AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,
                320
        );
        int widgetHeightDp = options.getInt(
                AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,
                320
        );
        CalendarWidgetRenderer.Result result =
                CalendarWidgetRenderer.render(
                        context,
                        year,
                        month,
                        group,
                        allGroups,
                        widgetWidthDp,
                        widgetHeightDp
                );
        RemoteViews views = new RemoteViews(
                context.getPackageName(),
                R.layout.widget_calendar
        );
        views.setTextViewText(
                R.id.widget_title,
                String.format(Locale.KOREA, "%d년 %d월", year, month + 1)
        );
        views.setTextViewText(R.id.widget_group, group + "조");
        views.setTextViewText(R.id.widget_mode, allGroups ? "내 조" : "4개 조");
        views.setInt(
                R.id.widget_group,
                "setBackgroundResource",
                allGroups ? R.drawable.widget_nav_button : R.drawable.widget_group_chip
        );
        views.setTextColor(
                R.id.widget_group,
                allGroups ? Color.rgb(89, 97, 116) : Color.WHITE
        );
        views.setInt(
                R.id.widget_mode,
                "setBackgroundResource",
                allGroups ? R.drawable.widget_group_chip : R.drawable.widget_nav_button
        );
        views.setTextColor(
                R.id.widget_mode,
                allGroups ? Color.WHITE : Color.rgb(89, 97, 116)
        );
        views.setImageViewBitmap(R.id.widget_calendar_image, result.bitmap);
        views.setTextViewText(R.id.widget_footer, result.footer);

        views.setOnClickPendingIntent(
                R.id.widget_previous,
                broadcastIntent(context, widgetId, ACTION_PREVIOUS, 1)
        );
        views.setOnClickPendingIntent(
                R.id.widget_next,
                broadcastIntent(context, widgetId, ACTION_NEXT, 2)
        );
        views.setOnClickPendingIntent(
                R.id.widget_title,
                broadcastIntent(context, widgetId, ACTION_TODAY, 3)
        );
        views.setOnClickPendingIntent(
                R.id.widget_group,
                broadcastIntent(context, widgetId, ACTION_GROUP, 5)
        );
        views.setOnClickPendingIntent(
                R.id.widget_mode,
                broadcastIntent(context, widgetId, ACTION_MODE, 6)
        );
        views.setOnClickPendingIntent(
                R.id.widget_footer,
                broadcastIntent(context, widgetId, ACTION_TODAY, 4)
        );

        Intent openIntent = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openApp = PendingIntent.getActivity(
                context,
                widgetId,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_calendar_image, openApp);
        manager.updateAppWidget(widgetId, views);
    }

    private static PendingIntent broadcastIntent(
            Context context,
            int widgetId,
            String action,
            int actionCode
    ) {
        Intent intent = new Intent(context, CalendarWidgetProvider.class)
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
        return "month_offset_" + widgetId;
    }

    private static String groupKey(int widgetId) {
        return "group_" + widgetId;
    }

    private static String modeKey(int widgetId) {
        return "all_groups_" + widgetId;
    }
}
