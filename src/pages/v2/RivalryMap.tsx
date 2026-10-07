import { useEffect, useMemo, useState } from "react";
import Avatar from "../../components/common/Avatar";
import { cx } from "../../utils/format";
import type { Member, RivalryPair } from "../../types";

const MIN_GAMES = 1;
const STRONG = 0.6;

const edgeWidth = (winRate: number) => {
  const strength = Math.abs(winRate - 0.5) * 2;
  return Math.round((0.25 + 1.15 * strength) * 100) / 100;
};

interface Edge {
  from: string;
  to: string;
  kind: "strong" | "even";
  games: number;
  fromWins: number;
  toWins: number;
  width: number;
}

export default function RivalryMap({
  pairs, memberOf, team = false,
}: {
  pairs: RivalryPair[];
  memberOf: (id: string) => Member | undefined;
  team?: boolean;
}) {
  const { nodes, edges } = useMemo(() => {
    const edges: Edge[] = [];
    const ids = new Set<string>();
    pairs.forEach((p) => {
      const games = p.aWins + p.bWins;
      if (games < MIN_GAMES) return;
      if (!memberOf(p.a) || !memberOf(p.b)) return;
      const aWr = p.aWins / games;
      if (aWr >= STRONG) {
        edges.push({ from: p.a, to: p.b, kind: "strong", games, fromWins: p.aWins, toWins: p.bWins, width: edgeWidth(aWr) });
      } else if (aWr <= 1 - STRONG) {
        edges.push({ from: p.b, to: p.a, kind: "strong", games, fromWins: p.bWins, toWins: p.aWins, width: edgeWidth(aWr) });
      } else {
        edges.push({ from: p.a, to: p.b, kind: "even", games, fromWins: p.aWins, toWins: p.bWins, width: 0.8 });
      }
      ids.add(p.a);
      ids.add(p.b);
    });
    const idList = [...ids];
    const totalGames = new Map<string, number>();
    const bump = (id: string, g: number) => totalGames.set(id, (totalGames.get(id) ?? 0) + g);
    edges.forEach((e) => { bump(e.from, e.games); bump(e.to, e.games); });
    const g = (id: string) => totalGames.get(id) ?? 0;
    const anchor = idList.reduce((best, id) =>
      g(id) > g(best) || (g(id) === g(best) && id < best) ? id : best, idList[0]);
    const vsAnchor = new Map<string, number>();
    edges.forEach((e) => {
      if (e.from === anchor) vsAnchor.set(e.to, (vsAnchor.get(e.to) ?? 0) + e.games);
      else if (e.to === anchor) vsAnchor.set(e.from, (vsAnchor.get(e.from) ?? 0) + e.games);
    });
    const va = (id: string) => vsAnchor.get(id) ?? 0;
    const N = idList.length;
    const others = idList.filter((id) => id !== anchor).sort((x, y) =>
      va(y) - va(x) || g(y) - g(x) || (x < y ? -1 : 1));
    const slots = Array.from({ length: N - 1 }, (_, k) => k + 1)
      .sort((a, b) => Math.min(b, N - b) - Math.min(a, N - a) || a - b);
    const nodes = new Array<string>(N);
    nodes[0] = anchor;
    others.forEach((id, i) => { nodes[slots[i]] = id; });
    return { nodes, edges };
  }, [pairs, memberOf]);

  const [selected, setSelected] = useState<string | null>(null);

  if (nodes.length < 2) {
    return (
      <div className="scr-empty">
        아직 상성을 그릴 만큼 쌓인 {team ? "팀전" : "1:1"} 상대전적({MIN_GAMES}전 이상)이 없어요.
      </div>
    );
  }

  const pos = new Map<string, { x: number; y: number }>();
  nodes.forEach((id, i) => {
    const ang = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
    pos.set(id, { x: 50 + 42 * Math.cos(ang), y: 50 + 42 * Math.sin(ang) });
  });

  const related = (e: Edge) => selected !== null && (e.from === selected || e.to === selected);
  const shownEdges = selected === null ? edges : edges.filter(related);

  const chipScale = Math.max(0.7, Math.min(1, 1 - Math.max(0, nodes.length - 8) * 0.03));

  const [arrowScale, setArrowScale] = useState(1);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1160px)");
    const update = () => setArrowScale(mq.matches ? 560 / 760 : 1);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <div className="scr-rivalry">
      <div className="scr-rivalry-wrap" onClick={() => setSelected(null)}>
        <svg className="scr-rivalry-svg" viewBox="0 0 100 100" aria-hidden>
          {shownEdges.map((e, i) => {
            const a = pos.get(e.from);
            const b = pos.get(e.to);
            if (!a || !b) return null;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const aw = e.width * arrowScale;
            const headLen = Math.min(3.6, Math.max(2.2, e.width * 3.4)) * arrowScale;
            const half = headLen * 0.45;
            const halfW = 9 * chipScale;
            const halfH = 3 * chipScale;
            const edgeRadius = (vx: number, vy: number) =>
              (halfW * halfH) / (Math.hypot(halfH * vx, halfW * vy) || 1);
            let trimStart = edgeRadius(ux, uy) + 0.2;
            let trimEnd = edgeRadius(ux, uy) + 0.7;
            const minShaft = headLen + 1.6 * arrowScale;
            if (len - trimStart - trimEnd < minShaft) {
              const k = Math.max(0, Math.min(1, (len - minShaft) / (trimStart + trimEnd)));
              trimStart *= k;
              trimEnd *= k;
            }
            const x1 = a.x + ux * trimStart;
            const y1 = a.y + uy * trimStart;
            const x2 = b.x - ux * trimEnd;
            const y2 = b.y - uy * trimEnd;
            const bx = x2 - ux * headLen;
            const by = y2 - uy * headLen;
            const arrowPoints = `${x2},${y2} ${bx - uy * half},${by + ux * half} ${bx + uy * half},${by - ux * half}`;
            const startHalf = (aw * 0.35) / 2;
            const endHalf = aw / 2;
            const shaftPoints = `${x1 - uy * startHalf},${y1 + ux * startHalf} ${bx - uy * endHalf},${by + ux * endHalf} ${bx + uy * endHalf},${by - ux * endHalf} ${x1 + uy * startHalf},${y1 - ux * startHalf}`;
            return (
              <g key={i} className={cx("scr-rivalry-edge", `scr-rivalry-edge-${e.kind}`, selected !== null && "scr-rivalry-edge-focus")}>
                {e.kind === "strong" ? (
                  <>
                    <polygon points={shaftPoints} className="scr-rivalry-shaft" />
                    <polygon points={arrowPoints} className="scr-rivalry-arrow-head" />
                  </>
                ) : (
                  <line x1={x1} y1={y1} x2={x2} y2={y2} style={{ strokeWidth: e.width }} />
                )}
                {selected !== null && (() => {
                  const midX = (x1 + x2) / 2;
                  const midY = (y1 + y2) / 2;
                  let side = ux > 0 ? -1 : 1;
                  let off = 1.6;
                  if (len < 32) {
                    side = (-uy * (50 - midX) + ux * (50 - midY)) >= 0 ? -1 : 1;
                    off = 4.2;
                  }
                  const lx = midX + side * -uy * off;
                  const ly = midY + side * ux * off;
                  const label = e.from === selected
                    ? `${e.fromWins}:${e.toWins}`
                    : `${e.toWins}:${e.fromWins}`;
                  return (
                    <text x={lx} y={ly} dominantBaseline="central" style={{ fontSize: 3.2 * chipScale }} className="scr-rivalry-edge-label">{label}</text>
                  );
                })()}
              </g>
            );
          })}
        </svg>
        {nodes.map((id) => {
          const m = memberOf(id);
          const p = pos.get(id);
          if (!m || !p) return null;
          const dimmed = selected !== null && id !== selected
            && !edges.some((e) => related(e) && (e.from === id || e.to === id));
          return (
            <button
              key={id}
              type="button"
              className={cx(
                "scr-rivalry-card",
                selected === id && "scr-rivalry-card-selected",
                dimmed && "scr-rivalry-card-dim",
              )}
              style={{
                left: `${p.x}%`, top: `${p.y}%`,
                fontSize: `${Math.round(12 * chipScale * 10) / 10}px`,
                padding: `${4 * chipScale}px ${6 * chipScale}px`,
                gap: `${5 * chipScale}px`,
              }}
              onClick={(e) => { e.stopPropagation(); setSelected((s) => (s === id ? null : id)); }}
            >
              <Avatar member={m} size={Math.round(18 * chipScale)} />
              <span className="scr-rivalry-card-name">{m.nickname}</span>
            </button>
          );
        })}
      </div>
      <RivalryLegend />
    </div>
  );
}

export function RivalryLegend() {
  return (
    <div className="scr-rivalry-legend">
      <span className="scr-rivalry-legend-item"><span className="scr-rivalry-legend-arrow" /> 우세→열세</span>
      <span className="scr-rivalry-legend-item"><span className="scr-rivalry-legend-even" /> 대등</span>
      <span className="scr-rivalry-legend-note">
        선이 굵을수록 상성이 뚜렷 · 유저를 누르면 그 유저의 상성만 표시
      </span>
    </div>
  );
}
