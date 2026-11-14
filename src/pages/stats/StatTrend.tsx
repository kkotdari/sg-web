import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { Spinner } from "../../components/common/Feedback";
import { shiftMonthValue } from "../../utils/date";
import type { TierCalcRow, BaseRace, Member, MemberStatsEntry, TierEntry } from "../../types";

/* ★ 통계 칸의 **5개월 변화 그래프**(2026-10-24, 요청: "통계 컬럼 피시는 호버 폰은 클릭시 → 5개월간의 변화 그래프로" → "7개월로 통일하자") ─────────────────────────
   표의 값 칸(게임수 · 승률 · 데미지 · APM · 종족별 게임수 · 승률 · 폰 전적 칸)에 PC 는 마우스를 얹으면, 폰은 누르면 그 사람 · 그 값의 다섯 달
   (조회한 달이 **맨 오른쪽** · 앞 네 달) 선 그래프가 팝오버로 뜬다. 자료는 표 요청의 trendMonths 로 **한 응답에** 같이 온다(응답 trend · ClanStatsScreen ·
   2026-10-24 "통계 요청 자체를 바꿔서 7달치를 한 응답에" — 옛 '앞 달들을 뒤따라 받기'는 걷었다 · 없는 달은 점을 안 찍는다). 꼴은 래더 상세 그래프(.scr-rank-detail-*)와 같은 벌이고, 두 값이 한 칸에 사는
   데미지(딜 · 피해)·폰 전적(게임수 · 승률)은 선을 둘 그린다(각자 제 자로 눕히고 값은 점 위에 적는다). */

/** 다섯 달(2026-10-28, 요청: "피시 모바일 모두 팝업 그래프 기간 5개월로" · 옛: 일곱 — 2026-10-24 "7개월로 통일하자" · 조회한 달이 맨 오른쪽). 한 달 조회 때의 달 수다. */
export const TREND_MONTHS = 5;
/** 서버 trendMonths 상한(ge=1 · le=24) — 여러 달 조회가 그보다 길면 마지막 24달만. */
export const TREND_MAX = 24;
/** 그래프의 달들 — 한 달(YYYY-MM) 조회면 그 달을 끝으로 다섯 달 · 여러 달(a~b) 조회면 **그 기간**(a..b · 2026-10-24, 요청: "여러달 기준이면 그 기간동안의 그래프를 보여주기") ·
 *  전체 기간은 부르는 쪽이 이번 달을 넣어 최근 다섯 달(요청: "전체 기간은 최근으로"). */
export function statTrendMonths(period: string): string[] {
  const [a, b] = period.split("~");
  const last = b || a;
  let n = TREND_MONTHS;
  if (b) {
    const [ya, ma] = a.split("-").map(Number); const [yb, mb] = b.split("-").map(Number);
    n = Math.min(TREND_MAX, Math.max(1, (yb - ya) * 12 + (mb - ma) + 1));
  }
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) out.push(shiftMonthValue(last, -i));
  return out;
}

/** 변화 그래프의 한 줄 — 평균 줄(2026-10-25)은 그 달의 **경기 수**(games · 화면 clanGames 규칙)를 함께 든다. */
export type TrendEntry = MemberStatsEntry & { games?: number };
/** 평균 줄의 회원 id — 표가 평균 행에 쓰는 가짜 회원(StatGrid CLAN_LABEL)과 같은 빈 id. 그래프는 이 id 면 clanByMonth 에서 줄을 찾는다. */
export const CLAN_MEMBER_ID = "";
export interface StatTrendData {
  /** 조회한 달(YYYY-MM · 여러 달이면 마지막 달) — 그래프 맨 오른쪽. */
  period: string;
  /** 그래프에 놓을 달들(왼 → 오른 · statTrendMonths). */
  months: string[];
  /** 달 → 회원 → 그 달의 통계 줄. 조회한 달도 든다(화면이 받은 그것). 아직 안 온 달은 키가 없다. */
  byMonth: Record<string, Record<string, MemberStatsEntry> | undefined>;
  /** 달 → 평균 줄(응답 trendClan + trendGames · 2026-10-25, 요청: "통계의 평균행에도 상세 팝업 붙여야지"). 없으면 평균 행은 보통 칸. */
  clanByMonth?: Record<string, TrendEntry | undefined>;
  /** 앞 달들을 아직 받는 중. */
  loading: boolean;
  /** ★ 그래프 없이(2026-11-13, 요청: "오늘로 조회시 팝업에 그래프 제거") — '오늘' 조회는 달별 그래프가 그 기간과 무관해 팝업에 근거값 · 셈 표만. */
  noChart?: boolean;
}

export interface TrendSeries {
  label: string;
  /** 선 색 클래스 — "" 본문색 · is-dealt 초록 · is-taken 빨강 · is-sub 옅게. */
  cls: string;
  pick: (e: TrendEntry) => number | null;
  fmt: (v: number) => string;
}
export interface StatMetric {
  key: string;
  label: string;
  series: TrendSeries[];
  /** 선이 둘일 때 — shared: 같은 단위라 한 자(딜 · 피해) · stacked: 단위가 달라 위아래 두 판(게임수 · 승률). 하나면 single. */
  mode: "single" | "shared" | "stacked";
  /** 아래에 덧붙이는 그래프들(2026-10-29, 요청: "교환비 팝업엔 교환비, 딜+피해 그래프 2개") — 저마다 제 이름 · 범례 줄과 그래프. */
  more?: StatMetric[];
}

const n = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** 그래프가 쓸 그 달의 줄 — 평균 행(CLAN_MEMBER_ID)은 clanByMonth, 나머지는 byMonth. */
export const trendEntryOf = (data: StatTrendData, member: Member, month: string): TrendEntry | undefined =>
  member.id === CLAN_MEMBER_ID ? data.clanByMonth?.[month] : data.byMonth[month]?.[member.id];
/** ★ 종합 티어(2026-11-04, 요청: "통계에 기본은 종합(전체 종족 평균)을 추가") — 종족 티어(tierByRace)의 인분을 **판 수 가중 평균** · 등급은 같은 기준선(1.6 · 1.1 · 0.6 · 서버 INBUN_CUTS)
 *  · 판 합이 열 미만이면 등급 없음(서버 TIER_MIN_GAMES). 종족 기록이 없으면 null. 팝업 근거값(EAPM · 교환비 보정 · 승패 보정)도 같은 가중 평균. */
export function combinedTier(tb: Record<string, TierEntry> | null | undefined): TierEntry | null {
  const all = Object.values(tb ?? {}).filter((t) => typeof t?.inbun === "number" && t.inbun > 0 && t.plays > 0);
  /* ★ 등급이 선 종족(열 판 이상)이 하나라도 있으면 그 종족들만 합친다(2026-11-07, 지적: "종합 상세에 왜 설명만 뜨고 수치는 안 떠" — 딴 종족으로 한두 판 뛴 줄이
     섞여 늘 '종족별'로 뭉개졌다 · 서버도 주종족 판으로만 티어를 낸다). 등급 선 종족이 없으면(모두 열 판 미만) 전부 합친다. */
  const ranked = all.filter((t) => typeof t.tier === "number");
  const ts = ranked.length > 0 ? ranked : all;
  if (ts.length === 0) return null;
  const n = ts.reduce((a, t) => a + t.plays, 0);
  const avg = (f: (t: TierEntry) => number | null | undefined): number | null => {
    const ok = ts.filter((t) => typeof f(t) === "number");
    const w = ok.reduce((a, t) => a + t.plays, 0);
    return w > 0 ? ok.reduce((a, t) => a + (f(t) as number) * t.plays, 0) / w : null;
  };
  /* 보여 주는 인분은 소수 둘째 자리 아래로 자른다 — 서버 tier.shown_inbun 과 같게(2026-11-08 밤 "0.996 은 0.99인분으로 나오는 게 나을 듯") · 등급도 이 값으로. */
  const ib = Math.floor((avg((t) => t.stdInbun ?? t.inbun) ?? 0) * 100 + 1e-9) / 100;
  /* 문턱은 서버 tier.py INBUN_CUTS 와 같아야 한다(2026-11-06 · 옛 1.6 이 남아 종합 티어만 1티어로 떴다 — 태섭 · 2026-11-08 밤 1.6 · 1.15 · 1.0 으로 맞춤 — 옛 1.2 · 0.8 이 남아 있었다 · 2026-11-09 2티어 1.2 "1.2인분부터 2티어" · 1티어 1.8 "1티어 컷 1.8인분으로"
     · 2026-11-12 서버 "티어 1.6 1.2 0.8 로 나눌거야" — 여기만 1.8 · 1.2 · 1.0 으로 남아 있던 것을 맞춤).*/
  const tier = n < 10 ? null : ib >= 1.6 ? 1 : ib >= 1.1 ? 2 : ib >= 0.6 ? 3 : 4;   // 2026-11-14 "문턱은 1.6 1.1 0.6 으로 변경 (0.5인분 단위)"(서버 INBUN_CUTS 와 같이 · 옛 2026-11-13 1.4 · 1.0 · 0.6)
  /* 셈 표(calc · 2026-11-06 저녁) — 종족이 하나면 그대로 · 여럿이면 줄마다 배수를 판 수로 가중 평균(점수 · 보정 글자는 못 합쳐 비움 · 인분 줄은 위 ib). */
  const calc = ts.length === 1 ? ts[0].calc ?? null : (ts[0].calc ?? null) && ts[0].calc!.map((r, i) => (
    r.name === "인분" ? { ...r, score: "", adj: tier ? `${tier}티어` : "", mult: ib }
      : { name: r.name, score: "종족별", adj: "판 수 가중 평균", mult: Math.round((avg((t) => t.calc?.[i]?.mult) ?? r.mult) * 1000) / 1000 }));
  return { ...ts[0], tier, inbun: ib, stdInbun: ib, plays: n, eapm: avg((t) => t.eapm), cbt: avg((t) => t.cbt), prod: avg((t) => t.prod), dmg: avg((t) => t.dmg), adj: avg((t) => t.adj), ex: avg((t) => t.ex), wpa: avg((t) => t.wpa), calc } as TierEntry;
}
/** 칸의 종족 — 종족 셋 · "주종족"(그 사람 주종족 판을 합친 줄 · MemberStatsEntry.main · 2026-11-04) · null 전체. */
export type StatRace = BaseRace | "주종족";
const of = (race: StatRace | null) => (e: MemberStatsEntry) => (race === "주종족" ? e.main ?? undefined : race ? e.byRace?.[race] : e.overall);
const playsOf = (race: StatRace | null) => (e: MemberStatsEntry) => { const s = of(race)(e); return s && s.plays > 0 ? s.plays : null; };
const rateOf = (race: StatRace | null) => (e: MemberStatsEntry) => { const s = of(race)(e); return s && s.plays > 0 ? n(s.winRate) : null; };
const int = (v: number) => Math.round(v).toLocaleString();
const pct = (v: number) => `${Math.round(v)}%`;
const x100 = (v: number) => (v / 100).toFixed(1);
const x2 = (v: number) => v.toFixed(2);
/** ★ 교환 이득(2026-11-08 밤, 요청: "통계 표의 전투 컬럼은 교환 이득으로 · 그 옆에 교전 참여 · 생산도 추가") — sg-api valTaken ÷ valLost(가져간 ÷ 잃은 자원값 · 티어 식과 같은 재료 · 덤퍼 가치 배분).
 *  1 = 본전. 화면은 부호 %(pctFmt · +25% = 잃은 것의 1.25배를 가져감). 옛 전투 칸(분당 준 − 입은 데미지 · fight)은 걷었다. 없으면 null. */
/** ★ 통계 표의 교환 이득 · 교전 참여 · 생산 칸 = **보정 뒤 인분 배수**(2026-11-08 밤, 요청: "통계표 전부 보정후 점수(인분점수로 표시) · 원점수와 보정과정은 팝업에서 확인") —
 *  티어 셈 표(calc)의 그 줄(1.00 = 보통 · 줄의 곱이 인분). 티어가 없는 조회(1:1 · 맵 탭)는 칸이 원점수 그대로다. */
/* ★★ 2026-11-12 WPA(sg-api wpa.py · 요청: "WPA 적용" · "전투+참전+생산 다 합친게 WPA") — 세 칸(교환 이득 · 교전 참여 · 생산)이 WPA 한 칸이 됐다. 티어 셈 표도 'WPA' 한 줄. */
export const CALC_NAME = { wpa: "WPA" } as const;
/** 셈 표 줄 이름 → 팝업 글자(2026-11-13 쉽게). */
/* ★ 지난 달(2026-11-14 · sg-api tier PAST_RHO) — 한 달 조회는 앞 달 판을 달마다 절반씩 줄여 같이 센다("그 사람의 지금 실력"). WPA 줄 = 그 달 판만의 배수 ·
   지난 달 줄 = 앞 달을 섞어 달라진 만큼 · 둘의 곱이 인분. 승패 줄은 서버가 승패 보정을 끄며 안 온다(옛 응답이면 그대로 보인다). */
const CALC_LABEL: Record<string, string> = { WPA: "WPA 점수", 승패: "승패 점수", "지난 달": "지난 달 반영" };
export type CalcKey = keyof typeof CALC_NAME;
export const calcRowOf = (t: TierEntry | null | undefined, k: CalcKey): TierCalcRow | null => t?.calc?.find((r) => r.name === CALC_NAME[k]) ?? null;
/** ★ 판당 WPA 원점수(승리 확률 %p · sg-api TierEntry.wpa) — 싸움마다 편의 승리 확률을 얼마나 올리고 내렸나의 판 평균. 티어(셈)가 없으면 null. */
export const wpaOf = (t: TierEntry | null | undefined): number | null => (typeof t?.wpa === "number" && Number.isFinite(t.wpa) ? t.wpa : null);
/** 점 글자 — +12.3점 · −4.0점(1점 = 이길 확률 1%p · 2026-11-13 "쉽게 몇가지로 점수화"). */
export const wpaFmt = (v: number): string => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}점`;

export function gainOf(s: MemberStatsEntry["overall"] | undefined | null): number | null {
  if (!s || !s.valPlays || typeof s.valTaken !== "number" || typeof s.valLost !== "number") return null;
  return (s.valTaken + 1) / (s.valLost + 1);
}
/** ★ 교전 참여(같은 날) — valTaken ÷ valExpected(가져간 ÷ 그 길이 판의 보통 · sg-api tier LEN_VAL0). 1 = 보통만큼 싸움. */
export function partOf(s: MemberStatsEntry["overall"] | undefined | null): number | null {
  if (!s || !s.valPlays || typeof s.valTaken !== "number" || typeof s.valExpected !== "number" || s.valExpected <= 0) return null;
  return s.valTaken / s.valExpected;
}
/** 배수 → 부호 %(1.25 → +25% · 0.9 → −10% · 1 → 0%) — 교환 이득 · 교전 참여 칸 글자. */
export const pctFmt = (v: number): string => { const r = Math.round((v - 1) * 100); return r > 0 ? `+${r}%` : r < 0 ? `−${-r}%` : "0%"; };

/** 생산 — 분당 뽑은 병력 값(미네랄 + 가스 · 2026-11-06, 요청: "생산도 추가 · 피시에 컬럼"). 값이 없으면 null. */
export function prodOf(s: MemberStatsEntry["overall"] | undefined | null): number | null {
  if (!s || !s.prodValue || !s.prodSeconds) return null;
  return s.prodValue / (s.prodSeconds / 60);
}

/** 칸 → 재는 값들. race 가 있으면 그 종족 칸. */
export function statMetric(kind: "plays" | "rate" | "dmg" | "ex" | "exr" | "part" | "prod" | "wpa" | "apm" | "eapm" | "eapmApm" | "games" | "tier", race: StatRace | null = null, scored = false): StatMetric {
  const who = race ? `${race} ` : "";
  const tierOf = (e: TrendEntry): TierEntry | null | undefined => (race && race !== "주종족" ? e.tierByRace?.[race] : e.tier ?? combinedTier(e.tierByRace));
  /* ★ 보정 뒤 점수 그래프(2026-11-09, 요청: "통계의 셀 팝업의 그래프도 인분(보정 후)로 나타내기") — 표 칸이 보정 뒤 인분 배수(calcRowOf ★)인 티어 조회면 그래프도 달마다
     그 달 티어 셈 표의 그 줄 배수(1.00 = 보통). 종족 묶음은 그 종족 티어 · 종합은 종합 티어(combinedTier). 원점수는 팝업 글자(원점수 줄)에 남는다. */
  if (scored && kind === "wpa") {
    return {
      key: `${race ?? ""}:wpa:sc`, label: `${who}WPA(보정 후 인분 배수 · 1.00 = 보통)`,
      series: [{ label: "WPA", cls: "", pick: (e) => n(calcRowOf(tierOf(e), "wpa")?.mult), fmt: x2 }],
      mode: "single",
    };
  }
  /* ★ WPA 원점수(2026-11-12) — 달마다 그 달 판으로 셈한 판당 WPA(승리 확률 %p · 티어가 없는 조회의 칸). */
  if (kind === "wpa") {
    return { key: race ? `${race}:wpa` : "wpa", label: `${who}WPA(판당 점수 · 1점 = 이길 확률 1%p)`, series: [{ label: "WPA", cls: "", pick: (e) => wpaOf(tierOf(e)), fmt: wpaFmt }], mode: "single" };
  }
  /* 평균 행(2026-10-25): PC 게임수 칸 = 경기 수(games) · 폰 전적 칸 = 위 참여(사람 판수 합) · 아래 경기 수. */
  /* 경기가 없던 달(0)은 점·선을 안 놓는다(2026-10-25, 요청: "경기수는 자료가 없는 달거 그래프표시 안되게" — 옛: 0 으로 찍혔다). */
  const gamesOf = (e: TrendEntry) => { const g = n(e.games); return g !== null && g > 0 ? g : null; };
  if (kind === "games") return { key: "games", label: "경기 수", series: [{ label: "경기 수", cls: "", pick: gamesOf, fmt: int }], mode: "single" };
  /* ★ 팀전 티어(2026-10-28, 요청: "티어 팝업을 다른 항목처럼 변화 그래프 팝업으로 · 그래프의 값 라벨은 배지로 안 하고 다른 그래프들처럼 텍스트로") — 달마다 그 달의 판으로 셈한
     티어(sg-api get_stats_trend · 그 달 판으로 EAPM × 교환비 보정 × 승패 보정 · 판 열부터). 티어는 1 이 위에 오도록 부호를 뒤집어 그리고 글자는 "2티어". 인분은 안 그린다(같은 날, 요청: "팝업에 인분 표시 안 하고"). */
  if (kind === "tier") {
    return {
      /* 종족 티어(2026-11-04 · race) — 그 달 tierByRace[종족]. 종족이 없으면 옛 전체 티어(팀 빌더 등). */
      key: race ? `${race}:tier` : "tier", label: race ? `${race} 티어` : "종합 티어",
      series: [{ label: "티어", cls: "", pick: (e) => { const v = race && race !== "주종족" ? e.tierByRace?.[race]?.tier : (e.tier ?? combinedTier(e.tierByRace))?.tier; return typeof v === "number" ? -v : null; }, fmt: (v) => `${-v}티어` }],
      mode: "single",
    };
  }
  if (kind === "plays") return { key: `${race ?? ""}:plays`, label: `${who}게임수`, series: [{ label: "게임수", cls: "", pick: playsOf(race), fmt: int }], mode: "single" };
  if (kind === "rate") return { key: `${race ?? ""}:rate`, label: `${who}승률`, series: [{ label: "승률", cls: "", pick: rateOf(race), fmt: pct }], mode: "single" };
  /* 종족 APM · EAPM · 교환비(2026-11-03 · PC 묶음 다섯 칸 — StatGrid GroupCells) — race 가 있으면 그 종족 판의 값. */
  if (kind === "apm") return { key: race ? `${race}:apm` : "apm", label: `${who}APM`, series: [{ label: "APM", cls: "", pick: (e) => { const s = of(race)(e); return s && s.plays > 0 ? n(s.avgApm) : null; }, fmt: int }], mode: "single" };
  if (kind === "eapm") return { key: race ? `${race}:eapm` : "eapm", label: `${who}EAPM`, series: [{ label: "EAPM", cls: "", pick: (e) => { const s = of(race)(e); return s && s.plays > 0 ? n(s.avgEapm) : null; }, fmt: int }], mode: "single" };
  /* 폰 EAPM 칸(2026-10-28, 요청: "모바일 EAPM 컬럼에 APM 그래프도 표시 · 겹쳐서 한 그래프로") — 한 자(shared)에 두 선: APM(옅게 · 값은 위)이 늘 더 커서 먼저 · EAPM(본색 · 값은 아래). */
  if (kind === "eapmApm") {
    return {
      key: "eapmApm", label: "EAPM · APM",
      series: [
        { label: "APM", cls: "is-sub", pick: (e) => n(e.overall.avgApm), fmt: int },
        { label: "EAPM", cls: "", pick: (e) => n(e.overall.avgEapm), fmt: int },
      ],
      mode: "shared",
    };
  }
  /* 보정 교환비(2026-10-28, 요청: "그리드 교환비 표시가 보정 전이라 헷갈림 — 라벨을 보정교환비로 바꾸고 보정값 표시") — 달마다 그 달 판으로 셈한 sg-api tier.ex. */
  if (kind === "ex") return { key: "ex", label: "보정교환비(종족 · 상대 세기 뺌)", series: [{ label: "보정교환비", cls: "", pick: (e) => n(e.tier?.ex), fmt: x2 }], mode: "single" };
  /* 교환비(날 값 · 2026-10-29, 요청: "PC 데미지 컬럼 제거하고 교환비 추가 — 팝업엔 교환비, 딜+피해 그래프 2개") — 교환비 그래프 아래에 데미지(딜 · 피해) 그래프. */
  if (kind === "prod") {   // 생산(분당 병력 값 · 2026-11-06)
    const pick = (e: TrendEntry) => { const v = prodOf(race ? of(race)(e) : e.overall); return v === null ? null : Math.round(v); };
    return { key: race ? `${race}:prod` : "prod", label: `${who}생산(분당 병력 값 · 미네랄 + 가스)`, series: [{ label: "생산", cls: "", pick, fmt: int }], mode: "single" };
  }
  /* ★ 교환 이득 · 교전 참여(2026-11-08 밤 · 위 gainOf · partOf) — 자 "exr" 는 옛 전투 칸 자리를 그대로 쓴다(정렬 자 · 팝업 열쇠). 옛 데미지(딜 · 피해) 곁 그래프는 걷었다. */
  if (kind === "exr") {
    const pick = (e: TrendEntry) => gainOf(race ? of(race)(e) : e.overall);
    return { key: race ? `${race}:exr` : "exr", label: `${who}교환 이득(가져간 ÷ 잃은 자원 · 0% = 본전)`, series: [{ label: "교환 이득", cls: "", pick, fmt: pctFmt }], mode: "single" };
  }
  if (kind === "part") {
    const pick = (e: TrendEntry) => partOf(race ? of(race)(e) : e.overall);
    return { key: race ? `${race}:part` : "part", label: `${who}교전 참여(가져간 자원 ÷ 판 길이의 보통 · 0% = 보통)`, series: [{ label: "교전 참여", cls: "", pick, fmt: pctFmt }], mode: "single" };
  }
  /* 데미지(kind "dmg") — 딜 · 피해 두 선. 옛 폰 전적 칸(게임수 · 승률 위아래 · "rec" · "crec")은 걷었다(2026-10-28 — 폰도 게임수 · 승률 칸이 따로). */
  return {
    key: "dmg", label: "데미지(평균 대비 배수)",
    series: [
      { label: "딜", cls: "is-dealt", pick: (e) => n(e.overall.dmgDealtRel), fmt: x100 },
      { label: "피해", cls: "is-taken", pick: (e) => n(e.overall.dmgTakenRel), fmt: x100 },
    ],
    mode: "shared",
  };
}

const PAD_X = 30;
const PAD_BOTTOM = 30;

/** 다섯 달 선 그래프 — 래더 상세와 같은 벌(.scr-rank-detail-*).
 *  single: 한 선 · shared(딜 · 피해): 같은 자에 두 선(첫 선 값은 점 위 · 둘째는 점 아래 — 아래 여백을 넓혀 달 이름과 안 겹치게) ·
 *  stacked(게임수 · 승률): 단위가 달라 **위아래 두 판**(각자 제 자 · 판 왼쪽 위에 이름) · 달 이름은 맨 아래 한 번. */
export function StatTrendChart({ data, member, metric, chartW = 320 }: { data: StatTrendData; member: Member; metric: StatMetric; chartW?: number }) {
  const months = data.months;
  /* 달이 많으면(여러 달 조회) 달 이름은 띄엄띄엄(겹침 방지 · 마지막 달은 늘) · 값 글자는 열 칸까지만. */
  const labelEvery = months.length > 16 ? 3 : months.length > 8 ? 2 : 1;
  const showVals = months.length <= 10;
  const xFor = (i: number) => PAD_X + (i * (chartW - PAD_X * 2)) / Math.max(1, months.length - 1);
  const mode = metric.mode;
  const H = mode === "stacked" ? 250 : mode === "shared" ? 168 : 150;   // 아래 판의 값이 달 이름과 안 닿게 stacked 는 여유를 더
  const padBottom = mode === "shared" ? 46 : PAD_BOTTOM;
  const bandH = mode === "stacked" ? 74 : H - 34 - padBottom;
  const bandTop = (ri: number) => (mode === "stacked" ? 30 + ri * (bandH + 36) : 34);
  const picked = metric.series.map((s) => months.map((m) => { const e = trendEntryOf(data, member, m); return e ? s.pick(e) : null; }));
  const allKnown = picked.flat().filter((v): v is number => v !== null);
  const rows = metric.series.map((s, ri) => {
    const vals = picked[ri];
    const known = mode === "shared" ? allKnown : vals.filter((v): v is number => v !== null);
    const lo = known.length ? Math.min(...known) : 0; const hi = known.length ? Math.max(...known) : 1;
    const span = Math.max(hi - lo, Math.abs(hi) * 0.02, 1e-6);
    const top = bandTop(ri);
    const yFor = (v: number) => top + ((hi - v) / span) * bandH;
    const segs: { i: number; v: number }[][] = [];
    vals.forEach((v, i) => {
      if (v === null) return;
      const last = segs[segs.length - 1];
      if (last && last[last.length - 1].i === i - 1) last.push({ i, v }); else segs.push([{ i, v }]);
    });
    return { s, vals, yFor, segs, top };
  });
  const any = allKnown.length > 0;
  const waiting = data.loading && !any;
  const area = { aspectRatio: `${chartW} / ${H}` };
  if (waiting) return <div className="scr-rank-detail-chart-area scr-sg-trend-area" style={area}><Spinner size={18} /></div>;
  if (!any) return <div className="scr-rank-detail-chart-area scr-sg-trend-area" style={area}><div className="scr-empty">기록이 없어요</div></div>;
  return (
    <div className="scr-rank-detail-chart-area scr-sg-trend-area" style={area}>
      <svg className="scr-rank-detail-chart" viewBox={`0 0 ${chartW} ${H}`}>
        {mode === "stacked" && rows.map((r, ri) => (
          <text key={`band-${ri}`} className={`scr-sg-trend-band ${r.s.cls}`} x={8} y={r.top - 14}>{r.s.label}</text>
        ))}
        {rows.map((r, ri) => r.segs.map((seg, si) => (
          <polyline key={`${ri}-${si}`} className={`scr-rank-detail-line scr-sg-trend-line ${r.s.cls}`} points={seg.map((p) => `${xFor(p.i)},${r.yFor(p.v)}`).join(" ")} />
        )))}
        {months.map((m, i) => ((i === months.length - 1 || (months.length - 1 - i) % labelEvery === 0) ? (
          <text key={m} className={i === months.length - 1 ? "scr-rank-detail-axis-label is-center" : "scr-rank-detail-axis-label"} x={xFor(i)} y={H - 12}>
            {`${Number(m.slice(5))}월`}
          </text>
        ) : null))}
        {rows.map((r, ri) => r.vals.map((v, i) => (v === null ? null : (
          <g key={`${ri}-p${i}`}>
            <circle className={`scr-rank-detail-dot scr-sg-trend-dot ${r.s.cls}`} cx={xFor(i)} cy={r.yFor(v)} r={3} />
            {showVals && (
              <text className={`scr-rank-detail-value scr-sg-trend-val ${r.s.cls}`} x={xFor(i)} y={mode === "shared" && ri === 1 ? r.yFor(v) + 15 : r.yFor(v) - 8}>
                {r.s.fmt(v)}
              </text>
            )}
          </g>
        ))))}
      </svg>
    </div>
  );
}

/** 팝오버 머리 아래의 근거값 한 칸(2026-10-28, 요청: "티어 팝업에 그래프 위에 현재 보는 티어의 근거값 두 개") — 지금 보는 기간의 값이다(그래프의 달별 값과 별개). */
export interface TrendFact { label: string; value: string }
export interface TrendAnchor { member: Member; metric: StatMetric; rect: { left: number; top: number; width: number; height: number }; facts?: TrendFact[]; calc?: TierCalcRow[] | null }

const POP_W = 340;
/** PC 팝오버 폭(2026-10-25, 요청: "통계 팝오버 그래프창 크기 키우고 글자들 요소들도 다 키우기") — 그래프는 옛 자(CHART_VB_W)로 그려 폭만 늘어나므로 선·점·글자가 함께 커진다. */
const PC_POP_W = 480;
const CHART_VB_W = POP_W - 24;
const POP_GAP = 10;
const POP_MARGIN = 12;

/** 팝오버 — PC·폰 다 **칸 아래 가운데**(모자라면 위)에 선다. 옆에 세우면 그 줄의 이웃 칸을 덮어 마우스를 옆으로 옮길 때 팝오버에 걸린다(래더 줄 팝오버와 다른 점 —
 *  거기는 줄 하나가 손잡이다). 아래로 두면 같은 줄을 따라 훑을 수 있다. PC 팝오버는 **마우스를 안 받는다**(CSS pointer-events none · 2026-10-24, 지적: "아래 공간이 없어 셀 위쪽에 뜨면 마우스를 위로 올려도
 *  윗칸 걸로 안 바뀜" — 팝오버가 윗칸을 덮어 그 칸의 enter 가 안 왔다) — 안에 누를 것이 없으니 마우스는 밑의 칸으로 그대로 간다. 화면 안에 들게 자른다. */
export function StatTrendPop({ anchor, data, mobile, onEnter, onLeave }: {
  anchor: TrendAnchor; data: StatTrendData; mobile: boolean; onEnter?: () => void; onLeave?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const vw = window.innerWidth; const vh = window.innerHeight;
  const w = Math.min(mobile ? POP_W : PC_POP_W, vw - POP_MARGIN * 2);
  const [pos, setPos] = useState<{ left: number; top: number }>(() => first(anchor, w, mobile, vw, 200));
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const h = el.offsetHeight;
    const p = first(anchor, w, mobile, vw, h);
    p.top = Math.max(POP_MARGIN, Math.min(vh - POP_MARGIN - h, p.top));
    setPos(p);
  }, [anchor, w, mobile, vw, vh, data]);
  return (
    <div
      ref={ref} className={mobile ? "scr-sg-trend-pop is-m" : "scr-sg-trend-pop"} role="dialog" aria-label={`${anchor.member.nickname} ${anchor.metric.label} 변화`}
      style={{ left: pos.left, top: pos.top, width: w }} onPointerEnter={mobile ? onEnter : undefined} onPointerLeave={mobile ? onLeave : undefined}
    >
      <div className="scr-sg-trend-head">
        <b>{anchor.member.nickname}</b>
        <span>{anchor.metric.label}</span>
        {anchor.metric.series.length > 1 && (
          <span className="scr-sg-trend-legend">{anchor.metric.series.map((s) => <i key={s.label} className={s.cls}>{s.label}</i>)}</span>
        )}
      </div>
      {anchor.facts && anchor.facts.length > 0 && (
        <div className="scr-sg-trend-facts">
          {anchor.facts.map((f) => <span key={f.label}><i>{f.label}</i><b>{f.value}</b></span>)}
        </div>
      )}
      {/* 티어 셈 과정 표(2026-11-06 저녁, 요청: "정확한 점수 계산 과정과 결과 · 이름 · 점수 · 보정 · 보정후점수") — 배수의 곱이 인분(마지막 줄). */}
      {anchor.calc && anchor.calc.length > 0 && (
        /* ★ 쉽게(2026-11-13, 요청: "티어는 WPA 점수와 승패 보정에 의한 점수를 쉽게 표현 · 보정 공식같은거 다 치우고") — 항목 · 점수 · 배수 세 칸 · 보정 글자 칸 걷음. */
        <table className="scr-sg-trend-calc">
          <thead><tr><th>항목</th><th>점수</th><th>배수</th></tr></thead>
          <tbody>
            {anchor.calc.map((r) => (
              <tr key={r.name} className={r.name === "인분" ? "is-total" : undefined}>
                <th scope="row">{CALC_LABEL[r.name] ?? r.name}</th>
                <td>{r.name === "인분" ? r.adj : r.score}</td>
                <td>{r.name === "인분" ? `${r.mult.toFixed(2)}인분` : `×${r.mult.toFixed(2)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!data.noChart && <StatTrendChart data={data} member={anchor.member} metric={anchor.metric} chartW={mobile ? w - 24 : CHART_VB_W} />}
      {!data.noChart && anchor.metric.more?.map((mm) => (
        <Fragment key={mm.key}>
          <div className="scr-sg-trend-head scr-sg-trend-more">
            <span>{mm.label}</span>
            {mm.series.length > 1 && <span className="scr-sg-trend-legend">{mm.series.map((s) => <i key={s.label} className={s.cls}>{s.label}</i>)}</span>}
          </div>
          <StatTrendChart data={data} member={anchor.member} metric={mm} chartW={mobile ? w - 24 : CHART_VB_W} />
        </Fragment>
      ))}
    </div>
  );
}

function first(anchor: TrendAnchor, w: number, mobile: boolean, vw: number, h: number): { left: number; top: number } {
  const r = anchor.rect;
  void mobile;
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(POP_MARGIN, Math.min(vw - POP_MARGIN - w, left));
  const gap = mobile ? POP_GAP : 4;   // PC 는 틈을 좁혀 마우스가 칸에서 팝오버로 바로 건너간다
  const below = r.top + r.height + gap;
  const top = below + h > window.innerHeight - POP_MARGIN ? r.top - gap - h : below;
  return { left, top };
}
