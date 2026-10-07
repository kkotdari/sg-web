import { useState } from "react";
import ModalHash from "../utils/modalHash";
import { createPortal } from "react-dom";
import { X, CalendarPlus, Clock } from "lucide-react";
import { cx } from "../utils/format";
import { Spinner } from "../components/common/Feedback";
import { openPicker } from "../components/common/OptionalDateTimeFields";
import { DATE_INPUT_MIN, DATE_INPUT_MAX, todayStr } from "../utils/date";
import { api } from "../api/client";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import type { Schedule } from "../types";

const TITLE_MAX = 60;
export default function ScheduleFormModal({ initial, onClose, onSaved }: {
  initial?: Schedule | null;
  onClose: () => void;
  onSaved: (schedule: Schedule) => void;
}) {
  useLockBodyScroll();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [dateStr, setDateStr] = useState(initial?.scheduledDate ?? todayStr());
  const [timeStr, setTimeStr] = useState(initial?.scheduledTime ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const canSubmit = title.trim().length > 0 && !!dateStr;


  const submit = async () => {
    if (!canSubmit || busy) return;
    setErr("");
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        scheduledDate: dateStr,
        scheduledTime: timeStr || null,
      };
      const saved = initial
        ? await api.updateSchedule(initial.id, payload)
        : await api.createSchedule(payload);
      onSaved(saved);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "일정을 저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash={initial ? `schedule-edit-${initial.id}` : "schedule-new"} onClose={onClose} />
      <div className="scr-modal scr-modal-sm scr-schedule-form-modal">
        <div className="scr-modal-head">
          <span>{initial ? "일정 수정" : "일정 등록"}</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>

        <div className="scr-modal-body">
          <label className="scr-field">
            <span className="scr-label">제목</span>
            <input
              className="scr-input"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
              placeholder="무슨 모임인가요?"
              maxLength={TITLE_MAX}
              autoFocus
            />
          </label>

          <div className="scr-field scr-schedule-when">
            <span className="scr-label">일시</span>
            <div className="scr-schedule-when-row">
              <span className="scr-datetime-input-wrap scr-schedule-when-date">
                <input
                  type="date" className="scr-input" value={dateStr}
                  min={DATE_INPUT_MIN} max={DATE_INPUT_MAX}
                  onClick={openPicker}
                  onChange={(e) => setDateStr(e.target.value)}
                />
              </span>
              <span className="scr-datetime-input-wrap scr-schedule-when-time">
                <input
                  type="time" className="scr-input" value={timeStr}
                  onClick={openPicker}
                  onChange={(e) => setTimeStr(e.target.value)}
                />
                {timeStr ? (
                  <button
                    type="button" className="scr-datetime-clear" aria-label="시간 지우기"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTimeStr(""); }}
                  >
                    <X size={12} />
                  </button>
                ) : (
                  <span className="scr-datetime-picker-icon" aria-hidden="true"><Clock size={15} /></span>
                )}
              </span>
            </div>
          </div>

          {err && <div className="scr-err">{err}</div>}
        </div>

        <div className="scr-form-actions">
          <button className="scr-rect-btn is-secondary" onClick={onClose}>취소</button>
          <button
            className={cx("scr-rect-btn")}
            onClick={submit} disabled={!canSubmit || busy}
          >
            {busy ? <><Spinner /> 저장하는 중...</> : <><CalendarPlus size={14} /> {initial ? "저장" : "등록"}</>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
