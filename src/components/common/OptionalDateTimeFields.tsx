import { X, Calendar } from "lucide-react";
import { cx } from "../../utils/format";
import { DATE_INPUT_MIN, DATE_INPUT_MAX, shortDate, isValidDateStr } from "../../utils/date";

export function openPicker(e: React.MouseEvent<HTMLInputElement>) {
  const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
  try { el.showPicker?.(); } catch { }
}

export const TIME_NOTE_MAX = 30;
export const TIME_NOTE_PLACEHOLDER = "예) 그날 봐서, 아무도 몰래";

interface OptionalDateTimeFieldsProps {
  dateStr: string;
  onDateChange: (value: string) => void;
  noteStr: string;
  onNoteChange: (value: string) => void;
  dateLocked?: boolean;
  noteLocked?: boolean;
  invalid?: boolean;
}

export default function OptionalDateTimeFields({
  dateStr, onDateChange, noteStr, onNoteChange,
  dateLocked = false, noteLocked = false, invalid = false,
}: OptionalDateTimeFieldsProps) {
  const cls = `scr-input${invalid ? " scr-input-invalid" : ""}`;
  const locked = dateLocked || noteLocked;
  const optional = locked ? null : <span className="scr-label-optional">(선택)</span>;

  return (
    <div className="scr-datetime-stack">
      <label className="scr-field scr-datetime-input">
        <span className="scr-label">날짜{optional && <> {optional}</>}</span>
        <span className="scr-datetime-input-wrap">
          {dateLocked ? (
            <input
              type="text" className={cx(cls, "scr-datetime-locked")} readOnly tabIndex={-1}
              value={isValidDateStr(dateStr) ? shortDate(dateStr) : dateStr}
            />
          ) : (
            <input
              type="date" className={cls} value={dateStr}
              min={DATE_INPUT_MIN} max={DATE_INPUT_MAX}
              onClick={openPicker}
              onChange={(e) => onDateChange(e.target.value)}
            />
          )}
          {!dateLocked && (dateStr ? (
            <button
              type="button" className="scr-datetime-clear" aria-label="날짜 지우기"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault(); e.stopPropagation();
                onDateChange("");
              }}
            >
              <X size={12} />
            </button>
          ) : (
            <span className="scr-datetime-picker-icon" aria-hidden="true"><Calendar size={15} /></span>
          ))}
        </span>
      </label>
      <label className="scr-field scr-datetime-input">
          <span className="scr-label">언제{optional && <> {optional}</>}</span>
          <span className="scr-datetime-input-wrap">
            <input
              type="text" className={cx(cls, noteLocked && "scr-datetime-locked")} value={noteStr}
              placeholder={noteLocked ? "" : TIME_NOTE_PLACEHOLDER}
              maxLength={TIME_NOTE_MAX}
              readOnly={noteLocked} tabIndex={noteLocked ? -1 : undefined}
              onChange={noteLocked ? undefined : (e) => onNoteChange(e.target.value)}
            />
            {!noteLocked && noteStr && (
              <button
                type="button" className="scr-datetime-clear" aria-label="언제 지우기"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  onNoteChange("");
                }}
              >
                <X size={12} />
              </button>
            )}
        </span>
      </label>
      {locked && (
        <p className="scr-datetime-locked-note">날짜와 언제는 수락 후 변경 가능</p>
      )}
    </div>
  );
}
