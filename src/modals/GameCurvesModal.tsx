import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { TEAM_COLOR } from "scplay";
import ModalHash from "../utils/modalHash";
import { Spinner } from "../components/common/Feedback";
import RaceBadge from "../components/common/RaceBadge";
import { CHART_PAD, Chart, minuteTicks, scaleOf, type ChartLine } from "../pages/stats/RaceCurves";
import { api } from "../api/client";
import { useAppStore } from "../store/appStore";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import { cx } from "../utils/format";
import { pad } from "../utils/date";
import type { GameCurve, GameResult } from "../types";

/* ★ 게임 그래프(2026-10-21, 요청: "게임 목록에서 PC에 그래프 보기 버튼 · 참가자 전원의 일꾼 및 병력 가치 그래프(한 그래프에 합쳐서) · 색은 임자색 ·
   범례에 색깔과 종족 닉네임 · 통계랑 똑같이 선택 · 팀컬러 모드로 변경도" → "두 그래프를 세로로 · PC 는 모달 폭 넓게" → "게임목록 폭 거의 다 ·
   그래프를 최대한 크게 · 각 플레이어 테크 건물 건설 시간을 그래프 위에 · 범례도 위로 · 폰에서는 제공되지 않는 기능").
   차례: [선 색 · 사람 단추](범례) → 테크 줄(사람마다 한 줄 · 다 지은 때 칩) → 일꾼 수 → 병력 가치. 셋 다 같은 가로 자(CW · CHART_PAD)
   · 같은 분 눈금(minuteTicks). 테크 줄 앞머리엔 닉네임만 연하게(요청: "범례 중복할 필요 없고" → "칸 앞머리에 심플하게 닉네임") — 범례와 같은 차례 · 같은 색.
   곡선·개인색은 서버의 통계용 참값 표(GET /{id}/curves) — 판(Chart)과 자(scaleOf)는 통계 펼침(RaceCurves)과 같은 것을 쓴다.
   개인색을 못 읽은 판(옛 굽기 · 로스터 색이 한 가지뿐)은 원작 팔레트를 자리 차례로 쓴다(재생기 personalUsable 과 같은 거름). */

const BW_PALETTE = ["#f40404", "#0c48cc", "#2cb494", "#88409c", "#f88c14", "#703014", "#cce0d0", "#fcfc38"];
type ColorMode = "player" | "team";
/** 판의 가로 자 — 테크 줄과 두 판이 같이 쓴다. */
const CW = 1000;

/** 테크 건물 짧은 이름(서버 series.TECH 와 짝). */
const TECH_LABEL: Record<number, string> = {
  111: "배럭", 112: "아카데미", 113: "팩토리", 114: "스타포트", 116: "사이언스", 122: "엔베", 123: "아머리",
  107: "컴샛", 108: "핵사일로", 115: "컨트롤타워", 117: "코버트옵스", 118: "피직스랩", 120: "머신샵",
  142: "스포닝풀", 132: "레어", 133: "하이브", 135: "히드라덴", 139: "에볼", 141: "스파이어", 137: "그레이터",
  138: "퀸즈네스트", 136: "디파일러마운드", 140: "울트라캐번", 134: "나이더스",
  160: "게이트", 166: "포지", 164: "사이버", 163: "시타델", 165: "아카이브", 155: "로보", 171: "서포트베이",
  159: "옵저버터리", 167: "스타게이트", 169: "플릿비컨", 170: "아비터트리뷰널",
};
const clock = (sec: number): string => `${Math.floor(sec / 60)}:${pad(sec % 60)}`;

type Lane = { key: string; name: string; color: string; techs: GameCurve["techs"] };
/** 왼쪽 여백 — 테크 줄 앞머리의 닉네임 칸(연한 글 · 2026-10-21 요청). 두 판도 같은 여백이라 가로 자가 같다. */
const PL = 96;
const shortName = (s: string): string => (s.length > 10 ? `${s.slice(0, 9)}…` : s);

/** 테크 줄 — 사람마다 한 줄 · 다 지은 때만 칩으로(2026-10-21, 요청: "다지은때만 칩형태로 표시"). 칩의 왼끝 = 다 지은 때 ·
 *  칩은 칸의 세로 가운데 · 겹치는 칩끼리만 위아래로. 짓기 시작은 칩에 마우스를 얹으면 팝업에 나온다. */
function TechLanes({ lanes, maxX }: { lanes: Lane[]; maxX: number }) {
  /* 칩에 마우스를 얹으면 그래프와 같은 꼴의 팝업(2026-10-21, 요청: "그래프처럼 팝업으로") — 칩 오른쪽(오른끝 가까이면 왼쪽)에 뜬다. */
  const [hover, setHover] = useState<{ lane: Lane; tech: GameCurve["techs"][number]; label: string; x0: number; x1: number; cy: number } | null>(null);
  const CH = 15;
  const GAP = 8;
  const ROW_H = CH * 2 + 2 + GAP;
  const AXIS = 18;
  const x = (sec: number): number => PL + Math.min(1, sec / 60 / maxX) * (CW - PL - CHART_PAD.r);
  const chipW = (s: string): number => s.length * 9.5 + 10;
  let y0 = 4;
  /* 칩은 칸의 세로 가운데 · **겹치는 칩끼리만** 가운데 위아래로 가른다(2026-10-21, 요청: "겹치는것들만 위아래로 배치").
     가로로 겹치는 칩들을 한 무리로 묶고, 한 칩뿐인 무리는 가운데 · 여럿인 무리는 윗단 · 아랫단에 번갈아(앞 칩 끝을 넘으면 같은 단). */
  const rows = lanes.map((l) => {
    const items = l.techs.map((t) => {
      const label = TECH_LABEL[t.t] ?? `#${t.t}`;
      return { t, xe: x(t.e), label, w: chipW(label), slot: 0 as -1 | 0 | 1 };
    });
    for (let a = 0; a < items.length;) {
      let b = a + 1;
      let end = items[a].xe + items[a].w + 3;
      while (b < items.length && items[b].xe < end) { end = Math.max(end, items[b].xe + items[b].w + 3); b += 1; }
      if (b - a > 1) {
        const ends = { [-1]: -Infinity, 1: -Infinity } as Record<-1 | 1, number>;
        for (let k = a; k < b; k += 1) {
          const slot: -1 | 1 = items[k].xe >= ends[-1] ? -1 : items[k].xe >= ends[1] ? 1 : -1;
          ends[slot] = items[k].xe + items[k].w + 3;
          items[k].slot = slot;
        }
      }
      a = b;
    }
    const row = { l, chips: items, top: y0, h: ROW_H };
    y0 += ROW_H;
    return row;
  });
  const H = y0 + AXIS;
  return (
    <figure className="scr-rc-chart">
      <figcaption className="scr-rc-title">테크 건물<i> · 다 지은 때</i></figcaption>
      <div className="scr-rc-plot">
      <svg viewBox={`0 0 ${CW} ${H}`} className="scr-rc-svg scr-tl-svg" role="img" aria-label="테크 건물을 다 지은 때">
        {rows.map(({ l, chips, top, h }) => (
          <g key={l.key}>
            <line className="scr-rc-grid" x1={PL} x2={CW - CHART_PAD.r} y1={top + h} y2={top + h} />
            <text className="scr-tl-name" x={PL - 5} y={top + h / 2} textAnchor="end" dominantBaseline="central">{shortName(l.name)}</text>
            {chips.map(({ t, xe, label, w, slot }) => {
              const mid = top + h / 2;
              const y = slot === 0 ? mid - CH / 2 : slot < 0 ? mid - CH - 1 : mid + 1;
              return (
                <g
                  key={t.t} className="scr-tl-hit"
                  onPointerEnter={() => setHover({ lane: l, tech: t, label, x0: xe, x1: xe + w, cy: y })}
                  onPointerLeave={() => setHover(null)}
                >
                  <rect className="scr-tl-chip" x={xe} y={y} width={w} height={CH} rx={4} style={{ stroke: l.color }} />
                  <rect x={xe} y={y} width={3} height={CH} rx={1.5} style={{ fill: l.color }} />
                  <text className="scr-tl-label" x={xe + 7} y={y + CH / 2} dominantBaseline="central">{label}</text>
                </g>
              );
            })}
          </g>
        ))}
        {minuteTicks(maxX).map((m) => (
          <text key={m} className="scr-rc-axis" x={x(m * 60)} y={H - 5} textAnchor="middle">{m}분</text>
        ))}
      </svg>
      {hover && (
        <div
          className={`scr-rc-tip${hover.x1 / CW > 0.8 ? " is-left" : ""}`} role="status"
          style={{ left: `${((hover.x1 / CW > 0.8 ? hover.x0 : hover.x1) / CW) * 100}%`, top: `${(hover.cy / H) * 100}%` }}
        >
          <div className="scr-rc-tip-head">{clock(hover.tech.e)} 다 지음</div>
          <div className="scr-rc-tip-row">
            <i className="scr-rc-key" style={{ background: hover.lane.color }} />
            <b>{hover.label}</b>
            <span>{hover.lane.name}</span>
          </div>
          <div className="scr-rc-tip-row"><span>짓기 시작 {clock(hover.tech.s)}</span></div>
        </div>
      )}
      </div>
    </figure>
  );
}

const teamNo = (team: string): 1 | 2 => (team === "team2" ? 2 : 1);

export default function GameCurvesModal({ game, onClose }: { game: GameResult; onClose: () => void }) {
  useLockBodyScroll();
  const memberOf = useAppStore((s) => s.memberOf);
  const [players, setPlayers] = useState<GameCurve[] | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<ColorMode>("player");
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    let alive = true;
    api.getGameCurves(game.id)
      .then((p) => { if (alive) setPlayers(p); })
      .catch((e) => { if (alive) { setError(e instanceof Error ? e.message : "그래프를 불러오지 못했어요."); setPlayers([]); } });
    return () => { alive = false; };
  }, [game.id]);

  const personalOk = useMemo(() => {
    const cs = (players ?? []).map((p) => p.color).filter((c): c is string => !!c);
    return cs.length === (players ?? []).length && new Set(cs).size > 1;
  }, [players]);
  const colorOf = (p: GameCurve, i: number): string => (mode === "team"
    ? TEAM_COLOR[teamNo(p.team)]
    : personalOk && p.color ? p.color : BW_PALETTE[i % BW_PALETTE.length]);
  const nameOf = (p: GameCurve): string => memberOf(p.memberId)?.nickname ?? p.playerName;
  const sc = useMemo(() => scaleOf((players ?? []).map((p) => p.wk), (players ?? []).map((p) => p.av)), [players]);
  const linesOf = (key: "wk" | "av"): ChartLine[] => (players ?? []).flatMap((p, i) => (off.has(p.playerName) || p[key].length < 2
    ? [] : [{ key: p.playerName, label: nameOf(p), color: colorOf(p, i), ys: p[key] }]));
  const toggle = (k: string): void => setOff((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  return createPortal(
    <div className="scr-modal-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <ModalHash hash="game-curves" onClose={onClose} />
      <div className="scr-modal scr-modal-graph" onClick={(e) => e.stopPropagation()}>
        <div className="scr-modal-head">
          <span>그래프 · {game.matchNo}</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>
        <div className="scr-modal-body">
          {players === null ? (
            <div className="scr-rc-empty"><Spinner /> 불러오는 중…</div>
          ) : players.length === 0 ? (
            <div className="scr-rc-empty">{error || "표시할 데이터가 아직 없어요 — 재분석하면 생겨요"}</div>
          ) : (
            <div className="scr-gc">
              <div className="scr-gc-legend" role="group" aria-label="보일 사람">
                <div className="scr-rc-mode" role="radiogroup" aria-label="선 색">
                  {(["player", "team"] as const).map((m) => (
                    <button
                      key={m} type="button" role="radio" aria-checked={mode === m}
                      className={cx("scr-compact-rect-btn", mode !== m && "is-secondary")} onClick={() => setMode(m)}
                    >
                      {m === "player" ? "개인색" : "팀색"}
                    </button>
                  ))}
                </div>
                {players.map((p, i) => (
                  <button
                    key={p.playerName} type="button" className="scr-compact-rect-btn is-secondary scr-rc-pick"
                    aria-pressed={!off.has(p.playerName)} onClick={() => toggle(p.playerName)}
                  >
                    <i className="scr-rc-key" style={{ background: colorOf(p, i) }} />
                    <RaceBadge race={p.race} size={14} />
                    <span className="scr-rc-pick-name">{nameOf(p)}</span>
                  </button>
                ))}
              </div>
              <TechLanes
                maxX={sc.x}
                lanes={players.flatMap((p, i) => (off.has(p.playerName) ? [] : [{ key: p.playerName, name: nameOf(p), color: colorOf(p, i), techs: p.techs }]))}
              />
              <Chart title="일꾼 수" unit="기" lines={linesOf("wk")} maxX={sc.x} maxY={sc.wk} width={CW} padL={PL} />
              <Chart title="병력 가치" unit="" lines={linesOf("av")} note="살아 있는 전투 유닛의 미네랄+가스 합" maxX={sc.x} maxY={sc.av} width={CW} padL={PL} />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
