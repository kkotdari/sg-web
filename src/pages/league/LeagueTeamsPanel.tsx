import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Trash2, X } from "lucide-react";
import Select from "../../components/common/Select";
import Avatar from "../../components/common/Avatar";
import RosterFace from "./RosterFace";
import RosterIntro from "./RosterIntro";
import { useAppStore } from "../../store/appStore";
import { api } from "../../api/client";
import { cx } from "../../utils/format";
import type { League, LeaguePoolMember } from "../../types";

const POOL_AVATAR = 36;
const POOL_ICON = 18;
const BIG_AVATAR = 56;
const BIG_ICON = 26;

function teamHasDecidedMatch(league: League, teamId: number | null): boolean {
  if (teamId === null) return false;
  return league.matches.some(
    (m) => m.setsWonA !== null && (m.teamA?.id === teamId || m.teamB?.id === teamId),
  );
}

function labelForIndex(index: number): string {
  const A = "A".charCodeAt(0);
  let n = index;
  let label = "";
  for (;;) {
    label = String.fromCharCode(A + (n % 26)) + label;
    n = Math.floor(n / 26);
    if (n === 0) break;
    n -= 1;
  }
  return label;
}

interface LocalTeam {
  key: string;
  id: number | null;
  size: number;
  seats: (number | null)[];
}

function seatsOf(team: League["teams"][number]): (number | null)[] {
  const seats: (number | null)[] = Array.from({ length: team.size }, () => null);
  for (const r of team.roster) if (r.position < seats.length) seats[r.position] = r.poolId;
  return seats;
}

function toLocalTeams(league: League): LocalTeam[] {
  return league.teams.map((t) => ({ key: `t${t.id}`, id: t.id, size: t.size, seats: seatsOf(t) }));
}

function teamsSignature(league: League): string {
  return JSON.stringify(league.teams.map((t) => [t.id, t.size, seatsOf(t)]));
}

type DragPayload =
  | { from: "pool"; poolId: number }
  | { from: "seat"; teamKey: string; index: number };

function PoolChip({ member, seatedLabel, draggable, hidden = false, avatarSize, iconSize, onDragStart, onDragEnd, onRemove }: {
  member: LeaguePoolMember;
  seatedLabel: string | null;
  draggable: boolean;
  hidden?: boolean;
  avatarSize: number;
  iconSize: number;
  onDragStart: () => void;
  onDragEnd: () => void;
  onRemove: (() => void) | null;
}) {
  const dragProps = {
    draggable,
    "data-pool-chip": member.id,
    style: hidden ? { opacity: 0 } : undefined,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(member.id)); onDragStart(); },
    onDragEnd,
    title: seatedLabel ? `${member.nickname} · ${seatedLabel}팀에 배치됨` : member.nickname,
  };
  return (
    <div className={cx("scr-league-rcard", seatedLabel && "scr-league-rcard-seated")} {...dragProps}>
      <RosterFace member={member} avatarSize={avatarSize} iconSize={iconSize} />
      {seatedLabel && <span className="scr-league-rcard-badge">{seatedLabel}</span>}
      {onRemove && (
        <button
          type="button" className="scr-icon-btn scr-league-rcard-remove"
          onClick={onRemove} aria-label={`${member.nickname} 참가 선수에서 빼기`}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export default function LeagueTeamsPanel({ league, onRegisterSave, section = "all", large = false }: {
  league: League;
  section?: "all" | "pool" | "teams";
  large?: boolean;
  onRegisterSave: (entry: { dirty: boolean; commit: () => Promise<League> } | null) => void;
}) {
  const members = useAppStore((s) => s.members);
  const isIndividual = league.mode === "individual";
  const avatarSize = large ? BIG_AVATAR : POOL_AVATAR;
  const iconSize = large ? BIG_ICON : POOL_ICON;
  const showPoolAdd = section !== "teams";
  const showTeams = section !== "pool";

  const [localTeams, setLocalTeams] = useState<LocalTeam[]>(() => toLocalTeams(league));
  const sigRef = useRef(teamsSignature(league));
  useEffect(() => {
    const sig = teamsSignature(league);
    if (sig !== sigRef.current) {
      sigRef.current = sig;
      setLocalTeams(toLocalTeams(league));
      return;
    }
    const alive = new Set(league.pool.map((p) => p.id));
    setLocalTeams((prev) => prev.map((t) => ({
      ...t, seats: t.seats.map((v) => (v === null || v < 0 || alive.has(v) ? v : null)),
    })));
  }, [league]);

  const poolSigRef = useRef(JSON.stringify(league.pool.map((p) => p.id)));
  useEffect(() => {
    const sig = JSON.stringify(league.pool.map((p) => p.id));
    if (sig === poolSigRef.current) return;
    poolSigRef.current = sig;
    setPendingAdds([]);
    setPendingRemoves([]);
  }, [league.pool]);

  const keyCounter = useRef(0);
  const newKey = () => `new${keyCounter.current++}`;
  const dragRef = useRef<DragPayload | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pendingAdds, setPendingAdds] = useState<LeaguePoolMember[]>([]);
  const [pendingRemoves, setPendingRemoves] = useState<number[]>([]);
  const tempIdRef = useRef(-1);
  const [introId, setIntroId] = useState<number | null>(null);

  const pool = useMemo(
    () => [...league.pool.filter((p) => !pendingRemoves.includes(p.id)), ...pendingAdds],
    [league.pool, pendingRemoves, pendingAdds],
  );
  const poolById = useMemo(() => new Map(pool.map((p) => [p.id, p])), [pool]);
  const seatedLabel = useMemo(() => {
    const m = new Map<number, string>();
    localTeams.forEach((t, i) => {
      for (const v of t.seats) if (v !== null) m.set(v, labelForIndex(i));
    });
    return m;
  }, [localTeams]);

  const dirty = useMemo(
    () => pendingAdds.length > 0 || pendingRemoves.length > 0
      || JSON.stringify(localTeams.map((t) => [t.id, t.size, t.seats])) !== JSON.stringify(
        toLocalTeams(league).map((t) => [t.id, t.size, t.seats]),
      ),
    [localTeams, league, pendingAdds, pendingRemoves],
  );

  const addMemberToPool = (memberId: string) => {
    const m9 = members.find((x) => x.id === memberId);
    if (!m9) return;
    const tempId = tempIdRef.current--;
    setPendingAdds((prev) => [...prev, {
      id: tempId, kind: "member", memberId: m9.id, nickname: m9.nickname,
      battletag: m9.battletag, avatar: m9.avatar, rosterImage: m9.rosterImage,
    }]);
    if (large) setIntroId(tempId);
  };
  const removeFromPool = (poolId: number) => {
    if (introId === poolId) setIntroId(null);
    if (poolId < 0) setPendingAdds((prev) => prev.filter((p) => p.id !== poolId));
    else setPendingRemoves((prev) => (prev.includes(poolId) ? prev : [...prev, poolId]));
    setLocalTeams((prev) => prev.map((t) => ({
      ...t, seats: t.seats.map((v) => (v === poolId ? null : v)),
    })));
  };

  const memberOptions = useMemo(() => {
    const taken = new Set(pool.map((p) => p.memberId).filter(Boolean));
    return members
      .filter((m) => !taken.has(m.id))
      .map((m) => ({ value: m.id, label: `${m.nickname} (${m.battletag})`, avatar: <Avatar member={m} size={20} /> }));
  }, [members, pool]);

  const addTeam = () => {
    const size = isIndividual ? 1 : 4;
    setLocalTeams((prev) => [
      ...prev, { key: newKey(), id: null, size, seats: Array.from({ length: size }, () => null) },
    ]);
  };
  const deleteTeam = (key: string) => setLocalTeams((prev) => prev.filter((t) => t.key !== key));

  const setSize = (key: string, size: number) => {
    if (size < 1) return;
    setLocalTeams((prev) => prev.map((t) => (t.key === key ? {
      ...t, size,
      seats: Array.from({ length: size }, (_, i) => t.seats[i] ?? null),
    } : t)));
  };

  const startDrag = (payload: DragPayload) => { dragRef.current = payload; setDragging(true); };
  const endDrag = () => { dragRef.current = null; setDragging(false); };

  const dropOnSeat = (teamKey: string, index: number) => {
    const d = dragRef.current;
    endDrag();
    if (!d) return;
    setLocalTeams((prev) => {
      const next = prev.map((t) => ({ ...t, seats: [...t.seats] }));
      const target = next.find((t) => t.key === teamKey);
      if (!target) return prev;
      const occupant = target.seats[index] ?? null;
      if (d.from === "seat") {
        const src = next.find((t) => t.key === d.teamKey);
        if (!src) return prev;
        const moving = src.seats[d.index] ?? null;
        if (moving === null) return prev;
        src.seats[d.index] = occupant;
        target.seats[index] = moving;
      } else {
        for (const t of next) {
          const at = t.seats.indexOf(d.poolId);
          if (at >= 0) t.seats[at] = null;
        }
        target.seats[index] = d.poolId;
      }
      return next;
    });
  };

  const dropOnPool = () => {
    const d = dragRef.current;
    endDrag();
    if (!d || d.from !== "seat") return;
    setLocalTeams((prev) => prev.map((t) => (t.key === d.teamKey ? {
      ...t, seats: t.seats.map((v, i) => (i === d.index ? null : v)),
    } : t)));
  };

  const commit = useCallback(async () => {
    let latest = league;
    for (const id of pendingRemoves) {
      if (!latest.pool.some((p) => p.id === id)) continue;
      latest = await api.removeLeaguePoolMember(league.id, id);
    }
    const idMap = new Map<number, number>();
    for (const add of pendingAdds) {
      const already = latest.pool.find((p) => p.memberId === add.memberId);
      if (already) { idMap.set(add.id, already.id); continue; }
      const before = new Set(latest.pool.map((p) => p.id));
      latest = await api.addLeaguePoolMember(league.id, { kind: "member", memberId: add.memberId });
      const real = latest.pool.find((p) => !before.has(p.id));
      if (real) idMap.set(add.id, real.id);
    }
    const seatOf = (v: number | null) => (v === null ? null : v < 0 ? idMap.get(v) ?? null : v);
    return api.setLeagueTeamComposition(
      league.id,
      localTeams.map((t) => ({ id: t.id, size: t.size, roster: t.seats.map(seatOf) })),
    );
  }, [league, localTeams, pendingAdds, pendingRemoves]);
  useEffect(() => {
    onRegisterSave({ dirty, commit });
    return () => onRegisterSave(null);
  }, [dirty, commit, onRegisterSave]);

  return (
    <div className={cx("scr-league-teams-panel", large && "scr-league-teams-panel-big")}>
      <div className="scr-league-teams-panel-head">
        <h2 className="scr-league-section-title">참가 선수 ({pool.length})</h2>
      </div>
      {showPoolAdd && (
        <div className="scr-league-pool-add">
          <Select
            value="" options={memberOptions} onChange={addMemberToPool}
            placeholder="회원 추가" disabled={memberOptions.length === 0}
            className="scr-cselect-plain scr-league-pool-select" size="sm"
          />
        </div>
      )}

      <div
        className={cx("scr-league-pool-list scr-league-pool-list-cards", dragging && "scr-league-pool-list-drop")}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDrop={(e) => { e.preventDefault(); dropOnPool(); }}
      >
        {pool.map((p) => (
          <PoolChip
            key={p.id} member={p} seatedLabel={seatedLabel.get(p.id) ?? null}
            hidden={introId === p.id}
            draggable avatarSize={avatarSize} iconSize={iconSize}
            onDragStart={() => startDrag({ from: "pool", poolId: p.id })}
            onDragEnd={endDrag}
            onRemove={() => removeFromPool(p.id)}
          />
        ))}
      </div>

      {introId !== null && poolById.get(introId) && (
        <RosterIntro
          member={poolById.get(introId) as LeaguePoolMember}
          targetSelector={`[data-pool-chip="${introId}"]`}
          onDone={() => setIntroId(null)}
        />
      )}

      {showTeams && (<>
      <div className="scr-league-teams-panel-head">
        <h2 className="scr-league-section-title">
          {isIndividual ? "선수" : "팀"} ({localTeams.length})
        </h2>
        <div className="scr-league-teams-panel-actions">
          <button type="button" className="scr-rect-btn scr-lighting-color" onClick={addTeam}>
            <Plus size={14} /> {isIndividual ? "선수 추가" : "팀 추가"}
          </button>
        </div>
      </div>

      {localTeams.length === 0 ? (
        <div className="scr-empty">{isIndividual ? "선수가" : "팀이"} 없어요</div>
      ) : (
        <div className="scr-league-teams-grid">
          {localTeams.map((team, i) => {
            const label = labelForIndex(i);
            const editable = !teamHasDecidedMatch(league, team.id);
            return (
              <div key={team.key} className="scr-league-team-card">
                <div className="scr-league-team-card-head">
                  <span className="scr-league-team-label">
                    {label}{isIndividual ? "" : "팀"}
                  </span>
                  {!isIndividual && editable && (
                    <span className="scr-league-team-size">
                      <button
                        type="button" className="scr-icon-btn" disabled={team.size <= 1}
                        onClick={() => setSize(team.key, team.size - 1)}
                        aria-label={`${label}팀 명수 줄이기`}
                      >
                        <Minus size={12} />
                      </button>
                      <span className="scr-league-team-size-num">{team.size}명</span>
                      <button
                        type="button" className="scr-icon-btn"
                        onClick={() => setSize(team.key, team.size + 1)}
                        aria-label={`${label}팀 명수 늘리기`}
                      >
                        <Plus size={12} />
                      </button>
                    </span>
                  )}
                  {editable && (
                    <button
                      type="button" className="scr-icon-btn scr-icon-btn-danger"
                      onClick={() => deleteTeam(team.key)}
                      aria-label={`${label}${isIndividual ? "" : "팀"} 삭제`}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                <div className="scr-league-seats scr-league-seats-cards">
                  {team.seats.map((poolId, idx) => {
                    const p = poolId !== null ? poolById.get(poolId) : undefined;
                    return (
                      <div
                        key={idx}
                        className={cx(
                          "scr-league-seat scr-league-seat-card",
                          !p && "scr-league-seat-empty",
                          dragging && editable && "scr-league-seat-open",
                        )}
                        onDragOver={(e) => {
                          if (!editable) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(e) => { e.preventDefault(); if (editable) dropOnSeat(team.key, idx); }}
                        draggable={editable && !!p}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", String(poolId));
                          startDrag({ from: "seat", teamKey: team.key, index: idx });
                        }}
                        onDragEnd={endDrag}
                      >
                        {p ? (
                          <>
                            <RosterFace member={p} avatarSize={avatarSize} iconSize={iconSize} />
                            {editable && (
                              <button
                                type="button" className="scr-icon-btn scr-league-rcard-remove"
                                onClick={() => setLocalTeams((prev) => prev.map((t) => (t.key === team.key ? {
                                  ...t, seats: t.seats.map((v, j) => (j === idx ? null : v)),
                                } : t)))}
                                aria-label="자리 비우기"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="scr-league-seat-hint">{idx + 1}번 자리</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>)}
    </div>
  );
}
