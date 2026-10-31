package com.kkotdari.stargate;

import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

/**
 * 스타게이트 안드 앱(2026-10-31) — Capacitor 가 사이트(capacitor.config.json server.url)를 웹뷰로 연다.
 * · 재생기 모델 그림(/spr/…)은 앱에 실어 온 파일로 답한다(SprWebViewClient · 없으면 네트워크).
 * · 뒤로 가기는 웹 기록부터(사이트는 주소 기록으로 화면·창을 쌓는다) · 더 없으면 앱을 닫는다.
 * · 새 판 확인(Updater) — 깃허브 릴리즈의 version.json 을 보고 내려받아 설치 창을 띄운다.
 */
public class MainActivity extends BridgeActivity {
    private Updater updater;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        bridge.setWebViewClient(new SprWebViewClient(bridge));
        /* 사이트가 묻는 앱 정보(window.ScrApp) — fcm(): 이 APK 에 Firebase 설정(google-services.json)이 들었나.
           없이 구운 판에서 푸시 플러그인 register() 를 부르면 FirebaseApp 이 없어 앱이 죽는다 → 사이트가 알림 스위치를 막는다(utils/push). */
        final boolean fcm = getResources().getIdentifier("google_app_id", "string", getPackageName()) != 0;
        bridge.getWebView().addJavascriptInterface(new Object() {
            @JavascriptInterface
            public boolean fcm() {
                return fcm;
            }
        }, "ScrApp");
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView wv = bridge.getWebView();
                if (wv != null && wv.canGoBack()) {
                    wv.goBack();
                } else {
                    finish();
                }
            }
        });
        updater = new Updater(this);
        updater.checkSoon();
    }

    @Override
    public void onResume() {
        super.onResume();
        if (updater != null) updater.onResume();
    }
}
