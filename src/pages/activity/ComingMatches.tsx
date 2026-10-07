import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Swords } from "lucide-react";
import Avatar from "../../components/common/Avatar";
import { useAppStore } from "../../store/appStore";
import { cx } from "../../utils/format";
import { formatWhen, serverMs } from "../../utils/date";
import type { LeagueMatchActivity, LeagueMatchTeam } from "../../types";

export const COMING_WINDOW_MS = 7 * 24 * 3600 * 1000;
export const COMING_GRACE_MS = 3 * 3600 * 1000;
const SLIDE_MS = 6000;

export function pickComingMatches(matches: LeagueMatchActivity[], now = Date.now()): LeagueMatchActivity[] {
  return matches
    .filter((m) => {
      if (!m.scheduledAt) return false;
      if (m.setsWonA !== null || m.setsWonB !== null) return false;
      const at = serverMs(m.scheduledAt);
      return at >= now - COMING_GRACE_MS && at <= now + COMING_WINDOW_MS;
    })
    .sort((a, b) => serverMs(a.scheduledAt ?? "") - serverMs(b.scheduledAt ?? ""));
}

export function dDayLabel(atMs: number, now = Date.now()): string {
  const a = new Date(atMs); a.setHours(0, 0, 0, 0);
  const b = new Date(now); b.setHours(0, 0, 0, 0);
  const d = Math.round((a.getTime() - b.getTime()) / (24 * 3600 * 1000));
  return d <= 0 ? "D-DAY" : `D-${d}`;
}

function comingCardWidth(n: number): number {
  if (n <= 1) return 220;
  if (n === 2) return 190;
  if (n === 3) return 150;
  if (n === 4) return 140;
  return 120;
}

function comingColumns(n: number): number {
  return n >= 3 ? 2 : 1;
}

function ComingSide({ team }: { team: LeagueMatchTeam | null }) {
  const memberOf = useAppStore((s) => s.memberOf);
  if (team === null) {
    return <div className="scr-coming-side"><span className="scr-coming-tbd">미정</span></div>;
  }
  if (team.members.length === 0) {
    return <div className="scr-coming-side"><span className="scr-coming-tbd">{team.label}</span></div>;
  }
  const style = {
    "--coming-card-w": `${comingCardWidth(team.members.length)}px`,
    "--coming-cols": comingColumns(team.members.length),
  } as CSSProperties;
  return (
    <div className="scr-coming-side" style={style}>
      {team.members.map((p, i) => {
        const m = p.memberId ? memberOf(p.memberId) : undefined;
        const key = `${p.memberId || p.nickname}-${i}`;
        return m?.rosterImage ? (
          <img key={key} className="scr-coming-card" src={m.rosterImage} alt={p.nickname} draggable={false} />
        ) : (
          <span key={key} className="scr-coming-person">
            <Avatar member={m ?? { id: p.memberId, nickname: p.nickname, avatar: null }} size={30} />
            <span className="scr-coming-name">{p.nickname}</span>
          </span>
        );
      })}
    </div>
  );
}

export default function ComingMatches({ matches, onOpen }: {
  matches: LeagueMatchActivity[];
  onOpen: (match: LeagueMatchActivity) => void;
}) {
  const n = matches.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const swipe = useRef<{ x: number; moved: boolean } | null>(null);

  useEffect(() => { if (index >= n) setIndex(0); }, [n, index]);
  useEffect(() => {
    if (n <= 1 || paused) return undefined;
    const t = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      setIndex((i) => (i + 1) % n);
    }, SLIDE_MS);
    return () => clearInterval(t);
  }, [n, paused]);

  if (n === 0) return null;
  const now = Date.now();
  const go = (next: number): void => setIndex(((next % n) + n) % n);
  const onPointerDown = (e: ReactPointerEvent): void => { swipe.current = { x: e.clientX, moved: false }; };
  const onPointerMove = (e: ReactPointerEvent): void => {
    if (swipe.current && Math.abs(e.clientX - swipe.current.x) > 10) swipe.current.moved = true;
  };
  const onPointerUp = (e: ReactPointerEvent): void => {
    const s = swipe.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (n > 1 && Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
    if (!s.moved) swipe.current = null;
  };
  const open = (m: LeagueMatchActivity): void => {
    if (swipe.current?.moved) { swipe.current = null; return; }
    onOpen(m);
  };
  const onKey = (e: ReactKeyboardEvent, m: LeagueMatchActivity): void => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(m); }
    else if (e.key === "ArrowRight") go(index + 1);
    else if (e.key === "ArrowLeft") go(index - 1);
  };

  return (
    <section
      className="scr-coming" aria-label="다가오는 리그 경기"
      onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
    >
      <div className="scr-coming-kicker">
        <Swords size={13} aria-hidden />
        <span>Coming Match</span>
        {n > 1 && <span className="scr-coming-counter">{index + 1} / {n}</span>}
      </div>
      <div className="scr-coming-viewport" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        <div className="scr-coming-track" style={{ transform: `translateX(-${index * 100}%)` }}>
          {matches.map((m, i) => {
            const at = serverMs(m.scheduledAt ?? "");
            return (
              <div
                key={m.id}
                className={cx("scr-coming-slide", i === index && "is-on")}
                role="button" tabIndex={i === index ? 0 : -1}
                aria-hidden={i !== index}
                aria-label={`${m.leagueName} ${m.roundName} — ${formatWhen(m.scheduledAt, { clock: true })}`}
                onClick={() => open(m)}
                onKeyDown={(e) => onKey(e, m)}
              >
                <div className="scr-coming-head">
                  <span className="scr-coming-league">{m.leagueName} · {m.roundName}</span>
                  <span className="scr-coming-dday">{dDayLabel(at, now)}</span>
                  <span className="scr-coming-when">{formatWhen(m.scheduledAt, { clock: true })}</span>
                </div>
                <div className="scr-coming-body">
                  <ComingSide team={m.teamA} />
                  <span className="scr-coming-vs" aria-hidden>VS</span>
                  <ComingSide team={m.teamB} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {n > 1 && (
        <div className="scr-coming-nav">
          <button type="button" className="scr-coming-arrow" aria-label="이전 경기" onClick={() => go(index - 1)}>
            <ChevronLeft size={16} aria-hidden />
          </button>
          <div className="scr-coming-dots">
            {matches.map((m, i) => (
              <button
                key={m.id} type="button"
                className={cx("scr-coming-dot", i === index && "is-on")}
                aria-label={`${i + 1}번째 경기`} aria-pressed={i === index}
                onClick={() => go(i)}
              />
            ))}
          </div>
          <button type="button" className="scr-coming-arrow" aria-label="다음 경기" onClick={() => go(index + 1)}>
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
      )}
    </section>
  );
}
