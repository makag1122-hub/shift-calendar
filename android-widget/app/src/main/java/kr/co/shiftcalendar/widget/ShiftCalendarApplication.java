package kr.co.shiftcalendar.widget;

import android.app.Application;

import com.kakao.sdk.common.KakaoSdk;

public final class ShiftCalendarApplication extends Application {
    private static final String KAKAO_NATIVE_APP_KEY =
            "e9f15b01b136223f0f0d7b2e00b94281";

    @Override
    public void onCreate() {
        super.onCreate();
        KakaoSdk.init(this, KAKAO_NATIVE_APP_KEY);
    }
}
