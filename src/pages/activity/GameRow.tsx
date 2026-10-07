import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Play } from "lucide-react";
import { cachedReplayMap } from "scplay";
import { isMeleeGame, resolveSlotName } from "./GameResultSides";
import { cleanMapName } from "../../utils/mapName";
import { cx } from "../../utils/format";
import { isSecretGame } from "../../utils/gameAccess";
import type { GameResult, GameResultSlot, Member } from "../../types";

const FLAT_MIN = 0.5;

export function FlatLine({ children }: { children: ReactNode }) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const inRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const box = boxRef.current;
    const inner = inRef.current;
    if (!box || !inner) return;
    const fit = () => {
      const avail = box.clientWidth;
      const natural = inner.offsetWidth;
      const k = natural > 0 ? Math.min(1, avail / natural) : 1;
      box.style.setProperty("--flat", Math.max(FLAT_MIN, Math.round(k * 1000) / 1000).toString());
    };
    fit();
    let raf = 0;
    let dead = false;
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    (document.fonts?.ready ?? Promise.resolve()).then(() => {
      if (dead) return;
      fit();
      raf = window.requestAnimationFrame(() => { if (!dead) box.dataset.flatReady = "1"; });
    }).catch(() => {});
    return () => { dead = true; window.cancelAnimationFrame(raf); ro.disconnect(); };
  });
  return (
    <span className="scr-activity-row-flat" ref={boxRef}>
      <span className="scr-activity-row-flat-in" ref={inRef}>{children}</span>
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

export function GameRowNames({ game, memberOf, mobile, playable, nameMask }: {
  game: GameResult;
  memberOf: (id: string) => Member | undefined;
  mobile: boolean;
  playable: boolean;
  /** 보이는 이름만 바꾸는 손 — 손님 모드의 가리기(maskPlayerName). 자료는 그대로다. */
  nameMask?: (name: string) => string;
}) {
  const nameOf = (s: GameResultSlot, all: GameResultSlot[]): string =>
    (nameMask ?? ((n) => n))(resolveSlotName(s, all, memberOf));
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
      ...(i > 0 ? [<span className="scr-activity-row-slash" key={`s${i}`} aria-hidden>/</span>] : []),
      <span className="scr-activity-row-em" key={`n${i}`}>
        {clipRowName(nameOf(s, slots), mobile)}
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
                {clipRowName(nameOf(s, all), mobile)}
              </span>,
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
      <span className="scr-activity-row-arrow scr-activity-row-vs" aria-hidden>vs</span>
      <span className="scr-activity-row-name">
        <span className="scr-activity-row-name-main">{sideNodes(game.team2)}</span>
      </span>
    </FlatLine>
    {playBadge}
  </>);
}

export function ListRow({ desc, top, side, onClick, check, picked, className, disabled }: {
  desc: ReactNode;
  top?: ReactNode;
  side?: ReactNode;
  onClick: () => void;
  check?: ReactNode;
  picked?: boolean;
  className?: string | false;
  disabled?: boolean;
}) {
  return (
    <div className={cx("scr-activity-row-wrap", !!check && "scr-activity-row-wrap-sel", picked && "is-picked")}>
      {check}
      <button
        type="button"
        className={cx("scr-activity-row", className, picked && "is-picked")}
        aria-disabled={disabled ? true : undefined}
        onClick={() => { if (!disabled) onClick(); }}
      >
        <span className="scr-activity-row-main">
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
