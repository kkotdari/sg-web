import { useLayoutEffect, useRef, useState } from "react";
import { Spinner } from "../../components/common/Feedback";
import { shiftMonthValue } from "../../utils/date";
import type { BaseRace, Member, MemberStatsEntry } from "../../types";

/* ★ 통계 칸의 **5개월 변화 그래프**(2026-10-24, 요청: "통계 컬럼 피시는 호버 폰은 클릭시 → 5개월간의 변화 그래프로" → "7개월로 통일하자") ─────────────────────────
   표의 값 칸(게임수 · 승률 · 데미지 · APM · 종족별 게임수 · 승률 · 폰 전적 칸)에 PC 는 마우스를 얹으면, 폰은 누르면 그 사람 · 그 값의 일곱 달
   (조회한 달이 **맨 오른쪽** · 앞 여섯 달) 선 그래프가 팝오버로 뜬다. 자료는 화면(ClanStatsScreen)이 조회한 달의 통계를 받은 뒤 앞 네 달을 같은
   조건으로 뒤따라 받아 둔다(StatTrendData · 없는 달은 점을 안 찍는다). 꼴은 래더 상세 그래프(.scr-rank-detail-*)와 같은 벌이고, 두 값이 한 칸에 사는
   데미지(딜 · 피해)·폰 전적(게임수 · 승률)은 선을 둘 그린다(각자 제 자로 눕히고 값은 점 위에 적는다). */

/** 일곱 달(2026-10-24, 요청: "7개월로 통일하자" — 처음엔 다섯 · 래더 그래프와 한 벌 · 조회한 달이 맨 오른쪽). */
export const TREND_MONTHS = 7;
export function statTrendMonths(period: string): string[] {
  const out: string[] = [];
  for (let i = TREND_MONTHS - 1; i >= 0; i -= 1) out.push(shiftMonthValue(period, -i));
  return out;
}

export interface StatTrendData {
  /** 조회한 달(YYYY-MM) — 그래프 맨 오른쪽. */
  period: string;
  /** 달 → 회원 → 그 달의 통계 줄. 조회한 달도 든다(화면이 받은 그것). 아직 안 온 달은 키가 없다. */
  byMonth: Record<string, Record<string, MemberStatsEntry> | undefined>;
  /** 앞 달들을 아직 받는 중. */
  loading: boolean;
}

export interface TrendSeries {
  label: string;
  /** 선 색 클래스 — "" 본문색 · is-dealt 초록 · is-taken 빨강 · is-sub 옅게. */
  cls: string;
  pick: (e: MemberStatsEntry) => number | null;
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
const of = (race: BaseRace | null) => (e: MemberStatsEntry) => (race ? e.byRace?.[race] : e.overall);
const playsOf = (race: BaseRace | null) => (e: MemberStatsEntry) => { const s = of(race)(e); return s && s.plays > 0 ? s.plays : null; };
const rateOf = (race: BaseRace | null) => (e: MemberStatsEntry) => { const s = of(race)(e); return s && s.plays > 0 ? n(s.winRate) : null; };
const int = (v: number) => Math.round(v).toLocaleString();
const pct = (v: number) => `${Math.round(v)}%`;
const x100 = (v: number) => (v / 100).toFixed(1);

/** 칸 → 재는 값들. race 가 있으면 그 종족 칸. */
export function statMetric(kind: "plays" | "rate" | "dmg" | "apm" | "rec", race: BaseRace | null = null): StatMetric {
  const who = race ? `${race} ` : "";
  if (kind === "plays") return { key: `${race ?? ""}:plays`, label: `${who}게임수`, series: [{ label: "게임수", cls: "", pick: playsOf(race), fmt: int }], mode: "single" };
  if (kind === "rate") return { key: `${race ?? ""}:rate`, label: `${who}승률`, series: [{ label: "승률", cls: "", pick: rateOf(race), fmt: pct }], mode: "single" };
  if (kind === "apm") return { key: "apm", label: "APM", series: [{ label: "APM", cls: "", pick: (e) => n(e.overall.avgApm), fmt: int }], mode: "single" };
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

/** 일곱 달 선 그래프 — 래더 상세와 같은 벌(.scr-rank-detail-*).
 *  single: 한 선 · shared(딜 · 피해): 같은 자에 두 선(첫 선 값은 점 위 · 둘째는 점 아래 — 아래 여백을 넓혀 달 이름과 안 겹치게) ·
 *  stacked(게임수 · 승률): 단위가 달라 **위아래 두 판**(각자 제 자 · 판 왼쪽 위에 이름) · 달 이름은 맨 아래 한 번. */
export function StatTrendChart({ data, member, metric, chartW = 320 }: { data: StatTrendData; member: Member; metric: StatMetric; chartW?: number }) {
  const months = statTrendMonths(data.period);
  const xFor = (i: number) => PAD_X + (i * (chartW - PAD_X * 2)) / Math.max(1, months.length - 1);
  const mode = metric.mode;
  const H = mode === "stacked" ? 250 : mode === "shared" ? 168 : 150;   // 아래 판의 값이 달 이름과 안 닿게 stacked 는 여유를 더
  const padBottom = mode === "shared" ? 46 : PAD_BOTTOM;
  const bandH = mode === "stacked" ? 74 : H - 34 - padBottom;
  const bandTop = (ri: number) => (mode === "stacked" ? 30 + ri * (bandH + 36) : 34);
  const picked = metric.series.map((s) => months.map((m) => { const e = data.byMonth[m]?.[member.id]; return e ? s.pick(e) : null; }));
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
        {months.map((m, i) => (
          <text key={m} className={i === months.length - 1 ? "scr-rank-detail-axis-label is-center" : "scr-rank-detail-axis-label"} x={xFor(i)} y={H - 12}>
            {`${Number(m.slice(5))}월`}
          </text>
        ))}
        {rows.map((r, ri) => r.vals.map((v, i) => (v === null ? null : (
          <g key={`${ri}-p${i}`}>
            <circle className={`scr-rank-detail-dot scr-sg-trend-dot ${r.s.cls}`} cx={xFor(i)} cy={r.yFor(v)} r={3} />
            <text className={`scr-rank-detail-value scr-sg-trend-val ${r.s.cls}`} x={xFor(i)} y={mode === "shared" && ri === 1 ? r.yFor(v) + 15 : r.yFor(v) - 8}>
              {r.s.fmt(v)}
            </text>
          </g>
        ))))}
      </svg>
    </div>
  );
}

export interface TrendAnchor { member: Member; metric: StatMetric; rect: { left: number; top: number; width: number; height: number } }

const POP_W = 340;
const POP_GAP = 10;
const POP_MARGIN = 12;

/** 팝오버 — PC·폰 다 **칸 아래 가운데**(모자라면 위)에 선다. 옆에 세우면 그 줄의 이웃 칸을 덮어 마우스를 옆으로 옮길 때 팝오버에 걸린다(래더 줄 팝오버와 다른 점 —
 *  거기는 줄 하나가 손잡이다). 아래로 두면 같은 줄을 따라 훑을 수 있고, 아래로 내려가면 팝오버에 들어가 머문다. 화면 안에 들게 자른다. */
export function StatTrendPop({ anchor, data, mobile, onEnter, onLeave }: {
  anchor: TrendAnchor; data: StatTrendData; mobile: boolean; onEnter?: () => void; onLeave?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const vw = window.innerWidth; const vh = window.innerHeight;
  const w = Math.min(POP_W, vw - POP_MARGIN * 2);
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
      style={{ left: pos.left, top: pos.top, width: w }} onPointerEnter={onEnter} onPointerLeave={onLeave}
    >
      <div className="scr-sg-trend-head">
        <b>{anchor.member.nickname}</b>
        <span>{anchor.metric.label}</span>
        {anchor.metric.series.length > 1 && (
          <span className="scr-sg-trend-legend">{anchor.metric.series.map((s) => <i key={s.label} className={s.cls}>{s.label}</i>)}</span>
        )}
      </div>
      <StatTrendChart data={data} member={anchor.member} metric={anchor.metric} chartW={w - 24} />
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
