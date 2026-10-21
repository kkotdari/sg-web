import { useState, type ReactNode } from "react";
import { ChartLine, Play } from "lucide-react";
import { cachedReplayMap } from "scplay";
import { isMeleeGame, resolveSlotName } from "./GameResultSides";
import { cleanMapName } from "../../utils/mapName";
import { cx } from "../../utils/format";
import { useLongPress } from "../../hooks/useLongPress";
import { isSecretGame } from "../../utils/gameAccess";
import { api } from "../../api/client";
import GameCurvesModal from "../../modals/GameCurvesModal";
import type { GameResult, GameResultSlot, Member } from "../../types";

/** 이름 줄(PC) — 넘치면 **말줄임으로 자른다**(2026-10, 요청: "글자 좌우 압축 제거 · 글자가 잘리면 할수없이 자르기").
 *  한때는 줄 폭을 재서 transform: scaleX(--flat) 로 글자를 좌우로 눌러 담았다(ResizeObserver + fonts.ready) — 글자가 찌그러져 보였다. */
export function FlatLine({ children }: { children: ReactNode }) {
  return (
    <span className="scr-activity-row-flat">
      <span className="scr-activity-row-flat-in">{children}</span>
    </span>
  );
}

/** 데이터 단추(폰 게임 줄 윗줄 오른끝 · 2026-10-21, 요청: "모바일에서 재생버튼 살짝 왼쪽으로 밀고 그자리에 데이터 아이콘") — 누르면 데이터 모달(GameCurvesModal).
 *  모달은 포털이지만 React 이벤트는 이 줄로 거슬러 올라온다 — 줄의 누름(열기·길게 눌러 고르기)이 안 타게 감싸 막는다. */
export function GameDataButton({ game }: { game: GameResult }) {
  const [open, setOpen] = useState(false);
  const stop = (e: { stopPropagation: () => void }): void => e.stopPropagation();
  return (
    <span className="scr-activity-row-data-wrap" onPointerDown={stop} onPointerUp={stop} onClick={stop} onKeyDown={stop} onContextMenu={stop}>
      <button
        type="button" className="scr-icon-btn scr-activity-row-data" title="데이터 그래프" aria-label="데이터 그래프"
        onClick={() => { setOpen(true); void api.pingGameAction("graph", game); }}
      >
        <ChartLine size={15} />
      </button>
      {open && <GameCurvesModal game={game} onClose={() => setOpen(false)} />}
    </span>
  );
}

/** 맵·길이 배지 + (data) 윗줄 오른끝 데이터 단추(폰 · PC 는 숨는다 · global.css). 폰 게임 줄의 재생 배지는 걷었다(2026-10-21, 요청: "데이터랑 상관없이 재생배지 지우란 거였어")
 *  → (play) 맵 배지 안 '분' 옆에 다시(같은 날 요청: "모바일 게임목록 재생 가능 배지를 맵 배지 안에 넣기 분 옆에"). */
export function GameRowStatus({ game, data, play }: { game: GameResult; data?: boolean; play?: boolean }) {
  if (isSecretGame(game)) {
    return (
      <span className="scr-activity-row-status scr-activity-row-status-dur scr-activity-row-status-secret" title="숨긴 경기">
        <span>?</span>
      </span>
    );
  }
  const sec = game.durationSeconds;
  const full = cleanMapName(game.mapCanonName
    ?? cachedReplayMap(game.mapHash)?.canonName
    ?? game.mapName);
  const map = full.length > 5 ? full.slice(0, 5) : full;
  const tail = !!data && !game.ums;
  if (sec == null && !map && !tail) return null;
  return (<>
    {(sec != null || map !== "") && (
      <span className="scr-activity-row-status scr-activity-row-status-dur" title={full || undefined}>
        {map !== "" && <span>{map}</span>}
        {sec != null && <span>{Math.round(sec / 60)}분</span>}
        {play && <Play size={9} className="scr-activity-row-play scr-activity-row-status-play" aria-label="재생 가능" fill="currentColor" />}
      </span>
    )}
    {tail && <GameDataButton game={game} />}
  </>);
}

const sideOutcome = (result: GameResult["result"], side: 1 | 2): "승" | "무" | "패" | null =>
  (result === "draw" ? "무" : result === "team1" ? (side === 1 ? "승" : "패") : result === "team2" ? (side === 2 ? "승" : "패") : null);
const OutcomeBadge = ({ text }: { text: "승" | "무" | "패" | null }) =>
  (text ? <span className={text === "패" ? "scr-activity-row-wl is-loss" : text === "승" ? "scr-activity-row-wl is-win" : "scr-activity-row-wl"} aria-label={text === "승" ? "승리" : text === "패" ? "패배" : "무승부"}>{text}</span> : null);

export function GameRowNames({ game, memberOf, mobile, playable, nameMask }: {
  game: GameResult;
  memberOf: (id: string) => Member | undefined;
  /** 폰이면 세로 칸 꼴(아래 ★★) · PC 는 한 줄(FlatLine). */
  mobile: boolean;
  playable: boolean;
  /** 보이는 이름만 바꾸는 손 — 손님 모드의 가명(guestAliasOf · Player1…). 자료는 그대로다. */
  nameMask?: (name: string, slot: GameResultSlot) => string;
}) {
  const nameOf = (s: GameResultSlot, all: GameResultSlot[]): string =>
    (nameMask ? nameMask(resolveSlotName(s, all, memberOf), s) : resolveSlotName(s, all, memberOf));
  if (isSecretGame(game)) {
    return (
      <span className="scr-activity-row-names">
        <span className="scr-activity-row-em scr-activity-row-secret-title">비밀</span>
      </span>
    );
  }
  const playBadge = playable
    ? <Play size={12} className="scr-activity-row-play" aria-label="재생 가능" fill="currentColor" />
    : null;
  /* ★★ **폰은 팀마다 세로 칸**(2026-10-19, 요청: "로스터 형태 변경 …" → 첫 판(2×2 격자)을 보고 "가독성이 오히려 떨어지네 · 이렇게 —
       재생배지 · 맵시간배지 · 타임스탬프 / 1팀 승패배지 · 2팀 승패배지(3팀 있으면 …) / 1팀 로스터(세로) vs 2팀 로스터(3팀 있으면 vs 로스터 …)") —
       윗줄(재생 · 맵 · 시각)은 global.css 가 맞춘다. 여기는 둘째·셋째 줄: 격자 두 줄 × [팀 1fr | vs | 팀 1fr | vs …] — 첫 줄에 팀마다 승패 배지(칸 가운데) ·
       둘째 줄에 그 팀 이름을 한 사람 한 줄로(칸 가운데) · vs 는 이름 줄의 세로 가운데. 개인전은 사람마다 한 칸. 이름은 칸 폭으로 잘린다(말줄임 없음 · global.css). */
  if (mobile) {
    const melee = isMeleeGame({ matchType: game.matchType, team1: game.team1, team2: game.team2 });
    const all = [...game.team1, ...game.team2];
    const sides: { slots: GameResultSlot[]; side: 1 | 2 }[] = melee
      ? all.map((s, i) => ({ slots: [s], side: i < game.team1.length ? 1 : 2 }))
      : [{ slots: game.team1, side: 1 }, { slots: game.team2, side: 2 }];
    const cols = sides.map(() => "minmax(0, 1fr)").join(" auto ");
    return (<>
      <span className="scr-activity-row-cols" style={{ gridTemplateColumns: cols }}>
        {sides.flatMap((sd, i) => {
          const col = i * 2 + 1;
          return [
            ...(i > 0 ? [<span className="scr-activity-row-arrow scr-activity-row-vs" key={`v${i}`} style={{ gridColumn: col - 1, gridRow: 2 }} aria-hidden>vs</span>] : []),
            <span className="scr-activity-row-col-wl" key={`w${i}`} style={{ gridColumn: col, gridRow: 1 }}><OutcomeBadge text={sideOutcome(game.result, sd.side)} /></span>,
            <span className="scr-activity-row-col-names" key={`n${i}`} style={{ gridColumn: col, gridRow: 2 }}>
              {sd.slots.map((s, k) => <span className="scr-activity-row-em" key={k}>{nameOf(s, melee ? all : sd.slots)}</span>)}
            </span>,
          ];
        })}
      </span>
    </>);
  }
  const sideNodes = (slots: GameResultSlot[]): ReactNode[] =>
    slots.flatMap((s, i) => [
      ...(i > 0 ? [<span className="scr-activity-row-slash" key={`s${i}`} aria-hidden>･</span>] : []),
      <span className="scr-activity-row-em" key={`n${i}`}>{nameOf(s, slots)}</span>,
    ]);
  if (isMeleeGame({ matchType: game.matchType, team1: game.team1, team2: game.team2 })) {
    const all = [...game.team1, ...game.team2];
    return (<>
      <FlatLine>
        <span className="scr-activity-row-name">
          <span className="scr-activity-row-name-main">
            {all.flatMap((s, i) => [
              ...(i > 0 ? [(
                <span className="scr-activity-row-arrow scr-activity-row-vs" key={`v${i}`} aria-hidden>
                  vs
                </span>
              )] : []),
              <span className="scr-activity-row-em" key={`n${i}`}>{nameOf(s, all)}</span>,
              <OutcomeBadge key={`w${i}`} text={sideOutcome(game.result, i < game.team1.length ? 1 : 2)} />,
            ])}
          </span>
        </span>
      </FlatLine>
      {playBadge}
    </>);
  }
  return (<>
    <FlatLine>
      <span className="scr-activity-row-name">
        <span className="scr-activity-row-name-main">{sideNodes(game.team1)}</span>
      </span>
      <span className="scr-activity-row-arrow scr-activity-row-vs">
        <OutcomeBadge text={sideOutcome(game.result, 1)} />
        <span aria-hidden>vs</span>
        <OutcomeBadge text={sideOutcome(game.result, 2)} />
      </span>
      <span className="scr-activity-row-name">
        <span className="scr-activity-row-name-main">{sideNodes(game.team2)}</span>
      </span>
    </FlatLine>
    {playBadge}
  </>);
}

export function ListRow({ desc, status, top, side, onClick, check, picked, className, disabled, onLongPress, above }: {
  desc: ReactNode;
  /** 줄 **위**에 따로 서는 배지 줄(리그 판의 "2026 팀리그 · 결승 · 1세트" · 2026-10-19). */
  above?: ReactNode;
  /** 맵·길이 배지(GameRowStatus 따위) — desc 안이 아니라 **제 칸**에 선다. 폰 게임 줄은 이 칸을 시각 옆 윗줄로 올린다(global.css). */
  status?: ReactNode;
  top?: ReactNode;
  side?: ReactNode;
  onClick: () => void;
  check?: ReactNode;
  picked?: boolean;
  className?: string | false;
  disabled?: boolean;
  /** 길게 누르기(폰 선택 모드로 들어가기) — 없으면 안 붙는다. */
  onLongPress?: () => void;
}) {
  const hold = useLongPress(onLongPress);
  return (
    <div className={cx("scr-activity-row-wrap", !!check && "scr-activity-row-wrap-sel", picked && "is-picked")}>
      {check}
      <button
        type="button"
        {...hold}
        className={cx("scr-activity-row", className, picked && "is-picked")}
        aria-disabled={disabled ? true : undefined}
        onClick={() => { if (!disabled) onClick(); }}
      >
        <span className={cx("scr-activity-row-main", !!above && "has-above")}>
          {above && <span className="scr-activity-row-above">{above}</span>}
          {status}
          <span className="scr-activity-row-desc">{desc}</span>
          <span className="scr-activity-row-badges">
            <span className="scr-activity-row-badges-top">{top}</span>
            <span className="scr-activity-row-time">{side}</span>
          </span>
        </span>
      </button>
    </div>
  );
}
