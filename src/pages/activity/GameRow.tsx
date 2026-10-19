import { type ReactNode } from "react";
import { Play } from "lucide-react";
import { cachedReplayMap } from "scplay";
import { isMeleeGame, resolveSlotName } from "./GameResultSides";
import { cleanMapName } from "../../utils/mapName";
import { cx } from "../../utils/format";
import { useLongPress } from "../../hooks/useLongPress";
import { isSecretGame } from "../../utils/gameAccess";
import type { GameResult, GameResultSlot, Member } from "../../types";

/** playable — 폰 게임 줄은 재생 배지를 맵 배지 **바로 옆**(윗줄)에 단다(2026-10-19, 요청: "모바일 게임목록 재생배지를 맵 배지 옆으로 이동") · PC 는 숨고 이름 줄 끝 그대로(global.css). */
export function GameRowStatus({ game, playable }: { game: GameResult; playable?: boolean }) {
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
  if (sec == null && !map) return null;
  return (<>
    <span className="scr-activity-row-status scr-activity-row-status-dur" title={full || undefined}>
      {map !== "" && <span>{map}</span>}
      {sec != null && <span>{Math.round(sec / 60)}분</span>}
    </span>
    {playable && <Play size={12} className="scr-activity-row-play scr-activity-row-play-top" aria-hidden fill="currentColor" />}
  </>);
}

const sideOutcome = (result: GameResult["result"], side: 1 | 2): "승" | "무" | "패" | null =>
  (result === "draw" ? "무" : result === "team1" ? (side === 1 ? "승" : "패") : result === "team2" ? (side === 2 ? "승" : "패") : null);
const OutcomeBadge = ({ text }: { text: "승" | "무" | "패" | null }) =>
  (text ? <span className={text === "패" ? "scr-activity-row-wl is-loss" : text === "승" ? "scr-activity-row-wl is-win" : "scr-activity-row-wl"} aria-label={text === "승" ? "승리" : text === "패" ? "패배" : "무승부"}>{text}</span> : null);

export function GameRowNames({ game, memberOf, playable, nameMask }: {
  game: GameResult;
  memberOf: (id: string) => Member | undefined;
  /** 옛 폰 글자 수 자르기(clipRowName)의 깃발 — 이제 이름은 칸 폭으로 잘린다(아래 ★★ 격자) · 부르는 쪽 호환으로만 남는다. */
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
  /* ★★ **이름 줄은 격자다**(2026-10-19, 요청: "로스터 형태 변경 · 2팀 경기면 vs 는 정가운데 · 각 팀 로스터는 제 영역 가로세로 가운데 · 3명 이상이면 각 팀 2×2 ·
     프리포올이나 3팀 이상이면 그에 맞게 · 로스터 칸 안의 조건은 같음 · 글자 수는 칸 너비에 맞게 유동(말줄임 없음)") — 옛 한 줄(FlatLine · 폰 글자 수 자르기 clipRowName)을 걷었다.
       · 2팀: [팀1 1fr | vs(승패 배지) | 팀2 1fr] — vs 가 줄 한가운데 · 팀 칸은 제 칸 가운데(가로·세로).
       · 팀 칸 안: 1~2명은 한 줄(사이 ･) · 3명 넘으면 2열(2×2 · 셋이면 2+1).
       · 개인전(melee): 넷까지 [사람 | vs | 사람 | vs …] 한 줄 · 그 위는 두 줄 격자(칸마다 이름 + 승패 배지).
       · 이름 칸은 남는 폭만큼 줄어 **그냥 잘린다**(text-overflow clip — global.css .scr-activity-row-cell). */
  const cellOf = (s: GameResultSlot, all: GameResultSlot[], key: string, badge?: ReactNode): ReactNode => (
    <span className="scr-activity-row-cell" key={key}>
      <span className="scr-activity-row-em">{nameOf(s, all)}</span>
      {badge}
    </span>
  );
  const teamOf = (slots: GameResultSlot[], k: string): ReactNode => {
    const two = slots.length >= 3;
    return (
      <span className={cx("scr-activity-row-team", two && "is-grid")} key={k}>
        {slots.flatMap((s, i) => [
          ...(!two && i > 0 ? [<span className="scr-activity-row-slash" key={`s${i}`} aria-hidden>･</span>] : []),
          cellOf(s, slots, `n${i}`),
        ])}
      </span>
    );
  };
  if (isMeleeGame({ matchType: game.matchType, team1: game.team1, team2: game.team2 })) {
    const all = [...game.team1, ...game.team2];
    const badgeOf = (i: number): ReactNode => <OutcomeBadge text={sideOutcome(game.result, i < game.team1.length ? 1 : 2)} />;
    if (all.length <= 4) {
      return (<>
        <span className="scr-activity-row-grid" style={{ gridTemplateColumns: all.map(() => "minmax(0, 1fr)").join(" auto ") }}>
          {all.flatMap((s, i) => [
            ...(i > 0 ? [<span className="scr-activity-row-arrow scr-activity-row-vs" key={`v${i}`} aria-hidden>vs</span>] : []),
            <span className="scr-activity-row-team" key={`t${i}`}>{cellOf(s, all, `n${i}`, badgeOf(i))}</span>,
          ])}
        </span>
        {playBadge}
      </>);
    }
    return (<>
      <span className="scr-activity-row-grid is-ffa" style={{ gridTemplateColumns: `repeat(${Math.ceil(all.length / 2)}, minmax(0, 1fr))` }}>
        {all.map((s, i) => <span className="scr-activity-row-team" key={`t${i}`}>{cellOf(s, all, `n${i}`, badgeOf(i))}</span>)}
      </span>
      {playBadge}
    </>);
  }
  return (<>
    <span className="scr-activity-row-grid">
      {teamOf(game.team1, "t1")}
      <span className="scr-activity-row-arrow scr-activity-row-vs">
        <OutcomeBadge text={sideOutcome(game.result, 1)} />
        <span aria-hidden>vs</span>
        <OutcomeBadge text={sideOutcome(game.result, 2)} />
      </span>
      {teamOf(game.team2, "t2")}
    </span>
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
