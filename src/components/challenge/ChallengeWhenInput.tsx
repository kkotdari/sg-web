import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "../../utils/format";
import { formatWhen, DATE_INPUT_MIN, DATE_INPUT_MAX } from "../../utils/date";
import { openPicker, TIME_NOTE_MAX, TIME_NOTE_PLACEHOLDER } from "../common/OptionalDateTimeFields";
import { attachPopover } from "../../utils/popover";
import type { Challenge } from "../../types";

function WhenPop({ label, filled, children }: {
  label: string;
  filled?: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !ref.current || !popRef.current) return;
    return attachPopover(ref.current, popRef.current, { maxWidth: 232 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  return (
    <div className="scr-when-pop" ref={ref}>
      <button
        type="button"
        className={cx("scr-when-pop-trigger", filled && "scr-when-pop-filled", open && "scr-when-pop-open")}
        onClick={() => setOpen((v) => !v)}
      >
        {filled || label}
      </button>
      {open && createPortal(
        <div className="scr-when-pop-panel" ref={popRef}>
          {children(() => setOpen(false))}
        </div>,
        document.body,
      )}
    </div>
  );
}

export default function ChallengeWhenInput({
  challenge, dateStr, onDateChange, noteStr, onNoteChange, dateLocked, noteLocked, invalid,
}: {
  challenge: Challenge;
  dateStr: string;
  onDateChange: (v: string) => void;
  noteStr: string;
  onNoteChange: (v: string) => void;
  dateLocked: boolean;
  noteLocked: boolean;
  invalid?: boolean;
}) {
  const date = dateLocked ? (challenge.scheduledDate ?? "") : dateStr;
  const note = (noteLocked ? challenge.scheduledTimeNote : noteStr).trim();

  return (
    <div className={cx("scr-challenge-when", invalid && "scr-challenge-when-invalid")}>
      {dateLocked ? (
        <span className="scr-challenge-when-value">{formatWhen(date, { empty: "일정 미정" })}</span>
      ) : (
        <WhenPop label="날짜 입력" filled={dateStr ? formatWhen(dateStr, { empty: "" }) : undefined}>
          {(close) => (
            <input
              type="date" className="scr-input" autoFocus
              value={dateStr} min={DATE_INPUT_MIN} max={DATE_INPUT_MAX}
              onClick={openPicker}
              onChange={(e) => { onDateChange(e.target.value); if (e.target.value) close(); }}
            />
          )}
        </WhenPop>
      )}
      <span className="scr-challenge-when-sep" aria-hidden>·</span>
      {noteLocked ? (
        <span className="scr-challenge-when-value">{note}</span>
      ) : (
        <WhenPop label="언제 입력" filled={note || undefined}>
          {(close) => (
            <input
              type="text" className="scr-input" autoFocus
              value={noteStr} maxLength={TIME_NOTE_MAX} placeholder={TIME_NOTE_PLACEHOLDER}
              onChange={(e) => onNoteChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") close(); }}
            />
          )}
        </WhenPop>
      )}
    </div>
  );
}
