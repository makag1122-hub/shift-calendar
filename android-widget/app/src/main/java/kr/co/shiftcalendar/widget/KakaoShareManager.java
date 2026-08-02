package kr.co.shiftcalendar.widget;

import android.app.Activity;
import android.util.Log;

import com.kakao.sdk.share.ShareClient;
import com.kakao.sdk.template.model.Button;
import com.kakao.sdk.template.model.Link;
import com.kakao.sdk.template.model.TextTemplate;

import java.util.Collections;
import java.util.Map;

import kotlin.Unit;

final class KakaoShareManager {
    private static final String TAG = "KakaoShareManager";

    private KakaoShareManager() {
    }

    static void shareInvitation(
            Activity activity,
            String title,
            String description,
            String inviteUrl,
            String token,
            Runnable fallback
    ) {
        Map<String, String> executionParams = Collections.singletonMap("token", token);

        /* webUrl·mobileWebUrl을 비워 두면 카카오톡 카드에 초대 주소가 아예 실리지 않아,
           앱이 없는 친구는 스토어 안내만 보게 됩니다. https 주소를 함께 넣어
           앱이 있으면 앱으로, 없으면 브라우저(PWA)로 열리게 합니다. */
        Link inviteLink = new Link(inviteUrl, inviteUrl, executionParams);
        Button openButton = new Button("근무표 보기", inviteLink);

        StringBuilder body = new StringBuilder();
        body.append(title == null || title.isEmpty() ? "교대캘린더 친구 초대" : title);
        if (description != null && !description.isEmpty()) {
            body.append("\n\n").append(description);
        }
        body.append("\n\n버튼을 누르면 근무표가 열려요. 앱이 없어도 브라우저에서 바로 볼 수 있어요.");

        TextTemplate template = new TextTemplate(
                body.toString(),
                inviteLink,
                Collections.singletonList(openButton),
                null
        );

        try {
            if (ShareClient.getInstance().isKakaoTalkSharingAvailable(activity)) {
                ShareClient.getInstance().shareDefault(
                        activity,
                        template,
                        (sharingResult, error) -> {
                            activity.runOnUiThread(() -> {
                                if (error == null && sharingResult != null) {
                                    activity.startActivity(sharingResult.getIntent());
                                } else {
                                    Log.w(TAG, "Native Kakao share failed; using Android share", error);
                                    fallback.run();
                                }
                            });
                            return Unit.INSTANCE;
                        }
                );
                return;
            }

            fallback.run();
        } catch (RuntimeException error) {
            Log.w(TAG, "Kakao share setup failed; using Android share", error);
            fallback.run();
        }
    }
}
