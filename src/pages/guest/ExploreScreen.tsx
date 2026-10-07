import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { SCENE_LINK_KEYS9 } from "scplay";
import GuestGameStory from "./GuestGameStory";
import { LoadingMark, Spinner } from "../../components/common/Feedback";
import { api, setExtShareContext } from "../../api/client";
import { isMeleeGame } from "../activity/GameResultSides";
import { GameRowNames, GameRowStatus, ListRow } from "../activity/GameRow";
import { useIsMobile } from "../../hooks/useIsMobile";
import { formatAgo } from "../../utils/date";
import { maskPlayerName } from "../../utils/maskName";
import type { ExtShareList, GameResult, GameResultSlot } from "../../types";

const PASS_KEY = "stargate_extshare_pass";
const PATH = "/explore";
const TITLE = "게임";
const SITE = "스타게이트";
const PUBLIC_SCREEN = "public_playlist";

function readPasses(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(PASS_KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function writePass(listId: number, pass: string): void {
  try {
    const all = readPasses();
    all[String(listId)] = pass;
    window.localStorage.setItem(PASS_KEY, JSON.stringify(all));
  } catch {
    return;
  }
}

function lineupTitle(
  g: { matchType?: string | null; team1: GameResultSlot[]; team2: GameResultSlot[] },
  nameOf: (s: GameResultSlot) => string,
): string {
  const n1 = g.team1.filter((s) => !s.observer).map(nameOf).filter(Boolean);
  const n2 = g.team2.filter((s) => !s.observer).map(nameOf).filter(Boolean);
  if (n1.length + n2.length === 0) return "";
  if (isMeleeGame(g)) return [...n1, ...n2].join(" vs ");
  return [n1.join(", "), n2.join(", ")].filter(Boolean).join(" vs ");
}

/* 손님 모드 — 제목의 이름도 가린다(요청: 첫·끝 글자만 남기고 반각 동그라미). */
function gameTitleOf(g: GameResult): string {
  return lineupTitle(g, (s) => maskPlayerName(s.rawName || "")) || "이름 없는 판";
}

function gameTime(g: GameResult): string {
  return g.gameStartedAt ?? g.date;
}

type Route = { list: number | null; game: number | null };
const HOME: Route = { list: null, game: null };

function routeFromUrl(): Route {
  const p = window.location.pathname;
  if (!p.startsWith(PATH)) return HOME;
  const seg = p.slice(PATH.length).split("/").filter(Boolean);
  const r: Route = { ...HOME };
  for (let i = 0; i + 1 < seg.length; i += 2) {
    const n = Number(seg[i + 1]);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (seg[i] === "list") r.list = n;
    else if (seg[i] === "games") r.game = n;
  }
  if (r.list === null) r.game = null;
  return r;
}

function pathOf(r: Route): string {
  let p = PATH;
  if (r.list !== null) p += `/list/${r.list}`;
  if (r.list !== null && r.game !== null) p += `/games/${r.game}`;
  return p;
}

function parentOf(r: Route): Route {
  return r.game !== null ? { ...r, game: null } : HOME;
}

function depthOf(): number {
  const s = window.history.state as { scr?: unknown } | null;
  return typeof s?.scr === "number" ? s.scr : 0;
}

function writeUrl(r: Route, push: boolean): void {
  let search = window.location.search;
  if (push && search) {
    const q = new URLSearchParams(search);
    for (const k of SCENE_LINK_KEYS9) q.delete(k);
    const qs = q.toString();
    search = qs ? `?${qs}` : "";
  }
  const url = pathOf(r) + search + window.location.hash;
  if (push) window.history.pushState({ scr: depthOf() + 1 }, "", url);
  else window.history.replaceState({ scr: depthOf() }, "", url);
}

export default function ExploreScreen() {
  const [lists, setLists] = useState<ExtShareList[] | null>(null);
  const [pass, setPass] = useState("");
  const [typed, setTyped] = useState("");
  const [games, setGames] = useState<GameResult[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [route, setRoute] = useState<Route>(routeFromUrl);
  const { list: listId, game: openId } = route;
  const memberOf = useCallback(() => undefined, []);
  const isMobile = useIsMobile();

  const nav = useCallback((r: Route, push: boolean): void => {
    writeUrl(r, push);
    setRoute(r);
  }, []);

  const goBack = useCallback((): void => {
    if (depthOf() > 0) {
      window.history.back();
      return;
    }
    nav(parentOf(routeFromUrl()), false);
  }, [nav]);

  useEffect(() => {
    writeUrl(routeFromUrl(), false);
  }, []);

  useEffect(() => {
    const onPop = (): void => {
      if (window.location.pathname.startsWith(PATH)) setRoute(routeFromUrl());
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    void api.pingPublicAccess(PUBLIC_SCREEN, listId === null ? undefined : `list#${listId}`);
  }, [listId]);

  useEffect(() => {
    let dead = false;
    api.getExtShareLists()
      .then((rows) => { if (!dead) setLists(rows); })
      .catch(() => { if (!dead) setLists([]); });
    return () => { dead = true; };
  }, []);

  const current = useMemo(
    () => (listId === null ? null : lists?.find((l) => l.id === listId) ?? null),
    [lists, listId],
  );

  useEffect(() => {
    if (listId === null || !lists) return undefined;
    const row = lists.find((l) => l.id === listId);
    if (!row) return undefined;
    const saved = row.locked ? (readPasses()[String(listId)] ?? "") : "";
    if (row.locked && !saved) {
      setPass("");
      setGames(null);
      return undefined;
    }
    setPass(saved);
    return undefined;
  }, [listId, lists]);

  useEffect(() => {
    if (listId === null) {
      setExtShareContext(null);
      return undefined;
    }
    setExtShareContext({ listId, pass });
    return () => setExtShareContext(null);
  }, [listId, pass]);

  useEffect(() => {
    setGames(null);
    setErr("");
  }, [listId]);

  useEffect(() => {
    if (listId === null || !current) return undefined;
    if (current.locked && !pass) return undefined;
    let dead = false;
    setBusy(true);
    api.getExtShareGames(listId, pass)
      .then((rows) => {
        if (dead) return;
        setGames(rows);
        setErr("");
      })
      .catch((e: Error) => {
        if (dead) return;
        setGames(null);
        setPass("");
        setErr(e.message || "목록을 받지 못했어요.");
      })
      .finally(() => { if (!dead) setBusy(false); });
    return () => { dead = true; };
  }, [listId, current, pass]);

  const submitPass = async (): Promise<void> => {
    if (listId === null) return;
    setBusy(true);
    setErr("");
    try {
      await api.enterExtShare(listId, typed);
      writePass(listId, typed);
      setPass(typed);
      setTyped("");
    } catch (e) {
      setErr((e as Error).message || "비밀번호가 맞지 않습니다.");
    } finally {
      setBusy(false);
    }
  };

  const openList = (id: number): void => { nav({ ...HOME, list: id }, true); };
  const openGame = (id: number): void => { nav({ ...route, game: id }, true); };
  const open = openId === null ? null : games?.find((g) => g.id === openId) ?? null;

  useEffect(() => {
    if (openId === null || games === null) return;
    if (!games.some((g) => g.id === openId)) nav({ ...routeFromUrl(), game: null }, false);
  }, [games, openId, nav]);

  useEffect(() => {
    document.title = open ? `${gameTitleOf(open)} — ${SITE}` : current ? `${current.name} — ${SITE}` : `${TITLE} — ${SITE}`;
  }, [open, current]);

  return (
    <div className={open ? "scr-screen scr-extshare-main is-play" : "scr-screen scr-extshare-main"}>
      {listId === null ? (
        <div className="scr-v2-toolbar">
          <div className="scr-v2-toolbar-title-row">
            <h1 className="scr-title scr-v2-toolbar-title">{TITLE}</h1>
          </div>
        </div>
      ) : (
        <div className="scr-v2-toolbar scr-v2-toolbar-crumb">
          <div className="scr-v2-toolbar-title-row scr-crumb">
            <button type="button" className="scr-crumb-back" onClick={goBack}>
              <ArrowLeft size={14} />
              <span>{open ? "목록" : "전체 목록"}</span>
            </button>
            <h1 className="scr-title scr-crumb-title">{open ? gameTitleOf(open) : current?.name ?? TITLE}</h1>
          </div>
        </div>
      )}

      {listId === null && (lists === null ? <LoadingMark /> : (
        <div className="scr-activity-rows scr-activity-group-page-rows">
          {lists.length === 0 && <div className="scr-empty">목록이 없어요</div>}
          {lists.map((l) => (
            <ListRow
              key={l.id}
              onClick={() => openList(l.id)}
              desc={<>
                {l.locked && (
                  <span className="scr-activity-row-status scr-extshare-lock" title="비밀번호">
                    <Lock size={11} aria-label="비밀번호" />
                  </span>
                )}
                <span className="scr-activity-row-names">
                  <span className="scr-activity-row-em">{l.name}</span>
                </span>
              </>}
              side={`${l.gameCount}판`}
            />
          ))}
        </div>
      ))}

      {listId !== null && current?.locked && !pass && (
        <form className="scr-extshare-gate" onSubmit={(e) => { e.preventDefault(); void submitPass(); }}>
          <Lock size={22} />
          <p>이 목록은 비밀번호가 필요합니다.</p>
          <input
            type="password" value={typed}
            autoFocus={typeof window !== "undefined" && !!window.matchMedia?.("(pointer: fine)").matches}
            onChange={(e) => setTyped(e.target.value)} placeholder="비밀번호"
          />
          <button type="submit" disabled={busy || !typed}>
            {busy ? <Spinner size={14} /> : "들어가기"}
          </button>
          {err && <span className="scr-extshare-err">{err}</span>}
        </form>
      )}

      {listId !== null && !open && (current ? !current.locked || !!pass : false) && (games === null ? <LoadingMark /> : (
        <div className="scr-activity-rows scr-activity-group-page-rows">
          {games.length === 0 && <div className="scr-empty">게임이 없어요</div>}
          {[...games].sort((a, b) => gameTime(b).localeCompare(gameTime(a))).map((g) => (
            <ListRow
              key={g.id}
              onClick={() => openGame(g.id)}
              desc={<>
                <GameRowStatus game={g} />
                <GameRowNames game={g} memberOf={memberOf} mobile={isMobile} playable={!!g.hasTruth} nameMask={maskPlayerName} />
              </>}
              side={formatAgo(gameTime(g))}
            />
          ))}
        </div>
      ))}

      {open && (
        <div className="scr-extshare-detail">
          <GuestGameStory
            gameResult={open} team1={open.team1} team2={open.team2} result={open.result}
            memberOf={memberOf} extShare
          />
        </div>
      )}
      {busy && listId !== null && games !== null && <Spinner size={16} />}
    </div>
  );
}
