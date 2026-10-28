import { useLayoutEffect, useRef, useState } from "react";
import { Spinner } from "../../components/common/Feedback";
import { shiftMonthValue } from "../../utils/date";
import type { BaseRace, Member, MemberStatsEntry, MemberStats } from "../../types";

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
}

const n = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** 그래프가 쓸 그 달의 줄 — 평균 행(CLAN_MEMBER_ID)은 clanByMonth, 나머지는 byMonth. */
export const trendEntryOf = (data: StatTrendData, member: Member, month: string): TrendEntry | undefined =>
  member.id === CLAN_MEMBER_ID ? data.clanByMonth?.[month] : data.byMonth[month]?.[member.id];
const of = (race: BaseRace | null) => (e: MemberStatsEntry) => (race ? e.byRace?.[race] : e.overall);
const playsOf = (race: BaseRace | null) => (e: MemberStatsEntry) => { const s = of(race)(e); return s && s.plays > 0 ? s.plays : null; };
const rateOf = (race: BaseRace | null) => (e: MemberStatsEntry) => { const s = of(race)(e); return s && s.plays > 0 ? n(s.winRate) : null; };
const int = (v: number) => Math.round(v).toLocaleString();
const pct = (v: number) => `${Math.round(v)}%`;
const x100 = (v: number) => (v / 100).toFixed(1);
const x2 = (v: number) => v.toFixed(2);
/** 교환비 = 준 ÷ 입은 데미지(유닛 + 건물 합 · 2026-10-28, 요청: "통계에 교환비 컬럼을 추가") — 둘 중 하나라도 없으면 null. */
export function exOf(s: MemberStats | undefined | null): number | null {
  if (!s) return null;
  const d = (s.dmgDealtUnit ?? 0) + (s.dmgDealtBldg ?? 0);
  const t = (s.dmgTakenUnit ?? 0) + (s.dmgTakenBldg ?? 0);
  return s.dmgPlays && d > 0 && t > 0 ? d / t : null;
}

/** 칸 → 재는 값들. race 가 있으면 그 종족 칸. */
export function statMetric(kind: "plays" | "rate" | "dmg" | "ex" | "apm" | "rec" | "games" | "crec" | "tier", race: BaseRace | null = null): StatMetric {
  const who = race ? `${race} ` : "";
  /* 평균 행(2026-10-25): PC 게임수 칸 = 경기 수(games) · 폰 전적 칸 = 위 참여(사람 판수 합) · 아래 경기 수. */
  /* 경기가 없던 달(0)은 점·선을 안 놓는다(2026-10-25, 요청: "경기수는 자료가 없는 달거 그래프표시 안되게" — 옛: 0 으로 찍혔다). */
  const gamesOf = (e: TrendEntry) => { const g = n(e.games); return g !== null && g > 0 ? g : null; };
  if (kind === "games") return { key: "games", label: "경기 수", series: [{ label: "경기 수", cls: "", pick: gamesOf, fmt: int }], mode: "single" };
  /* ★ 팀전 티어(2026-10-28, 요청: "티어 팝업을 다른 항목처럼 변화 그래프 팝업으로 · 그래프의 값 라벨은 배지로 안 하고 다른 그래프들처럼 텍스트로") — 달마다 그 달의 판으로 셈한
     티어(sg-api get_stats_trend · 그 달 EAPM × 교환비 보정 × 그 달 끝까지의 누적 승패 보정 · 판 열부터). 티어는 1 이 위에 오도록 부호를 뒤집어 그리고 글자는 "2티어". 인분은 안 그린다(같은 날, 요청: "팝업에 인분 표시 안 하고"). */
  if (kind === "tier") {
    return {
      key: "tier", label: "팀전 티어",
      series: [{ label: "티어", cls: "", pick: (e) => { const v = e.tier?.tier; return typeof v === "number" ? -v : null; }, fmt: (v) => `${-v}티어` }],
      mode: "single",
    };
  }
  if (kind === "crec") {
    return {
      key: "crec", label: "전체 전적",
      series: [{ label: "참여", cls: "", pick: playsOf(null), fmt: int }, { label: "경기 수", cls: "is-sub", pick: gamesOf, fmt: int }],
      mode: "stacked",
    };
  }
  if (kind === "plays") return { key: `${race ?? ""}:plays`, label: `${who}게임수`, series: [{ label: "게임수", cls: "", pick: playsOf(race), fmt: int }], mode: "single" };
  if (kind === "rate") return { key: `${race ?? ""}:rate`, label: `${who}승률`, series: [{ label: "승률", cls: "", pick: rateOf(race), fmt: pct }], mode: "single" };
  if (kind === "apm") return { key: "apm", label: "APM", series: [{ label: "APM", cls: "", pick: (e) => n(e.overall.avgApm), fmt: int }], mode: "single" };
  if (kind === "ex") return { key: "ex", label: "교환비(준 ÷ 입은 데미지)", series: [{ label: "교환비", cls: "", pick: (e) => exOf(e.overall), fmt: x2 }], mode: "single" };
  if (kind === "dmg") {
    return {
      key: "dmg", label: "데미지(평균 대비 배수)",
      series: [
        { label: "딜", cls: "is-dealt", pick: (e) => n(e.overall.dmgDealtRel), fmt: x100 },
        { label: "피해", cls: "is-taken", pick: (e) => n(e.overall.dmgTakenRel), fmt: x100 },
      ],
      mode: "shared",
    };
  }
  /* 폰 전적 칸 — 게임수 · 승률 둘. */
  return {
    key: `${race ?? ""}:rec`, label: `${who || "전체 "}전적`,
    series: [
      { label: "게임수", cls: "", pick: playsOf(race), fmt: int },
      { label: "승률", cls: "is-sub", pick: rateOf(race), fmt: pct },
    ],
    mode: "stacked",
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
export interface TrendAnchor { member: Member; metric: StatMetric; rect: { left: number; top: number; width: number; height: number }; facts?: TrendFact[] }

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
      <StatTrendChart data={data} member={anchor.member} metric={anchor.metric} chartW={mobile ? w - 24 : CHART_VB_W} />
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
