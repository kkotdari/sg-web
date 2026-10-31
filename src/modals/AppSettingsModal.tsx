import { useEffect, useState } from "react";
import { X } from "lucide-react";
import ModalHash from "../utils/modalHash";
import { cx } from "../utils/format";
import { showToast } from "../components/common/Toast";
import { disablePush, enablePush, isIos, isNativeApp, pushIsOn, pushSupported } from "../utils/push";

/* 안드 앱 내려받기 — GitHub 릴리즈의 '최신' 고정 주소(.github/workflows/android.yml 이 올린다 · 저장소 공개). */
export const APK_URL = "https://github.com/kkotdari/sg-web/releases/latest/download/stargate.apk";

/** ★ 앱 설정(2026-10-31, 요청: "홈 화면 추가 안내보다는 앱설정이라는 메뉴 · 거기서 알림 추가" · "알림은 그냥 통째로 켜고 끄기만 설명 X"). */
export default function AppSettingsModal({ onClose }: { onClose: () => void }) {
  const supported = pushSupported();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(supported);
  const showApk = !isNativeApp() && !isIos();

  useEffect(() => {
    if (!supported) return;
    let alive = true;
    void pushIsOn().then((v) => { if (alive) { setOn(v); setBusy(false); } });
    return () => { alive = false; };
  }, [supported]);

  const toggle = async () => {
    if (busy || !supported) return;
    setBusy(true);
    try {
      if (on) { await disablePush(); setOn(false); }
      else { await enablePush(); setOn(true); }
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      showToast(m === "permission" ? "알림 권한이 꺼져 있어요" : "알림을 켜지 못했어요");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scr-modal-overlay">
      <ModalHash hash="app-settings" onClose={onClose} />
      <div className="scr-modal scr-modal-sm">
        <div className="scr-modal-head">
          <span>앱 설정</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>
        <div className="scr-modal-body">
          <div className="scr-appset-row">
            <span className="scr-appset-title">알림</span>
            <button
              type="button" role="switch" aria-checked={on} aria-label="알림"
              className={cx("scr-notice-switch", on && "scr-notice-switch-on")}
              onClick={() => void toggle()} disabled={busy || !supported}
            >
              <span className="scr-notice-switch-knob" />
            </button>
          </div>
          {showApk && (
            <div className="scr-appset-row">
              <span className="scr-appset-title">안드로이드 앱</span>
              <a className="scr-rect-btn is-secondary scr-appset-btn" href={APK_URL} download>받기</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
