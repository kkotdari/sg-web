export type InAppKind = "kakao" | "naver" | "line" | "instagram" | "facebook" | "other";

export interface InAppInfo {
  isInApp: boolean;
  kind: InAppKind | null;
}

export function detectInAppBrowser(ua: string = navigator.userAgent): InAppInfo {
  const s = ua.toLowerCase();
  if (s.includes("kakaotalk")) return { isInApp: true, kind: "kakao" };
  if (s.includes("naver(inapp") || s.includes("naver ")) return { isInApp: true, kind: "naver" };
  if (/\bline\//.test(s) || s.includes("line/")) return { isInApp: true, kind: "line" };
  if (s.includes("instagram")) return { isInApp: true, kind: "instagram" };
  if (s.includes("fban") || s.includes("fbav")) return { isInApp: true, kind: "facebook" };
  return { isInApp: false, kind: null };
}

function androidIntentUrl(url: string): string | null {
  if (!/android/i.test(navigator.userAgent)) return null;
  try {
    const u = new URL(url);
    const sch = u.protocol.replace(":", "");
    return `intent://${u.host}${u.pathname}${u.search}${u.hash}`
      + `#Intent;scheme=${sch};action=android.intent.action.VIEW;end`;
  } catch { return null; }
}

export function openInExternalBrowser(kind: InAppKind | null, url: string = window.location.href): boolean {
  if (kind === "kakao") {
    window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
    return true;
  }
  const ai = androidIntentUrl(url);
  if (ai) {
    window.location.href = ai;
    return true;
  }
  return false;
}

/* ★ 앱이 있으면 앱으로(2026-11-03, 요청: "카카오톡등의 링크열면 앱/PWA앱이 있으면 그쪽으로 열리게") ─────────────────────────────
   카톡 등 인앱 브라우저는 링크를 제 웹뷰에서 열어 앱 링크(assetlinks)가 안 탄다. 안드로이드에서는 이 주소를 **앱 꾸러미를 짚은 intent://** 로 한 번 부른다 —
   앱이 깔렸으면 앱이 그 주소로 열리고(android-app MainActivity.onNewIntent), 없으면 인앱 브라우저가 browser_fallback_url(같은 주소)로 돌아온다.
   돌아온 판은 세션 표식(APP_TRIED_KEY)으로 다시 안 부르고 종전 길(외부 브라우저 열기)로 간다 — 외부 브라우저로 열린 주소는 확인된 앱 링크면 그때도 앱이 받고,
   크롬에 설치한 PWA(WebAPK)도 같은 길로 받는다. 아이폰은 홈 화면 웹앱을 링크로 열 길이 없다(애플이 막았다) — 종전대로 사파리. */
export const APP_PACKAGE = "com.kkotdari.stargate";
export const APP_TRIED_KEY = "stargate_app_open_tried";

/** 앱 안(Capacitor 웹뷰)인가 — 앱이 심은 window.ScrApp 또는 Capacitor 다리. */
export function inNativeApp(): boolean {
  const w = window as unknown as { ScrApp?: unknown; Capacitor?: { isNativePlatform?: () => boolean } };
  return !!w.ScrApp || !!w.Capacitor?.isNativePlatform?.();
}

/** 이 주소를 앱으로 여는 intent:// — 안드로이드 인앱 브라우저일 때만(아니면 null). 해시는 뺀다(#Intent 와 겹친다 · 주소는 경로로 간다). */
export function appIntentUrl(url: string = window.location.href, ua: string = navigator.userAgent): string | null {
  if (!/android/i.test(ua) || inNativeApp()) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    const back = `${u.origin}${u.pathname}${u.search}`;
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=${APP_PACKAGE};`
      + `S.browser_fallback_url=${encodeURIComponent(back)};end`;
  } catch { return null; }
}
