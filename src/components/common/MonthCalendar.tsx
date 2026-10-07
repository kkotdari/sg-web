import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "../../utils/format";
import { attachPopover } from "../../utils/popover";
import { monthLabel } from "../../utils/date";

interface MonthCalendarProps {
  value: string;
  onChange: (value: string) => void;
  minMonth?: string | null;
  maxMonth: string;
  allValue?: string;
  allLabel?: string;
  className?: string;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const pad2 = (n: number) => String(n).padStart(2, "0");
const yearOf = (m: string) => Number(m.slice(0, 4));

export default function MonthCalendar({
  value, onChange, minMonth, maxMonth, allValue, allLabel = "전체 기간", className,
}: MonthCalendarProps) {
  const [open, setOpen] = useState(false);
  const isAll = allValue !== undefined && value === allValue;
  const [year, setYear] = useState(() => (isAll ? yearOf(maxMonth) : yearOf(value)));
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setYear(isAll ? yearOf(maxMonth) : yearOf(value));
  }, [open, value, isAll, maxMonth]);

  useEffect(() => {
    if (!open || !ref.current || !popRef.current) return;
    return attachPopover(ref.current, popRef.current, { maxWidth: 248 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
      e.preventDefault();
      e.stopPropagation();
      const swallow = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
        document.removeEventListener("click", swallow, true);
      };
      document.addEventListener("click", swallow, true);
      window.setTimeout(() => document.removeEventListener("click", swallow, true), 400);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  const inRange = (m: string) => (!minMonth || m >= minMonth) && m <= maxMonth;
  const yearHasAny = (y: number) => MONTHS.some((m) => inRange(`${y}-${pad2(m)}`));
  const commit = (v: string) => { onChange(v); setOpen(false); };

  return (
    <div className={cx("scr-month-cal", className)} ref={ref}>
      <button
        type="button"
        className={cx("scr-month-cal-trigger scr-compact-rect-btn scr-lighting-color", open && "scr-month-cal-open")}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        aria-haspopup="dialog" aria-expanded={open}
      >
        <CalendarDays size={14} aria-hidden />
        <span>{isAll ? allLabel : monthLabel(value)}</span>
      </button>
      {open && createPortal(
        <div className="scr-month-cal-pop" ref={popRef} role="dialog" aria-label="기간 고르기">
          <div className="scr-month-cal-head">
            <button
              type="button" className="scr-month-cal-nav" aria-label="이전 해"
              onClick={() => setYear((y) => y - 1)} disabled={!yearHasAny(year - 1)}
            >
              <ChevronLeft size={15} aria-hidden />
            </button>
            <span className="scr-month-cal-year">{year}년</span>
            <button
              type="button" className="scr-month-cal-nav" aria-label="다음 해"
              onClick={() => setYear((y) => y + 1)} disabled={!yearHasAny(year + 1)}
            >
              <ChevronRight size={15} aria-hidden />
            </button>
          </div>
          <div className="scr-month-cal-grid">
            {MONTHS.map((m) => {
              const v = `${year}-${pad2(m)}`;
              return (
                <button
                  key={m} type="button"
                  className={cx("scr-month-cal-cell", v === value && "scr-month-cal-cell-on")}
                  onClick={() => commit(v)} disabled={!inRange(v)}
                >
                  {m}월
                </button>
              );
            })}
          </div>
          {allValue !== undefined && (
            <button
              type="button"
              className={cx("scr-month-cal-all", isAll && "scr-month-cal-cell-on")}
              onClick={() => commit(allValue)}
            >
              {allLabel}
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
