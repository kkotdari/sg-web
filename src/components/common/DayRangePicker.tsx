import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "../../utils/format";
import { attachPopover } from "../../utils/popover";

/* ★ 날짜 지정 단추(2026-11-13, 요청: "통계화면에도 필터에 날짜 지정 추가" → "날짜 지정의 기본값이 오늘") — 달 고르기(MonthCalendar)와 같은 꼴의 단추 + 아래 작은 창(시작 ~ 끝).
   꺼진 채 누르면 onActivate(통계: 오늘로 켬)하고 창을 연다 · 켜진 동안 단추 글자는 고른 날(label) · 다시 누르면 창을 열고 닫는다.
   단추가 한 칸이라 폰 기간 줄이 한 줄에 든다(요청: "모바일 … 최상단은 현재의 기간 필터 한줄만"). */

interface DayRangePickerProps {
  /** 고른 날 — 켜져 있을 때 창의 두 칸. */
  from: string;
  to: string;
  active: boolean;
  /** 켜진 동안 단추 글자. */
  label: string;
  /** 고를 수 있는 마지막 날(YYYY-MM-DD). */
  max: string;
  onChange: (from: string, to: string) => void;
  /** 꺼진 채 누를 때 — 기본 날로 켠다. */
  onActivate: () => void;
  className?: string;
}

export default function DayRangePicker({ from, to, active, label, max, onChange, onActivate, className }: DayRangePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !ref.current || !popRef.current) return;
    return attachPopover(ref.current, popRef.current, { maxWidth: 300, simple: true });
  }, [open]);

  /* 창 밖을 누르면 닫는다 — 그 누름은 아래 것에 안 간다(MonthCalendar 와 같은 규칙). */
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

  const press = (): void => {
    if (!active) { onActivate(); setOpen(true); return; }
    setOpen((v) => !v);
  };

  return (
    <div className={cx("scr-month-cal", className)} ref={ref}>
      <button
        type="button"
        className={cx("scr-month-cal-trigger scr-compact-rect-btn", open && "scr-month-cal-open", !active && "is-secondary")}
        onClick={press}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        aria-haspopup="dialog" aria-expanded={open} aria-pressed={active}
        title="시작 · 끝 날짜를 골라 그 사이(끝 날 포함) 판만 · 하루는 정오부터 다음 날 정오 전까지"
      >
        <span>{active ? label : "날짜 지정"}</span>
      </button>
      {open && createPortal(
        <div className="scr-month-cal-pop scr-dayrange-pop" ref={popRef} role="dialog" aria-label="날짜 고르기">
          <div className="scr-dayrange-row">
            <input type="date" className="scr-input scr-input-sm" aria-label="시작 날짜" value={from} max={max}
              onChange={(e) => { const v = e.target.value; if (v) onChange(v, v > to ? v : to); }} />
            <span aria-hidden>~</span>
            <input type="date" className="scr-input scr-input-sm" aria-label="끝 날짜" value={to} max={max}
              onChange={(e) => { const v = e.target.value; if (v) onChange(v < from ? v : from, v); }} />
          </div>
          <p className="scr-month-cal-hint">하루는 정오부터 다음 날 정오 전까지</p>
        </div>,
        document.body,
      )}
    </div>
  );
}
