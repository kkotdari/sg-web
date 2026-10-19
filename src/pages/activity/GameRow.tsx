import { type ReactNode } from "react";
import { Play } from "lucide-react";
import { cachedReplayMap } from "scplay";
import { isMeleeGame, resolveSlotName } from "./GameResultSides";
import { cleanMapName } from "../../utils/mapName";
import { cx } from "../../utils/format";
import { useLongPress } from "../../hooks/useLongPress";
import { isSecretGame } from "../../utils/gameAccess";
import type { GameResult, GameResultSlot, Member } from "../../types";

/** 이름 줄 — 넘치면 **말줄임으로 자른다**(2026-10, 요청: "글자 좌우 압축 제거 · 글자가 잘리면 할수없이 자르기").
 *  한때는 줄 폭을 재서 transform: scaleX(--flat) 로 글자를 좌우로 눌러 담았다(ResizeObserver + fonts.ready) — 글자가 찌그러져 보였다. */
export function FlatLine({ children }: { children: ReactNode }) {
  return (
    <span className="scr-activity-row-flat">
      <span className="scr-activity-row-flat-in">{children}</span>
    </span>
  );
}

const TITLE_UNITS_WIDE = 4;
const TITLE_UNITS_NARROW = 4;

function charUnits(ch: string): number {
  return /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꥠ-꥿가-힣豈-﫿︰-﹯＀-｠￠-￦]/u.test(ch)
    || ch.codePointAt(0)! > 0xFFFF ? 2 : 1;
}

export function clipRowName(name: string, mobile: boolean): string {
  if (!mobile) return name;
  const chars = Array.from(name);
  const wide = chars.some((c) => charUnits(c) === 2);
  const limit = wide ? TITLE_UNITS_WIDE : TITLE_UNITS_NARROW;
  let used = 0;
  const kept: string[] = [];
  for (const c of chars) {
    const w = charUnits(c);
    if (used + w > limit) break;
    kept.push(c); used += w;
  }
  return kept.join("");
}

export function GameRowStatus({ game }: { game: GameResult }) {
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
  return (
    <span className="scr-activity-row-status scr-activity-row-status-dur" title={full || undefined}>
      {map !== "" && <span>{map}</span>}
      {sec != null && <span>{Math.round(sec / 60)}분</span>}
    </span>
  );
}

const sideOutcome = (result: GameResult["result"], side: 1 | 2): "승" | "무" | "패" | null =>
  (result === "draw" ? "무" : result === "team1" ? (side === 1 ? "승" : "패") : result === "team2" ? (side === 2 ? "승" : "패") : null);
const OutcomeBadge = ({ text }: { text: "승" | "무" | "패" | null }) =>
  (text ? <span className={text === "패" ? "scr-activity-row-wl is-loss" : "scr-activity-row-wl"} aria-label={text === "승" ? "승리" : text === "패" ? "패배" : "무승부"}>{text}</span> : null);

export function GameRowNames({ game, memberOf, mobile, playable, nameMask }: {
  game: GameResult;
  memberOf: (id: string) => Member | undefined;
  mobile: boolean;
  playable: boolean;
  /** 보이는 이름만 바꾸는 손 — 손님 모드의 가명(guestAliasOf · Player1…). 자료는 그대로다. 가명은 폰 줄 자르기(clipRowName)를 안 탄다 — 번호가 잘린다. */
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
  const sideNodes = (slots: GameResultSlot[]): ReactNode[] =>
    slots.flatMap((s, i) => [
      ...(i > 0 ? [<span className="scr-activity-row-slash" key={`s${i}`} aria-hidden>･</span>] : []),
      <span className="scr-activity-row-em" key={`n${i}`}>
        {(nameMask ? nameOf(s, slots) : clipRowName(nameOf(s, slots), mobile))}
      </span>,
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
              <span className="scr-activity-row-em" key={`n${i}`}>
                {(nameMask ? nameOf(s, all) : clipRowName(nameOf(s, all), mobile))}
              </span>,
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
