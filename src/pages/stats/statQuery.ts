import { useEffect, useState } from "react";
import { currentMonthValue, MONTH_PERIOD_RE, monthPeriodToRange } from "../../utils/date";
import type { GameType } from "../../types";

/* ★ 통계 조회 조건(2026-11-13 · ClanStatsScreen 에서 옮김) — 통계 화면과 관리자 WPA 상세보기(WpaDetailModal)가 같은 탭 · 기간 · '오늘' 경계를 쓴다. */

export const CLAN_TYPE: GameType = "0102";
export const SOLO_TYPE: GameType = "0101";

/* ★ 화면 전체 탭(2026-10-20, 요청: "종족구성별 전적의 4:4 · 3:3 · 2:2 를 전체 페이지에 영향을 주는 탭으로 맨 위로 · 그에 따라 모든 데이터가 달라지게 ·
   맨 왼쪽 팀전 전체와 맨 오른쪽 1:1 추가") — 고른 규모의 판만 센다(서버 teamSize: 두 편 다 그 머릿수). 1:1 은 일대일 판(0101)의 한 명 대 한 명. */
export const SIZE_TABS = [
  { value: "team", label: "팀전 전체" },
  { value: "4", label: "4:4" },
  { value: "3", label: "3:3" },
  { value: "2", label: "2:2" },
  { value: "1", label: "1:1" },
] as const;
export type SizeTab = (typeof SIZE_TABS)[number]["value"];
export const sizeTabOf = (v: string): SizeTab => (SIZE_TABS.some((t) => t.value === v) ? v as SizeTab : "team");
/* 맵 탭(2026-10-20, 요청: "팀전 필터 밑에 맵 필터" → "기본은 빨무 · 빨무 헌터 투혼 전체 순 · 대표맵 빨무 헌터 투혼은 이미 만들어져 있음 · 그 외는 없애기")
   — 서버 mapGroup: 그 대표맵(map_canon)에 묶인 맵의 판(sg-api repository MAP_GROUP_LIKES). 전체 = 맵을 안 가림. */
/* 전체를 맨 앞으로(2026-10-28, 요청: "전체를 맨 앞으로" — 기본값도 전체 · 옛: 빨무 헌터 투혼 전체). */
export const MAP_TABS = [
  { value: "all", label: "전체" },
  { value: "fastest", label: "빨무" },
  { value: "hunter", label: "헌터" },
  { value: "spirit", label: "투혼" },
] as const;
export type MapTab = (typeof MAP_TABS)[number]["value"];
export const MAP_DEFAULT: MapTab = "all";   // 기본 = 전체(2026-10-28, 요청: "응 전체로 변경" — 티어가 팀전 전체 · 맵 전체에서만 보여서 · 옛: 빨무)
export const mapTabOf = (v: string): MapTab => (MAP_TABS.some((t) => t.value === v) ? v as MapTab : MAP_DEFAULT);
export const PERIOD_ALL = "all";
/* 기간은 달 단위뿐이다 — [어제] [오늘] 하루 고르기는 걷었다(2026-10-22, 요청: "아예 달 단위로 통일 · 오늘 어제 일자 조회 다 제거" — 마감한 달은
   달별 합계만 남는다). 옛 주소의 period=yesterday 는 달 범위로 못 읽어 이번 달로 떨어진다(아래 qRange).
   ★ [오늘]은 되살렸다(2026-10-26, 요청: "기간에 전체기간 과 오늘 버튼을 외부에 추가(월선택, 전체기간, 오늘은 배타적으로 활성됨)" → "기준을 오후 4시로 변경 ·
   게임번호가 아닌 실제 시작시간으로") → "정오 기준으로 변경") — 한국 시각 정오가 하루의 경계다(정오 전이면 어제 정오부터). 서버는 dateFrom/dateTo 의 THH:MM 을 판의 실제 시작 시각으로
   자른다(sg-api DayAt · 시작 시각을 모르는 판은 안 든다). */
export const PERIOD_TODAY = "today";
/** 하루의 경계(한국 시각 · 시) — 오늘은 이 시각부터 다음 날 이 시각 앞까지. */
export const TODAY_CUT_H = 12;   // 8 → 16 → 12(2026-10-26, 요청: "정오 기준으로 변경")
/** 오늘(한국 시각 · 정오 경계)의 [시작, 끝) — "YYYY-MM-DDT12:00" 둘. 정오 전이면 어제 정오부터다. */
export function todayRange(): { from: string; to: string } {
  const kst = new Date(Date.now() + (9 - TODAY_CUT_H) * 3600_000);   // 경계 시각을 0시로 당긴 한국 시각 — 그 날짜가 '오늘'
  const d = (t: Date): string => t.toISOString().slice(0, 10);
  const next = new Date(kst.getTime() + 24 * 3600_000);
  const hm = `${String(TODAY_CUT_H).padStart(2, "0")}:00`;
  return { from: `${d(kst)}T${hm}`, to: `${d(next)}T${hm}` };
}
/** 열쇠에 든 '오늘' 시작에서 [시작, 끝) — 불러오는 범위가 열쇠와 어긋나지 않게(경계 바로 앞에 누른 질의가 디바운스 뒤 경계를 넘어도 같은 하루). */
export function todayRangeFrom(from: string): { from: string; to: string } {
  const [day, hm] = from.split("T");
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + 24 * 3600_000).toISOString().slice(0, 10);
  return { from, to: `${next}T${hm}` };
}
/** 지금의 '오늘' 시작(todayRange().from) — 경계(정오)를 넘으면 저절로 바뀐다(2026-10-27, 요청: "현재 시간 기준으로 정오가 지나면 오늘 정오~내일 정오로 바뀌어야해").
 *  옛: 범위를 [오늘]을 누른 때 한 번만 셌다 — 화면을 연 채 정오를 넘기면 어제 정오~오늘 정오가 그대로 남았다. 이제 다음 경계에 맞춘 타이머와
 *  탭이 다시 보일 때(폰은 잠자는 동안 타이머가 늦는다) 다시 센다 · 값이 바뀌면 질의 열쇠가 바뀌어 다시 불러온다. */
export function useTodayFrom(on: boolean): string {
  const [from, setFrom] = useState(() => todayRange().from);
  useEffect(() => {
    if (!on) return undefined;
    let timer = 0;
    const sync = (): void => {
      const r = todayRange();
      setFrom(r.from);
      window.clearTimeout(timer);
      const ms = Date.parse(`${r.to}:00+09:00`) - Date.now();
      timer = window.setTimeout(sync, Math.max(1000, Math.min(ms + 1000, 6 * 3600_000)));
    };
    const onVis = (): void => { if (document.visibilityState === "visible") sync(); };
    sync();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); };
  }, [on]);
  return from;
}

/** 기간 글자(달 · 달~달 · 전체 · 오늘) → 서버 dateFrom/dateTo — day = 열쇠에 든 '오늘' 시작(useTodayFrom). 달이 아닌 글자는 이번 달. */
export function statRange(period: string, day?: string): { from: string; to: string } {
  if (period === PERIOD_ALL) return { from: "", to: "" };
  if (period === PERIOD_TODAY) return todayRangeFrom(day || todayRange().from);
  return monthPeriodToRange(MONTH_PERIOD_RE.test(period) ? period : currentMonthValue());
}
