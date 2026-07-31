package kr.co.shiftcalendar.widget;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.Locale;

final class CalendarWidgetRenderer {
    private static final int WIDTH = 560;
    private static final int DEFAULT_HEIGHT = 440;
    private static final int MIN_HEIGHT = 350;
    private static final int MAX_HEIGHT = 520;
    private static final float RENDER_SCALE = 2.5f;
    private static final int WEEK_HEIGHT = 32;
    private static final int ROWS = 6;
    private static final String[] WEEKDAYS = {"일", "월", "화", "수", "목", "금", "토"};
    private static final String[] GROUPS = {"A", "B", "C", "D"};
    private static final int COLOR_BRAND = Color.rgb(79, 70, 229);
    private static final int COLOR_INK = Color.rgb(31, 37, 51);
    private static final int COLOR_INK_SOFT = Color.rgb(100, 116, 139);
    private static final int COLOR_LINE = Color.rgb(225, 230, 239);
    private static final int COLOR_SURFACE = Color.rgb(255, 255, 255);
    private static final int COLOR_SUNDAY = Color.rgb(214, 70, 57);
    private static final int COLOR_SATURDAY = Color.rgb(48, 105, 184);
    private static final int COLOR_MEMO = Color.rgb(245, 158, 11);
    private static final Typeface TYPEFACE_BOLD =
            Typeface.create("sans-serif", Typeface.BOLD);
    private static final Typeface TYPEFACE_MEDIUM =
            Typeface.create("sans-serif-medium", Typeface.NORMAL);
    private static final Typeface TYPEFACE_REGULAR =
            Typeface.create("sans-serif", Typeface.NORMAL);

    private CalendarWidgetRenderer() {
    }

    static final class Result {
        final Bitmap bitmap;
        final String footer;

        Result(Bitmap bitmap, String footer) {
            this.bitmap = bitmap;
            this.footer = footer;
        }
    }

    static String activeGroup(Context context) {
        JSONObject root = payload(context);
        String group = root == null ? "A" : root.optString("activeGroup", "A");
        return group.matches("[ABCD]") ? group : "A";
    }

    static Result render(
            Context context,
            int year,
            int month,
            String group,
            boolean allGroups,
            int widgetWidthDp,
            int widgetHeightDp
    ) {
        int height = calendarHeight(widgetWidthDp, widgetHeightDp);
        Bitmap bitmap = Bitmap.createBitmap(
                Math.round(WIDTH * RENDER_SCALE),
                Math.round(height * RENDER_SCALE),
                Bitmap.Config.ARGB_8888
        );
        Canvas canvas = new Canvas(bitmap);
        canvas.scale(RENDER_SCALE, RENDER_SCALE);
        Paint paint = new Paint(
                Paint.ANTI_ALIAS_FLAG
                        | Paint.SUBPIXEL_TEXT_FLAG
                        | Paint.DITHER_FLAG
                        | Paint.FILTER_BITMAP_FLAG
        );
        canvas.drawColor(COLOR_SURFACE);

        JSONObject root = payload(context);
        JSONArray days = monthDays(root, year, month, group);
        if (root == null || days == null) {
            drawEmpty(canvas, paint, height);
            return new Result(bitmap, "앱을 열어 달력을 동기화해 주세요");
        }

        JSONObject shifts = root.optJSONObject("shifts");
        if (allGroups) {
            int memoCount = drawAllGroups(
                    canvas,
                    paint,
                    root,
                    shifts,
                    year,
                    month,
                    group,
                    height
            );
            return new Result(
                    bitmap,
                    String.format(Locale.KOREA, "4개 조 한눈에 · 이번 달 메모 %d개", memoCount)
            );
        }
        drawWeekdays(canvas, paint);
        drawMonth(canvas, paint, shifts, days, year, month, height);
        return new Result(bitmap, todaySummary(root, group));
    }

    private static int calendarHeight(int widgetWidthDp, int widgetHeightDp) {
        if (widgetWidthDp <= 0 || widgetHeightDp <= 0) {
            return DEFAULT_HEIGHT;
        }
        float availableWidth = Math.max(220f, widgetWidthDp - 24f);
        float availableHeight = Math.max(145f, widgetHeightDp - 102f);
        int fittedHeight = Math.round(WIDTH * availableHeight / availableWidth);
        return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, fittedHeight));
    }

    private static int drawAllGroups(
            Canvas canvas,
            Paint paint,
            JSONObject root,
            JSONObject shifts,
            int year,
            int month,
            String activeGroup,
            int height
    ) {
        final float labelWidth = 42f;
        final float headerHeight = 32f;
        final float columnWidth = (WIDTH - labelWidth) /
                new Calendar.Builder()
                        .setDate(year, month, 1)
                        .build()
                        .getActualMaximum(Calendar.DAY_OF_MONTH);
        final float rowHeight = (height - headerHeight) / GROUPS.length;

        Calendar dayCalendar = Calendar.getInstance();
        dayCalendar.set(year, month, 1, 12, 0, 0);
        int daysInMonth = dayCalendar.getActualMaximum(Calendar.DAY_OF_MONTH);
        Calendar today = Calendar.getInstance();
        boolean currentMonth =
                today.get(Calendar.YEAR) == year && today.get(Calendar.MONTH) == month;
        int memoCount = 0;

        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.rgb(246, 247, 251));
        canvas.drawRoundRect(
                new RectF(0f, 0f, labelWidth, height),
                8f,
                8f,
                paint
        );
        paint.setTextAlign(Paint.Align.CENTER);
        paint.setTypeface(TYPEFACE_BOLD);
        paint.setTextSize(8f);
        paint.setColor(Color.rgb(119, 127, 143));
        canvas.drawText("조", labelWidth / 2f, 20f, paint);

        for (int day = 1; day <= daysInMonth; day++) {
            dayCalendar.set(Calendar.DAY_OF_MONTH, day);
            int column = dayCalendar.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY;
            float centerX = labelWidth + (day - 0.5f) * columnWidth;
            paint.setTypeface(TYPEFACE_BOLD);
            paint.setTextSize(8.2f);
            paint.setColor(
                    column == 0
                            ? COLOR_SUNDAY
                            : column == 6
                            ? COLOR_SATURDAY
                            : Color.rgb(71, 85, 105)
            );
            canvas.drawText(String.valueOf(day), centerX, 12f, paint);
            paint.setTypeface(TYPEFACE_REGULAR);
            paint.setTextSize(6.2f);
            paint.setColor(Color.rgb(148, 156, 172));
            canvas.drawText(WEEKDAYS[column], centerX, 24f, paint);
        }

        for (int row = 0; row < GROUPS.length; row++) {
            String group = GROUPS[row];
            JSONArray days = monthDays(root, year, month, group);
            float top = headerHeight + row * rowHeight;
            float bottom = top + rowHeight;

            paint.setColor(COLOR_SURFACE);
            canvas.drawRect(labelWidth, top, WIDTH, bottom, paint);
            paint.setColor(COLOR_LINE);
            canvas.drawRect(0f, bottom - 1f, WIDTH, bottom, paint);

            if (group.equals(activeGroup)) {
                paint.setColor(COLOR_BRAND);
                canvas.drawRoundRect(
                        new RectF(5f, top + 20f, labelWidth - 5f, bottom - 20f),
                        9f,
                        9f,
                        paint
                );
                paint.setColor(Color.WHITE);
            } else {
                paint.setColor(COLOR_INK);
            }
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setTypeface(TYPEFACE_BOLD);
            paint.setTextSize(12f);
            canvas.drawText(group, labelWidth / 2f, top + rowHeight / 2f + 4f, paint);

            if (days == null) {
                continue;
            }
            for (int day = 1; day <= daysInMonth; day++) {
                JSONArray entry = days.optJSONArray(day - 1);
                String shiftKey = entry == null ? "" : entry.optString(0, "");
                JSONObject shift = shifts == null ? null : shifts.optJSONObject(shiftKey);
                int shiftColor = parseColor(
                        shift == null ? "#94a3b8" : shift.optString("color", "#94a3b8")
                );
                float left = labelWidth + (day - 1) * columnWidth;
                float right = left + columnWidth;
                RectF cell = new RectF(left + 1.2f, top + 7f, right - 1.2f, bottom - 7f);

                paint.setStyle(Paint.Style.FILL);
                paint.setColor(blendWithWhite(shiftColor, 0.10f));
                canvas.drawRoundRect(cell, 4.5f, 4.5f, paint);
                paint.setStyle(Paint.Style.STROKE);
                paint.setStrokeWidth(0.7f);
                paint.setColor(blendWithWhite(shiftColor, 0.34f));
                canvas.drawRoundRect(cell, 4.5f, 4.5f, paint);
                paint.setStyle(Paint.Style.FILL);

                String tag = entry == null ? "" : entry.optString(1, "");
                if (!tag.isEmpty()) {
                    paint.setColor(tagColor(tag));
                    canvas.drawRoundRect(
                            new RectF(left + 2.3f, top + 9f, right - 2.3f, top + 12f),
                            1.5f,
                            1.5f,
                            paint
                    );
                }

                String shiftLabel = shift == null
                        ? "-"
                        : shift.optString("short", shift.optString("label", shiftKey));
                paint.setTextAlign(Paint.Align.CENTER);
                RectF badge = new RectF(
                        left + 2.4f,
                        top + rowHeight / 2f - 10f,
                        right - 2.4f,
                        top + rowHeight / 2f + 10f
                );
                paint.setColor(shiftColor);
                canvas.drawRoundRect(badge, 4.5f, 4.5f, paint);
                paint.setTypeface(TYPEFACE_BOLD);
                paint.setTextSize(7.4f);
                paint.setColor(Color.WHITE);
                canvas.drawText(
                        ellipsize(paint, trimLabel(shiftLabel), columnWidth - 3f),
                        (left + right) / 2f,
                        top + rowHeight / 2f + 3f,
                        paint
                );

                String memo = memoText(entry);
                if (!memo.isEmpty()) {
                    memoCount++;
                    paint.setColor(COLOR_MEMO);
                    canvas.drawCircle((left + right) / 2f, bottom - 13f, 2.2f, paint);
                }
            }
        }

        if (currentMonth) {
            float todayLeft =
                    labelWidth + (today.get(Calendar.DAY_OF_MONTH) - 1) * columnWidth;
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(2f);
            paint.setColor(COLOR_BRAND);
            canvas.drawRoundRect(
                    new RectF(todayLeft + 0.6f, 0.6f, todayLeft + columnWidth - 0.6f, height - 0.6f),
                    4f,
                    4f,
                    paint
            );
            paint.setStyle(Paint.Style.FILL);
        }
        return memoCount;
    }

    private static JSONObject payload(Context context) {
        SharedPreferences preferences =
                context.getSharedPreferences(
                        CalendarWidgetProvider.PREFS_NAME,
                        Context.MODE_PRIVATE
                );
        String raw = preferences.getString(CalendarWidgetProvider.KEY_PAYLOAD, "");
        if (raw == null || raw.isEmpty()) {
            return null;
        }
        try {
            return new JSONObject(raw);
        } catch (JSONException ignored) {
            return null;
        }
    }

    private static JSONArray monthDays(
            JSONObject root,
            int year,
            int month,
            String group
    ) {
        if (root == null) {
            return null;
        }
        JSONObject months = root.optJSONObject("months");
        if (months == null) {
            return null;
        }
        String monthKey = String.format(Locale.US, "%04d-%02d", year, month + 1);
        JSONObject groups = months.optJSONObject(monthKey);
        return groups == null ? null : groups.optJSONArray(group);
    }

    private static void drawWeekdays(Canvas canvas, Paint paint) {
        float columnWidth = WIDTH / 7f;
        paint.setTypeface(TYPEFACE_BOLD);
        paint.setTextSize(14f);
        paint.setTextAlign(Paint.Align.CENTER);
        for (int column = 0; column < 7; column++) {
            paint.setColor(column == 0
                    ? COLOR_SUNDAY
                    : column == 6
                    ? COLOR_SATURDAY
                    : Color.rgb(119, 127, 143));
            canvas.drawText(
                    WEEKDAYS[column],
                    column * columnWidth + columnWidth / 2f,
                    21f,
                    paint
            );
        }
    }

    private static void drawMonth(
            Canvas canvas,
            Paint paint,
            JSONObject shifts,
            JSONArray days,
            int year,
            int month,
            int height
    ) {
        Calendar first = Calendar.getInstance();
        first.set(year, month, 1, 12, 0, 0);
        int firstColumn = first.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY;
        int daysInMonth = first.getActualMaximum(Calendar.DAY_OF_MONTH);
        float columnWidth = WIDTH / 7f;
        float rowHeight = (height - WEEK_HEIGHT) / (float) ROWS;

        Calendar today = Calendar.getInstance();
        boolean currentMonth =
                today.get(Calendar.YEAR) == year && today.get(Calendar.MONTH) == month;

        for (int day = 1; day <= daysInMonth; day++) {
            int position = firstColumn + day - 1;
            int row = position / 7;
            int column = position % 7;
            float left = column * columnWidth;
            float top = WEEK_HEIGHT + row * rowHeight;
            float right = left + columnWidth;
            float bottom = top + rowHeight;

            JSONArray entry = days.optJSONArray(day - 1);
            String shiftKey = entry == null ? "" : entry.optString(0, "");
            String tag = entry == null ? "" : entry.optString(1, "");
            String memo = memoText(entry);
            boolean hasMemo = !memo.isEmpty()
                    || (entry != null && entry.optInt(3, 0) == 1);
            boolean holiday = entry != null && entry.optInt(4, 0) == 1;
            JSONObject shift = shifts == null ? null : shifts.optJSONObject(shiftKey);
            int shiftColor = parseColor(
                    shift == null ? "#94a3b8" : shift.optString("color", "#94a3b8")
            );

            RectF cell = new RectF(left + 2.5f, top + 2f, right - 2.5f, bottom - 2.5f);
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(blendWithWhite(shiftColor, 0.10f));
            canvas.drawRoundRect(cell, 8f, 8f, paint);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(0.9f);
            paint.setColor(COLOR_LINE);
            canvas.drawRoundRect(cell, 8f, 8f, paint);
            paint.setStyle(Paint.Style.FILL);

            paint.setTypeface(TYPEFACE_BOLD);
            paint.setTextAlign(Paint.Align.LEFT);
            paint.setTextSize(15f);
            paint.setColor(
                    holiday || column == 0
                            ? COLOR_SUNDAY
                            : column == 6
                            ? COLOR_SATURDAY
                            : COLOR_INK
            );
            float dateBaseline = top + Math.min(20f, rowHeight * 0.30f + 2f);
            canvas.drawText(String.valueOf(day), left + 8f, dateBaseline, paint);

            if (!tag.isEmpty()) {
                drawTag(canvas, paint, tag, right - 7f, top + 7f);
            }

            String shiftLabel = shift == null
                    ? "-"
                    : shift.optString("short", shift.optString("label", shiftKey));
            float badgeTop = top + Math.min(27f, rowHeight * 0.36f);
            float badgeBottom = Math.min(badgeTop + 24f, top + rowHeight * 0.71f);
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(shiftColor);
            RectF pill = new RectF(left + 7f, badgeTop, right - 7f, badgeBottom);
            canvas.drawRoundRect(pill, 8f, 8f, paint);
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setTextSize(13.5f);
            paint.setColor(Color.WHITE);
            paint.setTypeface(TYPEFACE_BOLD);
            canvas.drawText(
                    trimLabel(shiftLabel),
                    left + columnWidth / 2f,
                    pill.centerY() - (paint.ascent() + paint.descent()) / 2f,
                    paint
            );

            if (hasMemo) {
                paint.setColor(COLOR_MEMO);
                canvas.drawCircle(left + 10f, bottom - 10f, 2.7f, paint);
                if (!memo.isEmpty()) {
                    paint.setTextAlign(Paint.Align.LEFT);
                    paint.setTypeface(TYPEFACE_MEDIUM);
                    paint.setTextSize(9.2f);
                    paint.setColor(COLOR_INK_SOFT);
                    canvas.drawText(
                            ellipsize(paint, memo, columnWidth - 24f),
                            left + 16f,
                            bottom - 7f,
                            paint
                    );
                }
            }

            if (currentMonth && today.get(Calendar.DAY_OF_MONTH) == day) {
                paint.setStyle(Paint.Style.STROKE);
                paint.setStrokeWidth(2.4f);
                paint.setColor(COLOR_BRAND);
                canvas.drawRoundRect(cell, 8f, 8f, paint);
                paint.setStyle(Paint.Style.FILL);
            }
        }
    }

    private static void drawTag(
            Canvas canvas,
            Paint paint,
            String tag,
            float right,
            float top
    ) {
        String label = tagLabel(tag);
        int color = tagColor(tag);
        paint.setTypeface(TYPEFACE_BOLD);
        paint.setTextSize(9.5f);
        float width = paint.measureText(label) + 9f;
        RectF badge = new RectF(right - width, top, right, top + 14f);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(blendWithWhite(color, 0.11f));
        canvas.drawRoundRect(badge, 5f, 5f, paint);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(0.8f);
        paint.setColor(blendWithWhite(color, 0.46f));
        canvas.drawRoundRect(badge, 5f, 5f, paint);
        paint.setStyle(Paint.Style.FILL);
        paint.setTextAlign(Paint.Align.CENTER);
        paint.setColor(color);
        canvas.drawText(label, badge.centerX(), top + 10.4f, paint);
    }

    private static String todaySummary(JSONObject root, String group) {
        Calendar now = Calendar.getInstance();
        JSONArray days = monthDays(
                root,
                now.get(Calendar.YEAR),
                now.get(Calendar.MONTH),
                group
        );
        if (days == null) {
            return "앱을 열어 이번 달을 동기화해 주세요";
        }
        JSONArray entry = days.optJSONArray(now.get(Calendar.DAY_OF_MONTH) - 1);
        if (entry == null) {
            return "오늘 근무를 확인할 수 없습니다";
        }
        JSONObject shifts = root.optJSONObject("shifts");
        JSONObject shift = shifts == null ? null : shifts.optJSONObject(entry.optString(0, ""));
        if (shift == null) {
            return String.format(
                    Locale.KOREA,
                    "%s조 · 오늘 %d일",
                    group,
                    now.get(Calendar.DAY_OF_MONTH)
            );
        }
        String label = shift.optString("label", shift.optString("short", ""));
        String start = shift.optString("start", "");
        String end = shift.optString("end", "");
        String time = start.isEmpty() ? "" : " · " + start + "–" + end;
        String summary = String.format(
                Locale.KOREA,
                "오늘 · %s조 · %s%s",
                group,
                label,
                time
        );
        String memo = memoText(entry);
        return memo.isEmpty() ? summary : summary + " · 메모 " + trimMemo(memo, 18);
    }

    private static void drawEmpty(Canvas canvas, Paint paint, int height) {
        paint.setTextAlign(Paint.Align.CENTER);
        paint.setTypeface(TYPEFACE_BOLD);
        paint.setColor(COLOR_INK);
        paint.setTextSize(25f);
        canvas.drawText("교대캘린더", WIDTH / 2f, height / 2f - 10f, paint);
        paint.setTypeface(TYPEFACE_REGULAR);
        paint.setColor(COLOR_INK_SOFT);
        paint.setTextSize(18f);
        canvas.drawText("앱을 한 번 열면 근무표가 표시됩니다", WIDTH / 2f, height / 2f + 25f, paint);
    }

    private static int parseColor(String value) {
        try {
            return Color.parseColor(value);
        } catch (IllegalArgumentException ignored) {
            return Color.rgb(148, 163, 184);
        }
    }

    private static int blendWithWhite(int color, float amount) {
        int red = Math.round(255 + (Color.red(color) - 255) * amount);
        int green = Math.round(255 + (Color.green(color) - 255) * amount);
        int blue = Math.round(255 + (Color.blue(color) - 255) * amount);
        return Color.rgb(red, green, blue);
    }

    private static int blendWithBlack(int color, float amount) {
        int red = Math.round(Color.red(color) * amount);
        int green = Math.round(Color.green(color) * amount);
        int blue = Math.round(Color.blue(color) * amount);
        return Color.rgb(red, green, blue);
    }

    private static String tagLabel(String tag) {
        if ("JG".equals(tag)) {
            return "지근";
        }
        if ("JH".equals(tag)) {
            return "지휴";
        }
        if ("TG".equals(tag)) {
            return "특근";
        }
        return "";
    }

    private static int tagColor(String tag) {
        return "JH".equals(tag)
                ? Color.rgb(13, 148, 136)
                : Color.rgb(220, 38, 38);
    }

    private static String trimLabel(String value) {
        if (value == null) {
            return "-";
        }
        String trimmed = value.trim();
        return trimmed.length() > 4 ? trimmed.substring(0, 4) : trimmed;
    }

    private static String memoText(JSONArray entry) {
        if (entry == null) {
            return "";
        }
        Object raw = entry.opt(3);
        if (!(raw instanceof String)) {
            return "";
        }
        return ((String) raw).replaceAll("\\s+", " ").trim();
    }

    private static String trimMemo(String value, int maxLength) {
        if (value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, Math.max(1, maxLength - 1)) + "…";
    }

    private static String ellipsize(Paint paint, String value, float maxWidth) {
        if (paint.measureText(value) <= maxWidth) {
            return value;
        }
        String ellipsis = "…";
        int length = value.length();
        while (length > 1
                && paint.measureText(value.substring(0, length) + ellipsis) > maxWidth) {
            length--;
        }
        return value.substring(0, length) + ellipsis;
    }
}
