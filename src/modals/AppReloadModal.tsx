import { createPortal } from "react-dom";
import { RefreshCw } from "lucide-react";
import { useLockBodyScroll } from "../utils/bodyScrollLock";

export default function AppReloadModal({ from, to }: { from: string; to: string }) {
  useLockBodyScroll(true);

  return createPortal(
    <div className="scr-modal-overlay">
      <div className="scr-modal scr-modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="scr-modal-head">
          <span><RefreshCw size={15} /> 새 판이 깔렸어요</span>
        </div>
        <div className="scr-modal-body">
          <p className="scr-update-notice-title">
            {from} → {to}
          </p>
          <div className="scr-update-notice-body">
            {"이 탭은 아직 옛 판으로 돌고 있어요. 새로고침해야 바뀐 화면이 제대로 보입니다."}
          </div>
        </div>
        <div className="scr-form-actions">
          <button
            type="button" className="scr-rect-btn is-fill"
            onClick={() => window.location.reload()}
          >
            새로고침
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
