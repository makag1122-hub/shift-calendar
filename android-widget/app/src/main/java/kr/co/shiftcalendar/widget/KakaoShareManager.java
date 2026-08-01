package kr.co.shiftcalendar.widget;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import com.kakao.sdk.share.ShareClient;
import com.kakao.sdk.share.WebSharerClient;
import com.kakao.sdk.template.model.Button;
import com.kakao.sdk.template.model.Link;
import com.kakao.sdk.template.model.TextTemplate;

import java.util.Collections;
import java.util.Map;

import kotlin.Unit;

final class KakaoShareManager {
    private KakaoShareManager() {
    }

    static void shareInvitation(
            Activity activity,
            String title,
            String description,
            String token,
            Runnable fallback
    ) {
        Map<String, String> executionParams = Collections.singletonMap("token", token);
        Link appLink = new Link(null, null, executionParams);
        Button openButton = new Button("교대캘린더에서 열기", appLink);

        StringBuilder body = new StringBuilder();
        body.append(title == null || title.isEmpty() ? "교대캘린더 친구 초대" : title);
        if (description != null && !description.isEmpty()) {
            body.append("\n\n").append(description);
        }
        body.append("\n\n버튼을 누르면 공유받은 근무표를 앱에서 바로 확인할 수 있어요.");

        TextTemplate template = new TextTemplate(
                body.toString(),
                appLink,
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
                                    fallback.run();
                                }
                            });
                            return Unit.INSTANCE;
                        }
                );
                return;
            }

            Uri webShareUrl = WebSharerClient.getInstance().makeDefaultUrl(template);
            activity.startActivity(new Intent(Intent.ACTION_VIEW, webShareUrl));
        } catch (RuntimeException error) {
            fallback.run();
        }
    }
}
