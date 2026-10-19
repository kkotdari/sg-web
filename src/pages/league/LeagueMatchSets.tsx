import { useEffect, useMemo, useState } from "react";
import { Link2, Play, Plus, Unlink, X } from "lucide-react";
import { Spinner } from "../../components/common/Feedback";
import { api } from "../../api/client";
import { useAppStore } from "../../store/appStore";
import { cx } from "../../utils/format";
import { cleanMapName } from "../../utils/mapName";
import { gamePlayable } from "../../utils/gamePlayable";
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
    // 이으면 글 칸이 사라진다 — 숨은 글이 남지 않게 비운다(해제하면 빈 글 칸으로 돌아온다).
    patch(i, { gameResultId: g.id, winner: w ?? sets[i].winner, memo: "" });
  };
  const used = new Set(sets.map((s) => s.gameResultId).filter((x): x is number => x !== null));

  /* ★ 세트 줄(2026-10-19, 요청: "세트추가버튼은 라이팅 테마 채우기 네모 버튼 · N세트 링크 아이콘버튼(경기결과 연동) 옆엔 인풋창 옆에 재생버튼(재생가능한 경우만) ·
     승리 선택(무승부도 있게) · 링크 눌러서 연동한 경우에는 인풋창이 제거되게 링크 해제버튼으로 바뀌고 해제하면 다시 링크버튼 + 인풋창으로").
     안 이은 세트 = [N세트] [링크] [글 칸] · 이은 세트 = [N세트] [링크 해제] [그 게임] [재생(재생 가능할 때)] — 둘 다 끝에 [빼기], 아래에 [A 승 · 무 · B 승]. */
  return (
    <div className="scr-field">
      <div className="scr-league-sets-head">
        <span className="scr-label">세트</span>
        <button
          type="button" className="scr-compact-rect-btn" disabled={disabled}
          onClick={() => onChange([...sets, { gameResultId: null, winner: null, memo: "" }])}
        >
          <Plus size={13} aria-hidden /> 세트 추가
        </button>
      </div>
      {sets.length > 0 && (
        <ol className="scr-league-sets">
          {sets.map((s, i) => {
            const linked = s.gameResultId !== null;
            const g = linked ? byId.get(s.gameResultId as number) : undefined;
            return (
              <li key={i} className="scr-league-set">
                <div className="scr-league-set-row">
                  <span className="scr-league-set-no">{i + 1}세트</span>
                  {linked ? (
                    <button
                      type="button" className="scr-icon-btn scr-league-set-link is-on" disabled={disabled}
                      aria-label={`${i + 1}세트 게임 연결 해제`} title="게임 결과 연결 해제"
                      onClick={() => { setOpen(null); patch(i, { gameResultId: null }); }}
                    >
                      <Unlink size={14} />
                    </button>
                  ) : (
                    <button
                      type="button" className="scr-icon-btn scr-league-set-link" disabled={disabled}
                      aria-label={`${i + 1}세트 게임 결과 연결`} title="게임 결과 연결" aria-expanded={open === i}
                      onClick={() => setOpen(open === i ? null : i)}
                    >
                      <Link2 size={14} />
                    </button>
                  )}
                  {linked ? (
                    <span className="scr-league-set-game">{g ? labelOf(g) : `게임 #${s.gameResultId}`}</span>
                  ) : (
                    <input
                      type="text" className="scr-input scr-league-set-memo" disabled={disabled} maxLength={200}
                      value={s.memo ?? ""} placeholder="세트 내용(예: 홍탑 승)" aria-label={`${i + 1}세트 내용`}
                      onChange={(e) => patch(i, { memo: e.target.value })}
                    />
                  )}
                  {linked && g && gamePlayable(g) && (
                    <button
                      type="button" className="scr-icon-btn scr-league-set-play" aria-label={`${i + 1}세트 게임 보기`} title="게임 재생"
                      onClick={() => {
                        onOpenGame?.();
                        navigateTo(pathOf({ screen: "activity", group: "gameResult", item: g.matchNo || String(g.id) }));
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
                <div className="scr-league-set-win" role="group" aria-label={`${i + 1}세트 결과`}>
                  {(["a", "draw", "b"] as const).map((side) => (
                    <button
                      key={side} type="button" disabled={disabled}
                      className={cx("scr-compact-rect-btn", s.winner !== side && "is-secondary", side === "draw" && "scr-league-set-draw")}
                      aria-pressed={s.winner === side}
                      onClick={() => patch(i, { winner: s.winner === side ? null : side })}
                    >
                      {side === "a" ? `${nameA} 승` : side === "b" ? `${nameB} 승` : "무"}
                    </button>
                  ))}
                </div>
                {open === i && !linked && (
                  <div className="scr-league-set-pick">
                    {games === null ? (
                      <div className="scr-league-set-pick-empty"><Spinner size={14} /> 불러오는 중</div>
                    ) : games.length === 0 ? (
                      <div className="scr-league-set-pick-empty">{loadErr || "두 팀이 맞선 게임 결과가 없어요."}</div>
                    ) : (
                      games.map((c) => {
                        const w = winnerOf(c);
                        const taken = used.has(c.id);
                        return (
                          <button
                            key={c.id} type="button" disabled={taken}
                            className="scr-league-set-cand"
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
