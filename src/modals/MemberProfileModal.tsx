import { useState } from "react";
import ModalHash from "../utils/modalHash";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import Avatar from "../components/common/Avatar";
import PhotoViewer from "../components/common/PhotoViewer";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import type { Member } from "../types";

interface MemberProfileModalProps {
  member: Member;
  onClose: () => void;
}

export default function MemberProfileModal({ member, onClose }: MemberProfileModalProps) {
  useLockBodyScroll();
  const [photoOpen, setPhotoOpen] = useState(false);

  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash={`member-${member.id}`} onClose={onClose} />
      <div className="scr-modal scr-modal-sm">
        <div className="scr-modal-head">
          <span>회원 프로필</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>

        <div className="scr-modal-body scr-scroll">
          <div className="scr-avatar-pick">
            <button
              type="button"
              className="scr-avatar-open-btn"
              onClick={() => setPhotoOpen(true)}
              disabled={!member.avatar}
              aria-label="사진 크게 보기"
            >
              <Avatar member={member} size={56} />
            </button>
            <div>
              <div className="scr-member-detail-name">{member.nickname}</div>
              <div className="scr-member-detail-tag scr-mono">{member.battletag}</div>
            </div>
          </div>

          <dl className="scr-detail-list">
            {member.insta && <div className="scr-detail-row"><dt>인스타</dt><dd>{member.insta}</dd></div>}
          </dl>

        </div>
        <div className="scr-form-actions">
          <button type="button" className="scr-rect-btn" onClick={onClose}>닫기</button>
        </div>
      </div>

      {photoOpen && member.avatar && (
        <PhotoViewer src={member.avatar} alt={member.nickname} onClose={() => setPhotoOpen(false)} />
      )}
    </div>,
    document.body,
  );
}
