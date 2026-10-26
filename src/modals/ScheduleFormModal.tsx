import { useState } from "react";
import { X, CalendarPlus, Clock } from "lucide-react";
import { openPicker } from "../components/common/OptionalDateTimeFields";
import { DATE_INPUT_MIN, DATE_INPUT_MAX, todayStr } from "../utils/date";
import { api } from "../api/client";
import type { Schedule } from "../types";
import DocFormModal, { DocTitleField } from "./DocFormModal";

export default function ScheduleFormModal({ initial, onClose, onSaved }: {
  initial?: Schedule | null;
  onClose: () => void;
  onSaved: (schedule: Schedule) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [dateStr, setDateStr] = useState(initial?.scheduledDate ?? todayStr());
  const [timeStr, setTimeStr] = useState(initial?.scheduledTime ?? "");

  const submit = async () => {
    const payload = {
      title: title.trim(),
      scheduledDate: dateStr,
      scheduledTime: timeStr || null,
    };
    onSaved(initial ? await api.updateSchedule(initial.id, payload) : await api.createSchedule(payload));
  };

  return (
    <DocFormModal
      hash={initial ? `schedule-edit-${initial.id}` : "schedule-new"}
      heading={initial ? "일정 수정" : "일정 등록"}
      submitIcon={<CalendarPlus size={14} />}
      submitLabel={initial ? "저장" : "등록"}
      canSubmit={title.trim().length > 0 && !!dateStr}
      failText="일정을 저장하지 못했어요."
      onSubmit={submit}
      onClose={onClose}
      className="scr-schedule-form-modal"
    >
      <DocTitleField value={title} onChange={setTitle} placeholder="무슨 모임인가요?" />

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
    </DocFormModal>
  );
}
