import { useRef } from "react";
import { cx } from "../../utils/format";

/* ★ 날짜 지정 두 칸(2026-11-14, 요청: "2번째 줄은 날짜지정 라벨 옆에 인풋창 두개를 이미 보여주기") — 시작 ~ 끝 날짜 칸을 **늘 보이게** 한 줄로.
   옛(2026-11-13, 요청: "통계화면에도 필터에 날짜 지정 추가" → "날짜 지정의 기본값이 오늘"): 달 고르기(MonthCalendar)와 같은 꼴의 단추 + 눌러 여는 작은 창(두 칸 · 도움말 한 줄).
   고른 칸의 반대 칸 고르기 창을 바로 여는 것은 그대로다(아래 picked ★). 켜고 끄기(라디오)는 밖(ClanStatsScreen)이 한다 — 칸을 바꾸면 onChange 가 그 날로 켠다. */

interface DayRangePickerProps {
  /** 고른 날("YYYY-MM-DD") — 두 칸의 값. */
  from: string;
  to: string;
  /** 고를 수 있는 마지막 날(YYYY-MM-DD). */
  max: string;
  onChange: (from: string, to: string) => void;
  className?: string;
}

export default function DayRangePicker({ from, to, max, onChange, className }: DayRangePickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  /** 손이 두 칸 안에 든 뒤 고른 칸(2026-11-13, 요청: "한 날짜 선택 시 바로 반대 날짜 선택 창으로 · 둘 다 선택 시 닫힘") — 손이 밖에서 들어올 때 비운다(옛: 창을 열 때). */
  const picked = useRef({ from: false, to: false });
  /** 마지막으로 자판을 누른 때 — 숫자를 쳐 넣는 중이면 반대 칸으로 넘기지 않는다(한 자리만 쳐도 날짜가 되어 onChange 가 온다). */
  const typedAt = useRef(0);
  /** 다른 칸의 고르기 창을 바로 연다 — showPicker 가 없거나 막히면 칸에 손만 옮긴다. */
  const openPicker = (el: HTMLInputElement | null): void => {
    if (!el || Date.now() - typedAt.current < 1500) return;
    window.setTimeout(() => {
      try { el.showPicker(); } catch { el.focus(); }
    }, 0);
  };
  const pickFrom = (v: string): void => {
    onChange(v, v > to ? v : to);
    picked.current.from = true;
    if (!picked.current.to) openPicker(toRef.current);
  };
  const pickTo = (v: string): void => {
    onChange(v < from ? v : from, v);
    picked.current.to = true;
    if (!picked.current.from) openPicker(fromRef.current);
  };

  return (
    <div
      className={cx("scr-dayrange-inline", className)} ref={ref}
      title="시작 · 끝 날짜 사이(끝 날 포함) 판만 · 하루는 정오부터 다음 날 정오 전까지"
      onFocus={(e) => { if (!ref.current?.contains(e.relatedTarget as Node | null)) picked.current = { from: false, to: false }; }}
      onKeyDown={() => { typedAt.current = Date.now(); }}
    >
      <input ref={fromRef} type="date" className="scr-input scr-date-compact" aria-label="시작 날짜" value={from} max={max}
        onChange={(e) => { const v = e.target.value; if (v) pickFrom(v); }} />
      <span aria-hidden>~</span>
      <input ref={toRef} type="date" className="scr-input scr-date-compact" aria-label="끝 날짜" value={to} max={max}
        onChange={(e) => { const v = e.target.value; if (v) pickTo(v); }} />
    </div>
  );
}
