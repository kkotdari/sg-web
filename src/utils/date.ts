import type { PeriodPreset } from "../types";

export const DATE_INPUT_MIN = "1990-01-01";
export const DATE_INPUT_MAX = "2100-12-31";
export const MONTH_INPUT_MIN = "1990-01";
export const MONTH_INPUT_MAX = "2100-12";

export const pad = (n: number): string => String(n).padStart(2, "0");


export const fmt = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function gameNow(): Date {
  return new Date();
}

export const todayStr = (): string => fmt(gameNow());

export const dstrFor = (y: number, m: number, d: number): string =>
  `${y}-${pad(m + 1)}-${pad(d)}`;

export const isValidDateStr = (s: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());

export const autoFormatDateInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  let out = y;
  if (digits.length > 4) out += `-${m}`;
  if (digits.length > 6) out += `-${d}`;
  return out;
};

export const monthStart = (y: number, m: number): string => dstrFor(y, m, 1);
export const monthEnd = (y: number, m: number): string =>
  dstrFor(y, m, new Date(y, m + 1, 0).getDate());

export function monthInputToRange(value: string): { from: string; to: string } {
  const [y, m] = value.split("-").map(Number);
  return { from: monthStart(y, m - 1), to: monthEnd(y, m - 1) };
}

/** 달 구간 "YYYY-MM~YYYY-MM"(앞 ≤ 뒤) 또는 한 달 "YYYY-MM" — 통계의 연속 달 고르기(2026-10-22, 요청: "통계에서 월을 연속적으로 선택 가능하게"). */
export const MONTH_PERIOD_RE = /^\d{4}-\d{2}(~\d{4}-\d{2})?$/;
export function monthPeriodToRange(value: string): { from: string; to: string } {
  const [a, b = a] = value.split("~");
  return { from: monthInputToRange(a).from, to: monthInputToRange(b).to };
}

export const currentMonthValue = (): string => todayStr().slice(0, 7);


export function shortYearPrefix(year: number, now: Date = gameNow()): string {
  return year === now.getFullYear() ? "" : `${String(year).slice(2)}년 `;
}

export function monthLabel(month: string, now: Date = gameNow()): string {
  const [y, m] = month.split("-").map(Number);
  return `${shortYearPrefix(y, now)}${m}월`;
}

/** 달 구간 이름 — "8월~10월" · 올해가 아니면 해를 붙인다("25년 8월~10월") · 해를 넘으면 두 끝에("24년 12월~1월"은 뒤가 올해일 때). */
export function monthPeriodLabel(value: string, now: Date = gameNow()): string {
  const [a, b] = value.split("~");
  if (!b || a === b) return monthLabel(a, now);
  const mon = (s: string): number => Number(s.slice(5));
  if (a.slice(0, 4) === b.slice(0, 4)) return `${monthLabel(a, now)}~${mon(b)}월`;
  return `${a.slice(2, 4)}년 ${mon(a)}월~${monthLabel(b, now)}`;
}

export function shiftMonthValue(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export const weekStart = (d: Date): string => {
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  return fmt(new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff));
};
export const weekEnd = (d: Date): string => {
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  return fmt(new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff));
};

export function periodPresetRange(
  preset: PeriodPreset, from: string, to: string, offset = 0,
): { from: string; to: string } {
  if (preset === "custom") return { from, to };
  if (preset === "all") return { from: "", to: "" };
  const now = gameNow();
  if (preset === "today") {
    const t = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset));
    return { from: t, to: t };
  }
  if (preset === "week") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset * 7);
    return { from: weekStart(d), to: weekEnd(d) };
  }
  if (preset === "year") {
    const y = now.getFullYear() - offset;
    return { from: fmt(new Date(y, 0, 1)), to: fmt(new Date(y, 11, 31)) };
  }
  let y = now.getFullYear();
  let m = now.getMonth() - offset;
  while (m < 0) { m += 12; y -= 1; }
  return { from: monthStart(y, m), to: monthEnd(y, m) };
}


export const DOW = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function shortDate(dateStr: string, now: Date = gameNow()): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${shortYearPrefix(y, now)}${m}월 ${d}일`;
}

const DOW_FULL = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"] as const;

export function formatWhen(
  when: number | Date | string | null | undefined,
  { clock = false, empty = "미정", now = gameNow() }: { clock?: boolean; empty?: string; now?: Date } = {},
): string {
  if (when === null || when === undefined || when === "") return empty;
  let d: Date;
  let withClock = clock;
  if (typeof when === "string") {
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(when);
    if (ymd) {
      d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
      withClock = false;
    } else {
      d = new Date(when);
    }
  } else {
    d = new Date(when);
  }
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return empty;

  if (withClock) {
    const diffMs = now.getTime() - ms;
    if (diffMs >= 0 && diffMs < 24 * 60 * 60 * 1000) {
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return "방금 전";
      if (mins < 60) return `${mins}분 전`;
      return `${Math.floor(diffMs / (60 * 60 * 1000))}시간 전`;
    }
  }
  const time = withClock ? ` ${formatKoreanTime(d)}` : "";
  const dayStart = (x: Date) => { const c = new Date(x); c.setHours(0, 0, 0, 0); return c.getTime(); };
  const diffDays = Math.round((dayStart(d) - dayStart(now)) / 86_400_000);
  if (diffDays === 0) return `오늘${time}`;
  if (diffDays === 1) return `내일${time}`;
  if (diffDays === 2) return `모레${time}`;
  if (diffDays > 0) {
    const wkStart = (x: Date) => dayStart(x) - ((x.getDay() + 6) % 7) * 86_400_000;
    const weekDiff = Math.round((wkStart(d) - wkStart(now)) / (7 * 86_400_000));
    if (weekDiff === 0) return `이번주 ${DOW_FULL[d.getDay()]}${time}`;
    if (weekDiff === 1) return `다음주 ${DOW_FULL[d.getDay()]}${time}`;
  } else if (diffDays === -1) {
    return `어제${time}`;
  } else if (diffDays === -2) {
    return `그저께${time}`;
  } else if (diffDays > -7) {
    return `${DOW_FULL[d.getDay()]}${time}`;
  }
  return `${shortDate(fmt(d), now)}${time}`;
}

export interface ScheduleLike {
  scheduledDate: string | null;
}

export function serverMs(iso: string | null | undefined): number {
  if (!iso) return NaN;
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`).getTime();
}

export function formatAgo(when: number | string | Date | null | undefined, now: Date = gameNow()): string {
  if (when === null || when === undefined || when === "") return formatWhen(when, { now });
  const ms = typeof when === "number" ? when : new Date(when).getTime();
  if (!Number.isFinite(ms)) return formatWhen(when, { now });
  const diff = now.getTime() - ms;
  if (diff < 0) return formatWhen(when, { now });
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(diff / 86_400_000);
  if (days <= 7) return `${days}일 전`;
  return formatWhen(when, { now });
}

export function scheduledInstantMs(s: ScheduleLike): number | null {
  if (!s.scheduledDate) return null;
  return new Date(`${s.scheduledDate}T23:59:59`).getTime();
}

export function isToday(s: ScheduleLike): boolean {
  if (!s.scheduledDate) return false;
  return s.scheduledDate === fmt(gameNow());
}

export function formatKoreanTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function calendarMonthsDays(earlier: Date, later: Date): { months: number; days: number } {
  let months = (later.getFullYear() - earlier.getFullYear()) * 12 + (later.getMonth() - earlier.getMonth());
  let days = later.getDate() - earlier.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(later.getFullYear(), later.getMonth(), 0).getDate();
  }
  return { months: Math.max(0, months), days: Math.max(0, days) };
}

export function formatRelativeSchedule(s: ScheduleLike): string {
  if (!s.scheduledDate) return "일정 미정";
  const [y, mo, dd] = s.scheduledDate.split("-").map(Number);
  const d = new Date(y, mo - 1, dd);
  const now = gameNow();
  const past = d.getTime() <= now.getTime();
  const [earlier, later] = past ? [d, now] : [now, d];
  const { months, days } = calendarMonthsDays(earlier, later);
  const parts: string[] = [];
  if (months > 0) parts.push(`${months}개월`);
  if (days > 0) parts.push(`${days}일`);
  return parts.length > 0 ? `${parts.join(" ")} ${past ? "전" : "후"}` : "오늘";
}
export const MONTHS_KR = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
] as const;
