import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X } from "lucide-react";
import LeagueBracket from "./LeagueBracket";
import { useLockBodyScroll } from "../../utils/bodyScrollLock";
import { useDocumentFullscreen } from "../../hooks/useDocumentFullscreen";
import type { League } from "../../types";

const noSave = () => {};

export default function LeaguePresentView({ league, onUpdated, onClose }: {
  league: League;
  onUpdated: (league: League) => void;
  onClose: () => void;
}) {
  useLockBodyScroll();
  const fs = useDocumentFullscreen(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="scr-league-present" role="dialog" aria-modal="true" aria-label={`${league.name} 대진표`}>
      <div className="scr-league-present-head">
        <span className="scr-league-present-name">{league.name}</span>
        <span className="scr-league-present-spacer" />
        <div className="scr-league-present-actions">
          {fs.supported && !fs.isFullscreen && (
            <button type="button" className="scr-icon-btn" onClick={fs.enter} aria-label="전체화면" title="전체화면">
              <Maximize2 size={18} />
            </button>
          )}
          <button type="button" className="scr-icon-btn" onClick={onClose} aria-label="닫기" title="닫기 (Esc)">
            <X size={20} />
          </button>
        </div>
      </div>
      <div className="scr-league-present-body scr-scroll">
        <LeagueBracket league={league} canEdit={false} present onUpdated={onUpdated} onRegisterSave={noSave} />
      </div>
    </div>,
    document.body,
  );
}
