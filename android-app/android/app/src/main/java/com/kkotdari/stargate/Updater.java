package com.kkotdari.stargate;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONObject;

/**
 * 새 판 알림(2026-10-31, 요청: "apk 업데이트 가능하게") — 스토어 없이.
 * 깃허브 릴리즈 '최신'의 version.json({versionCode, versionName, notes})을 읽어 지금보다 크면 묻고, [받기]를 누르면 **브라우저로 stargate.apk 를 연다**.
 * ★ 앱이 APK 를 직접 내려받아 설치 창을 띄우던 길은 걷었다(2026-11-02, 요청: Play 프로텍트가 '유해한 앱'으로 거는 것 — 그 첫째 까닭 적용) —
 *   스토어 밖 앱이 다른 APK 를 내려받아 설치하는 것(REQUEST_INSTALL_PACKAGES · FileProvider 설치 인텐트)은 Play 프로텍트가 드로퍼의 대표 신호로 본다.
 *   이제 받기·설치는 브라우저와 시스템 설치기가 한다(사용자가 받은 파일을 눌러 설치).
 */
class Updater {
    static final String BASE = "https://github.com/kkotdari/sg-web/releases/latest/download/";
    private final Activity act;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private boolean checked;

    Updater(Activity act) {
        this.act = act;
    }

    void checkSoon() {
        if (checked) return;
        checked = true;
        ui.postDelayed(() -> new Thread(this::check).start(), 4000);
    }

    void onResume() {
        // 옛 '설치 허용 설정에서 돌아오면 이어서 설치' 자리 — 이제 할 일이 없다(MainActivity 가 부른다).
    }

    private long myVersion() {
        try {
            PackageInfo pi = act.getPackageManager().getPackageInfo(act.getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
        } catch (PackageManager.NameNotFoundException e) {
            return Long.MAX_VALUE;
        }
    }

    private void check() {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(BASE + "version.json?t=" + System.currentTimeMillis()).openConnection();
            c.setInstanceFollowRedirects(true);
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setRequestProperty("Cache-Control", "no-cache");
            if (c.getResponseCode() != 200) return;
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            try (InputStream in = c.getInputStream()) {
                byte[] b = new byte[8192];
                int n;
                while ((n = in.read(b)) > 0) bo.write(b, 0, n);
            }
            JSONObject j = new JSONObject(bo.toString("UTF-8"));
            long code = j.optLong("versionCode", 0);
            if (code <= myVersion()) return;
            String name = j.optString("versionName", "");
            String notes = j.optString("notes", "");
            ui.post(() -> ask(name, notes));
        } catch (Exception ignored) {
        }
    }

    private void ask(String name, String notes) {
        if (act.isFinishing()) return;
        String head = "새 버전 " + name + "이 있어요.\n받은 파일을 눌러 설치해 주세요.";
        String msg = notes.isEmpty() ? head : head + "\n\n" + notes;
        new AlertDialog.Builder(act)
                .setTitle("업데이트")
                .setMessage(msg)
                .setPositiveButton("받기", (d, w) -> openDownload())
                .setNegativeButton("나중에", null)
                .show();
    }

    private void openDownload() {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(BASE + "stargate.apk"));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            act.startActivity(i);
        } catch (ActivityNotFoundException e) {
            new AlertDialog.Builder(act).setMessage("브라우저를 열지 못했어요.").setPositiveButton("확인", null).show();
        }
    }
}
