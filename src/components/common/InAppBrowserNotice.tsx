import { useEffect, useRef, useState } from "react";
import { X, ExternalLink } from "lucide-react";
import { detectInAppBrowser, openInExternalBrowser, appIntentUrl, APP_TRIED_KEY, type InAppInfo } from "../../utils/inAppBrowser";

const DISMISS_KEY = "stargate_inapp_notice_dismissed";
const AUTO_KEY = "stargate_inapp_auto_tried";

export default function InAppBrowserNotice({ compact = false }: { compact?: boolean } = {}) {
  const [info] = useState<InAppInfo>(() => detectInAppBrowser());
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });
  const [hint, setHint] = useState(false);
  const autoRef = useRef(false);

  useEffect(() => {
    if (!info.isInApp || dismissed || autoRef.current) return undefined;
    autoRef.current = true;
    /** 종전 길 — 공유 링크로 들어왔으면 외부 브라우저로 한 번 자동으로 연다. */
    const external = (): void => {
      if (!compact) return;
      try { if (sessionStorage.getItem(AUTO_KEY) === "1") return; sessionStorage.setItem(AUTO_KEY, "1"); } catch { }
      openInExternalBrowser(info.kind);
    };
    /* ★ 먼저 앱(안드로이드 · 세션에 한 번 · utils/inAppBrowser appIntentUrl ★). 앱이 열리면 이 화면은 뒤로 숨는다 — 그 뒤로는 아무것도 안 한다
       (숨은 동안 늦춰진 타이머가 돌아와서 외부 브라우저를 또 열지 않게 숨음을 기억한다). 앱이 없으면 인앱 브라우저가 같은 주소로 다시 열어 표식을 보고 종전 길로. */
    let tried = false;
    try { tried = sessionStorage.getItem(APP_TRIED_KEY) === "1"; } catch { tried = true; }
    const intent = tried ? null : appIntentUrl();
    if (!intent) { const id = window.setTimeout(external, 350); return () => window.clearTimeout(id); }
    try { sessionStorage.setItem(APP_TRIED_KEY, "1"); } catch { }
    let left = false;
    const onHide = (): void => { if (document.visibilityState === "hidden") left = true; };
    const onPageHide = (): void => { left = true; };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    window.location.href = intent;
    const id = window.setTimeout(() => { if (!left && document.visibilityState === "visible") external(); }, 1600);
    return () => { window.clearTimeout(id); document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", onPageHide); };
  }, [compact, info.isInApp, info.kind, dismissed]);

  if (!info.isInApp || dismissed) return null;

  const close = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { }
  };

  const openExternal = () => {
    const ok = openInExternalBrowser(info.kind);
    if (!ok) setHint(true);
  };

  if (compact) {
    return (
      <div className="scr-inapp-mini" role="dialog" aria-label="외부 브라우저로 열기 안내">
        {hint && (
          <div className="scr-inapp-mini-hint">
            오른쪽 위 <b>⋯(더보기)</b> → <b>다른 브라우저로 열기</b>
          </div>
        )}
        <button
          type="button" className="scr-inapp-mini-btn" onClick={openExternal}
          aria-label="기본 브라우저로 열기" title="기본 브라우저로 열기"
        >
          <ExternalLink size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="scr-inapp-notice" role="dialog" aria-label="외부 브라우저로 열기 안내">
      <div className="scr-inapp-notice-main">
        <button type="button" className="scr-pill-btn" onClick={openExternal}>
          <ExternalLink size={14} /> 기본 브라우저로 열기
        </button>
        <button type="button" className="scr-inapp-notice-close" onClick={close} aria-label="닫기">
          <X size={16} />
        </button>
      </div>
      {hint && (
        <div className="scr-inapp-notice-hint">
          오른쪽 위 <b>⋯(더보기)</b> → <b>다른 브라우저로 열기</b>를 눌러주세요.
        </div>
      )}
    </div>
  );
}
