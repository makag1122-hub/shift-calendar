package kr.co.shiftcalendar.widget;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.kakao.sdk.auth.model.OAuthToken;
import com.kakao.sdk.common.model.ClientError;
import com.kakao.sdk.common.model.ClientErrorCause;
import com.kakao.sdk.user.UserApiClient;
import com.kakao.sdk.user.model.Account;
import com.kakao.sdk.user.model.Profile;
import com.kakao.sdk.user.model.User;

import kotlin.Unit;

/** 카카오 토큰은 네이티브 SDK 안에만 두고 WebView에는 닉네임만 전달합니다. */
final class KakaoLoginManager {
    private static final String TAG = "KakaoLoginManager";
    private static final long LOGIN_TIMEOUT_MS = 45_000L;

    interface Listener {
        void onConnected(String nickname);
        void onSignedOut();
        void onError(String message, boolean cancelled);
    }

    private KakaoLoginManager() {
    }

    static void login(Activity activity, Listener listener) {
        LoginAttempt attempt = new LoginAttempt(listener);
        attempt.startTimeout();
        UserApiClient client = UserApiClient.getInstance();
        if (client.isKakaoTalkLoginAvailable(activity)) {
            client.loginWithKakaoTalk(activity, (token, error) -> {
                if (token != null) {
                    loadProfile(attempt);
                } else if (isCancelled(error)) {
                    attempt.error("카카오 로그인이 취소됐어요.", true);
                } else {
                    Log.w(TAG, "KakaoTalk login failed; trying Kakao Account", error);
                    loginWithAccount(activity, attempt);
                }
                return Unit.INSTANCE;
            });
        } else {
            loginWithAccount(activity, attempt);
        }
    }

    private static void loginWithAccount(Activity activity, LoginAttempt attempt) {
        UserApiClient.getInstance().loginWithKakaoAccount(activity, (token, error) -> {
            if (token != null) {
                loadProfile(attempt);
            } else if (isCancelled(error)) {
                attempt.error("카카오 로그인이 취소됐어요.", true);
            } else {
                Log.w(TAG, "Kakao account login failed", error);
                attempt.error("카카오 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.", false);
            }
            return Unit.INSTANCE;
        });
    }

    private static void loadProfile(LoginAttempt attempt) {
        UserApiClient.getInstance().me((user, error) -> {
            if (user != null) {
                String nickname = nicknameOf(user);
                if (!nickname.isEmpty()) {
                    attempt.connected(nickname);
                } else {
                    attempt.error("카카오 동의 항목에서 닉네임 사용을 설정해 주세요.", false);
                }
            } else {
                Log.w(TAG, "Failed to load Kakao profile after login", error);
                attempt.error("카카오 로그인 정보 확인에 실패했어요. 다시 시도해 주세요.", false);
            }
            return Unit.INSTANCE;
        });
    }

    /** 저장된 카카오 토큰이 유효한지 확인하고 닉네임을 다시 가져옵니다. */
    static void restore(Listener listener) {
        loadProfile(listener);
    }

    private static void loadProfile(Listener listener) {
        UserApiClient.getInstance().me((user, error) -> {
            if (user != null) {
                String nickname = nicknameOf(user);
                if (!nickname.isEmpty()) {
                    listener.onConnected(nickname);
                } else {
                    listener.onError(
                            "카카오 동의 항목에서 닉네임 사용을 설정해 주세요.",
                            false
                    );
                }
            } else if (isMissingToken(error)) {
                listener.onSignedOut();
            } else {
                Log.w(TAG, "Failed to load Kakao profile", error);
                listener.onError("카카오 로그인 정보를 확인하지 못했어요.", false);
            }
            return Unit.INSTANCE;
        });
    }

    /** 앱과 카카오계정의 연결을 끊어 SDK 토큰까지 삭제합니다. */
    static void disconnect(Listener listener) {
        UserApiClient.getInstance().unlink(error -> {
            if (error == null || isMissingToken(error)) {
                listener.onSignedOut();
            } else {
                Log.w(TAG, "Kakao unlink failed", error);
                listener.onError("카카오 연결을 해제하지 못했어요.", false);
            }
            return Unit.INSTANCE;
        });
    }

    private static String nicknameOf(User user) {
        Account account = user.getKakaoAccount();
        Profile profile = account == null ? null : account.getProfile();
        String raw = profile == null ? null : profile.getNickname();
        if (raw == null) {
            return "";
        }
        String cleaned = raw.replaceAll("[\\p{Cntrl}]", " ")
                .replaceAll("\\s+", " ")
                .trim();
        return cleaned.length() > 20 ? cleaned.substring(0, 20) : cleaned;
    }

    private static boolean isCancelled(Throwable error) {
        return error instanceof ClientError
                && ((ClientError) error).getReason() == ClientErrorCause.Cancelled;
    }

    private static boolean isMissingToken(Throwable error) {
        return error instanceof ClientError
                && ((ClientError) error).getReason() == ClientErrorCause.TokenNotFound;
    }

    /** 로그인 콜백이 유실돼도 WebView가 확인 중 상태에 계속 머물지 않게 합니다. */
    private static final class LoginAttempt {
        private final Listener listener;
        private final Handler handler = new Handler(Looper.getMainLooper());
        private boolean completed;
        private final Runnable timeout = () -> error(
                "카카오 로그인 응답이 늦어지고 있어요. 다시 시도해 주세요.",
                false
        );

        LoginAttempt(Listener listener) {
            this.listener = listener;
        }

        void startTimeout() {
            handler.postDelayed(timeout, LOGIN_TIMEOUT_MS);
        }

        synchronized void connected(String nickname) {
            if (!finish()) {
                return;
            }
            listener.onConnected(nickname);
        }

        synchronized void error(String message, boolean cancelled) {
            if (!finish()) {
                return;
            }
            listener.onError(message, cancelled);
        }

        private boolean finish() {
            if (completed) {
                return false;
            }
            completed = true;
            handler.removeCallbacks(timeout);
            return true;
        }
    }
}
