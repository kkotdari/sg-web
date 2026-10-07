import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Spinner } from "../../components/common/Feedback";
import Select from "../../components/common/Select";
import Avatar from "../../components/common/Avatar";
import RosterFace from "./RosterFace";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { api } from "../../api/client";
import { useLockBodyScroll } from "../../utils/bodyScrollLock";
import { cx } from "../../utils/format";
import { formatWhen } from "../../utils/date";
import type { League, LeagueMatch, LeagueMatchSide, LeagueTeam } from "../../types";

function cellOf(present: boolean): { w: number; h: number; gap: number } {
  const w = present ? 160 : 110;
  return { w, h: Math.round(w * 500 / 800), gap: present ? 6 : 5 };
}

function roundLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return "결승";
  if (fromEnd === 1) return "준결승";
  return `${round}라운드`;
}

function TeamSlotCard({
  team, isWinner, mode, compact, editSelect, cell,
}: {
  team: LeagueTeam | null; isWinner: boolean; mode: League["mode"]; compact: boolean;
  editSelect?: React.ReactNode;
  cell: { w: number; h: number; gap: number };
}) {
  const cardClass = cx(
    "scr-league-bracket-team-card",
    "scr-league-bracket-team-card-stacked",
    "scr-league-bracket-team-card-present",
    mode === "team" && "scr-league-bracket-team-card-stacked",
    mode === "individual" && "scr-league-bracket-team-card-individual",
    isWinner && "scr-league-bracket-team-card-win",
    compact && "scr-league-bracket-team-card-compact",
  );
  const cols = mode === "team" ? 2 : 1;
  const body = !team ? null : team.roster.length === 0 ? (
    <span className="scr-league-bracket-team-card-empty-roster">{team.label}팀(로스터 없음)</span>
  ) : (
    <div
      className="scr-league-bracket-rgrid"
      style={{ gridTemplateColumns: `repeat(${cols}, ${cell.w}px)`, gap: cell.gap }}
    >
      {team.roster.map((r) => (
        <span
          key={r.poolId} className="scr-league-bracket-rcell" title={r.nickname}
          style={{ width: cell.w, height: cell.h }}
        >
          <RosterFace member={r} avatarSize={Math.round(cell.h * 0.36)} iconSize={Math.round(cell.h * 0.18)} />
        </span>
      ))}
    </div>
  );
  return (
    <div className={cardClass}>
      {mode === "team"
        ? (editSelect ?? (team && <span className="scr-league-bracket-team-card-label">{team.label}</span>))
        : editSelect}
      {body}
    </div>
  );
}

function SlotCell({
  league, match, team, teamRef, editable, busy, mode, compact, cell, onAssign, onClear,
}: {
  league: League; match: LeagueMatch | null;
  team: LeagueTeam | null; teamRef: { id: number } | null; editable: boolean; busy: boolean;
  mode: League["mode"]; compact: boolean; cell: { w: number; h: number; gap: number };
  onAssign: (teamId: number) => void; onClear: () => void;
}) {
  const decided = match !== null && match.winnerTeamId !== null;

  if (!editable) {
    if (!team) {
      if (decided) return <div className="scr-league-bracket-team-empty">부전</div>;
      return <div className="scr-league-bracket-team-empty">{match?.isDead ? "공백" : "미정"}</div>;
    }
    return <TeamSlotCard team={team} isWinner={decided && match?.winnerTeamId === teamRef?.id} mode={mode} compact={compact} cell={cell} />;
  }

  const handleChange = (v: string) => (v === "" ? onClear() : onAssign(Number(v)));
  const select = mode === "individual" ? (
    <Select
      value={team ? String(team.id) : ""}
      options={[
        { value: "", label: "미지정" },
        ...league.teams.map((t) => ({
          value: String(t.id),
          label: t.roster[0]?.nickname ?? `${t.label}(로스터 없음)`,
          avatar: t.roster[0]
            ? <Avatar member={{ id: t.roster[0].memberId, nickname: t.roster[0].nickname, avatar: t.roster[0].avatar }} size={18} />
            : undefined,
        })),
      ]}
      onChange={handleChange}
      placeholder="미지정"
      size="sm" className="scr-league-bracket-slot-select scr-cselect-plain"
      disabled={busy}
    />
  ) : (
    <Select
      value={team ? String(team.id) : ""}
      options={[
        { value: "", label: "미지정", shortLabel: "-" },
        ...league.teams.map((t) => ({
          value: String(t.id), label: `${t.label}팀 ${t.roster.map((r) => r.nickname).join(", ") || "로스터 없음"}`,
          shortLabel: t.label,
        })),
      ]}
      onChange={handleChange}
      size="sm" className="scr-league-bracket-label-select scr-cselect-plain" minDropWidth={280}
      disabled={busy}
    />
  );
  return (
    <TeamSlotCard
      team={team} isWinner={decided && match?.winnerTeamId === teamRef?.id} mode={mode} compact={compact}
      editSelect={select} cell={cell}
    />
  );
}

function elbowPath(x1: number, y1: number, bendX: number, x2: number, y2: number, r: number): string {
  if (Math.abs(y1 - y2) < 0.5) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const dir = y2 > y1 ? 1 : -1;
  const rr = Math.max(0, Math.min(r, bendX - x1, Math.abs(y2 - y1)));
  if (rr <= 0) return `M ${x1} ${y1} L ${bendX} ${y1} L ${bendX} ${y2} L ${x2} ${y2}`;
  return [
    `M ${x1} ${y1}`,
    `L ${bendX - rr} ${y1}`,
    `Q ${bendX} ${y1} ${bendX} ${y1 + rr * dir}`,
    `L ${bendX} ${y2}`,
    `L ${x2} ${y2}`,
  ].join(" ");
}

function pathOf(match: LeagueMatch, totalRounds: number): string {
  const depth = totalRounds - match.round;
  if (depth <= 0) return "";
  return match.slotInRound.toString(2).padStart(depth, "0")
    .split("").map((bit) => (bit === "0" ? "a" : "b")).join("");
}

function indexByPath(league: League): Map<string, LeagueMatch> {
  const totalRounds = league.matches.reduce((n, m) => Math.max(n, m.round), 0);
  const by = new Map<string, LeagueMatch>();
  league.matches.forEach((m) => by.set(pathOf(m, totalRounds), m));
  return by;
}

type SeatMap = Record<string, number | null>;

const seatKey = (path: string, side: LeagueMatchSide) => `${path}:${side}`;
const pathOfSeat = (key: string) => key.slice(0, key.lastIndexOf(":"));
const byDepth = (a: string, b: string) => (a.length - b.length) || (a < b ? -1 : a > b ? 1 : 0);

function serverShape(league: League): string[] {
  return [...indexByPath(league).keys()].sort(byDepth);
}

function serverSeats(league: League): SeatMap {
  const by = indexByPath(league);
  const out: SeatMap = {};
  by.forEach((m, path) => {
    (["a", "b"] as const).forEach((side) => {
      if (by.has(path + side)) return;
      out[seatKey(path, side)] = (side === "a" ? m.teamA : m.teamB)?.id ?? null;
    });
  });
  return out;
}

function sameShape(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(b);
  return a.every((p) => s.has(p));
}

function sameSeats(a: SeatMap, b: SeatMap): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if ((a[k] ?? null) !== (b[k] ?? null)) return false;
  return true;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function MatchEditModal({
  league, match, teamA, teamB, onSaved, onClose,
}: {
  league: League; match: LeagueMatch;
  teamA: LeagueTeam | null; teamB: LeagueTeam | null;
  onSaved: (l: League) => void; onClose: () => void;
}) {
  useLockBodyScroll();
  const [when, setWhen] = useState(() => toLocalInput(match.scheduledAt));
  const [a, setA] = useState(() => (match.setsWonA === null ? "" : String(match.setsWonA)));
  const [b, setB] = useState(() => (match.setsWonB === null ? "" : String(match.setsWonB)));
  const [note, setNote] = useState(() => match.note);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const nameOf = (t: LeagueTeam | null, fallback: string) => {
    if (!t) return fallback;
    if (league.mode === "individual") return t.roster[0]?.nickname ?? `${t.label}팀`;
    return `${t.label}팀`;
  };
  const canScore = league.bracketLocked && teamA !== null && teamB !== null;
  const scoreNote = league.bracketLocked
    ? (canScore ? null : "두 자리가 다 차야 결과를 넣을 수 있어요.")
    : "대진을 확정해야 결과를 넣을 수 있어요.";

  const save = async () => {
    setErr("");
    setBusy(true);
    try {
      let next = league;
      const nextWhen = when ? new Date(when).toISOString() : null;
      if (nextWhen !== (match.scheduledAt ? new Date(match.scheduledAt).toISOString() : null)) {
        next = await api.setLeagueMatchSchedule(league.id, match.id, nextWhen);
      }
      if (canScore) {
        const filled = a !== "" && b !== "";
        const na = filled ? Number(a) : null;
        const nb = filled ? Number(b) : null;
        if (a !== "" && b === "") throw new Error("두 팀의 세트 수를 다 적어 주세요.");
        if (b !== "" && a === "") throw new Error("두 팀의 세트 수를 다 적어 주세요.");
        if (na !== match.setsWonA || nb !== match.setsWonB) {
          next = await api.setLeagueMatchResult(league.id, match.id, na, nb);
        }
      }
      if (note.trim() !== match.note) {
        next = await api.setLeagueMatchNote(league.id, match.id, note.trim());
      }
      onSaved(next);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="scr-modal-overlay">
      <div className="scr-modal scr-league-match-modal">
        <div className="scr-modal-head">
          <span>경기 정보</span>
          <button type="button" className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>
        <div className="scr-league-match-vs">
          <span>{nameOf(teamA, "미정")}</span>
          <span className="scr-league-match-vs-sep">vs</span>
          <span>{nameOf(teamB, "미정")}</span>
        </div>
        <label className="scr-field">
          <span className="scr-label">일시 <span className="scr-label-optional">(선택)</span></span>
          <input
            type="datetime-local" className="scr-input" value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </label>

        <div className="scr-field">
          <span className="scr-label">결과 <span className="scr-label-optional">(몇 대 몇)</span></span>
          <div className="scr-league-match-score">
            <input
              type="number" inputMode="numeric" min={0} className="scr-input"
              value={a} onChange={(e) => setA(e.target.value)} disabled={!canScore} aria-label="A 세트 수"
            />
            <span className="scr-league-match-score-sep">:</span>
            <input
              type="number" inputMode="numeric" min={0} className="scr-input"
              value={b} onChange={(e) => setB(e.target.value)} disabled={!canScore} aria-label="B 세트 수"
            />
            {canScore && (a !== "" || b !== "") && (
              <button
                type="button" className="scr-rect-btn scr-lighting-color"
                onClick={() => { setA(""); setB(""); }}
              >
                지우기
              </button>
            )}
          </div>
          {scoreNote && <p className="scr-league-match-note">{scoreNote}</p>}
        </div>

        <label className="scr-field">
          <span className="scr-label">메모 <span className="scr-label-optional">(세트 정보 등)</span></span>
          <textarea
            className="scr-input scr-league-match-memo" value={note} rows={4}
            onChange={(e) => setNote(e.target.value)}
            placeholder={"예)\n1세트 홍탑 승\n2세트 타센 승\n3세트 팀전 A 승"}
          />
        </label>

        {err && <div className="scr-err" role="alert">{err}</div>}
        <div className="scr-form-actions">
          <button type="button" className="scr-rect-btn scr-lighting-color" onClick={onClose} disabled={busy}>취소</button>
          <button type="button" className="scr-rect-btn scr-lighting-color-fill" onClick={save} disabled={busy}>
            {busy && <Spinner size={14} />} 저장
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function LeagueBracket({
  league, canEdit, onUpdated, onRegisterSave, present = false,
}: {
  league: League; canEdit: boolean; onUpdated: (l: League) => void;
  present?: boolean;
  onRegisterSave: (entry: { dirty: boolean; commit: () => Promise<League> } | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmingBracket, setConfirmingBracket] = useState(false);
  const [cut, setCut] = useState<
    { path: string | null; side: LeagueMatchSide; matches: number; teams: number } | null
  >(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const dragTeamRef = useRef<number | null>(null);
  const [draggingTeam, setDraggingTeam] = useState(false);

  const [shape, setShape] = useState<string[]>(() => serverShape(league));
  const [seats, setSeats] = useState<SeatMap>(() => serverSeats(league));
  useEffect(() => {
    setShape(serverShape(league));
    setSeats(serverSeats(league));
  }, [league, canEdit]);

  const dirty = useMemo(
    () => !sameShape(shape, serverShape(league)) || !sameSeats(seats, serverSeats(league)),
    [shape, seats, league],
  );

  const byPath = useMemo(() => indexByPath(league), [league]);
  const inShape = useMemo(() => new Set(shape), [shape]);
  const canShape = canEdit && !league.bracketLocked;

  const confirmBracket = async () => {
    setErr("");
    setBusy(true);
    try {
      onUpdated(await api.confirmLeagueBracket(league.id));
      setConfirmingBracket(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "대진을 확정하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const commit = useCallback(() => {
    const assignments = Object.entries(seats)
      .filter(([key, teamId]) => teamId !== null && inShape.has(pathOfSeat(key)))
      .map(([key, teamId]) => ({
        path: pathOfSeat(key), side: key.slice(-1) as LeagueMatchSide, teamId,
      }));
    return api.setLeagueBracket(league.id, shape, assignments);
  }, [league.id, shape, seats, inShape]);
  useEffect(() => {
    onRegisterSave(canShape ? { dirty, commit } : null);
    return () => onRegisterSave(null);
  }, [canShape, dirty, commit, onRegisterSave]);

  const branchSeat = (path: string, side: LeagueMatchSide) => {
    const child = path + side;
    setShape((prev) => [...prev, child].sort(byDepth));
    setSeats((prev) => {
      const next = { ...prev };
      delete next[seatKey(path, side)];
      next[seatKey(child, "a")] = null;
      next[seatKey(child, "b")] = null;
      return next;
    });
  };
  const cutSeat = (path: string | null, side: LeagueMatchSide) => {
    setCut(null);
    if (path === null) {
      setShape([]);
      setSeats({});
      return;
    }
    const root = path + side;
    const gone = (p: string) => p === root || p.startsWith(root);
    setShape((prev) => prev.filter((p) => !gone(p)));
    setSeats((prev) => {
      const next: SeatMap = {};
      Object.entries(prev).forEach(([k, v]) => {
        if (!gone(pathOfSeat(k))) next[k] = v;
      });
      next[seatKey(path, side)] = null;
      return next;
    });
  };
  const startBracket = () => {
    setShape([""]);
    setSeats({ [seatKey("", "a")]: null, [seatKey("", "b")]: null });
  };

  const totalRounds = shape.reduce((n, p) => Math.max(n, p.length + 1), 1);
  const compact = league.mode === "team";
  const roundOf = (path: string) => totalRounds - path.length;

  const handleAssign = (path: string, side: LeagueMatchSide, teamId: number) => {
    setSeats((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) if (next[k] === teamId) next[k] = null;
      next[seatKey(path, side)] = teamId;
      return next;
    });
  };
  const handleClear = (path: string, side: LeagueMatchSide) => {
    setSeats((prev) => ({ ...prev, [seatKey(path, side)]: null }));
  };

  const CARD_PAD_Y = 6;
  const SELECT_H = 25;
  const LABEL_H = 16;
  const STACK_GAP = 4;
  const MIN_CARD_H = 46;
  const cardHOf = (team: LeagueTeam | null, hasSelect = false): number => {
    const cols = league.mode === "team" ? 2 : 1;
    const n = team ? Math.max(1, team.roster.length) : 0;
    const rows = Math.ceil(n / cols);
    const rosterH = rows ? rows * cell.h + (rows - 1) * cell.gap : 0;
    const headH = hasSelect ? SELECT_H : team && league.mode === "team" ? LABEL_H : 0;
    const gap = headH && rosterH ? STACK_GAP : 0;
    return Math.max(MIN_CARD_H, CARD_PAD_Y * 2 + headH + gap + rosterH);
  };
  const ROW_GAP = present ? 14 : 10;
  const CARD_PAD_X = 15;
  const cell = cellOf(present);
  const COL_W = (league.mode === "team" ? cell.w * 2 + cell.gap : cell.w) + CARD_PAD_X * 2;
  const COL_GAP = present ? 176 : 136;
  const PAD_L = 16;
  const CORNER_R = 8;

  const colX = (r: number) => PAD_L + (r - 1) * (COL_W + COL_GAP);

  const teamOf = (id: number | null | undefined) => (id == null ? null : league.teams.find((t) => t.id === id) ?? null);
  const isEditableSeat = (path: string, side: LeagueMatchSide) => canShape && !inShape.has(path + side);
  const seatTeamId = (path: string, side: LeagueMatchSide): number | null => {
    if (!inShape.has(path + side)) return seats[seatKey(path, side)] ?? null;
    const m = byPath.get(path);
    return (side === "a" ? m?.teamA : m?.teamB)?.id ?? null;
  };

  const seatY = new Map<string, number>();
  const seatH = new Map<string, number>();
  const mergeY = new Map<string, number>();
  let cursorY = 0;
  const place = (path: string): number => {
    const ys = (["a", "b"] as const).map((side) => {
      const child = path + side;
      const h = cardHOf(teamOf(seatTeamId(path, side)), isEditableSeat(path, side));
      seatH.set(seatKey(path, side), h);
      let y: number;
      if (inShape.has(child)) {
        y = place(child);
      } else {
        y = cursorY + h / 2;
        cursorY += h + ROW_GAP;
      }
      seatY.set(seatKey(path, side), y);
      return y;
    });
    const mid = (ys[0] + ys[1]) / 2;
    mergeY.set(path, mid);
    return mid;
  };
  if (inShape.has("")) place("");
  const totalHeight = Math.max(cardHOf(null), cursorY - ROW_GAP);
  const champX = colX(totalRounds + 1);
  const canvasWidth = champX + COL_W;

  const subtreeStats = (path: string, side: LeagueMatchSide) => {
    const stack = inShape.has(path + side) ? [path + side] : [];
    let matches = 0;
    let teams = 0;
    while (stack.length) {
      const p = stack.pop() as string;
      matches += 1;
      (["a", "b"] as const).forEach((s) => {
        if (seatTeamId(p, s) !== null) teams += 1;
        if (inShape.has(p + s)) stack.push(p + s);
      });
    }
    return { matches, teams };
  };
  const askCut = (path: string | null, side: LeagueMatchSide) => {
    if (path === null) {
      const teams = shape.reduce(
        (n, p) => n + (["a", "b"] as const).filter((s) => seatTeamId(p, s) !== null).length, 0,
      );
      setCut({ path: null, side, matches: shape.length, teams });
      return;
    }
    const st = subtreeStats(path, side);
    if (st.matches <= 1 && st.teams === 0) {
      cutSeat(path, side);
      return;
    }
    setCut({ path, side, ...st });
  };

  const connectors: { path: string; won: boolean }[] = [];
  shape.forEach((p) => {
    const mid = mergeY.get(p);
    if (mid === undefined) return;
    const match = byPath.get(p) ?? null;
    const x1 = colX(roundOf(p)) + COL_W;
    const bendX = x1 + COL_GAP / 2;
    const x2 = colX(roundOf(p) + 1);
    const winnerSide = !match || match.winnerTeamId == null
      ? null
      : match.winnerTeamId === match.teamA?.id ? "a" : match.winnerTeamId === match.teamB?.id ? "b" : null;
    (["a", "b"] as const).forEach((side) => {
      const y = seatY.get(seatKey(p, side));
      if (y === undefined) return;
      connectors.push({ path: elbowPath(x1, y, bendX, x2, mid, CORNER_R), won: winnerSide === side });
    });
  });

  const slots: {
    key: string; x: number; y: number; h: number; node: React.ReactNode;
    seat: { path: string; side: LeagueMatchSide } | null; teamId: number | null;
  }[] = [];
  const branchButtons: { key: string; x: number; y: number; node: React.ReactNode }[] = [];
  const badges: { key: string; x: number; y: number; node: React.ReactNode }[] = [];
  const BRANCH_D = 22;
  const pushBranchButton = (
    key: string, x: number, y: number, hasChild: boolean,
    onClick: () => void, what: string,
  ) => {
    if (!canShape) return;
    branchButtons.push({
      key, x: x - BRANCH_D / 2, y: y - BRANCH_D / 2,
      node: (
        <button
          type="button" className="scr-league-bracket-branch" onClick={onClick} disabled={busy}
          title={hasChild ? `${what}에 달린 가지를 지웁니다` : `${what} 왼쪽에 가지를 칩니다`}
          aria-label={hasChild ? "가지 지우기" : "가지 치기"}
        >
          {hasChild ? "−" : "+"}
        </button>
      ),
    });
  };

  shape.forEach((p) => {
    const round = roundOf(p);
    const match = byPath.get(p) ?? null;
    const isCompact = compact && round > 1;
    const x = colX(round);
    (["a", "b"] as const).forEach((side) => {
      const y = seatY.get(seatKey(p, side));
      if (y === undefined) return;
      const hasChild = inShape.has(p + side);
      const editableSeat = isEditableSeat(p, side);
      slots.push({
        key: `${p}-${side}`, x, y: y - (seatH.get(seatKey(p, side)) as number) / 2,
        h: seatH.get(seatKey(p, side)) as number,
        seat: editableSeat ? { path: p, side } : null,
        teamId: editableSeat ? seatTeamId(p, side) : null,
        node: (
          <SlotCell
            league={league} match={match} team={teamOf(seatTeamId(p, side))}
            teamRef={side === "a" ? match?.teamA ?? null : match?.teamB ?? null}
            editable={isEditableSeat(p, side)} busy={busy} mode={league.mode} compact={isCompact} cell={cell}
            onAssign={(id) => handleAssign(p, side, id)} onClear={() => handleClear(p, side)}
          />
        ),
      });
      pushBranchButton(
        `${p}-${side}-branch`, x, y, hasChild,
        () => (hasChild ? askCut(p, side) : branchSeat(p, side)),
        `${roundLabel(round, totalRounds)} ${side === "a" ? "위" : "아래"} 자리`,
      );
    });
    const canFillIn = match !== null && !match.isDead;
    const hasBadge = match !== null && (
      match.setsWonA !== null || match.scheduledAt !== null || match.note !== ""
    );
    if (!hasBadge && !canFillIn) return;
    const content = (
      <>
        {match?.setsWonA !== null && match?.setsWonB !== null && (
          <div className="scr-league-bracket-score">{match?.setsWonA} : {match?.setsWonB}</div>
        )}
        {match?.note && <div className="scr-league-bracket-memo">{match.note}</div>}
        {match?.scheduledAt && (
          <div className="scr-league-bracket-when">{formatWhen(match.scheduledAt, { clock: true })}</div>
        )}
        {!hasBadge && <div className="scr-league-bracket-badge-add">일시·결과</div>}
      </>
    );
    badges.push({
      key: `${p}-badge`, x: x + COL_W + COL_GAP / 2, y: mergeY.get(p) as number,
      node: canFillIn ? (
        <button
          type="button" className="scr-league-bracket-badge-btn" onClick={() => setEditingPath(p)}
          title="일시와 결과를 적습니다"
        >
          {content}
        </button>
      ) : content,
    });
  });

  const rootMatch = byPath.get("") ?? null;
  const champion0 = inShape.has("") && rootMatch ? teamOf(rootMatch.winnerTeamId) : null;
  const champH = cardHOf(champion0);
  const champY = inShape.has("") ? mergeY.get("") as number : champH / 2;
  const champion = champion0;
  if (inShape.has("")) pushBranchButton("champ-branch", champX, champY, true, () => askCut(null, "a"), "우승 자리");

  const heads = Array.from({ length: totalRounds }, (_, i) => i + 1);
  const editingMatch = editingPath === null ? null : byPath.get(editingPath) ?? null;

  if (shape.length === 0 && !canEdit) {
    return (
      <div className="scr-league-bracket-panel">
        <h2 className="scr-league-section-title">대진표</h2>
        <div className="scr-empty">아직 대진표가 만들어지지 않았어요</div>
      </div>
    );
  }

  return (
    <div className="scr-league-bracket-panel">
      <div className="scr-league-bracket-toolbar">
        <div className="scr-league-bracket-seed-actions" />
        {canShape && shape.length > 0 && (
          <button
            type="button" className="scr-rect-btn scr-lighting-color"
            onClick={() => setConfirmingBracket(true)} disabled={busy || dirty}
            title={dirty ? "먼저 저장하세요" : undefined}
          >
            대진 확정
          </button>
        )}
      </div>
      {err && <div className="scr-err">{err}</div>}
      {present && canShape && (
        <div
          className={cx("scr-league-bracket-rail", draggingTeam && "scr-league-bracket-rail-drop")}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
          onDrop={(e) => {
            e.preventDefault();
            const id = dragTeamRef.current;
            dragTeamRef.current = null;
            setDraggingTeam(false);
            if (id === null) return;
            setSeats((prev) => {
              const next = { ...prev };
              for (const k of Object.keys(next)) if (next[k] === id) next[k] = null;
              return next;
            });
          }}
        >
          {league.teams.length === 0 ? (
            <span className="scr-hint">'팀 구성' 탭에서 팀을 먼저 만들고 저장하세요</span>
          ) : league.teams.map((t) => {
            const seated = Object.values(seats).includes(t.id);
            return (
              <div
                key={t.id}
                className={cx("scr-league-bracket-rail-chip", seated && "scr-league-bracket-rail-chip-seated")}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(t.id));
                  dragTeamRef.current = t.id;
                  setDraggingTeam(true);
                }}
                onDragEnd={() => { dragTeamRef.current = null; setDraggingTeam(false); }}
              >
                {league.mode === "team" && <span className="scr-league-bracket-rail-label">{t.label}</span>}
                <span className="scr-league-bracket-rail-roster">
                  {t.roster.length === 0
                    ? <span className="scr-league-bracket-rail-empty">로스터 없음</span>
                    : t.roster.map((r) => (
                      <span key={r.poolId} className="scr-league-bracket-rail-cell" title={r.nickname}>
                        <RosterFace member={r} avatarSize={28} iconSize={14} />
                      </span>
                    ))}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {shape.length === 0 ? (
        <div className="scr-league-bracket-start">
            <button
              type="button" className="scr-league-bracket-branch" onClick={startBracket}
              disabled={busy} title="여기서 갈라 대진표를 시작합니다" aria-label="대진표 시작"
            >
              +
            </button>
            <div className="scr-league-bracket-champ">우승</div>
        </div>
      ) : (
        <div className="scr-league-bracket-scroll scr-scroll">
          <div className="scr-league-bracket-heads" style={{ width: canvasWidth, paddingLeft: PAD_L }}>
            {heads.map((r) => (
              <div key={r} className="scr-league-bracket-col-head" style={{ width: COL_W, marginRight: COL_GAP }}>
                {roundLabel(r, totalRounds)}
              </div>
            ))}
            <div className="scr-league-bracket-col-head" style={{ width: COL_W }}>우승</div>
          </div>
          <div className="scr-league-bracket-canvas" style={{ width: canvasWidth, height: totalHeight }}>
            <svg
              className="scr-league-bracket-svg" width={canvasWidth} height={totalHeight}
              viewBox={`0 0 ${canvasWidth} ${totalHeight}`}
            >
              {connectors.map((c, i) => (
                <path key={i} d={c.path} className={cx("scr-league-bracket-line", c.won && "scr-league-bracket-line-won")} />
              ))}
            </svg>
            {slots.map((s) => {
              const dropHere = present && s.seat !== null;
              return (
                <div
                  key={s.key}
                  className={cx(
                    "scr-league-bracket-slot",
                    dropHere && draggingTeam && "scr-league-bracket-slot-open",
                  )}
                  style={{ left: s.x, top: s.y, width: COL_W, height: s.h }}
                  draggable={dropHere && s.teamId !== null}
                  onDragStart={(e) => {
                    if (!dropHere || s.teamId === null) return;
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(s.teamId));
                    dragTeamRef.current = s.teamId;
                    setDraggingTeam(true);
                  }}
                  onDragEnd={() => { dragTeamRef.current = null; setDraggingTeam(false); }}
                  onDragOver={dropHere ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } : undefined}
                  onDrop={dropHere ? (e) => {
                    e.preventDefault();
                    const id = dragTeamRef.current;
                    dragTeamRef.current = null;
                    setDraggingTeam(false);
                    if (id !== null && s.seat) handleAssign(s.seat.path, s.seat.side, id);
                  } : undefined}
                >
                  {s.node}
                </div>
              );
            })}
            <div
              className="scr-league-bracket-slot"
              style={{ left: champX, top: champY - champH / 2, width: COL_W, height: champH }}
            >
              {champion
                ? <TeamSlotCard team={champion} isWinner mode={league.mode} compact={compact} cell={cell} />
                : <div className="scr-league-bracket-champ">우승</div>}
            </div>
            {badges.map((b) => (
              <div key={b.key} className="scr-league-bracket-badge" style={{ left: b.x, top: b.y }}>
                {b.node}
              </div>
            ))}
            {branchButtons.map((b) => (
              <div key={b.key} className="scr-league-bracket-branch-slot" style={{ left: b.x, top: b.y }}>
                {b.node}
              </div>
            ))}
          </div>
        </div>
      )}
      {editingMatch && (
        <MatchEditModal
          league={league} match={editingMatch}
          teamA={teamOf(editingMatch.teamA?.id)} teamB={teamOf(editingMatch.teamB?.id)}
          onSaved={onUpdated} onClose={() => setEditingPath(null)}
        />
      )}
      {cut && (
        <ConfirmDialog
          title={cut.path === null ? "대진표 지우기" : "가지 지우기"}
          message={(cut.path === null
            ? `대진표를 통째로 지웁니다. 경기 ${cut.matches}개가 사라져요.`
            : `이 자리에 매달린 경기 ${cut.matches}개가 통째로 사라져요.`)
            + (cut.teams > 0 ? `\n앉혀 둔 팀 ${cut.teams}팀의 배정도 함께 풀립니다(팀은 남아요).` : "")
            + "\n계속할까요?"}
          confirmLabel="지우기"
          onConfirm={() => cutSeat(cut.path, cut.side)}
          onCancel={() => setCut(null)}
        />
      )}
      {confirmingBracket && (
        <ConfirmDialog
          title="대진 확정"
          message={"대진을 확정하면 팀 배정을 더 이상 바꿀 수 없어요.\n"
            + "아무도 안 앉은 가지는 이때 사라지고, 혼자 남은 팀은 다음 라운드로 올라갑니다. 계속할까요?"}
          confirmLabel={busy ? "확정 중..." : "확정"}
          onConfirm={confirmBracket}
          onCancel={() => setConfirmingBracket(false)}
        />
      )}
    </div>
  );
}
