import { useState } from "react";
import { X, Download } from "lucide-react";
import { usePwaInstall } from "../../hooks/usePwaInstall";
import InstallGuideModal from "./InstallGuideModal";

const DISMISS_KEY = "stargate_install_dismissed";

export default function InstallBanner() {
  const { canInstall, platform, promptInstall } = usePwaInstall();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === "1");
  const [guideOpen, setGuideOpen] = useState(false);

  const close = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, "1");
  };

  const onInstall = async () => {
    const r = await promptInstall();
    if (r === "ios") setGuideOpen(true);
    else if (r === "installed" || r === "dismissed") close();
  };

  if (guideOpen) {
    return <InstallGuideModal onClose={() => { setGuideOpen(false); close(); }} />;
  }
  if (!canInstall || dismissed) return null;

  return (
    <div className="scr-install-banner" role="dialog" aria-label="홈 화면에 추가">
      <div className="scr-install-banner-text">
        <b>주소창 없이 앱처럼</b>
        <span>홈 화면에 추가하면 화면이 넓어져요{platform === "ios" ? " (방법 안내)" : ""}.</span>
      </div>
      <button type="button" className="scr-pill-btn scr-lighting-color-fill" onClick={onInstall}>
        <Download size={14} /> 추가
      </button>
      <button type="button" className="scr-install-banner-close" onClick={close} aria-label="닫기">
        <X size={16} />
      </button>
    </div>
  );
}
