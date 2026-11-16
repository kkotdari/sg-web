import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DateRange } from "react-day-picker";
import { ko } from "react-day-picker/locale";
import "react-day-picker/style.css";
import { cx } from "../../utils/format";
import { attachPopover } from "../../utils/popover";

/* ★ 날짜 지정 — 한 달력에서 시작 · 끝(2026-11-16, 요청: "데이트피커 라이브러리 제일 좋은걸로 조사해서 도입 · 달력누르면 기간을 한 달력안에서 처음과 끝 지정할수 있게 ·
   오늘 어제 최근 일주일 이렇게는 프리셋으로 · 디자인은 우리 라이팅테마"). react-day-picker 9(shadcn Calendar 가 감싸는 것 · 범위 고르기 · 접근성 · 한국어 locale ·
   제 CSS 변수만 덮으면 테마가 먹는다 — 라이팅 테마 색은 global.css .scr-drp-*). 단추 하나(달력 아이콘 + 기간 글자)를 누르면 달 고르기(MonthCalendar)와 같은 꼴의
   작은 창 — 맨 위 프리셋 셋 · 한 달 달력 · 아래 안내 한 줄. 첫 날을 누르면 시작(끝은 손이 가는 날까지 옅게 미리 칠함) · 다음 날을 누르면 둘 사이 전부로 닫힌다
   (어느 차례든 · 같은 날 두 번이면 하루). 창 밖 · Esc 는 그대로 닫힌다. 켜고 끄기(라디오)는 밖(ClanStatsScreen)이 한다 — 고르면 onChange 가 그 날로 켠다.
   옛(2026-11-14 ~ 11-16): 늘 보이는 시작 ~ 끝 두 칸(input type=date) · 한 칸을 고르면 반대 칸 창을 바로 열었다 — 윈도 크롬에서 달만 넘겨도(값이 미리 바뀌며 input 이 온다)
   고른 것으로 쳐 반대 칸 창이 떴고 · 창이 뜬 칸이 어딘지 안 보였다(같은 날 "달력 떴을때 인풋칸 포커싱 효과 필요 · 어딘지 모르겠어"). 그 전(2026-11-13): 단추 + 두 칸 창. */

interface DayRangePickerProps {
  /** 고른 날("YYYY-MM-DD") — 기간의 두 끝(하루면 같다). */
  from: string;
  to: string;
  /** 고를 수 있는 마지막 날(YYYY-MM-DD · 오늘). 프리셋도 이 날을 '오늘'로 센다. */
  max: string;
  onChange: (from: string, to: string) => void;
  className?: string;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
/** "YYYY-MM-DD" → 그 날 0시(기기 시간대) — 달력은 날만 본다. */
const toDate = (s: string): Date => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const toStr = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDays = (s: string, n: number): string => { const d = toDate(s); d.setDate(d.getDate() + n); return toStr(d); };
/** 단추 글자 — "2026.11.01 ~ 11.14"(같은 해면 끝의 해를 줄인다) · 하루면 "2026.11.14". */
const label = (a: string, b: string): string => {
  const dot = (s: string) => s.replace(/-/g, ".");
  if (a === b) return dot(a);
  return `${dot(a)} ~ ${a.slice(0, 4) === b.slice(0, 4) ? dot(b.slice(5)) : dot(b)}`;
};

/** 프리셋(요청: "오늘 어제 최근 일주일") — 최근 일주일은 오늘을 넣은 이레. */
const PRESETS: { key: string; text: string; range: (today: string) => [string, string] }[] = [
  { key: "today", text: "오늘", range: (t) => [t, t] },
  { key: "yesterday", text: "어제", range: (t) => [addDays(t, -1), addDays(t, -1)] },
  { key: "week", text: "최근 일주일", range: (t) => [addDays(t, -6), t] },
];

export default function DayRangePicker({ from, to, max, onChange, className }: DayRangePickerProps) {
  const [open, setOpen] = useState(false);
  /** 첫 칸(연 동안만) — 다음 칸이 다른 끝이다. */
  const [anchor, setAnchor] = useState<string | null>(null);
  /** 첫 칸을 누른 뒤 손이 올라간 날 — 그 사이를 옅게 미리 칠한다. */
  const [hover, setHover] = useState<string | null>(null);
  /** 보고 있는 달(그 달 1일) — 열 때 끝 날의 달로 맞춘다. */
  const [month, setMonth] = useState(() => toDate(to));
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setMonth(toDate(to));
    setAnchor(null); setHover(null);
    // 열고 닫을 때만 — 고르는 동안 보던 달을 지킨다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !ref.current || !popRef.current) return;
    return attachPopover(ref.current, popRef.current, { maxWidth: 272, simple: true });   // 단추 바로 아래(MonthCalendar 와 같은 자리 잡기)
  }, [open]);

  /* 창 밖을 누르면 닫고 그 누름은 삼킨다(MonthCalendar 와 같다 — 밑의 단추가 같이 눌리지 않게) · Esc 도 닫는다. */
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
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown, true); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const commit = (a: string, b: string): void => {
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    onChange(lo, hi);
    setOpen(false);
  };
  const pick = (d: Date | undefined): void => {
    if (!d) return;
    const v = toStr(d);
    if (anchor === null) { setAnchor(v); setHover(v); return; }
    commit(anchor, v);
  };

  /* 달력에 칠할 것 — 고르는 중이면 첫 칸 ~ 손이 간 날(미리 보기), 아니면 지금 기간. */
  const shown: DateRange = anchor !== null
    ? (() => { const h = hover ?? anchor; const [lo, hi] = anchor <= h ? [anchor, h] : [h, anchor]; return { from: toDate(lo), to: toDate(hi) }; })()
    : { from: toDate(from), to: toDate(to) };
  const maxDate = toDate(max);
  const presetOn = (p: (typeof PRESETS)[number]) => { const [a, b] = p.range(max); return a === from && b === to; };

  return (
    <div className={cx("scr-month-cal scr-drp", className)} ref={ref}>
      <button
        type="button"
        className={cx("scr-month-cal-trigger scr-compact-rect-btn is-secondary scr-drp-trigger", open && "scr-month-cal-open")}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog" aria-expanded={open}
        title="시작 · 끝 날짜 사이(끝 날 포함) 판만 · 하루는 정오부터 다음 날 정오 전까지"
      >
        <CalendarDays size={14} aria-hidden />
        <span className="scr-drp-text">{label(from, to)}</span>
      </button>
      {open && createPortal(
        <div className="scr-month-cal-pop scr-drp-pop" ref={popRef} role="dialog" aria-label="날짜 고르기">
          <div className="scr-drp-presets">
            {PRESETS.map((p) => (
              <button
                key={p.key} type="button"
                className={cx("scr-month-cal-all scr-drp-preset", presetOn(p) && "scr-month-cal-cell-on")}
                onClick={() => { const [a, b] = p.range(max); commit(a, b); }}
              >
                {p.text}
              </button>
            ))}
          </div>
          <DayPicker
            mode="range"
            locale={ko}
            className="scr-drp-cal"
            navLayout="around"
            showOutsideDays
            selected={shown}
            onSelect={(_r, day) => pick(day)}
            onDayMouseEnter={(d) => { if (anchor !== null) setHover(toStr(d)); }}
            month={month}
            onMonthChange={setMonth}
            endMonth={maxDate}
            disabled={{ after: maxDate }}
            modifiers={anchor !== null ? { picking: shown } : undefined}
            modifiersClassNames={{ picking: "is-picking" }}
            formatters={{ formatCaption: (d) => `${d.getFullYear()}년 ${d.getMonth() + 1}월` }}
            components={{
              Chevron: ({ orientation }) => (orientation === "left" ? <ChevronLeft size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />),
            }}
          />
          <p className="scr-month-cal-hint">{anchor === null ? "시작과 끝 날을 선택" : "끝 날을 선택 · 같은 날을 한 번 더 누르면 하루"}</p>
        </div>,
        document.body,
      )}
    </div>
  );
}
