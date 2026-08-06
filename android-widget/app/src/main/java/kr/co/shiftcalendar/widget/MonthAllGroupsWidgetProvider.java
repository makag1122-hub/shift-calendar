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

/**
 * 6행 7열 월간 달력에 A/B/C/D 네 개 조를 함께 담는 큰 위젯입니다.
 * 월간 달력 위젯과 4개 조 비교 위젯을 하나로 합친 형태입니다.
 * 아래쪽 4개 조 띠는 한 주씩만 보여 주고 ‹ › 로 주를 넘깁니다.
 */
public class MonthAllGroupsWidgetProvider extends AppWidgetProvider {
    private static final String ACTION_PREVIOUS =
            "kr.co.shiftcalendar.widget.action.MONTH_ALL_PREVIOUS";
    private static final String ACTION_NEXT =
            "kr.co.shiftcalendar.widget.action.MONTH_ALL_NEXT";
    private static final String ACTION_TODAY =
            "kr.co.shiftcalendar.widget.action.MONTH_ALL_TODAY";
    private static final String ACTION_GROUP =
            "kr.co.shiftcalendar.widget.action.MONTH_ALL_GROUP";
    private static final String ACTION_WEEK_PREVIOUS =
            "kr.co.shiftcalendar.widget.action.MONTH_ALL_WEEK_PREVIOUS";
    private static final String ACTION_WEEK_NEXT =
            "kr.co.shiftcalendar.widget.action.MONTH_ALL_WEEK_NEXT";
    private static final String EXTRA_WIDGET_ID = "widget_id";
    private static final String[] GROUPS = {"A", "B", "C", "D"};
    private static final int MONTH_LIMIT = 18;
    /** 저장된 주가 없으면 오늘이 든 주를 씁니다. 달을 옮길 때마다 이 값으로 되돌립니다. */
    private static final int AUTO_WEEK = -1;

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
                && !ACTION_TODAY.equals(action)
                && !ACTION_GROUP.equals(action)
                && !ACTION_WEEK_PREVIOUS.equals(action)
                && !ACTION_WEEK_NEXT.equals(action)) {
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
        String offsetKey = offsetKey(widgetId);
        String weekKey = weekKey(widgetId);
        int offset = preferences.getInt(offsetKey, 0);

        if (ACTION_TODAY.equals(action)) {
            preferences.edit().putInt(offsetKey, 0).putInt(weekKey, AUTO_WEEK).apply();
        } else if (ACTION_PREVIOUS.equals(action)) {
            preferences.edit()
                    .putInt(offsetKey, Math.max(-MONTH_LIMIT, offset - 1))
                    .putInt(weekKey, AUTO_WEEK)
                    .apply();
        } else if (ACTION_NEXT.equals(action)) {
            preferences.edit()
                    .putInt(offsetKey, Math.min(MONTH_LIMIT, offset + 1))
                    .putInt(weekKey, AUTO_WEEK)
                    .apply();
        } else if (ACTION_WEEK_PREVIOUS.equals(action)) {
            int week = resolveWeek(preferences, widgetId, offset);
            if (week > 0) {
                preferences.edit().putInt(weekKey, week - 1).apply();
            } else if (offset > -MONTH_LIMIT) {
                /* 달의 첫 줄에서 더 넘기면 지난달 마지막 줄로 이어집니다. */
                int previous = offset - 1;
                preferences.edit()
                        .putInt(offsetKey, previous)
                        .putInt(weekKey, weekRows(previous) - 1)
                        .apply();
            }
        } else if (ACTION_WEEK_NEXT.equals(action)) {
            int week = resolveWeek(preferences, widgetId, offset);
            if (week < weekRows(offset) - 1) {
                preferences.edit().putInt(weekKey, week + 1).apply();
            } else if (offset < MONTH_LIMIT) {
                preferences.edit()
                        .putInt(offsetKey, offset + 1)
                        .putInt(weekKey, 0)
                        .apply();
            }
        } else {
            String current = preferences.getString(
                    groupKey(widgetId),
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
                    .putString(groupKey(widgetId), GROUPS[(index + 1) % GROUPS.length])
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
        SharedPreferences.Editor editor = context.getSharedPreferences(
                CalendarWidgetProvider.PREFS_NAME,
                Context.MODE_PRIVATE
        ).edit();
        for (int widgetId : appWidgetIds) {
            editor.remove(offsetKey(widgetId));
            editor.remove(groupKey(widgetId));
            editor.remove(weekKey(widgetId));
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
        String group = preferences.getString(
                groupKey(widgetId),
                CalendarWidgetRenderer.activeGroup(context)
        );
        Calendar target = monthOf(offset);
        int year = target.get(Calendar.YEAR);
        int month = target.get(Calendar.MONTH);
        int week = resolveWeek(preferences, widgetId, offset);

        Bundle options = manager.getAppWidgetOptions(widgetId);
        int widgetWidthDp = WidgetSize.widthDp(context, options, 360);
        int widgetHeightDp = WidgetSize.heightDp(context, options, 460);
        CalendarWidgetRenderer.Result result =
                CalendarWidgetRenderer.renderMonthAllGroups(
                        context,
                        year,
                        month,
                        group,
                        week,
                        widgetWidthDp,
                        widgetHeightDp
                );

        RemoteViews views = new RemoteViews(
                context.getPackageName(),
                R.layout.widget_month_all_groups
        );
        views.setTextViewText(
                R.id.month_all_widget_title,
                String.format(Locale.KOREA, "%d년 %d월", year, month + 1)
        );
        views.setTextViewText(R.id.month_all_widget_group, group + "조");
        views.setImageViewBitmap(R.id.month_all_widget_image, result.bitmap);
        /* 보고 있는 주는 띠 카드 머리글에 그려집니다. 아래 줄은 오늘 근무 요약만 맡습니다. */
        views.setTextViewText(R.id.month_all_widget_footer, result.footer);

        views.setOnClickPendingIntent(
                R.id.month_all_widget_previous,
                broadcastIntent(context, widgetId, ACTION_PREVIOUS, 1)
        );
        views.setOnClickPendingIntent(
                R.id.month_all_widget_next,
                broadcastIntent(context, widgetId, ACTION_NEXT, 2)
        );
        views.setOnClickPendingIntent(
                R.id.month_all_widget_title,
                broadcastIntent(context, widgetId, ACTION_TODAY, 3)
        );
        views.setOnClickPendingIntent(
                R.id.month_all_widget_footer,
                broadcastIntent(context, widgetId, ACTION_TODAY, 4)
        );
        views.setOnClickPendingIntent(
                R.id.month_all_widget_group,
                broadcastIntent(context, widgetId, ACTION_GROUP, 5)
        );
        views.setOnClickPendingIntent(
                R.id.month_all_widget_week_previous,
                broadcastIntent(context, widgetId, ACTION_WEEK_PREVIOUS, 6)
        );
        views.setOnClickPendingIntent(
                R.id.month_all_widget_week_next,
                broadcastIntent(context, widgetId, ACTION_WEEK_NEXT, 7)
        );

        Intent openIntent = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openApp = PendingIntent.getActivity(
                context,
                widgetId + 200_000,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.month_all_widget_image, openApp);
        manager.updateAppWidget(widgetId, views);
    }

    private static Calendar monthOf(int offset) {
        Calendar target = Calendar.getInstance();
        target.set(Calendar.DAY_OF_MONTH, 1);
        target.add(Calendar.MONTH, offset);
        return target;
    }

    private static int weekRows(int offset) {
        Calendar target = monthOf(offset);
        return CalendarWidgetRenderer.weekRowCount(
                target.get(Calendar.YEAR),
                target.get(Calendar.MONTH)
        );
    }

    /**
     * 지금 띠가 보여 줄 주입니다.
     * 저장된 값이 없으면(달을 막 옮겼거나 위젯을 막 놓았으면) 오늘이 든 주를 씁니다.
     * 달마다 줄 수가 달라지므로 저장된 값도 이 달의 범위로 다시 맞춥니다.
     */
    private static int resolveWeek(
            SharedPreferences preferences,
            int widgetId,
            int offset
    ) {
        Calendar target = monthOf(offset);
        int year = target.get(Calendar.YEAR);
        int month = target.get(Calendar.MONTH);
        int stored = preferences.getInt(weekKey(widgetId), AUTO_WEEK);
        if (stored == AUTO_WEEK) {
            return CalendarWidgetRenderer.weekRowOfToday(year, month);
        }
        int rows = CalendarWidgetRenderer.weekRowCount(year, month);
        return Math.max(0, Math.min(rows - 1, stored));
    }

    private static PendingIntent broadcastIntent(
            Context context,
            int widgetId,
            String action,
            int actionCode
    ) {
        Intent intent = new Intent(context, MonthAllGroupsWidgetProvider.class)
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
        return "month_all_offset_" + widgetId;
    }

    private static String groupKey(int widgetId) {
        return "month_all_group_" + widgetId;
    }

    private static String weekKey(int widgetId) {
        return "month_all_week_" + widgetId;
    }
}
