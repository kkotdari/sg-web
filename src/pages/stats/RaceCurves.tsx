import { useEffect, useRef, useState } from "react";
import type { BaseRace, MemberStats, StatCurve } from "../../types";

/* ★ 통계 펼침 = 분당 곡선 두 판(2026-10-20, 요청: "펼친 부분 내용 변경 · 시간별 … 연속 선 그래프로 세 종족을 색을 나눠서 같은 그래프에
   겹쳐서" → "일꾼 수랑 병력 가치로"). 서버의 통계용 참값(game_result_participant_curves → curve {wk, av, n})을 종족마다 한 줄로 겹친다.
   두 값은 자가 달라(명 · 미네랄+가스) 한 축에 안 싣고 판을 둘로 나눈다. 판 수가 처음의 20% 밑으로 줄어든 꼬리 분은 자른다(한두 판이
   곡선을 흔들지 않게). 선 색은 그래프 전용(--race-chart-*) — 앱의 종족색은 밝은 바탕에서 노랑이 1.47:1 이라 선으로 못 읽혀 검사기
   (dataviz validate_palette)를 통과한 한 단 진한 짝을 쓴다. 손가락·마우스가 닿은 분에 세로 선과 세 종족 값을 띄운다. */

const RACES: BaseRace[] = ["테란", "프로토스", "저그"];
const TONE: Record<BaseRace, string> = {
  테란: "var(--race-chart-terran)", 프로토스: "var(--race-chart-protoss)", 저그: "var(--race-chart-zerg)",
};
const W0 = 320;
const H0 = 150;
export const CHART_PAD = { l: 34, r: 12, t: 10, b: 20 };
const PAD = CHART_PAD;

type Line = { race: BaseRace; ys: number[] };
/** 판에 그리는 한 줄 — 통계는 종족마다, 게임 그래프(GameCurvesModal)는 사람마다. */
export type ChartLine = { key: string; label: string; color: string; ys: number[]; off?: boolean };
type ByRace = Partial<Record<BaseRace, MemberStats>> | undefined;

/** 모든 줄이 함께 쓰는 자(2026-10-20, 요청: "일꾼 수 100 · 병력 가치 5K 로 세로 눈금 똑같이 · 가로도 똑같이" → 병력 "20K") — 세로는 일꾼 0~100 ·
 *  병력 0~20K 가 기본이고 넘는 줄이 있으면 그 단(100 · 5K)으로 올려 **모두** 같이 늘린다. 가로는 보이는 줄 중 가장 긴 분. */
export interface CurveScale { x: number; wk: number; av: number }
const WK_STEP = 100;
const AV_STEP = 5000;
const AV_MIN = 20000; // 병력 가치 세로 자 기본 0~20K(2026-10-20, 요청: "5K" → "20K")

/** 줄 값들로 자를 정한다(위 규칙 그대로 · 게임 그래프도 같은 자). */
export function scaleOf(wkLines: number[][], avLines: number[][]): CurveScale {
  let x = 1, wk = 0, av = 0;
  for (const ys of wkLines) { x = Math.max(x, ys.length - 1); wk = Math.max(wk, ...ys); }
  for (const ys of avLines) { x = Math.max(x, ys.length - 1); av = Math.max(av, ...ys); }
  return {
    x,
    wk: Math.max(WK_STEP, Math.ceil(wk / WK_STEP) * WK_STEP),
    av: Math.max(AV_MIN, Math.ceil(av / AV_STEP) * AV_STEP),
  };
}

const linesOf = (byRace: ByRace, key: "wk" | "av"): Line[] => RACES.flatMap((race) => {
  const c = byRace?.[race]?.curve;
  if (!c || c.n.length === 0) return [];
  const ys = trimmed(c, key);
  return ys.length >= 2 ? [{ race, ys }] : [];
});

export function curveScale(all: ByRace[]): CurveScale {
  return scaleOf(all.flatMap((b) => linesOf(b, "wk").map((l) => l.ys)), all.flatMap((b) => linesOf(b, "av").map((l) => l.ys)));
}

/** 판 수가 첫 분의 20%(최소 1판) 밑으로 떨어지기 전까지만. */
function trimmed(c: StatCurve, key: "wk" | "av"): number[] {
  const floor = Math.max(1, Math.ceil((c.n[0] ?? 0) * 0.2));
  const out: number[] = [];
  for (let i = 0; i < c[key].length; i += 1) {
    if ((c.n[i] ?? 0) < floor) break;
    out.push(c[key][i]);
  }
  return out;
}

const compact = (v: number): string => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K` : `${Math.round(v * 10) / 10}`);

/** 가로 눈금(분) — 판과 게임 그래프의 테크 줄이 같이 쓴다. */
function minuteTicks(maxX: number): number[] {
  const step = maxX <= 10 ? 2 : maxX <= 20 ? 5 : 10;
  return Array.from({ length: Math.floor(maxX / step) + 1 }, (_, i) => i * step);
}

/* 끝 칩(2026-10-21, 요청: "범례 제거하고 대신 그래프마다 그래프 끝에 칩으로 표시 · 칩 누르면 껐다켰다") — 줄마다 끝점 오른쪽에 이름 칩.
   칩끼리 겹치면 아래로 밀고(끝점과 짧은 줄로 잇는다), 끈 줄은 선을 지우고 칩만 흐리게 남긴다(다시 눌러 켠다). 칩 자리만큼 오른쪽 여백을 연다. */
/** 칠한 칩 위 글자색(2026-10-21, 요청: "모든 칩을 색으로 채우고 흰색이나 검정색 글자") — 밝은 바탕(휘도 0.3 넘게: 노랑·주황·옥색·연두빛 흰색)만 검정 #111 · 나머지(빨강·파랑·보라·갈색…)는 흰 #fff.
    var(--…) 색은 지금 테마의 값을 읽어 잰다. */
export function inkOn(color: string): string {
  const v = color.startsWith("var(")
    ? getComputedStyle(document.documentElement).getPropertyValue(color.slice(4, -1).split(",")[0].trim()).trim()
    : color;
  const m = /^#?([0-9a-f]{6})$/i.exec(v);
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => { const k = c / 255; return k <= 0.03928 ? k / 12.92 : ((k + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.3 ? "#111" : "#fff";
}

/** 컴팩트 네모 단추(.scr-compact-rect-btn)의 치수 — 글자 12px/600 · 높이 22(글줄 12 + 위아래 4 + 테 1) · 좌우 7(6 + 테 1) · 모서리 6.
    칩은 이 치수를 화면 px 그대로(끝 칩) 또는 글자 크기에 비례해(테크 칩) 쓴다(2026-10-21, 요청: "컴팩트네모버튼이야 · 패딩같은거는"). */
export const BTN = { fs: 12, h: 22, px: 7, r: 6 };
let measureCtx: CanvasRenderingContext2D | null = null;
/** 글자 폭(px · 굵기 600 · 본문 글꼴) — 칩 폭을 글자에 딱 맞춰 좌우 여백이 같게. */
export function textW(s: string, fs: number): number {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return s.length * fs;
  measureCtx.font = `600 ${fs}px ${getComputedStyle(document.body).fontFamily}`;
  return measureCtx.measureText(s).width;
}
const chipWOf = (s: string): number => textW(s, BTN.fs) + 2 * BTN.px;
/** 끝 칩을 단 판의 오른쪽 여백(k = 화면 1px 의 판 자) — 게임 그래프의 테크 줄도 같은 여백을 써서 가로 자를 맞춘다. */
export const chipGutter = (labels: string[], k = 1): number => PAD.r + k * (8 + Math.max(0, ...labels.map(chipWOf)));

export function Chart({ title, unit, lines, note, maxX, maxY, width, padL, height, onToggle, ticksX: tx, ticksY: ty }: {
  title: string; unit: string; lines: ChartLine[]; note?: string; maxX: number; maxY: number;
  /** 눈금(기본: 세로는 0·반·끝 · 가로는 minuteTicks) — 게임 그래프는 그 판에 맞춘 눈금을 건넨다. */
  ticksX?: number[]; ticksY?: number[];
  /** 판의 가로 자(기본 320) — 넓은 자리(PC 게임 그래프)는 키워 판이 너무 높아지지 않게 한다(높이 150 그대로). */
  width?: number;
  /** 왼쪽 여백(기본 34) — 게임 그래프는 테크 줄 앞머리의 닉네임 칸과 가로 자를 맞추려 넓힌다. */
  padL?: number;
  /** 판의 세로 자(기본 150) — 게임 그래프는 잰 칸 크기 그대로(1:1) 그려 세 판의 높이를 맞춘다. */
  height?: number;
  /** 끝 칩을 누르면 그 줄을 끄고 켠다(줄의 key). */
  onToggle?: (key: string) => void;
}) {
  const W = width ?? W0;
  const H = height ?? H0;
  const PL = padL ?? PAD.l;
  const [at, setAt] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  /* 판은 viewBox 로 늘고 준다 — 칩은 단추와 같은 화면 px 이어야 해서 화면 1px 이 판 자로 몇인지(k) 잰다. */
  const [k, setK] = useState(1);
  useEffect(() => {
    const el = svgRef.current;
    if (!el || !onToggle) return undefined;
    const ro = new ResizeObserver(() => { if (el.clientWidth > 0) setK(W / el.clientWidth); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, onToggle]);
  const PR = onToggle ? chipGutter(lines.map((l) => l.label), k) : PAD.r;
  const CHIP_H = BTN.h * k;
  const shown = lines.filter((l) => !l.off);
  /* 띄운 값 상자는 그래프 밖 어디를 누르든 닫힌다(2026-10-20, 요청: "그래프 누르면 팝업 같은 거 나오는데 다른 데 누르면 닫히게").
     폰은 손가락을 떼도 남아 있어(pointerleave 는 마우스만 닫는다) 이것이 닫는 길이다. */
  useEffect(() => {
    if (at === null) return undefined;
    const close = (e: PointerEvent): void => {
      if (!svgRef.current?.contains(e.target as Node)) setAt(null);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [at]);
  const x = (i: number) => PL + (i / maxX) * (W - PL - PR);
  const y = (v: number) => PAD.t + (1 - v / maxY) * (H - PAD.t - PAD.b);
  const ticksY = ty ?? [0, maxY / 2, maxY];
  const ticksX = tx ?? minuteTicks(maxX);
  const pick = (clientX: number): void => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    setAt(Math.max(0, Math.min(maxX, Math.round(((sx - PL) / (W - PL - PR)) * maxX))));
  };
  const tipLeft = at === null ? 0 : (x(at) / W) * 100;
  /* 칩 자리 — 끝점 오른쪽 · 위에서부터 겹치면 아래로 민다(판 안에 가둔다). */
  const chips = (onToggle ? lines : []).filter((l) => l.ys.length > 0).map((l) => {
    const i = l.ys.length - 1;
    return { l, ex: x(i), ey: y(l.ys[i]), cx: x(i) + 8 * k, cy: y(l.ys[i]), w: chipWOf(l.label) * k };
  }).sort((a, b) => a.ey - b.ey);
  const placed: typeof chips = [];
  for (const c of chips) {
    c.cy = Math.max(PAD.t + CHIP_H / 2, c.cy);
    for (const p of placed) {
      if (c.cx < p.cx + p.w && p.cx < c.cx + c.w && c.cy < p.cy + CHIP_H + 2 * k) c.cy = Math.max(c.cy, p.cy + CHIP_H + 2 * k);
    }
    c.cy = Math.min(c.cy, H - PAD.b - CHIP_H / 2);
    placed.push(c);
  }
  return (
    <figure className="scr-rc-chart">
      <figcaption className="scr-rc-title">{title}{note && <i> · {note}</i>}</figcaption>
      <div className="scr-rc-plot">
        <svg
          ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="scr-rc-svg" role="img"
          aria-label={`${title} 분당 — ${lines.map((l) => `${l.label} ${l.ys.length - 1}분까지`).join(", ")}`}
          onPointerMove={(e) => pick(e.clientX)} onPointerDown={(e) => pick(e.clientX)}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") setAt(null); }}
        >
          {ticksY.map((v) => (
            <g key={v}>
              <line className="scr-rc-grid" x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} />
              <text className="scr-rc-axis" x={PL - 5} y={y(v)} textAnchor="end" dominantBaseline="middle">{compact(v)}</text>
            </g>
          ))}
          {ticksX.map((m) => (
            <text key={m} className="scr-rc-axis" x={x(m)} y={H - 5} textAnchor="middle">{m}분</text>
          ))}
          {shown.map((l) => (
            <polyline
              key={l.key} className="scr-rc-line" style={{ stroke: l.color }}
              points={l.ys.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            />
          ))}
          {shown.map((l) => {
            const i = l.ys.length - 1;
            return <circle key={l.key} className="scr-rc-end" cx={x(i)} cy={y(l.ys[i])} r={4} style={{ fill: l.color }} />;
          })}
          {chips.map((c) => (
            <g
              key={c.l.key} className={`scr-rc-chip${c.l.off ? " is-off" : ""}`} role="button" tabIndex={0}
              aria-pressed={!c.l.off} aria-label={`${c.l.label} ${c.l.off ? "켜기" : "끄기"}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onToggle?.(c.l.key)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle?.(c.l.key); } }}
            >
              {Math.abs(c.cy - c.ey) > 1 && <line className="scr-rc-chip-lead" x1={c.ex} y1={c.ey} x2={c.cx} y2={c.cy} style={{ stroke: c.l.color }} />}
              <rect x={c.cx} y={c.cy - CHIP_H / 2} width={c.w} height={CHIP_H} rx={BTN.r * k} style={{ fill: c.l.color }} />
              <text x={c.cx + c.w / 2} y={c.cy} textAnchor="middle" dominantBaseline="central" style={{ fontSize: BTN.fs * k, fill: inkOn(c.l.color) }}>{c.l.label}</text>
            </g>
          ))}
          {at !== null && <line className="scr-rc-cross" x1={x(at)} x2={x(at)} y1={PAD.t} y2={H - PAD.b} />}
          {at !== null && shown.map((l) => (at < l.ys.length
            ? <circle key={l.key} className="scr-rc-dot" cx={x(at)} cy={y(l.ys[at])} r={4} style={{ fill: l.color }} />
            : null))}
        </svg>
        {at !== null && (
          <div className={`scr-rc-tip${tipLeft > 60 ? " is-left" : ""}`} style={{ left: `${tipLeft}%` }} role="status">
            <div className="scr-rc-tip-head">{at}분</div>
            {shown.map((l) => (
              <div key={l.key} className="scr-rc-tip-row">
                <i className="scr-rc-key" style={{ background: l.color }} />
                <b>{at < l.ys.length ? `${compact(l.ys[at])}${unit}` : "-"}</b>
                <span>{l.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}

export default function RaceCurves({ byRace, scale }: { byRace?: Partial<Record<BaseRace, MemberStats>>; scale?: CurveScale }) {
  /* 종족 켜고 끄기는 줄 끝 칩으로(2026-10-21, 요청: "범례 제거하고 그래프 끝에 칩 · 칩 누르면 껐다켰다") — 옛 종족 단추 줄은 걷었다.
     두 판이 한 상태를 같이 쓰고, 끈 종족은 선만 빠지고 자(scale)는 그대로라 켰다 껐다 해도 눈금이 안 흔들린다. */
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set());
  const allWk = linesOf(byRace, "wk");
  const allAv = linesOf(byRace, "av");
  const sc = scale ?? curveScale([byRace]);
  if (allWk.length === 0 && allAv.length === 0) {
    return <div className="scr-rc-empty">표시할 데이터가 아직 없어요</div>;
  }
  const toggle = (k: string): void => setOff((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  const drawn = (ls: Line[]): ChartLine[] => ls.map((l) => ({ key: l.race, label: l.race, color: TONE[l.race], ys: l.ys, off: off.has(l.race) }));
  return (
    <div className="scr-rc">
      <div className="scr-rc-charts">
        <Chart title="일꾼 수" unit="기" lines={drawn(allWk)} maxX={sc.x} maxY={sc.wk} onToggle={toggle} />
        {/* 짧은 설명(2026-10-20, 요청: "병력 가치가 뭐야?" → "짧은 설명 붙이고" → "분마다 평균 · 일꾼·오버로드·건물 제외 걷고 설명은 제목 옆으로") — 셈은 sg-api series.ARMY_COST. */}
        <Chart title="병력 가치" unit="" lines={drawn(allAv)} note="살아 있는 전투 유닛의 미네랄+가스 합" maxX={sc.x} maxY={sc.av} onToggle={toggle} />
      </div>
    </div>
  );
}
