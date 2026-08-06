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

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

final class CalendarWidgetRenderer {
    private static final int WIDTH = 560;
    private static final int DEFAULT_HEIGHT = 440;
    private static final int MIN_HEIGHT = 350;
    private static final int MAX_HEIGHT = 520;
    private static final int DEFAULT_WEEK_HEIGHT = 200;
    private static final int MIN_WEEK_HEIGHT = 180;
    private static final int MAX_WEEK_HEIGHT = 240;
    private static final float RENDER_SCALE = 2.5f;
    private static final int WEEK_HEIGHT = 32;
    private static final int ROWS = 6;
    /*
     * 6행 7열 큰 달력 위젯입니다. 칸마다 메모를 두 줄까지 보여 주려면
     * 기본 월간 위젯(560)보다 넓어야 합니다.
     */
    private static final int MONTH_ALL_WIDTH = 700;
    /*
     * 이 위젯은 화면 폭을 거의 다 쓰므로 1.7배면 기기 픽셀보다 촘촘합니다.
     * 배율을 더 올리면 RemoteViews 비트맵이 기존 위젯보다 커져 안전하지 않습니다.
     */
    private static final float MONTH_ALL_RENDER_SCALE = 1.7f;
    private static final int MONTH_ALL_DEFAULT_HEIGHT = 760;
    private static final int MONTH_ALL_MIN_HEIGHT = 600;
    private static final int MONTH_ALL_MAX_HEIGHT = 950;
    private static final float MONTH_ALL_HEADER_HEIGHT = 30f;
    /*
     * 아래쪽 4개 조 띠는 한 주(7일)만 보여 줍니다.
     * 한 달 31일을 한 줄에 밀어 넣으면 칸이 20px 남짓이라 근무 글자를 읽을 수 없었습니다.
     * 7일만 그리면 같은 자리에서 칸이 4배 넓어져 근무 이름이 그대로 들어갑니다.
     */
    private static final float MONTH_ALL_BAND_MIN = 140f;
    private static final float MONTH_ALL_BAND_MAX = 220f;
    private static final float MONTH_ALL_BAND_RATIO = 0.25f;
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
        /** 4개 조 띠가 지금 보여 주는 주간 범위입니다. 위젯의 주간 이동 줄에 그대로 씁니다. */
        final String weekLabel;

        Result(Bitmap bitmap, String footer) {
            this(bitmap, footer, "");
        }

        Result(Bitmap bitmap, String footer, String weekLabel) {
            this.bitmap = bitmap;
            this.footer = footer;
            this.weekLabel = weekLabel;
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
        int bitmapHeight = calendarHeight(widgetWidthDp, widgetHeightDp);
        Bitmap bitmap = Bitmap.createBitmap(
                Math.round(WIDTH * RENDER_SCALE),
                Math.round(bitmapHeight * RENDER_SCALE),
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
        int height = prepareContentCanvas(
                canvas,
                WIDTH,
                bitmapHeight,
                MIN_HEIGHT,
                MAX_HEIGHT
        );

        JSONObject root = payload(context);
        JSONArray days = monthDays(root, year, month, group);
        if (root == null || days == null) {
            drawEmpty(canvas, paint, WIDTH, height);
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
        drawWeekdays(canvas, paint, WIDTH);
        drawMonth(canvas, paint, shifts, days, year, month, height);
        return new Result(bitmap, todaySummary(root, group));
    }

    static Result renderWeek(
            Context context,
            Calendar weekStart,
            String activeGroup,
            int widgetWidthDp,
            int widgetHeightDp
    ) {
        int bitmapHeight = weekHeight(widgetWidthDp, widgetHeightDp);
        Bitmap bitmap = Bitmap.createBitmap(
                Math.round(WIDTH * RENDER_SCALE),
                Math.round(bitmapHeight * RENDER_SCALE),
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
        int height = prepareContentCanvas(
                canvas,
                WIDTH,
                bitmapHeight,
                MIN_WEEK_HEIGHT,
                MAX_WEEK_HEIGHT
        );

        JSONObject root = payload(context);
        if (root == null) {
            drawEmpty(canvas, paint, WIDTH, height);
            return new Result(bitmap, "앱을 열어 근무표를 동기화해 주세요");
        }
        drawWeekGroups(
                canvas,
                paint,
                root,
                root.optJSONObject("shifts"),
                weekStart,
                activeGroup,
                height
        );
        return new Result(bitmap, "");
    }

    /** 이 달의 달력이 몇 줄(주)을 쓰는지입니다. 주간 이동 범위를 정할 때 씁니다. */
    static int weekRowCount(int year, int month) {
        Calendar first = Calendar.getInstance();
        first.set(year, month, 1, 12, 0, 0);
        int firstColumn = first.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY;
        int daysInMonth = first.getActualMaximum(Calendar.DAY_OF_MONTH);
        return (int) Math.ceil((firstColumn + daysInMonth) / 7f);
    }

    /** 오늘이 이 달의 몇 번째 줄에 있는지입니다. 다른 달이면 첫 줄을 씁니다. */
    static int weekRowOfToday(int year, int month) {
        Calendar today = Calendar.getInstance();
        if (today.get(Calendar.YEAR) != year || today.get(Calendar.MONTH) != month) {
            return 0;
        }
        Calendar first = Calendar.getInstance();
        first.set(year, month, 1, 12, 0, 0);
        int firstColumn = first.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY;
        return (firstColumn + today.get(Calendar.DAY_OF_MONTH) - 1) / 7;
    }

    /** 달력 weekIndex 줄의 맨 왼쪽(일요일) 날짜입니다. 지난달 날짜일 수도 있습니다. */
    private static Calendar weekStartDate(int year, int month, int weekIndex) {
        Calendar date = Calendar.getInstance();
        date.set(year, month, 1, 12, 0, 0);
        date.set(Calendar.MILLISECOND, 0);
        int firstColumn = date.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY;
        date.add(Calendar.DAY_OF_MONTH, weekIndex * 7 - firstColumn);
        return date;
    }

    /**
     * 6행 7열 큰 달력 위젯입니다.
     * 위쪽은 메모가 그대로 보이는 내 조 달력, 아래쪽은 네 개 조를 나란히 보여 주는 띠입니다.
     * 띠는 weekIndex 줄(한 주)만 그리고, 위 달력에서 그 줄을 함께 표시해 둘을 이어 줍니다.
     */
    static Result renderMonthAllGroups(
            Context context,
            int year,
            int month,
            String activeGroup,
            int weekIndex,
            int widgetWidthDp,
            int widgetHeightDp
    ) {
        int weekRow = Math.max(0, Math.min(weekRowCount(year, month) - 1, weekIndex));
        int bitmapHeight = fittedBitmapHeight(
                MONTH_ALL_WIDTH,
                widgetWidthDp,
                widgetHeightDp,
                20f,
                /* 위아래 여백 17 + 달 이동 줄 40 + 이미지 여백 7 + 아래 요약·주간 이동 줄 34 */
                98f,
                MONTH_ALL_DEFAULT_HEIGHT
        );
        Bitmap bitmap = Bitmap.createBitmap(
                Math.round(MONTH_ALL_WIDTH * MONTH_ALL_RENDER_SCALE),
                Math.round(bitmapHeight * MONTH_ALL_RENDER_SCALE),
                Bitmap.Config.ARGB_8888
        );
        Canvas canvas = new Canvas(bitmap);
        canvas.scale(MONTH_ALL_RENDER_SCALE, MONTH_ALL_RENDER_SCALE);
        Paint paint = new Paint(
                Paint.ANTI_ALIAS_FLAG
                        | Paint.SUBPIXEL_TEXT_FLAG
                        | Paint.DITHER_FLAG
                        | Paint.FILTER_BITMAP_FLAG
        );
        canvas.drawColor(COLOR_SURFACE);
        int height = prepareContentCanvas(
                canvas,
                MONTH_ALL_WIDTH,
                bitmapHeight,
                MONTH_ALL_MIN_HEIGHT,
                MONTH_ALL_MAX_HEIGHT
        );

        Calendar weekStart = weekStartDate(year, month, weekRow);
        String weekLabel = weekRangeLabel(weekStart);

        JSONObject root = payload(context);
        JSONArray days = monthDays(root, year, month, activeGroup);
        if (root == null || days == null) {
            drawEmpty(canvas, paint, MONTH_ALL_WIDTH, height);
            return new Result(bitmap, "앱을 열어 달력을 동기화해 주세요", weekLabel);
        }
        JSONObject shifts = root.optJSONObject("shifts");

        /* 위쪽은 메모까지 보이는 내 조 달력, 아래쪽은 그중 한 주의 네 개 조 비교입니다. */
        float bandHeight = Math.min(
                MONTH_ALL_BAND_MAX,
                Math.max(MONTH_ALL_BAND_MIN, height * MONTH_ALL_BAND_RATIO)
        );
        float calendarHeight = height - bandHeight;

        drawWeekdays(canvas, paint, MONTH_ALL_WIDTH);
        drawMonthWithMemos(
                canvas,
                paint,
                shifts,
                days,
                year,
                month,
                weekRow,
                MONTH_ALL_WIDTH,
                calendarHeight
        );

        /* 띠가 카드로 그려지므로 구분선을 따로 긋지 않습니다(선이 겹치면 지저분해집니다). */
        int bandSave = canvas.save();
        canvas.translate(0f, calendarHeight + 4f);
        drawGroupWeekBand(
                canvas,
                paint,
                root,
                shifts,
                weekStart,
                activeGroup,
                weekLabel,
                MONTH_ALL_WIDTH,
                bandHeight - 6f
        );
        canvas.restoreToCount(bandSave);

        return new Result(bitmap, todaySummary(root, activeGroup), weekLabel);
    }

    /** 주간 이동 줄에 쓰는 "8/3 ~ 8/9" 형태의 범위 문구입니다. */
    private static String weekRangeLabel(Calendar weekStart) {
        Calendar end = (Calendar) weekStart.clone();
        end.add(Calendar.DAY_OF_MONTH, 6);
        return String.format(
                Locale.KOREA,
                "%d/%d ~ %d/%d",
                weekStart.get(Calendar.MONTH) + 1,
                weekStart.get(Calendar.DAY_OF_MONTH),
                end.get(Calendar.MONTH) + 1,
                end.get(Calendar.DAY_OF_MONTH)
        );
    }

    /**
     * 큰 달력 본문입니다. 기본 월간 위젯보다 칸이 넓으므로
     * 근무 배지 아래에 메모를 두 줄까지 그대로 보여 줍니다.
     */
    private static void drawMonthWithMemos(
            Canvas canvas,
            Paint paint,
            JSONObject shifts,
            JSONArray days,
            int year,
            int month,
            int highlightRow,
            float width,
            float height
    ) {
        Calendar first = Calendar.getInstance();
        first.set(year, month, 1, 12, 0, 0);
        int firstColumn = first.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY;
        int daysInMonth = first.getActualMaximum(Calendar.DAY_OF_MONTH);
        float columnWidth = width / 7f;
        float rowHeight = (height - MONTH_ALL_HEADER_HEIGHT) / ROWS;

        Calendar today = Calendar.getInstance();
        boolean currentMonth =
                today.get(Calendar.YEAR) == year && today.get(Calendar.MONTH) == month;

        /*
         * 아래 띠가 보여 주는 줄을 달력에서도 옅게 칠해 둡니다.
         * 이게 없으면 띠의 7일이 달력의 어느 줄인지 눈으로 찾아야 합니다.
         */
        if (highlightRow >= 0 && highlightRow < ROWS) {
            float top = MONTH_ALL_HEADER_HEIGHT + highlightRow * rowHeight;
            RectF row = new RectF(0f, top, width, top + rowHeight);
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(blendWithWhite(COLOR_BRAND, 0.93f));
            canvas.drawRoundRect(row, 8f, 8f, paint);
        }

        for (int day = 1; day <= daysInMonth; day++) {
            int position = firstColumn + day - 1;
            int row = position / 7;
            int column = position % 7;
            float left = column * columnWidth;
            float top = MONTH_ALL_HEADER_HEIGHT + row * rowHeight;
            float right = left + columnWidth;
            float bottom = top + rowHeight;

            JSONArray entry = days.optJSONArray(day - 1);
            String shiftKey = entry == null ? "" : entry.optString(0, "");
            String tag = entry == null ? "" : entry.optString(1, "");
            String memo = memoText(entry);
            boolean holiday = entry != null && entry.optInt(4, 0) == 1;
            JSONObject shift = shifts == null ? null : shifts.optJSONObject(shiftKey);
            int shiftColor = parseColor(
                    shift == null ? "#94a3b8" : shift.optString("color", "#94a3b8")
            );

            RectF cell = new RectF(left + 3f, top + 3f, right - 3f, bottom - 3f);
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(blendWithWhite(shiftColor, 0.10f));
            canvas.drawRoundRect(cell, 10f, 10f, paint);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(1f);
            paint.setColor(COLOR_LINE);
            canvas.drawRoundRect(cell, 10f, 10f, paint);
            paint.setStyle(Paint.Style.FILL);

            int cellSave = canvas.save();
            canvas.clipRect(cell.left + 1f, cell.top + 1f, cell.right - 1f, cell.bottom - 1f);

            paint.setTypeface(TYPEFACE_BOLD);
            paint.setTextAlign(Paint.Align.LEFT);
            paint.setTextSize(16f);
            paint.setColor(
                    holiday || column == 0
                            ? COLOR_SUNDAY
                            : column == 6
                            ? COLOR_SATURDAY
                            : COLOR_INK
            );
            canvas.drawText(String.valueOf(day), left + 9f, top + 21f, paint);
            if (!tag.isEmpty()) {
                drawTag(canvas, paint, tag, right - 7f, top + 6f, false);
            }

            float pillTop = top + 27f;
            float pillHeight = Math.min(26f, Math.max(17f, rowHeight * 0.26f));
            RectF pill = new RectF(left + 7f, pillTop, right - 7f, pillTop + pillHeight);
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(shiftColor);
            canvas.drawRoundRect(pill, 8f, 8f, paint);
            String shiftLabel = shift == null
                    ? "-"
                    : shift.optString("short", shift.optString("label", shiftKey));
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setTypeface(TYPEFACE_BOLD);
            paint.setTextSize(13f);
            paint.setColor(Color.WHITE);
            canvas.drawText(
                    ellipsize(paint, trimLabel(shiftLabel), pill.width() - 8f),
                    pill.centerX(),
                    pill.centerY() - (paint.ascent() + paint.descent()) / 2f,
                    paint
            );

            if (!memo.isEmpty()) {
                float memoTop = pill.bottom + 4f;
                float lineHeight = 12f;
                int roomForLines = (int) Math.floor((bottom - 5f - memoTop) / lineHeight);
                if (roomForLines >= 1) {
                    /* 점을 먼저 찍어 두면 달력이 빽빽해도 메모가 있는 날을 바로 찾습니다. */
                    paint.setStyle(Paint.Style.FILL);
                    paint.setColor(COLOR_MEMO);
                    canvas.drawCircle(left + 11f, memoTop + 4.5f, 2.4f, paint);

                    paint.setTypeface(TYPEFACE_MEDIUM);
                    paint.setTextAlign(Paint.Align.LEFT);
                    paint.setTextSize(10f);
                    paint.setColor(COLOR_INK_SOFT);
                    String[] lines = wrapMemo(
                            paint,
                            memo,
                            columnWidth - 26f,
                            Math.min(2, roomForLines)
                    );
                    for (int line = 0; line < lines.length; line++) {
                        canvas.drawText(
                                lines[line],
                                left + 17f,
                                memoTop + 8f + line * lineHeight,
                                paint
                        );
                    }
                }
            }

            canvas.restoreToCount(cellSave);

            if (currentMonth && today.get(Calendar.DAY_OF_MONTH) == day) {
                paint.setStyle(Paint.Style.STROKE);
                paint.setStrokeWidth(2.6f);
                paint.setColor(COLOR_BRAND);
                canvas.drawRoundRect(cell, 10f, 10f, paint);
                paint.setStyle(Paint.Style.FILL);
            }
        }
    }

    /** 메모를 칸 너비에 맞춰 최대 maxLines 줄로 자릅니다. 마지막 줄은 …로 끝냅니다. */
    private static String[] wrapMemo(Paint paint, String memo, float maxWidth, int maxLines) {
        if (maxLines <= 1) {
            return new String[]{ellipsize(paint, memo, maxWidth)};
        }
        List<String> lines = new ArrayList<>();
        int start = 0;
        while (start < memo.length() && lines.size() < maxLines) {
            int fit = 0;
            while (start + fit + 1 <= memo.length()
                    && paint.measureText(memo, start, start + fit + 1) <= maxWidth) {
                fit++;
            }
            int end = Math.min(memo.length(), start + Math.max(1, fit));
            boolean lastLine = lines.size() == maxLines - 1;
            if (lastLine && end < memo.length()) {
                lines.add(ellipsize(paint, memo.substring(start), maxWidth));
                break;
            }
            lines.add(memo.substring(start, end));
            start = end;
        }
        return lines.toArray(new String[0]);
    }

    /**
     * 달력 아래에 붙는 4개 조 비교 카드입니다.
     * 한 달 31일을 한 줄에 밀어 넣지 않고 한 주(7일)만 그리므로
     * 칸이 네 배 넓어지고, 이니셜 한 글자 대신 근무 이름이 그대로 들어갑니다.
     * 보고 있는 주는 카드 머리글과 위 달력의 옅은 칠로 함께 알려 줍니다.
     */
    private static void drawGroupWeekBand(
            Canvas canvas,
            Paint paint,
            JSONObject root,
            JSONObject shifts,
            Calendar weekStart,
            String activeGroup,
            String weekLabel,
            float width,
            float height
    ) {
        /* 카드로 감싸면 달력과 구분되어 구분선을 따로 긋지 않아도 됩니다. */
        RectF card = new RectF(0f, 0f, width, height);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.rgb(248, 249, 252));
        canvas.drawRoundRect(card, 13f, 13f, paint);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1f);
        paint.setColor(COLOR_LINE);
        canvas.drawRoundRect(card, 13f, 13f, paint);
        paint.setStyle(Paint.Style.FILL);

        /* 위젯을 작게 줄이면 여백과 머리글이 칸을 다 먹습니다. 높이에 맞춰 같이 줄입니다. */
        final float padding = Math.max(5f, Math.min(8f, height * 0.045f));
        final float labelWidth = 30f;
        final float titleHeight = Math.max(13f, Math.min(17f, height * 0.10f));
        final float daysHeight = Math.max(12.5f, Math.min(16f, height * 0.09f));
        final float left0 = padding;
        final float right0 = width - padding;
        final float columnWidth = (right0 - left0 - labelWidth) / 7f;
        final float rowsTop = padding + titleHeight + daysHeight;
        final float rowHeight = (height - padding - rowsTop) / GROUPS.length;

        Calendar today = Calendar.getInstance();
        int todayColumn = -1;
        for (int column = 0; column < 7; column++) {
            Calendar date = (Calendar) weekStart.clone();
            date.add(Calendar.DAY_OF_MONTH, column);
            if (sameDate(date, today)) {
                todayColumn = column;
                break;
            }
        }

        /* 카드 머리글 — 어느 주를 보고 있는지. 위젯 바깥에 줄을 하나 더 두지 않으려고 여기 넣습니다. */
        paint.setTypeface(TYPEFACE_BOLD);
        paint.setTextAlign(Paint.Align.LEFT);
        paint.setTextSize(12f);
        paint.setColor(COLOR_INK);
        canvas.drawText(weekLabel, left0, padding + 12f, paint);
        paint.setTypeface(TYPEFACE_MEDIUM);
        paint.setTextAlign(Paint.Align.RIGHT);
        paint.setTextSize(10f);
        paint.setColor(COLOR_INK_SOFT);
        canvas.drawText("4개 조 비교", right0, padding + 12f, paint);

        float gridTop = padding + titleHeight;
        float gridBottom = height - padding;

        if (todayColumn >= 0) {
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(blendWithWhite(COLOR_BRAND, 0.90f));
            canvas.drawRoundRect(
                    new RectF(
                            left0 + labelWidth + todayColumn * columnWidth + 1f,
                            gridTop,
                            left0 + labelWidth + (todayColumn + 1) * columnWidth - 1f,
                            gridBottom
                    ),
                    8f,
                    8f,
                    paint
            );
        }

        /* 요일과 날짜 — 카드가 위 달력과 다른 주를 보여 줄 수 있으므로 여기에도 적습니다. */
        for (int column = 0; column < 7; column++) {
            Calendar date = (Calendar) weekStart.clone();
            date.add(Calendar.DAY_OF_MONTH, column);
            int weekday = date.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY;
            paint.setTypeface(TYPEFACE_BOLD);
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setTextSize(10.5f);
            paint.setColor(
                    column == todayColumn ? COLOR_BRAND
                            : weekday == 0 ? COLOR_SUNDAY
                            : weekday == 6 ? COLOR_SATURDAY
                            : COLOR_INK_SOFT
            );
            canvas.drawText(
                    String.format(
                            Locale.KOREA,
                            "%s %d",
                            WEEKDAYS[weekday],
                            date.get(Calendar.DAY_OF_MONTH)
                    ),
                    left0 + labelWidth + (column + 0.5f) * columnWidth,
                    gridTop + 12f,
                    paint
            );
        }

        for (int row = 0; row < GROUPS.length; row++) {
            String group = GROUPS[row];
            float top = rowsTop + row * rowHeight;
            float bottom = top + rowHeight;
            boolean selected = group.equals(activeGroup);

            paint.setStyle(Paint.Style.FILL);
            paint.setColor(selected ? COLOR_BRAND : Color.rgb(233, 236, 243));
            canvas.drawRoundRect(
                    new RectF(left0, top + 2.5f, left0 + labelWidth - 7f, bottom - 2.5f),
                    7f,
                    7f,
                    paint
            );
            paint.setTypeface(TYPEFACE_BOLD);
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setTextSize(11.5f);
            paint.setColor(selected ? Color.WHITE : COLOR_INK_SOFT);
            canvas.drawText(
                    group,
                    left0 + (labelWidth - 7f) / 2f,
                    (top + bottom) / 2f - (paint.ascent() + paint.descent()) / 2f,
                    paint
            );

            for (int column = 0; column < 7; column++) {
                Calendar date = (Calendar) weekStart.clone();
                date.add(Calendar.DAY_OF_MONTH, column);
                JSONArray entry = dayEntry(root, date, group);
                String shiftKey = entry == null ? "" : entry.optString(0, "");
                JSONObject shift = shifts == null ? null : shifts.optJSONObject(shiftKey);
                int shiftColor = parseColor(
                        shift == null ? "#94a3b8" : shift.optString("color", "#94a3b8")
                );
                float left = left0 + labelWidth + column * columnWidth;
                RectF cell = new RectF(
                        left + 2f,
                        top + 2.5f,
                        left + columnWidth - 2f,
                        bottom - 2.5f
                );

                /* 내 조만 색을 꽉 채웁니다. 네 줄을 함께 봐도 내 줄이 먼저 눈에 들어옵니다. */
                paint.setStyle(Paint.Style.FILL);
                paint.setColor(selected ? shiftColor : blendWithWhite(shiftColor, 0.82f));
                canvas.drawRoundRect(cell, 7f, 7f, paint);

                String label = shift == null
                        ? "-"
                        : shift.optString("short", shift.optString("label", shiftKey));
                paint.setTypeface(TYPEFACE_BOLD);
                paint.setTextAlign(Paint.Align.CENTER);
                paint.setTextSize(Math.min(14.5f, Math.max(9f, rowHeight * 0.44f)));
                paint.setColor(selected ? Color.WHITE : blendWithBlack(shiftColor, 0.42f));
                canvas.drawText(
                        ellipsize(paint, trimLabel(label), cell.width() - 6f),
                        cell.centerX(),
                        cell.centerY() - (paint.ascent() + paint.descent()) / 2f,
                        paint
                );
            }
        }

        if (todayColumn >= 0) {
            float left = left0 + labelWidth + todayColumn * columnWidth;
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(1.6f);
            paint.setColor(COLOR_BRAND);
            canvas.drawRoundRect(
                    new RectF(left + 0.5f, gridTop + 0.5f, left + columnWidth - 0.5f, gridBottom - 0.5f),
                    8f,
                    8f,
                    paint
            );
            paint.setStyle(Paint.Style.FILL);
        }
    }

    private static void drawWeekGroups(
            Canvas canvas,
            Paint paint,
            JSONObject root,
            JSONObject shifts,
            Calendar weekStart,
            String activeGroup,
            int height
    ) {
        final float labelWidth = 48f;
        final float headerHeight = 38f;
        final float columnWidth = (WIDTH - labelWidth) / 7f;
        final float rowHeight = (height - headerHeight) / 4f;
        Calendar today = Calendar.getInstance();

        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.rgb(246, 247, 251));
        canvas.drawRoundRect(new RectF(0f, 0f, labelWidth, height), 9f, 9f, paint);
        paint.setTextAlign(Paint.Align.CENTER);
        paint.setTypeface(TYPEFACE_BOLD);
        paint.setTextSize(8.5f);
        paint.setColor(COLOR_INK_SOFT);
        canvas.drawText("조", labelWidth / 2f, 23f, paint);

        for (int column = 0; column < 7; column++) {
            Calendar date = (Calendar) weekStart.clone();
            date.add(Calendar.DAY_OF_MONTH, column);
            float centerX = labelWidth + (column + 0.5f) * columnWidth;
            boolean isToday = sameDate(date, today);
            if (isToday) {
                paint.setColor(Color.rgb(239, 240, 255));
                canvas.drawRoundRect(
                        new RectF(
                                labelWidth + column * columnWidth + 2f,
                                2f,
                                labelWidth + (column + 1) * columnWidth - 2f,
                                height - 2f
                        ),
                        8f,
                        8f,
                        paint
                );
            }

            int weekday = date.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY;
            paint.setTypeface(TYPEFACE_BOLD);
            paint.setTextSize(9f);
            paint.setColor(
                    weekday == 0 ? COLOR_SUNDAY
                            : weekday == 6 ? COLOR_SATURDAY
                            : COLOR_INK_SOFT
            );
            canvas.drawText(WEEKDAYS[weekday], centerX, 12f, paint);
            paint.setTextSize(11.5f);
            paint.setColor(
                    weekday == 0 ? COLOR_SUNDAY
                            : weekday == 6 ? COLOR_SATURDAY
                            : COLOR_INK
            );
            canvas.drawText(
                    String.format(Locale.KOREA, "%d/%d", date.get(Calendar.MONTH) + 1,
                            date.get(Calendar.DAY_OF_MONTH)),
                    centerX,
                    29f,
                    paint
            );
        }

        for (int row = 0; row < GROUPS.length; row++) {
            String group = GROUPS[row];
            float top = headerHeight + row * rowHeight;
            float bottom = top + rowHeight;
            boolean selected = group.equals(activeGroup);
            paint.setColor(selected ? COLOR_BRAND : Color.rgb(235, 238, 245));
            canvas.drawRoundRect(
                    new RectF(5f, top + 5f, labelWidth - 5f, bottom - 5f),
                    8f,
                    8f,
                    paint
            );
            paint.setTypeface(TYPEFACE_BOLD);
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setTextSize(12f);
            paint.setColor(selected ? Color.WHITE : COLOR_INK);
            canvas.drawText(
                    group + "조",
                    labelWidth / 2f,
                    top + rowHeight / 2f - (paint.ascent() + paint.descent()) / 2f,
                    paint
            );

            for (int column = 0; column < 7; column++) {
                Calendar date = (Calendar) weekStart.clone();
                date.add(Calendar.DAY_OF_MONTH, column);
                JSONArray entry = dayEntry(root, date, group);
                String shiftKey = entry == null ? "" : entry.optString(0, "");
                JSONObject shift = shifts == null ? null : shifts.optJSONObject(shiftKey);
                int shiftColor = parseColor(
                        shift == null ? "#94a3b8" : shift.optString("color", "#94a3b8")
                );
                float left = labelWidth + column * columnWidth;
                float right = left + columnWidth;
                RectF cell = new RectF(left + 2.5f, top + 3f, right - 2.5f, bottom - 3f);

                paint.setStyle(Paint.Style.FILL);
                paint.setColor(blendWithWhite(shiftColor, 0.10f));
                canvas.drawRoundRect(cell, 7f, 7f, paint);
                paint.setStyle(Paint.Style.STROKE);
                paint.setStrokeWidth(sameDate(date, today) ? 2.2f : 0.8f);
                paint.setColor(sameDate(date, today) ? COLOR_BRAND : COLOR_LINE);
                canvas.drawRoundRect(cell, 7f, 7f, paint);
                paint.setStyle(Paint.Style.FILL);

                String label = shift == null
                        ? "-"
                        : shift.optString("short", shift.optString("label", shiftKey));
                float badgeHeight = Math.min(25f, rowHeight - 13f);
                float badgeTop = top + (rowHeight - badgeHeight) / 2f;
                RectF badge = new RectF(
                        left + 7f,
                        badgeTop,
                        right - 7f,
                        badgeTop + badgeHeight
                );
                paint.setColor(shiftColor);
                canvas.drawRoundRect(badge, 6f, 6f, paint);
                paint.setTypeface(TYPEFACE_BOLD);
                paint.setTextAlign(Paint.Align.CENTER);
                paint.setTextSize(11.5f);
                paint.setColor(Color.WHITE);
                canvas.drawText(
                        ellipsize(paint, trimLabel(label), columnWidth - 18f),
                        badge.centerX(),
                        badge.centerY() - (paint.ascent() + paint.descent()) / 2f,
                        paint
                );
            }
        }
    }

    private static JSONArray dayEntry(JSONObject root, Calendar date, String group) {
        JSONArray days = monthDays(
                root,
                date.get(Calendar.YEAR),
                date.get(Calendar.MONTH),
                group
        );
        return days == null ? null : days.optJSONArray(date.get(Calendar.DAY_OF_MONTH) - 1);
    }

    private static boolean sameDate(Calendar first, Calendar second) {
        return first.get(Calendar.YEAR) == second.get(Calendar.YEAR)
                && first.get(Calendar.DAY_OF_YEAR) == second.get(Calendar.DAY_OF_YEAR);
    }

    private static int calendarHeight(int widgetWidthDp, int widgetHeightDp) {
        return fittedBitmapHeight(
                WIDTH,
                widgetWidthDp,
                widgetHeightDp,
                22f,
                105f,
                DEFAULT_HEIGHT
        );
    }

    private static int weekHeight(int widgetWidthDp, int widgetHeightDp) {
        return fittedBitmapHeight(
                WIDTH,
                widgetWidthDp,
                widgetHeightDp,
                18f,
                42f,
                DEFAULT_WEEK_HEIGHT
        );
    }

    /** ImageView의 실제 내용 박스와 같은 종횡비로 비트맵을 만듭니다. */
    private static int fittedBitmapHeight(
            int contentWidth,
            int widgetWidthDp,
            int widgetHeightDp,
            float horizontalChromeDp,
            float verticalChromeDp,
            int fallback
    ) {
        if (widgetWidthDp <= 0 || widgetHeightDp <= 0) {
            return fallback;
        }
        float availableWidth = Math.max(1f, widgetWidthDp - horizontalChromeDp);
        float availableHeight = Math.max(1f, widgetHeightDp - verticalChromeDp);
        return Math.max(1, Math.round(contentWidth * availableHeight / availableWidth));
    }

    /**
     * 너무 낮은 칸에서는 검증된 최소 레이아웃을 균일 축소하고 좌우 중앙에 둡니다.
     * 따라서 날짜 셀 좌표는 유지하면서 가로·세로 배율이 달라지는 찌그러짐만 막습니다.
     */
    private static int prepareContentCanvas(
            Canvas canvas,
            int contentWidth,
            int bitmapHeight,
            int minContentHeight,
            int maxContentHeight
    ) {
        int contentHeight = Math.max(
                minContentHeight,
                Math.min(maxContentHeight, bitmapHeight)
        );
        float scale = Math.min(1f, bitmapHeight / (float) contentHeight);
        float scaledWidth = contentWidth * scale;
        float scaledHeight = contentHeight * scale;
        canvas.translate(
                (contentWidth - scaledWidth) / 2f,
                Math.max(0f, (bitmapHeight - scaledHeight) / 2f)
        );
        canvas.scale(scale, scale);
        return contentHeight;
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

    private static void drawWeekdays(Canvas canvas, Paint paint, float width) {
        float columnWidth = width / 7f;
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

            /*
             * 낮은 위젯에서는 날짜, 근무 배지, 메모가 같은 세로 구간을 사용하지 않도록
             * 셀을 세 구역으로 분리합니다. 모든 텍스트는 셀 안에서만 그려집니다.
             */
            boolean compactCell = rowHeight < 60f;
            int cellSave = canvas.save();
            canvas.clipRect(cell.left + 1f, cell.top + 1f, cell.right - 1f, cell.bottom - 1f);

            paint.setTypeface(TYPEFACE_BOLD);
            paint.setTextAlign(Paint.Align.LEFT);
            paint.setTextSize(compactCell ? 12.5f : 14f);
            paint.setColor(
                    holiday || column == 0
                            ? COLOR_SUNDAY
                            : column == 6
                            ? COLOR_SATURDAY
                            : COLOR_INK
            );
            float dateBaseline = top + (compactCell ? 16f : 19f);
            canvas.drawText(String.valueOf(day), left + 7f, dateBaseline, paint);

            if (!tag.isEmpty()) {
                drawTag(
                        canvas,
                        paint,
                        tag,
                        right - 6f,
                        top + (compactCell ? 4f : 6f),
                        compactCell
                );
            }

            String shiftLabel = shift == null
                    ? "-"
                    : shift.optString("short", shift.optString("label", shiftKey));
            float badgeTop = top + (compactCell ? 21f : 26f);
            float memoBand = hasMemo ? (compactCell ? 13f : 16f) : 6f;
            float badgeBottom = Math.min(
                    badgeTop + (compactCell ? 18f : 22f),
                    bottom - memoBand
            );
            badgeBottom = Math.max(badgeTop + 13f, badgeBottom);
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(shiftColor);
            RectF pill = new RectF(left + 6f, badgeTop, right - 6f, badgeBottom);
            canvas.drawRoundRect(pill, compactCell ? 6f : 7f, compactCell ? 6f : 7f, paint);
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setTextSize(compactCell ? 11f : 12.5f);
            paint.setColor(Color.WHITE);
            paint.setTypeface(TYPEFACE_BOLD);
            canvas.drawText(
                    ellipsize(paint, trimLabel(shiftLabel), pill.width() - 8f),
                    left + columnWidth / 2f,
                    pill.centerY() - (paint.ascent() + paint.descent()) / 2f,
                    paint
            );

            if (hasMemo) {
                paint.setColor(COLOR_MEMO);
                float memoBaseline = bottom - (compactCell ? 5f : 7f);
                canvas.drawCircle(left + 9f, memoBaseline - 2.3f, compactCell ? 2f : 2.4f, paint);
                boolean showMemoText = !memo.isEmpty()
                        && rowHeight >= 49f
                        && columnWidth >= 66f;
                if (showMemoText) {
                    paint.setTextAlign(Paint.Align.LEFT);
                    paint.setTypeface(TYPEFACE_MEDIUM);
                    paint.setTextSize(compactCell ? 7.4f : 8.6f);
                    paint.setColor(COLOR_INK_SOFT);
                    canvas.drawText(
                            ellipsize(paint, memo, columnWidth - 22f),
                            left + 14f,
                            memoBaseline,
                            paint
                    );
                }
            }

            canvas.restoreToCount(cellSave);

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
            float top,
            boolean compact
    ) {
        String label = tagLabel(tag);
        int color = tagColor(tag);
        paint.setTypeface(TYPEFACE_BOLD);
        paint.setTextSize(compact ? 7.8f : 9f);
        float width = paint.measureText(label) + (compact ? 7f : 8f);
        float height = compact ? 11f : 13f;
        RectF badge = new RectF(right - width, top, right, top + height);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(blendWithWhite(color, 0.11f));
        canvas.drawRoundRect(badge, 4f, 4f, paint);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(0.8f);
        paint.setColor(blendWithWhite(color, 0.46f));
        canvas.drawRoundRect(badge, 4f, 4f, paint);
        paint.setStyle(Paint.Style.FILL);
        paint.setTextAlign(Paint.Align.CENTER);
        paint.setColor(color);
        canvas.drawText(
                label,
                badge.centerX(),
                badge.centerY() - (paint.ascent() + paint.descent()) / 2f,
                paint
        );
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

    private static void drawEmpty(Canvas canvas, Paint paint, int width, int height) {
        paint.setTextAlign(Paint.Align.CENTER);
        paint.setTypeface(TYPEFACE_BOLD);
        paint.setColor(COLOR_INK);
        paint.setTextSize(25f);
        canvas.drawText("교대캘린더", width / 2f, height / 2f - 10f, paint);
        paint.setTypeface(TYPEFACE_REGULAR);
        paint.setColor(COLOR_INK_SOFT);
        paint.setTextSize(18f);
        canvas.drawText("앱을 한 번 열면 근무표가 표시됩니다", width / 2f, height / 2f + 25f, paint);
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
