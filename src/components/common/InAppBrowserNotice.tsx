import { useEffect, useRef, useState } from "react";
import { X, ExternalLink } from "lucide-react";
import { detectInAppBrowser, openInExternalBrowser, type InAppInfo } from "../../utils/inAppBrowser";

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
    if (!compact || !info.isInApp || dismissed || autoRef.current) return undefined;
    try { if (sessionStorage.getItem(AUTO_KEY) === "1") return undefined; } catch { }
    autoRef.current = true;
    const id = window.setTimeout(() => {
      try { sessionStorage.setItem(AUTO_KEY, "1"); } catch { }
      openInExternalBrowser(info.kind);
    }, 350);
    return () => window.clearTimeout(id);
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
        <button type="button" className="scr-inapp-notice-cta" onClick={openExternal}>
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
