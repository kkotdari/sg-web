import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { TEAM_COLOR } from "scplay";
import ModalHash from "../utils/modalHash";
import { Spinner } from "../components/common/Feedback";
import RaceBadge from "../components/common/RaceBadge";
import { Chart, scaleOf, type ChartLine } from "../pages/stats/RaceCurves";
import { api } from "../api/client";
import { useAppStore } from "../store/appStore";
import { useIsMobile } from "../hooks/useIsMobile";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import { cx } from "../utils/format";
import type { GameCurve, GameResult } from "../types";

/* ★ 게임 그래프(2026-10-21, 요청: "게임 목록에서 PC에 그래프 보기 버튼 · 참가자 전원의 일꾼 및 병력 가치 그래프(한 그래프에 합쳐서) · 색은 임자색 ·
   범례에 색깔과 종족 닉네임 · 통계랑 똑같이 선택 · 팀컬러 모드로 변경도" → "두 그래프를 세로로 · PC 는 모달 폭 넓게").
   곡선·개인색은 서버의 통계용 참값 표(GET /{id}/curves) — 판(Chart)과 자(scaleOf)는 통계 펼침(RaceCurves)과 같은 것을 쓴다.
   개인색을 못 읽은 판(옛 굽기 · 로스터 색이 한 가지뿐)은 원작 팔레트를 자리 차례로 쓴다(재생기 personalUsable 과 같은 거름). */

const BW_PALETTE = ["#f40404", "#0c48cc", "#2cb494", "#88409c", "#f88c14", "#703014", "#cce0d0", "#fcfc38"];
type ColorMode = "player" | "team";

const teamNo = (team: string): 1 | 2 => (team === "team2" ? 2 : 1);

export default function GameCurvesModal({ game, onClose }: { game: GameResult; onClose: () => void }) {
  useLockBodyScroll();
  const memberOf = useAppStore((s) => s.memberOf);
  const isMobile = useIsMobile();
  const chartW = isMobile ? undefined : 640;
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
            <div className="scr-rc is-stack">
              <div className="scr-rc-charts">
                <Chart title="일꾼 수" unit="기" lines={linesOf("wk")} maxX={sc.x} maxY={sc.wk} width={chartW} />
                <Chart title="병력 가치" unit="" lines={linesOf("av")} note="살아 있는 전투 유닛의 미네랄+가스 합" maxX={sc.x} maxY={sc.av} width={chartW} />
              </div>
              <div className="scr-rc-picks" role="group" aria-label="보일 사람">
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
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
