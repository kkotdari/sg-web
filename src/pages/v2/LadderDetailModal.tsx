import ModalHash from "../../utils/modalHash";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import LadderDetailBody, { type LadderDetailData } from "./LadderDetailBody";
import { useLockBodyScroll } from "../../utils/bodyScrollLock";
import type { Member } from "../../types";

/** 래더 상세 창(폰 · 줄을 누르면). 재료는 래더 화면이 같이 받아 둔 것(LadderDetailData) — 여기서 따로 묻지 않는다(2026-10-24).
 *  PC 는 마우스오버 팝오버(LadderScreen .scr-ladder-pop)가 같은 본문(LadderDetailBody)을 쓴다. */
export default function LadderDetailModal({
  member, data, onClose,
}: {
  member: Member;
  data: LadderDetailData;
  onClose: () => void;
}) {
  useLockBodyScroll();
  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash={`ladder-${member.id}`} onClose={onClose} />
      <div className="scr-modal scr-modal-sm scr-modal-rank-detail">
        <div className="scr-modal-head">
          <span>래더 상세</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>
        <div className="scr-modal-body">
          <LadderDetailBody member={member} data={data} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
