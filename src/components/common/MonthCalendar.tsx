import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "../../utils/format";
import { attachPopover } from "../../utils/popover";
import { monthPeriodLabel } from "../../utils/date";

interface MonthCalendarProps {
  value: string;
  onChange: (value: string) => void;
  minMonth?: string | null;
  maxMonth: string;
  allValue?: string;
  allLabel?: string;
  className?: string;
  /** 연속 달 고르기(통계 · 2026-10-22, 요청: "통계에서 월을 연속적으로 선택 가능하게") — 값이 "YYYY-MM~YYYY-MM" 일 수 있다.
   *  첫 칸을 누르면 그 한 달로 바로 바뀌고 창이 열린 채 남는다 · 다른 칸을 누르면 두 달 사이 전부로 닫힌다(같은 칸이나 창 밖은 한 달 그대로). */
  range?: boolean;
  /** 달이 아닌 기간(밖의 [전체기간]·[오늘])이 켜진 동안 — 단추를 테두리 꼴로 · 글자 "월 선택"(통계 · 2026-10-26 배타 기간 단추). */
  idle?: boolean;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const pad2 = (n: number) => String(n).padStart(2, "0");
const yearOf = (m: string) => Number(m.slice(0, 4));

export default function MonthCalendar({
  value, onChange, minMonth, maxMonth, allValue, allLabel = "전체 기간", className, range = false, idle = false,
}: MonthCalendarProps) {
  const [open, setOpen] = useState(false);
  const isAll = allValue !== undefined && value === allValue;
  /* 고른 구간의 두 끝(한 달이면 같다) · 해는 뒤 끝의 해로 연다. */
  const [lo, hi = lo] = isAll ? ["", ""] : value.split("~");
  const [year, setYear] = useState(() => (isAll ? yearOf(maxMonth) : yearOf(hi)));
  /** 구간의 첫 칸(연 동안만) — 다음 칸이 끝이다. */
  const [anchor, setAnchor] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setYear(isAll ? yearOf(maxMonth) : yearOf(hi));
    else setAnchor(null);
    // 열 때만 해를 맞춘다(구간 첫 칸을 누르며 값이 바뀌어도 보던 해를 지킨다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !ref.current || !popRef.current) return;
    return attachPopover(ref.current, popRef.current, { maxWidth: 248, simple: true });   // 단추 바로 아래(popover simple ★ · 아이폰 앱에서 위로 뒤집히던 것)
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
  const pick = (v: string): void => {
    if (!range) { commit(v); return; }
    if (anchor === null) { onChange(v); setAnchor(v); return; }
    if (v === anchor) { setOpen(false); return; }
    commit(v < anchor ? `${v}~${anchor}` : `${anchor}~${v}`);
  };

  return (
    <div className={cx("scr-month-cal", className)} ref={ref}>
      <button
        type="button"
        className={cx("scr-month-cal-trigger scr-compact-rect-btn", open && "scr-month-cal-open", idle && "is-secondary")}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        aria-haspopup="dialog" aria-expanded={open}
      >
        <CalendarDays size={14} aria-hidden />
        <span>{idle ? "월 선택" : isAll ? allLabel : monthPeriodLabel(value)}</span>
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
                  className={cx("scr-month-cal-cell", !idle && (v === lo || v === hi) && "scr-month-cal-cell-on", !idle && v > lo && v < hi && "scr-month-cal-cell-in")}
                  onClick={() => pick(v)} disabled={!inRange(v)}
                >
                  {m}월
                </button>
              );
            })}
          </div>
          {range && <p className="scr-month-cal-hint">{anchor ? "끝 달을 누르면 그 사이 전부" : "두 달을 차례로 누르면 그 사이 전부"}</p>}
          {allValue !== undefined && (
            <div className="scr-month-cal-extra">
              <button
                type="button"
                className={cx("scr-month-cal-all", value === allValue && "scr-month-cal-cell-on")}
                onClick={() => commit(allValue)}
              >
                {allLabel}
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
