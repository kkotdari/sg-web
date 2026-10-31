package com.kkotdari.stargate;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.ProgressDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONObject;

/**
 * 앱 안 업데이트(2026-10-31, 요청: "apk 업데이트 가능하게") — 스토어 없이.
 * 깃허브 릴리즈 '최신'의 version.json({versionCode, versionName, notes})을 읽어 지금보다 크면 묻고,
 * stargate.apk 를 캐시에 내려받아 FileProvider 로 설치 창을 띄운다. 처음엔 '이 앱에서 설치 허용'을 켜야 한다(설정으로 보낸 뒤 돌아오면 이어서).
 */
class Updater {
    static final String BASE = "https://github.com/kkotdari/sg-web/releases/latest/download/";
    private final Activity act;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private boolean checked;
    private File pending;   // 설치 허용 설정에서 돌아오면 이어서 설치할 파일

    Updater(Activity act) {
        this.act = act;
    }

    void checkSoon() {
        if (checked) return;
        checked = true;
        ui.postDelayed(() -> new Thread(this::check).start(), 4000);
    }

    void onResume() {
        if (pending != null && canInstall()) {
            File f = pending;
            pending = null;
            install(f);
        }
    }

    private long myVersion() {
        try {
            PackageInfo pi = act.getPackageManager().getPackageInfo(act.getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
        } catch (PackageManager.NameNotFoundException e) {
            return Long.MAX_VALUE;
        }
    }

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setInstanceFollowRedirects(true);
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("Cache-Control", "no-cache");
        return c;
    }

    private void check() {
        try {
            HttpURLConnection c = open(BASE + "version.json?t=" + System.currentTimeMillis());
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
        String msg = notes.isEmpty() ? "새 버전 " + name + "이 있어요." : "새 버전 " + name + "이 있어요.\n\n" + notes;
        new AlertDialog.Builder(act)
                .setTitle("업데이트")
                .setMessage(msg)
                .setPositiveButton("업데이트", (d, w) -> download())
                .setNegativeButton("나중에", null)
                .show();
    }

    @SuppressWarnings("deprecation")
    private void download() {
        ProgressDialog pd = new ProgressDialog(act);
        pd.setMessage("내려받는 중…");
        pd.setProgressStyle(ProgressDialog.STYLE_HORIZONTAL);
        pd.setMax(100);
        pd.setCancelable(false);
        pd.show();
        new Thread(() -> {
            File dir = new File(act.getCacheDir(), "updates");
            dir.mkdirs();
            File f = new File(dir, "stargate.apk");
            try {
                HttpURLConnection c = open(BASE + "stargate.apk");
                long total = c.getContentLengthLong();
                try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(f)) {
                    byte[] b = new byte[65536];
                    long got = 0;
                    int n;
                    int last = -1;
                    while ((n = in.read(b)) > 0) {
                        out.write(b, 0, n);
                        got += n;
                        if (total > 0) {
                            int p = (int) (got * 100 / total);
                            if (p != last) {
                                last = p;
                                ui.post(() -> pd.setProgress(p));
                            }
                        }
                    }
                }
                ui.post(() -> {
                    pd.dismiss();
                    if (canInstall()) install(f);
                    else askInstallPermission(f);
                });
            } catch (Exception e) {
                ui.post(() -> {
                    pd.dismiss();
                    new AlertDialog.Builder(act).setMessage("내려받지 못했어요. 잠시 뒤 다시 시도해 주세요.")
                            .setPositiveButton("확인", null).show();
                });
            }
        }).start();
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < 26 || act.getPackageManager().canRequestPackageInstalls();
    }

    private void askInstallPermission(File f) {
        pending = f;
        new AlertDialog.Builder(act)
                .setMessage("설치하려면 이 앱의 '알 수 없는 앱 설치'를 허용해 주세요.")
                .setPositiveButton("설정 열기", (d, w) -> act.startActivity(new Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + act.getPackageName()))))
                .setNegativeButton("취소", (d, w) -> pending = null)
                .show();
    }

    private void install(File f) {
        Uri uri = FileProvider.getUriForFile(act, act.getPackageName() + ".fileprovider", f);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        act.startActivity(i);
    }
}
