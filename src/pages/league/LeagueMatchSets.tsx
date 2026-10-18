import { useEffect, useMemo, useState } from "react";
import { Play, Plus, X } from "lucide-react";
import { Spinner } from "../../components/common/Feedback";
import { api } from "../../api/client";
import { useAppStore } from "../../store/appStore";
import { cx } from "../../utils/format";
import { cleanMapName } from "../../utils/mapName";
import { navigateTo, pathOf } from "../../utils/route";
import type { GameResult, GameResultSlot, League, LeagueMatch, LeagueMatchSet, LeagueMatchSide } from "../../types";

/* 경기 결과 입력창의 세트 목록(요청: "리그 결과 입력창에서 세트 추가하고 게임 결과 중 해당 매치 게임을 선택 가능하게").
   세트마다 그 판의 게임 결과를 고를 수 있다 — 후보는 두 팀 선수(대타 포함)가 서로 맞선 게임 결과다.
   게임을 고르면 그 게임의 승패로 이긴 쪽이 채워진다(손으로 바꿀 수 있다). */

type Side = { ids: Set<string>; names: Set<string>; nicks: string[] };

function sideOf(league: League, match: LeagueMatch, teamId: number | undefined): Side {
  const team = league.teams.find((t) => t.id === teamId);
  const people = [
    ...(team?.roster ?? []).map((r) => ({ id: r.memberId, nick: r.nickname })),
    ...match.substitutions.filter((s) => s.teamId === teamId).map((s) => ({ id: s.substituteMemberId, nick: s.substituteNickname })),
  ];
  return {
    ids: new Set(people.map((p) => p.id).filter(Boolean)),
    names: new Set(people.map((p) => p.nick.trim().toLowerCase()).filter(Boolean)),
    nicks: [...new Set(people.map((p) => p.nick.trim()).filter(Boolean))],
  };
}

const NO_GAME = "게임 고르기";
const PICK_LIMIT = 60;

export default function LeagueMatchSets({
  league, match, sets, onChange, nameA, nameB, disabled, onOpenGame,
}: {
  league: League; match: LeagueMatch; sets: LeagueMatchSet[];
  onChange: (next: LeagueMatchSet[]) => void;
  nameA: string; nameB: string; disabled: boolean;
  /** 이은 게임의 재생 단추를 누르면 그 게임 상세로 간다 — 그 전에 부르는 것(창 닫기). */
  onOpenGame?: () => void;
}) {
  const members = useAppStore((s) => s.members);
  const memberOf = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const nickOf = (sl: GameResultSlot): string => memberOf.get(sl.memberId)?.nickname ?? sl.rawName ?? sl.memberId;
  const sideA = useMemo(() => sideOf(league, match, match.teamA?.id), [league, match]);
  const sideB = useMemo(() => sideOf(league, match, match.teamB?.id), [league, match]);
  const isOf = (sl: GameResultSlot, side: Side): boolean =>
    (!!sl.memberId && side.ids.has(sl.memberId))
    || side.names.has((sl.rawName ?? "").trim().toLowerCase())
    || side.names.has(nickOf(sl).trim().toLowerCase());
  /** A 팀이 앉은 쪽 — 한쪽에 A 선수, 맞은쪽에 B 선수가 있어야 이 경기의 게임으로 본다. */
  const aSeat = (g: GameResult): "team1" | "team2" | null => {
    const has = (slots: GameResultSlot[], side: Side) => slots.some((sl) => !sl.observer && isOf(sl, side));
    if (has(g.team1, sideA) && has(g.team2, sideB)) return "team1";
    if (has(g.team2, sideA) && has(g.team1, sideB)) return "team2";
    return null;
  };
  const winnerOf = (g: GameResult): LeagueMatchSide | null => {
    const seat = aSeat(g);
    if (!seat || (g.result !== "team1" && g.result !== "team2")) return null;
    return g.result === seat ? "a" : "b";
  };

  const [games, setGames] = useState<GameResult[] | null>(null);
  const [extra, setExtra] = useState<Map<number, GameResult>>(new Map());
  const [loadErr, setLoadErr] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (sideA.nicks.length === 0 || sideB.nicks.length === 0) { setGames([]); return; }
    let alive = true;
    const any = [sideA.nicks.join("|"), sideB.nicks.join("|")].join("\t");
    api.getGameResultsPage({ any, limit: PICK_LIMIT, sort: "latest" })
      .then((page) => { if (alive) setGames(page.items.filter((g) => aSeat(g) !== null)); })
      .catch((e) => { if (alive) { setGames([]); setLoadErr(e instanceof Error ? e.message : "게임 결과를 불러오지 못했어요."); } });
    return () => { alive = false; };
  }, [sideA, sideB]);

  // 이미 고른 게임이 후보(최근 PICK_LIMIT 판)에 없으면 따로 받아 이름을 보인다.
  useEffect(() => {
    if (!games) return;
    const have = new Set(games.map((g) => g.id));
    const want = sets.map((s) => s.gameResultId).filter((id): id is number => id !== null && !have.has(id) && !extra.has(id));
    if (want.length === 0) return;
    let alive = true;
    void Promise.all(want.map((id) => api.getGameResult(id).catch(() => null))).then((got) => {
      if (!alive) return;
      setExtra((prev) => {
        const next = new Map(prev);
        for (const g of got) if (g) next.set(g.id, g);
        return next;
      });
    });
    return () => { alive = false; };
  }, [games, sets]);

  const byId = useMemo(() => {
    const m = new Map<number, GameResult>(extra);
    for (const g of games ?? []) m.set(g.id, g);
    return m;
  }, [games, extra]);

  const whenOf = (g: GameResult): string => {
    const [, mo, d] = g.date.split("-").map(Number);
    const t = g.gameStartedAt ? new Date(g.gameStartedAt) : null;
    const hm = t && !Number.isNaN(t.getTime()) ? ` ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}` : "";
    return `${mo}/${d}${hm}`;
  };
  const vsOf = (g: GameResult): string => {
    const seat = aSeat(g);
    const names = (slots: GameResultSlot[]) => slots.filter((sl) => !sl.observer).map(nickOf).join("·");
    const [left, right] = seat === "team2" ? [g.team2, g.team1] : [g.team1, g.team2];
    return `${names(left)} vs ${names(right)}`;
  };
  const labelOf = (g: GameResult): string => [whenOf(g), cleanMapName(g.mapCanonName ?? g.mapName), vsOf(g)].filter(Boolean).join(" · ");

  const patch = (i: number, p: Partial<LeagueMatchSet>): void => onChange(sets.map((s, k) => (k === i ? { ...s, ...p } : s)));
  const pick = (i: number, g: GameResult | null): void => {
    setOpen(null);
    if (!g) { patch(i, { gameResultId: null }); return; }
    const w = winnerOf(g);
    patch(i, { gameResultId: g.id, winner: w ?? sets[i].winner });
  };
  const used = new Set(sets.map((s) => s.gameResultId).filter((x): x is number => x !== null));

  return (
    <div className="scr-field">
      <div className="scr-league-sets-head">
        <span className="scr-label">세트 <span className="scr-label-optional">(게임 결과 연결)</span></span>
        <button
          type="button" className="scr-compact-rect-btn is-secondary" disabled={disabled}
          onClick={() => { onChange([...sets, { gameResultId: null, winner: null }]); setOpen(sets.length); }}
        >
          <Plus size={13} aria-hidden /> 세트 추가
        </button>
      </div>
      {sets.length > 0 && (
        <ol className="scr-league-sets">
          {sets.map((s, i) => {
            const g = s.gameResultId !== null ? byId.get(s.gameResultId) : undefined;
            return (
              <li key={i} className="scr-league-set">
                <div className="scr-league-set-row">
                  <span className="scr-league-set-no">{i + 1}세트</span>
                  <button
                    type="button" className={cx("scr-league-set-game", s.gameResultId === null && "is-empty")}
                    disabled={disabled} aria-expanded={open === i}
                    onClick={() => setOpen(open === i ? null : i)}
                  >
                    {g ? labelOf(g) : s.gameResultId !== null ? `게임 #${s.gameResultId}` : NO_GAME}
                  </button>
                  {s.gameResultId !== null && (
                    <button
                      type="button" className="scr-icon-btn scr-league-set-play" aria-label={`${i + 1}세트 게임 보기`} title="게임 상세 보기"
                      onClick={() => {
                        const id = s.gameResultId as number;
                        onOpenGame?.();
                        navigateTo(pathOf({ screen: "activity", group: "gameResult", item: g?.matchNo || String(id) }));
                      }}
                    >
                      <Play size={13} />
                    </button>
                  )}
                  <button
                    type="button" className="scr-icon-btn scr-league-set-x" aria-label={`${i + 1}세트 빼기`} disabled={disabled}
                    onClick={() => { setOpen(null); onChange(sets.filter((_, k) => k !== i)); }}
                  >
                    <X size={13} />
                  </button>
                </div>
                <div className="scr-league-set-win" role="group" aria-label={`${i + 1}세트 이긴 쪽`}>
                  {(["a", "b"] as const).map((side) => (
                    <button
                      key={side} type="button" disabled={disabled}
                      className={cx("scr-compact-rect-btn", s.winner !== side && "is-secondary")} aria-pressed={s.winner === side}
                      onClick={() => patch(i, { winner: s.winner === side ? null : side })}
                    >
                      {side === "a" ? nameA : nameB} 승
                    </button>
                  ))}
                </div>
                {open === i && (
                  <div className="scr-league-set-pick">
                    {games === null ? (
                      <div className="scr-league-set-pick-empty"><Spinner size={14} /> 불러오는 중</div>
                    ) : games.length === 0 ? (
                      <div className="scr-league-set-pick-empty">{loadErr || "두 팀이 맞선 게임 결과가 없어요."}</div>
                    ) : (
                      games.map((c) => {
                        const w = winnerOf(c);
                        const taken = used.has(c.id) && c.id !== s.gameResultId;
                        return (
                          <button
                            key={c.id} type="button" disabled={taken}
                            className={cx("scr-league-set-cand", c.id === s.gameResultId && "is-on")}
                            onClick={() => pick(i, c)}
                          >
                            <span className="scr-league-set-cand-main">{labelOf(c)}</span>
                            <span className="scr-league-set-cand-tag">
                              {taken ? "다른 세트" : w === "a" ? `${nameA} 승` : w === "b" ? `${nameB} 승` : "결과 없음"}
                            </span>
                          </button>
                        );
                      })
                    )}
                    {s.gameResultId !== null && (
                      <button type="button" className="scr-league-set-cand scr-league-set-cand-none" onClick={() => pick(i, null)}>
                        게임 연결 빼기
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
