/* ★ 접속 출처(2026-11-02, 요청: "앞으로 access log 쌓을 때 출처에 앱인지 피시인지 모바일인지 구분") — 모든 API 요청에 X-Client-Kind 로 싣는다(api/client).
   · "app"    — 안드 앱(Capacitor 웹뷰) · 홈 화면에 올린 앱(PWA · 아이폰은 이것이 앱이다)
   · "mobile" — 폰·태블릿 브라우저(아이패드 데스크톱 모드도 · 손가락 + 맥 플랫폼)
   · "pc"     — 그 밖
   서버(sg-api core.client_env.client_kind)는 이 값이 없으면(옛 판) 사용자 에이전트로 어림한다. 한 번만 재서 둔다. */
type CapWin = { Capacitor?: { isNativePlatform?: () => boolean } };

let kind9: "app" | "mobile" | "pc" | "uploader" | null = null;

/** SG Uploader 트레이 앱의 숨은 창이면 그 앱의 버전(preload 가 window.stargateUploader.version 으로 준다) — 아니면 null. */
export function uploaderVersion(): string | null {
  try {
    const v = (window as unknown as { stargateUploader?: { version?: unknown } }).stargateUploader?.version;
    return typeof v === "string" && v ? v : null;
  } catch { return null; }
}

export function clientKind(): "app" | "mobile" | "pc" | "uploader" {
  if (kind9) return kind9;
  let k: "app" | "mobile" | "pc" | "uploader" = "pc";
  try {
    /* 업로더(2026-11-05, 요청: "앱에서 업로드 요청 오는거도 접속 기록 테이블에 쌓기 · 앱버전도 기록") — 서버가 등록 요청을 접속 기록(screen upload)에 남긴다. */
    if (uploaderVersion() !== null) { kind9 = "uploader"; return kind9; }
    const nav = navigator as Navigator & { standalone?: boolean; userAgentData?: { mobile?: boolean } };
    const native = !!(window as unknown as CapWin).Capacitor?.isNativePlatform?.();
    const pwa = nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true;
    const ipadDesk = nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1;
    const mobile = nav.userAgentData?.mobile === true || /Mobi|Android|iPhone|iPad|iPod/i.test(nav.userAgent) || ipadDesk;
    k = native || pwa ? "app" : mobile ? "mobile" : "pc";
  } catch { /* 모르면 pc */ }
  kind9 = k;
  return k;
}
