import { useState } from "react";
import ModalHash from "../utils/modalHash";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Spinner } from "../components/common/Feedback";
import OptionalDateTimeFields from "../components/common/OptionalDateTimeFields";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import { api } from "../api/client";
import type { Challenge } from "../types";

export default function ChallengeTimeEditModal({
  challenge, onClose, onUpdated,
}: {
  challenge: Challenge;
  onClose: () => void;
  onUpdated: (updated: Challenge) => void;
}) {
  useLockBodyScroll(true, onClose);
  const [dateStr, setDateStr] = useState(challenge.scheduledDate ?? "");
  const [noteStr, setNoteStr] = useState(challenge.scheduledTimeNote);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setErr("");
    setBusy(true);
    try {
      const updated = await api.rescheduleChallenge(challenge.id, dateStr || null, noteStr.trim());
      onUpdated(updated);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "일정을 바꾸지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="scr-modal-overlay" onClick={onClose}>
      <ModalHash hash={`callout-time-${challenge.id}`} onClose={onClose} />
      <div className="scr-modal scr-modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="scr-modal-head">
          <span>일시 수정</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>
        <div className="scr-modal-body">
          <OptionalDateTimeFields
            dateStr={dateStr} onDateChange={setDateStr}
            noteStr={noteStr} onNoteChange={setNoteStr}
          />
          {err && <div className="scr-err">{err}</div>}
        </div>
        <div className="scr-form-actions">
          <button className="scr-rect-btn is-secondary" onClick={onClose} disabled={busy}>취소</button>
          <button className="scr-rect-btn" onClick={save} disabled={busy}>
            {busy ? <><Spinner /> 저장 중...</> : "저장"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
