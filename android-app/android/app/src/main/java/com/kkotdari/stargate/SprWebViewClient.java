package com.kkotdari.stargate;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * 재생기 서버 아틀라스(/spr/…)를 앱에 실어 온 파일로 답한다(2026-10-31, 요청: "모델도 기본 포함").
 * 실은 것은 폰 판(k/*.h.*.ktx2) · 표(index.*.json) · basis 풀이기(assets/spr · CI 가 scripts/bundle-spr.mjs 로 넣는다).
 * 이름이 내용 해시라 사이트가 새로 구우면 이름이 달라져 여기 없고 → 네트워크로 받는다(앱 재배포 없이 새 그림).
 * 그 밖의 요청은 Capacitor 그대로(HTML 에는 브리지 스크립트를 넣어 FCM 플러그인이 산다).
 */
public class SprWebViewClient extends BridgeWebViewClient {
    private static final String PREFIX = "/spr/";
    private static volatile Set<String> files;
    private final AssetManager assets;

    public SprWebViewClient(Bridge bridge) {
        super(bridge);
        this.assets = bridge.getContext().getAssets();
    }

    private Set<String> files() {
        Set<String> f = files;
        if (f != null) return f;
        synchronized (SprWebViewClient.class) {
            if (files == null) {
                Set<String> s = new HashSet<>();
                walk("spr", s);
                files = s;
            }
            return files;
        }
    }

    private void walk(String dir, Set<String> out) {
        try {
            String[] names = assets.list(dir);
            if (names == null) return;
            for (String n : names) {
                String p = dir + "/" + n;
                if (n.contains(".")) out.add(p);
                else walk(p, out);
            }
        } catch (IOException ignored) {
        }
    }

    private static String mimeOf(String p) {
        if (p.endsWith(".ktx2")) return "image/ktx2";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".wasm")) return "application/wasm";
        if (p.endsWith(".js")) return "text/javascript";
        return "application/octet-stream";
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri u = request.getUrl();
        String path = u.getPath();
        if ("GET".equalsIgnoreCase(request.getMethod()) && path != null && path.startsWith(PREFIX)
                && !request.getRequestHeaders().containsKey("Range")) {
            String asset = "spr/" + path.substring(PREFIX.length());
            if (files().contains(asset)) {
                try {
                    InputStream in = assets.open(asset);
                    Map<String, String> h = new HashMap<>();
                    h.put("Access-Control-Allow-Origin", "*");
                    h.put("Cache-Control", "public, max-age=31536000, immutable");
                    String mime = mimeOf(asset);
                    return new WebResourceResponse(mime, mime.startsWith("text/") || mime.endsWith("json") ? "utf-8" : null,
                            200, "OK", h, in);
                } catch (IOException ignored) {
                }
            }
        }
        return super.shouldInterceptRequest(view, request);
    }
}
