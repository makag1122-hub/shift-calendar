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
    private static final int HEIGHT = 474;
    private static final int WEEK_HEIGHT = 34;
    private static final int ROWS = 6;
    private static final String[] WEEKDAYS = {"일", "월", "화", "수", "목", "금", "토"};

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

    static Result render(Context context, int year, int month, String group) {
        Bitmap bitmap = Bitmap.createBitmap(WIDTH, HEIGHT, Bitmap.Config.RGB_565);
        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        canvas.drawColor(Color.WHITE);

        JSONObject root = payload(context);
        JSONArray days = monthDays(root, year, month, group);
        if (root == null || days == null) {
            drawEmpty(canvas, paint);
            return new Result(bitmap, "앱을 열어 달력을 동기화해 주세요");
        }

        JSONObject shifts = root.optJSONObject("shifts");
        drawWeekdays(canvas, paint);
        drawMonth(canvas, paint, shifts, days, year, month);
        return new Result(bitmap, todaySummary(root, group));
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
        paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        paint.setTextSize(18f);
        paint.setTextAlign(Paint.Align.CENTER);
        for (int column = 0; column < 7; column++) {
            paint.setColor(column == 0
                    ? Color.rgb(220, 38, 38)
                    : column == 6
                    ? Color.rgb(37, 99, 235)
                    : Color.rgb(100, 116, 139));
            canvas.drawText(
                    WEEKDAYS[column],
                    column * columnWidth + columnWidth / 2f,
                    23f,
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
            int month
    ) {
        Calendar first = Calendar.getInstance();
        first.set(year, month, 1, 12, 0, 0);
        int firstColumn = first.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY;
        int daysInMonth = first.getActualMaximum(Calendar.DAY_OF_MONTH);
        float columnWidth = WIDTH / 7f;
        float rowHeight = (HEIGHT - WEEK_HEIGHT) / (float) ROWS;

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
            boolean hasMemo = entry != null && entry.optInt(3, 0) == 1;
            boolean holiday = entry != null && entry.optInt(4, 0) == 1;
            JSONObject shift = shifts == null ? null : shifts.optJSONObject(shiftKey);
            int shiftColor = parseColor(
                    shift == null ? "#94a3b8" : shift.optString("color", "#94a3b8")
            );

            paint.setStyle(Paint.Style.FILL);
            paint.setColor(blendWithWhite(shiftColor, 0.14f));
            canvas.drawRoundRect(
                    new RectF(left + 2f, top + 2f, right - 2f, bottom - 2f),
                    8f,
                    8f,
                    paint
            );

            paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
            paint.setTextAlign(Paint.Align.LEFT);
            paint.setTextSize(17f);
            paint.setColor(
                    holiday || column == 0
                            ? Color.rgb(220, 38, 38)
                            : column == 6
                            ? Color.rgb(37, 99, 235)
                            : Color.rgb(51, 65, 85)
            );
            canvas.drawText(String.valueOf(day), left + 7f, top + 20f, paint);

            if (!tag.isEmpty()) {
                paint.setTextAlign(Paint.Align.RIGHT);
                paint.setTextSize(14f);
                paint.setColor(tagColor(tag));
                canvas.drawText(tagLabel(tag), right - 6f, top + 19f, paint);
            }

            String shiftLabel = shift == null
                    ? "-"
                    : shift.optString("short", shift.optString("label", shiftKey));
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(shiftColor);
            RectF pill = new RectF(left + 7f, top + 29f, right - 7f, top + 55f);
            canvas.drawRoundRect(pill, 7f, 7f, paint);
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setTextSize(16f);
            paint.setColor(Color.WHITE);
            paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
            canvas.drawText(
                    trimLabel(shiftLabel),
                    left + columnWidth / 2f,
                    top + 48f,
                    paint
            );

            if (hasMemo) {
                paint.setColor(Color.rgb(245, 158, 11));
                canvas.drawCircle(right - 10f, bottom - 10f, 4f, paint);
            }

            if (currentMonth && today.get(Calendar.DAY_OF_MONTH) == day) {
                paint.setStyle(Paint.Style.STROKE);
                paint.setStrokeWidth(3f);
                paint.setColor(Color.rgb(79, 70, 229));
                canvas.drawRoundRect(
                        new RectF(left + 2f, top + 2f, right - 2f, bottom - 2f),
                        8f,
                        8f,
                        paint
                );
                paint.setStyle(Paint.Style.FILL);
            }
        }
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
        String time = start.isEmpty() ? "" : " · " + start + "~" + end;
        return String.format(
                Locale.KOREA,
                "%s조 · 오늘 %d일 · %s%s",
                group,
                now.get(Calendar.DAY_OF_MONTH),
                label,
                time
        );
    }

    private static void drawEmpty(Canvas canvas, Paint paint) {
        paint.setTextAlign(Paint.Align.CENTER);
        paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        paint.setColor(Color.rgb(71, 85, 105));
        paint.setTextSize(25f);
        canvas.drawText("교대 캘린더", WIDTH / 2f, HEIGHT / 2f - 10f, paint);
        paint.setTypeface(Typeface.DEFAULT);
        paint.setColor(Color.rgb(100, 116, 139));
        paint.setTextSize(18f);
        canvas.drawText("앱을 한 번 열면 근무표가 표시됩니다", WIDTH / 2f, HEIGHT / 2f + 25f, paint);
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
}
