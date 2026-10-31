import { createPortal } from "react-dom";
import ModalHash from "../utils/modalHash";
import { X, Sparkles } from "lucide-react";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import { updatePageOf } from "../updates";
import type { AppVersion } from "../types";

interface AppUpdateNoticeModalProps {
  notes: string;
  /** 그 버전에 안내 페이지(src/updates)가 있으면 글 대신 페이지를 띄운다. */
  version?: AppVersion | null;
  onClose: () => void;
}

export default function AppUpdateNoticeModal({ notes, version, onClose }: AppUpdateNoticeModalProps) {
  useLockBodyScroll(true, onClose);
  const Page = updatePageOf(version);
  if (Page) {
    return createPortal(
      <div className="scr-modal-overlay" onClick={onClose}>
        <ModalHash hash="app-update" onClose={onClose} />
        <div className="scr-modal scr-update-page-modal" onClick={(e) => e.stopPropagation()}>
          <div className="scr-modal-head">
            <span><Sparkles size={15} className="scr-update-notice-icon" /> 업데이트 안내</span>
            <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
          </div>
          <div className="scr-modal-body"><Page /></div>
          <div className="scr-form-actions">
            <button type="button" className="scr-rect-btn" onClick={onClose}>확인</button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="scr-modal-overlay" onClick={onClose}>
      <ModalHash hash="app-update" onClose={onClose} />
      <div className="scr-modal scr-modal-sm scr-update-notice-modal" onClick={(e) => e.stopPropagation()}>
        <div className="scr-modal-head">
          <span><Sparkles size={15} className="scr-update-notice-icon" /> 업데이트 안내</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>

        <div className="scr-modal-body">
          <p className="scr-update-notice-title">업데이트 내용</p>
          <div className="scr-update-notice-body">{notes}</div>

        </div>
        <div className="scr-form-actions">
          <button type="button" className="scr-rect-btn" onClick={onClose}>확인</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
