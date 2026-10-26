import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link2, Play, Plus, Unlink, X } from "lucide-react";
import { Spinner } from "../../components/common/Feedback";
import { api } from "../../api/client";
import { useAppStore } from "../../store/appStore";
import { cx } from "../../utils/format";
import { cleanMapName } from "../../utils/mapName";
import { gamePlayable } from "../../utils/gamePlayable";
import { gamePath, navigateTo } from "../../utils/route";
import { GameRowNames, GameRowStatus, ListRow } from "../games/GameRow";
import { fmt, formatAgo, todayStr } from "../../utils/date";
import type { GameResult, GameResultSlot, League, LeagueMatch, LeagueMatchSet, LeagueMatchSide } from "../../types";

/* 경기 결과 입력창의 세트 목록(요청: "리그 결과 입력창에서 세트 추가하고 게임 결과 중 해당 매치 게임을 선택 가능하게").
   세트마다 그 판의 게임 결과를 고를 수 있다 — 후보는 두 팀 선수(대타 포함)가 서로 맞선 게임 결과다.
   게임을 고르면 그 게임의 승패로 이긴 쪽이 채워진다(손으로 바꿀 수 있다). */

export type Side = { ids: Set<string>; names: Set<string>; nicks: string[] };

function sideOf(league: League, teamId: number | undefined): Side {
  const team = league.teams.find((t) => t.id === teamId);
  return sideOfPeople((team?.roster ?? []).map((r) => ({ id: r.memberId, nick: r.nickname })));
}

/** 한 편(사람들) — 게임 슬롯을 회원 id 나 이름으로 그 편에 맞춘다. 배치고사는 한 사람이 한 편이다. */
export function sideOfPeople(people: { id: string; nick: string }[]): Side {
  return {
    ids: new Set(people.map((p) => p.id).filter(Boolean)),
    names: new Set(people.map((p) => p.nick.trim().toLowerCase()).filter(Boolean)),
    nicks: [...new Set(people.map((p) => p.nick.trim()).filter(Boolean))],
  };
}

const PICK_LIMIT = 60;

type SetsProps = {
  sets: LeagueMatchSet[];
  onChange: (next: LeagueMatchSet[]) => void;
  nameA: string; nameB: string; disabled: boolean;
  /** 이은 게임의 재생 단추를 누르면 그 게임 상세로 간다 — 그 전에 부르는 것(창 닫기). */
  onOpenGame?: () => void;
};

export default function LeagueMatchSets({ league, match, ...rest }: SetsProps & { league: League; match: LeagueMatch }) {
  const sideA = useMemo(() => sideOf(league, match.teamA?.id), [league, match.teamA?.id]);
  const sideB = useMemo(() => sideOf(league, match.teamB?.id), [league, match.teamB?.id]);
  return <MatchSets sideA={sideA} sideB={sideB} who="두 팀이" {...rest} />;
}

/** 세트 목록 — 두 편(sideA · sideB)이 맞선 게임을 세트마다 잇거나 손으로 적는다. 리그 경기 · 배치고사 대진이 같이 쓴다(2026-10-23). */
export function MatchSets({
  sideA, sideB, who, sets, onChange, nameA, nameB, disabled, onOpenGame,
}: SetsProps & { sideA: Side; sideB: Side; /** 후보가 없을 때 글의 주어 — "두 팀이" · "두 사람이". */ who: string }) {
  const members = useAppStore((s) => s.members);
  const memberOf = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const nickOf = (sl: GameResultSlot): string => memberOf.get(sl.memberId)?.nickname ?? sl.rawName ?? sl.memberId;
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

  /* 후보는 기간(기본 최근 1주일)을 정해 조회한다(2026-10-21, 요청: "게임결과 연결창에서 모든 게임 조회 X · 날짜(기본 1주일) 및 조회버튼") —
     창을 처음 펼칠 때 기본 기간으로 한 번 받고, 기간을 바꾸면 [조회]로 다시 받는다. */
  const [range, setRange] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return { from: fmt(d), to: todayStr() };
  });
  const [candLoading, setCandLoading] = useState(false);
  const loadGames = (r: { from: string; to: string }): void => {
    if (sideA.nicks.length === 0 || sideB.nicks.length === 0) { setGames([]); return; }
    const any = [sideA.nicks.join("|"), sideB.nicks.join("|")].join("\t");
    setCandLoading(true);
    setLoadErr("");
    api.getGameResultsPage({ any, limit: PICK_LIMIT, sort: "latest", dateFrom: r.from || undefined, dateTo: r.to || undefined })
      .then((page) => setGames(page.items.filter((g) => aSeat(g) !== null)))
      .catch((e) => { setGames([]); setLoadErr(e instanceof Error ? e.message : "게임 결과를 불러오지 못했어요."); })
      .finally(() => setCandLoading(false));
  };
  useEffect(() => {
    if (open !== null && games === null && !candLoading) loadGames(range);
  }, [open]);

  /* 이은 게임은 후보 목록을 기다리지 않고 **바로** 따로 받는다(2026-10-20 — 후보를 다 받은 뒤에 받던 때는 창이 "게임 #2399" + 승무패 단추로 떴다가 바뀌었다).
     tried 는 받아 본 id(실패 포함) — 받는 동안은 "불러오는 중", 실패한 것만 옛 꼴(번호 + 손 승무패)로 둔다. */
  const [tried, setTried] = useState<Set<number>>(new Set());
  useEffect(() => {
    const have = new Set((games ?? []).map((g) => g.id));
    const want = sets.map((s) => s.gameResultId).filter((id): id is number => id !== null && !have.has(id) && !extra.has(id) && !tried.has(id));
    if (want.length === 0) return;
    let alive = true;
    void Promise.all(want.map((id) => api.getGameResult(id).catch(() => null))).then((got) => {
      if (!alive) return;
      setExtra((prev) => {
        const next = new Map(prev);
        for (const g of got) if (g) next.set(g.id, g);
        return next;
      });
      setTried((prev) => new Set([...prev, ...want]));
    });
    return () => { alive = false; };
  }, [sets]);

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
  /** 이은 게임을 게임 목록 로스터 꼴로(2026-10-20, 요청: "게임 연결시 게임목록 로스터형태로 표시") — A 팀이 왼쪽이 되게 자리를 돌린다. */
  const oriented = (g: GameResult): GameResult => {
    if (aSeat(g) !== "team2") return g;
    const flip = g.result === "team1" ? "team2" : g.result === "team2" ? "team1" : g.result;
    return { ...g, team1: g.team2, team2: g.team1, result: flip };
  };
  const memberById = (id: string) => memberOf.get(id);

  const patch = (i: number, p: Partial<LeagueMatchSet>): void => onChange(sets.map((s, k) => (k === i ? { ...s, ...p } : s)));
  const pick = (i: number, g: GameResult | null): void => {
    setOpen(null);
    if (!g) { patch(i, { gameResultId: null }); return; }
    const w = winnerOf(g);
    // 이긴 쪽은 게임이 정한다(이은 세트엔 승무패 단추가 없다) — 결과 없는 판은 비운다.
    // 이으면 글 칸이 사라진다 — 숨은 글이 남지 않게 비운다(해제하면 빈 글 칸으로 돌아온다).
    patch(i, { gameResultId: g.id, winner: w ?? (g.result === "draw" ? "draw" : null), memo: "" });
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
            const loading = linked && !g && !tried.has(s.gameResultId as number);
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
                    /* 이은 게임: 머리 줄엔 시각·맵 글만(테두리 없음) · 로스터는 **머리 줄 아래 줄**(2026-10-20, 요청: "테두리 없이 헤더 아래줄"). */
                    <span className={cx("scr-league-set-game", (g || loading) && "is-roster")}>
                      {g ? [whenOf(g), cleanMapName(g.mapCanonName ?? g.mapName)].filter(Boolean).join(" · ") : loading ? <><Spinner size={12} /> 불러오는 중</> : `게임 #${s.gameResultId}`}
                    </span>
                  ) : (
                    /* 안 이은 세트도 이은 세트와 같은 꼴(2026-10-20, 요청: "수기입력 칸 위치와 모양 크기 · 승무패 버튼 위치와 모양 크기를 게임 연결한 세트와 맞게") —
                       머리 줄의 시각·맵 자리엔 "직접 입력" · 아래 줄은 로스터 자리: 윗줄 승패 배지 단추(팀 칸 가운데 · 무는 vs 칸) · 아랫줄 글 칸(이름 자리 · 테두리 없음). */
                    <span className="scr-league-set-game is-roster">직접 입력</span>
                  )}
                  {linked && g && gamePlayable(g) && (
                    <button
                      type="button" className="scr-icon-btn scr-league-set-play" aria-label={`${i + 1}세트 게임 보기`} title="게임 재생"
                      onClick={() => {
                        onOpenGame?.();
                        navigateTo(gamePath(g.matchNo || String(g.id)));
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
                {linked && g && (
                  <div className="scr-league-set-roster">
                    <GameRowNames game={oriented(g)} memberOf={memberById} mobile playable={false} />
                  </div>
                )}
                {!linked && (
                  <div className="scr-league-set-roster scr-league-set-manual">
                    <span className="scr-feed-row-cols" style={{ gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)" }}>
                      {(["a", "draw", "b"] as const).map((side, k) => {
                        const text = side === "draw" ? "무" : s.winner === null || s.winner === "draw" || s.winner === side ? "승" : "패";
                        const on = s.winner === side;
                        return (
                          <span className="scr-feed-row-col-wl" key={side} style={{ gridColumn: k + 1, gridRow: 1 }}>
                            <button
                              type="button" disabled={disabled}
                              className={cx("scr-feed-row-wl scr-league-set-wl", on && "is-win", !on && "is-idle", s.winner !== null && s.winner !== "draw" && !on && side !== "draw" && "is-loss")}
                              aria-pressed={on}
                              aria-label={side === "a" ? `${nameA} 승` : side === "b" ? `${nameB} 승` : "무승부"}
                              title={side === "a" ? `${nameA} 승` : side === "b" ? `${nameB} 승` : "무승부"}
                              onClick={() => patch(i, { winner: on ? null : side })}
                            >
                              {text}
                            </button>
                          </span>
                        );
                      })}
                      <input
                        type="text" className="scr-league-set-memo" disabled={disabled} maxLength={200}
                        style={{ gridColumn: "1 / -1", gridRow: 2 }}
                        value={s.memo} placeholder="세트 내용(예: 홍탑 승)" aria-label={`${i + 1}세트 내용`}
                        onChange={(e) => patch(i, { memo: e.target.value })}
                      />
                    </span>
                  </div>
                )}
                {/* 이은 세트는 승무패 단추가 없다 — 이긴 쪽은 그 게임이 정하고 로스터 배지가 보인다(2026-10-20, 요청: "승무패 버튼 불필요").
                    게임을 못 받았을 때(g 없음)만 손으로 고르게 둔다. */}
                {linked && !g && !loading && <div className="scr-league-set-win" role="group" aria-label={`${i + 1}세트 결과`}>
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
                </div>}
              </li>
            );
          })}
        </ol>
      )}
      {/* ★ 게임 연결은 **팝업 창**(2026-10-23, 지적: "결과 입력에서 게임 연결 시 조회가 이상해 — 왜 그 칸에서 조회되지 · 팝업 안 뜨고") — 옛: 세트 줄 아래에 펼쳐지는 칸.
          경기 창 위에 한 겹 더 뜬다(.scr-league-set-pick-modal · z 110) · 기간 · [조회] · 후보 목록은 그대로. 고르면 닫히고 그 세트에 이어진다. */}
      {open !== null && sets[open] && sets[open].gameResultId === null && createPortal(
        <div className="scr-modal-overlay">
          <div className="scr-modal scr-league-set-pick-modal" role="dialog" aria-label={`${open + 1}세트 게임 연결`}>
            <div className="scr-modal-head">
              <span>{open + 1}세트 게임 연결</span>
              <button type="button" className="scr-icon-btn" onClick={() => setOpen(null)} aria-label="닫기"><X size={14} /></button>
            </div>
            <div className="scr-modal-body">
              <div className="scr-league-set-pick">
                <div className="scr-league-set-pick-range">
                  <input
                    type="date" className="scr-input scr-date-compact" aria-label="시작 날짜"
                    value={range.from} max={range.to || todayStr()}
                    onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                  />
                  <span aria-hidden>~</span>
                  <input
                    type="date" className="scr-input scr-date-compact" aria-label="끝 날짜"
                    value={range.to} min={range.from || undefined} max={todayStr()}
                    onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                  />
                  <button type="button" className="scr-compact-rect-btn" onClick={() => loadGames(range)} disabled={candLoading}>
                    {candLoading ? <Spinner size={12} /> : "조회"}
                  </button>
                </div>
                {games === null || candLoading ? (
                  <div className="scr-league-set-pick-empty"><Spinner size={14} /> 불러오는 중</div>
                ) : games.length === 0 ? (
                  <div className="scr-league-set-pick-empty">{loadErr || `이 기간에 ${who} 맞선 게임 결과가 없어요.`}</div>
                ) : (
                  /* 후보 = 폰 게임 목록 꼴(.scr-gm · 2026-10-20, 요청: "리그의 경기결과 입력창의 게임연결창 … 모바일 화면의 게임목록처럼") — A 팀이 왼쪽. */
                  <div className="scr-feed-rows">
                    {games.map((c) => {
                      const taken = used.has(c.id);
                      const oc = oriented(c);
                      return (
                        <ListRow
                          key={c.id}
                          className={cx("scr-feed-row-game scr-gm", taken && "is-in")}
                          disabled={taken}
                          onClick={() => pick(open, c)}
                          status={<GameRowStatus game={oc} />}
                          desc={<GameRowNames game={oc} memberOf={memberById} mobile playable={gamePlayable(c)} />}
                          top={taken ? <span className="scr-extshare-add-in">다른 세트</span> : undefined}
                          side={formatAgo(c.gameStartedAt ?? c.date)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
