import { useState, type ReactNode } from "react";
import ModalHash from "../utils/modalHash";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Spinner } from "../components/common/Feedback";
import { useLockBodyScroll } from "../utils/bodyScrollLock";

/* ★ 문서 등록 창(2026-10-26 공통화, 요청: "자유게시판 만들어줘 · 일정 폼 재사용(공통화)") — 옛 일정 등록 창(ScheduleFormModal)의
   틀(머리 · 몸 · 취소/등록 단추 · 보내는 중 · 오류)을 떼어 일정(ScheduleFormModal)과 글(PostFormModal)이 같이 쓴다. 칸은 children 으로 받는다. */

export const DOC_TITLE_MAX = 60;

export function DocTitleField({ value, onChange, placeholder }: {
  value: string; onChange: (next: string) => void; placeholder: string;
}) {
  return (
    <label className="scr-field">
      <span className="scr-label">제목</span>
      <input
        className="scr-input"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, DOC_TITLE_MAX))}
        placeholder={placeholder}
        maxLength={DOC_TITLE_MAX}
        autoFocus
      />
    </label>
  );
}

export default function DocFormModal({
  hash, heading, submitIcon, submitLabel, canSubmit, failText, onSubmit, onClose, children, className,
}: {
  hash: string;
  heading: string;
  submitIcon: ReactNode;
  submitLabel: string;
  canSubmit: boolean;
  /** 서버가 글귀 없이 실패했을 때. */
  failText: string;
  /** 보내고 받은 뒤의 일까지(onSaved) — 끝나면 창을 닫는다. */
  onSubmit: () => Promise<void>;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  useLockBodyScroll();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!canSubmit || busy) return;
    setErr("");
    setBusy(true);
    try {
      await onSubmit();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : failText);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash={hash} onClose={onClose} />
      <div className={`scr-modal scr-modal-sm ${className ?? ""}`}>
        <div className="scr-modal-head">
          <span>{heading}</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>

        <div className="scr-modal-body">
          {children}
          {err && <div className="scr-err">{err}</div>}
        </div>

        <div className="scr-form-actions">
          <button className="scr-rect-btn is-secondary" onClick={onClose}>취소</button>
          <button className="scr-rect-btn" onClick={submit} disabled={!canSubmit || busy}>
            {busy ? <><Spinner /> 저장하는 중...</> : <>{submitIcon} {submitLabel}</>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
