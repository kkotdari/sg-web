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
const W = 320;
const H = 150;
const PAD = { l: 34, r: 12, t: 10, b: 20 };

type Line = { race: BaseRace; ys: number[] };

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

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

const compact = (v: number): string => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K` : `${Math.round(v * 10) / 10}`);

function Chart({ title, unit, lines, note }: { title: string; unit: string; lines: Line[]; note?: string }) {
  const [at, setAt] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
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
  const maxX = Math.max(1, ...lines.map((l) => l.ys.length - 1));
  const maxY = niceMax(Math.max(0, ...lines.flatMap((l) => l.ys)));
  const x = (i: number) => PAD.l + (i / maxX) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / maxY) * (H - PAD.t - PAD.b);
  const ticksY = [0, maxY / 2, maxY];
  const stepX = maxX <= 10 ? 2 : maxX <= 20 ? 5 : 10;
  const ticksX = Array.from({ length: Math.floor(maxX / stepX) + 1 }, (_, i) => i * stepX);
  const pick = (clientX: number): void => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    setAt(Math.max(0, Math.min(maxX, Math.round(((sx - PAD.l) / (W - PAD.l - PAD.r)) * maxX))));
  };
  const tipLeft = at === null ? 0 : (x(at) / W) * 100;
  return (
    <figure className="scr-rc-chart">
      <figcaption className="scr-rc-title">{title} <i>· 분마다 평균</i>{note && <small className="scr-rc-note">{note}</small>}</figcaption>
      <div className="scr-rc-plot">
        <svg
          ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="scr-rc-svg" role="img"
          aria-label={`${title} 분당 평균 — ${lines.map((l) => `${l.race} ${l.ys.length - 1}분까지`).join(", ")}`}
          onPointerMove={(e) => pick(e.clientX)} onPointerDown={(e) => pick(e.clientX)}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") setAt(null); }}
        >
          {ticksY.map((v) => (
            <g key={v}>
              <line className="scr-rc-grid" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
              <text className="scr-rc-axis" x={PAD.l - 5} y={y(v)} textAnchor="end" dominantBaseline="middle">{compact(v)}</text>
            </g>
          ))}
          {ticksX.map((m) => (
            <text key={m} className="scr-rc-axis" x={x(m)} y={H - 5} textAnchor="middle">{m}분</text>
          ))}
          {lines.map((l) => (
            <polyline
              key={l.race} className="scr-rc-line" style={{ stroke: TONE[l.race] }}
              points={l.ys.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            />
          ))}
          {lines.map((l) => {
            const i = l.ys.length - 1;
            return <circle key={l.race} className="scr-rc-end" cx={x(i)} cy={y(l.ys[i])} r={4} style={{ fill: TONE[l.race] }} />;
          })}
          {at !== null && <line className="scr-rc-cross" x1={x(at)} x2={x(at)} y1={PAD.t} y2={H - PAD.b} />}
          {at !== null && lines.map((l) => (at < l.ys.length
            ? <circle key={l.race} className="scr-rc-dot" cx={x(at)} cy={y(l.ys[at])} r={4} style={{ fill: TONE[l.race] }} />
            : null))}
        </svg>
        {at !== null && (
          <div className={`scr-rc-tip${tipLeft > 60 ? " is-left" : ""}`} style={{ left: `${tipLeft}%` }} role="status">
            <div className="scr-rc-tip-head">{at}분</div>
            {lines.map((l) => (
              <div key={l.race} className="scr-rc-tip-row">
                <i className="scr-rc-key" style={{ background: TONE[l.race] }} />
                <b>{at < l.ys.length ? `${compact(l.ys[at])}${unit}` : "-"}</b>
                <span>{l.race}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}

export default function RaceCurves({ byRace }: { byRace?: Partial<Record<BaseRace, MemberStats>> }) {
  const of = (key: "wk" | "av"): Line[] => RACES.flatMap((race) => {
    const c = byRace?.[race]?.curve;
    if (!c || c.n.length === 0) return [];
    const ys = trimmed(c, key);
    return ys.length >= 2 ? [{ race, ys }] : [];
  });
  const wk = of("wk");
  const av = of("av");
  if (wk.length === 0 && av.length === 0) {
    return <div className="scr-rc-empty">곡선 기록이 아직 없어요 — 참값을 구운(재분석한) 경기부터 쌓여요.</div>;
  }
  const shown = RACES.filter((r) => wk.some((l) => l.race === r) || av.some((l) => l.race === r));
  return (
    <div className="scr-rc">
      <div className="scr-rc-legend" aria-hidden>
        {shown.map((r) => (
          <span key={r}><i className="scr-rc-key" style={{ background: TONE[r] }} />{r}
            <em>{byRace?.[r]?.curve?.n[0] ?? 0}판</em></span>
        ))}
      </div>
      <div className="scr-rc-charts">
        <Chart title="일꾼 수" unit="기" lines={wk} />
        {/* 짧은 설명(2026-10-20, 요청: "병력 가치가 뭐야?" → "짧은 설명 붙이고") — 셈은 sg-api series.ARMY_COST. */}
        <Chart title="병력 가치" unit="" lines={av} note="살아 있는 전투 유닛의 미네랄+가스 합 (일꾼·건물·오버로드 제외)" />
      </div>
    </div>
  );
}
