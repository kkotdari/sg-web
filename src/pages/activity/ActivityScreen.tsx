import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { CalendarPlus, Phone, Upload } from "lucide-react";
import { Spinner } from "../../components/common/Feedback";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import ReplayReviewModal from "../../modals/ReplayReviewModal";
import ChallengeFormModal from "../../modals/ChallengeFormModal";
import ScheduleFormModal from "../../modals/ScheduleFormModal";
import { SCENE_LINK_KEYS9 } from "scplay";
import { useAppStore } from "../../store/appStore";
import { isAdminRole } from "../../constants/roles";
import { cx } from "../../utils/format";
import { api } from "../../api/client";
import { navigateTo, parseRoute, pathOf, type ActivityGroupKey, type Route } from "../../utils/route";
import { showAlert } from "../../components/common/AlertDialog";
import { showToast } from "../../components/common/Toast";
import { useUrlState } from "../../hooks/useUrlState";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useEditableFocused } from "../../hooks/useEditableFocused";
import { useSelection } from "../../hooks/useSelection";
import { batchSummary, runBatch } from "../../utils/batch";
import { gameResultShareContent } from "./gameShare";
import { canManageGame, isSecretGame } from "../../utils/gameAccess";
import { buildReplayDrafts, type ReplayDraft } from "../../utils/replayDraft";
import { hasAppUpdatePreloadErrorOccurred } from "../../utils/appUpdate";
import type { LeagueMatchActivity } from "../../types";
import ActivityHome from "./ActivityHome";
import ActivityGroupPage from "./ActivityGroupPage";
import ActivityDetailPage from "./ActivityDetailPage";
import GameDetailPage from "./GameDetailPage";
import type { RowAct, RowView } from "./ActivityRow";
import { FeedProvider, useFeedActions, useRecentLeague } from "./activityFeed";
import {
  GROUP_DEFS, GROUP_ITEM_KIND, GROUP_SCREEN_CODE, HIDE_FORMS, SCRAP_FORMS, bulkDeleteMessageOf, deletableOf,
  detailGroupOf, detailIdOf, leagueMatchItem, type DisplayItem, type GameTab,
} from "./activityItems";

export { GameResultCard } from "./GameResultCard";
export { gameResultItem } from "./activityItems";

const MAX_REPLAY_FILES = 20;

/* ★ 활동 화면 = **주소로 고르는 라우터**(2026-10-19, 요청: "활동과 일정 너나와 리그 게임 목록과 상세등 모두 컴포넌트 분리").
   주소(/ · /schedules · /schedules/7 · /games/123 …)가 곧 화면이고, 화면마다 제 컴포넌트다 — 홈(ActivityHome) · 묶음 목록(ActivityGroupPage) ·
   상세(ActivityDetailPage: 일정·너 나와!·리그) · 게임 상세(GameDetailPage). 피드(목록 데이터)는 FeedProvider 가 들고 목록 화면만 구독한다 —
   상세는 제 항목을 제 상태로 들어, 목록이 바뀌어도(다시 받기·다른 카드 저장) 상세는 다시 그려지지 않는다. 라우터는 피드를 구독하지 않는다. */

type View =
  | { kind: "home" }
  | { kind: "group"; key: ActivityGroupKey }
  | { kind: "detail"; group: ActivityGroupKey; id: number; path: string }
  | { kind: "game"; idText: string; path: string };

const isListGroup = (g: ActivityGroupKey | null): g is ActivityGroupKey =>
  !!g && g !== "league" && GROUP_DEFS.some((d) => d.key === g);

function viewOf(r: Route, path: string, miss: string | null): View {
  if (r.item !== null && r.group && path !== miss) {
    if (r.group === "gameResult") return { kind: "game", idText: r.item, path };
    const id = Number(r.item);
    if (r.group in GROUP_ITEM_KIND && Number.isFinite(id)) return { kind: "detail", group: r.group, id, path };
  }
  return isListGroup(r.group) ? { kind: "group", key: r.group } : { kind: "home" };
}

export default function ActivityScreen() {
  return (
    <FeedProvider>
      <ActivityRouter />
    </FeedProvider>
  );
}

function ActivityRouter() {
  const feed = useFeedActions();
  const [route, setRoute] = useState<{ r: Route; path: string }>(() => ({ r: parseRoute(), path: window.location.pathname }));
  /** 서버에 없던 상세 주소 — 그 주소에선 목록을 그린다. */
  const [miss, setMiss] = useState<string | null>(null);
  const view = useMemo(() => viewOf(route.r, route.path, miss), [route, miss]);
  const viewKey = view.kind === "home" ? "home" : view.kind === "group" ? `g:${view.key}` : view.path;
  const groupKey = view.kind === "group" ? view.key : null;

  const pushedGroupRef = useRef(false);
  const pushedItemRef = useRef(false);
  const homeScrollRef = useRef(0);
  const sync = useCallback(() => {
    setMiss(null);
    setRoute({ r: parseRoute(), path: window.location.pathname });
  }, []);
  const go = (path: string, opts: { replace?: boolean; search?: string } = {}): void => {
    navigateTo(path, { ...opts, notify: false });
    sync();
  };
  const linkParams = (drop: string[]): string => {
    const params = new URLSearchParams(window.location.search);
    for (const k of drop) params.delete(k);
    return params.toString();
  };

  const openGroup = (key: ActivityGroupKey): void => {
    homeScrollRef.current = window.scrollY;
    // 게임 탭(tab)은 게임 전체 보기에만 넘긴다(2026-10-20 · App.tsx 같은 요청) — 일정·너 나와! 묶음엔 쓸모가 없다.
    go(pathOf({ screen: "activity", group: key }), { search: linkParams(key === "gameResult" ? ["u", "q"] : ["u", "q", "tab"]) });
    pushedGroupRef.current = true;
    void api.pingAccess(GROUP_SCREEN_CODE[key]);
  };
  const closeGroup = (): void => {
    if (pushedGroupRef.current) { window.history.back(); return; }
    go("/", { replace: true, search: window.location.search });
  };
  const openItem = (item: DisplayItem): void => {
    // 게임 목록의 공방/내전 탭은 목록 주소의 것 — 상세 주소엔 안 싣는다(뒤로 가면 목록 주소에서 되살아난다)
    const search = linkParams([...SCENE_LINK_KEYS9, "u", "q", "tab"]);
    let path: string;
    if (item.kind === "gameResult") {
      path = pathOf({ screen: "activity", group: "gameResult", item: item.gameResult.matchNo || String(item.gameResult.id) });
    } else {
      const id = detailIdOf(item);
      const group = detailGroupOf(item);
      if (id === null || group === null) return;
      path = pathOf({ screen: "activity", group, item: String(id) });
    }
    go(path, { search });
    pushedItemRef.current = true;
  };
  /** 카드 안에서 상세를 닫을 때(GameDetailCloseContext). */
  const closeDetail = (): void => {
    if (pushedItemRef.current) { window.history.back(); return; }
    go(pathOf({ screen: "activity", group: parseRoute().group }), { replace: true, search: window.location.search });
  };
  const closeGame = (): void => {
    if (pushedItemRef.current) { window.history.back(); return; }
    go("/games", { replace: true, search: linkParams([...SCENE_LINK_KEYS9]) });
  };
  /** 상세 머리 줄의 뒤로 — 그 묶음 목록으로(리그는 홈으로). */
  const gotoGroupList = (key: ActivityGroupKey): void => {
    if (pushedItemRef.current) {
      pushedItemRef.current = false;
      window.history.back();
      return;
    }
    const search = linkParams([...SCENE_LINK_KEYS9]);
    if (key === "league") { go(pathOf({ screen: "activity" }), { replace: true, search }); return; }
    go(pathOf({ screen: "activity", group: key }), { replace: true, search });
    if (groupKey !== key) void api.pingAccess(GROUP_SCREEN_CODE[key]);
  };
  const gameGone = (): void => go("/games", { replace: true });

  useEffect(() => {
    const onPop = (): void => {
      pushedGroupRef.current = false;
      pushedItemRef.current = false;
      sync();
    };
    const onNav = (): void => { pushedItemRef.current = false; sync(); };
    window.addEventListener("popstate", onPop);
    window.addEventListener("scr-screen-nav", onNav);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("scr-screen-nav", onNav);
    };
  }, [sync]);
  useEffect(() => {
    if (groupKey) void api.pingAccess(GROUP_SCREEN_CODE[groupKey]);
  }, []);
  useLayoutEffect(() => {
    if (view.kind === "home" && homeScrollRef.current > 0) {
      window.scrollTo({ top: homeScrollRef.current, behavior: "instant" });
    }
  }, [viewKey]);

  /* 화면마다 넘기는 손잡이는 늘 같은 함수다(아래 nav) — 상세·목록이 memo 라 라우터가 다시 그려져도 따라 그리지 않는다. */
  const navRef = useRef({ openGroup, closeGroup, openItem, closeDetail, closeGame, gotoGroupList, gameGone, setMiss, view });
  navRef.current = { openGroup, closeGroup, openItem, closeDetail, closeGame, gotoGroupList, gameGone, setMiss, view };
  const nav = useMemo(() => ({
    openGroup: (key: ActivityGroupKey) => navRef.current.openGroup(key),
    closeGroup: () => navRef.current.closeGroup(),
    openLeague: (m: LeagueMatchActivity) => navRef.current.openItem(leagueMatchItem(m)),
    closeDetail: () => navRef.current.closeDetail(),
    closeGame: () => navRef.current.closeGame(),
    backFromDetail: () => {
      const v = navRef.current.view;
      navRef.current.gotoGroupList(v.kind === "detail" ? v.group : "gameResult");
    },
    gameGone: () => navRef.current.gameGone(),
    miss: () => {
      const v = navRef.current.view;
      if (v.kind === "detail" || v.kind === "game") navRef.current.setMiss(v.path);
    },
  }), []);

  const isMobile = useIsMobile();
  const user = useAppStore((s) => s.user);
  const isAdmin = !!user && isAdminRole(user.roles);
  const memberOf = useAppStore((s) => s.memberOf);
  const members = useAppStore((s) => s.members);
  const sel = useSelection();
  const selection = user && groupKey ? sel : null;
  const selClear = sel.clear;   // 일괄 지우기·숨기기 뒤 — 고른 것만 풀고 선택 모드는 둔다
  const selExit = sel.exit;
  useEffect(() => { selExit(); }, [selExit, viewKey]);
  const canPick = useCallback((it: DisplayItem): boolean => {
    if (it.kind === "gameResult" && isSecretGame(it.gameResult)) return false;
    if (isAdmin) return deletableOf(it);
    return it.kind === "gameResult" && canManageGame(it.gameResult, user);
  }, [isAdmin, user]);
  const selectionNote = isAdmin ? "리그 경기는 여기서 지울 수 없어요." : "내가 뛴 게임만 고를 수 있어요.";
  const hideOne = useCallback((it: DisplayItem) => { setBulkErr(null); setBulkHide([it]); }, []);
  const rowAct = useRef<RowAct>({ open: openItem, toggle: sel.toggle, setMany: sel.setMany, hide: hideOne });
  rowAct.current = { open: openItem, toggle: sel.toggle, setMany: sel.setMany, hide: hideOne };

  /* ★ 게임 탭 기본값은 **리그**, 다만 최근 7일 안에 리그 판이 없으면 **내전**(2026-10-19, 요청: "게임 탭 기본값은 리그로하고 리그 경기 일주일 이내에 없으면 내전으로").
     주소에 탭이 없을 때만 이 셈을 타고, 사람이 고른 탭은 주소(tab=league|clan|pub)에 남아 그대로 선다. */
  const recentLeague = useRecentLeague();
  const [gameTabRaw, setGameTabRaw] = useUrlState("tab");
  const gameTab: GameTab = gameTabRaw === "pub" || gameTabRaw === "league" || gameTabRaw === "clan"
    ? gameTabRaw : recentLeague ? "league" : "clan";
  const rowView = useMemo<RowView>(() => ({
    isMobile, memberOf, selecting: !!selection, selMode: sel.mode, selectionNote, leagueCol: gameTab === "league",
  }), [isMobile, memberOf, !!selection, sel.mode, selectionNote, gameTab]);
  const setGameTab = useCallback((next: GameTab) => setGameTabRaw(next), [setGameTabRaw]);

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const fabHidden = useEditableFocused();
  /* ★ 등록 ↔ 선택 끝내기가 **바뀔 때만** 튀어나오는 전환(2026-10-13, 요청: "변할 때 트랜지션 가능? 좀 티나게") — 처음 그릴 때는 안 탄다. */
  const [fabSwap, setFabSwap] = useState(false);
  const fabModeRef = useRef(sel.mode);
  useEffect(() => {
    if (fabModeRef.current === sel.mode) return;
    fabModeRef.current = sel.mode;
    setFabSwap(true);
  }, [sel.mode]);
  useEffect(() => {
    if (fabHidden) setAddMenuOpen(false);
  }, [fabHidden]);

  const replayInputRef = useRef<HTMLInputElement>(null);
  const [parsingReplays, setParsingReplays] = useState(false);
  const [reviewDrafts, setReviewDrafts] = useState<ReplayDraft[] | null>(null);
  const pendingNoticeRef = useRef<{ text: string; kind: "success" | "error" } | null>(null);
  const [challengeFormOpen, setChallengeFormOpen] = useState(false);
  const [scheduleFormOpen, setScheduleFormOpen] = useState(false);
  const [error, setError] = useState("");
  const directAdd: (() => void) | null =
    groupKey === "gameResult" ? () => replayInputRef.current?.click()
      : groupKey === "call" ? () => setChallengeFormOpen(true)
        : groupKey === "schedule" ? () => setScheduleFormOpen(true)
          : null;

  const handleReplayFilesChosen = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    const chosen = picked.filter((f) => f.name.toLowerCase().endsWith(".rep"));
    if (chosen.length === 0) {
      setError("리플레이(.rep) 파일이 아니에요 — .rep 파일을 골라 주세요.");
      return;
    }
    const truncated = chosen.length > MAX_REPLAY_FILES;
    const batch = chosen.slice(0, MAX_REPLAY_FILES);
    setParsingReplays(true);
    setError("");
    try {
      const [drafts] = await Promise.all([
        buildReplayDrafts(batch, members),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
      if (hasAppUpdatePreloadErrorOccurred()) return;

      let duplicates = 0;
      const review: ReplayDraft[] = [];
      for (const raw of drafts) {
        if (raw.excludeReason === "duplicate") { duplicates += 1; continue; }
        review.push(raw);
      }

      const parts: string[] = [];
      if (truncated) parts.push(`한 번에 최대 ${MAX_REPLAY_FILES}개까지만 등록돼 처음 ${MAX_REPLAY_FILES}개만 처리했어요.`);
      if (duplicates > 0) parts.push(`${duplicates}개는 이미 등록된 경기라 건너뛰었어요.`);
      const notice = parts.length > 0 ? { text: parts.join(" "), kind: "success" as const } : null;
      if (review.length > 0) {
        pendingNoticeRef.current = notice;
        setReviewDrafts(review);
      } else {
        if (notice) showToast(notice.text, { kind: "ok" });
        else showAlert("등록할 리플레이가 없어요.");
      }
    } finally {
      setParsingReplays(false);
    }
  };

  const [bulkConfirm, setBulkConfirm] = useState<DisplayItem[] | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkErr, setBulkErr] = useState<string | null>(null);
  const [groupRefreshKey, setGroupRefreshKey] = useState(0);
  const askBulkDelete = useCallback((items: DisplayItem[]) => {
    if (items.length === 0) return;
    setBulkErr(null);
    setBulkConfirm(items);
  }, []);
  const runBulkDelete = async (items: DisplayItem[]) => {
    setBulkErr(null);
    setBulkProgress({ done: 0, total: items.length });
    const { done, failed } = await runBatch(items, async (it) => {
      if (it.kind === "gameResult") await api.deleteGameResult(it.gameResult.id);
      else if (it.kind === "challenge") await api.deleteChallenge(it.challenge.id);
      else if (it.kind === "schedule") await api.deleteSchedule(it.schedule.id);
    }, { onProgress: (n) => setBulkProgress({ done: n, total: items.length }) });
    if (done.length > 0) {
      const gameIds = new Set(done.flatMap((it) => (it.kind === "gameResult" ? [it.gameResult.id] : [])));
      const challengeIds = new Set(done.flatMap((it) => (it.kind === "challenge" ? [it.challenge.id] : [])));
      const scheduleIds = new Set(done.flatMap((it) => (it.kind === "schedule" ? [it.schedule.id] : [])));
      feed.patch((prev) => prev
        .map((it) => (it.gameResults.some((g) => gameIds.has(g.id))
          ? { ...it, gameResults: it.gameResults.filter((g) => !gameIds.has(g.id)) }
          : it))
        .filter((it) => !(it.challenge && challengeIds.has(it.challenge.id)))
        .filter((it) => !(it.schedule && scheduleIds.has(it.schedule.id)))
        .filter((it) => it.kind !== "gameResultPost" || it.gameResults.length > 0));
      setGroupRefreshKey((k) => k + 1);
      feed.reload();
    }
    setBulkProgress(null);
    if (failed.length > 0 && done.length === 0) {
      setBulkErr(batchSummary("삭제", 0, failed.length));
      return;
    }
    setBulkConfirm(null);
    selClear();
    showToast(batchSummary("삭제", done.length, failed.length), { kind: failed.length > 0 ? "warn" : "ok" });
  };

  const [bulkHide, setBulkHide] = useState<DisplayItem[] | null>(null);
  const askBulkHide = useCallback((items: DisplayItem[]) => {
    if (items.length === 0) return;
    setBulkErr(null);
    setBulkHide(items);
  }, []);
  const runBulkHide = async (items: DisplayItem[]) => {
    setBulkErr(null);
    setBulkProgress({ done: 0, total: items.length });
    const { done, failed } = await runBatch(items, async (it) => {
      if (it.kind !== "gameResult") return;
      feed.patchGameResult(await api.hideGameResult(it.gameResult.id));
    }, { onProgress: (n) => setBulkProgress({ done: n, total: items.length }) });
    if (done.length > 0) setGroupRefreshKey((k) => k + 1);
    setBulkProgress(null);
    if (failed.length > 0 && done.length === 0) {
      setBulkErr(batchSummary("", 0, failed.length, "개", HIDE_FORMS));
      return;
    }
    setBulkHide(null);
    selClear();
    showToast(batchSummary("", done.length, failed.length, "개", HIDE_FORMS), { kind: failed.length > 0 ? "warn" : "ok" });
  };

  /** 고른 게임마다 처음(0초) 장면 스크랩(SelectionActions ★) — 묻지 않고 바로 담는다(되돌리기는 스크랩 화면의 지우기). 제목·부제는 공유 글과 같은
   *  자(gameResultShareContent) · 고리는 장면 시각 없는 게임 주소(그 게임을 마지막으로 본 시각이 붙지 않게). */
  const [scrapBusy, setScrapBusy] = useState(false);
  const scrapBusyRef = useRef(false);
  const runBulkScrap = useCallback(async (items: DisplayItem[]) => {
    const games = items.flatMap((it) => (it.kind === "gameResult" ? [it.gameResult] : []));
    if (games.length === 0 || scrapBusyRef.current) return;
    scrapBusyRef.current = true;
    setScrapBusy(true);
    const { done, failed } = await runBatch(games, async (g) => {
      const c9 = gameResultShareContent(g, memberOf);
      const key9 = String(g.matchNo || g.id);
      await api.createSceneScrap({ title: c9.title, subtitle: c9.description ?? "", link: `${window.location.origin}/games/${key9}`, gameNo: key9 });
    });
    scrapBusyRef.current = false;
    setScrapBusy(false);
    if (done.length > 0) selClear();
    showToast(batchSummary("", done.length, failed.length, "개", SCRAP_FORMS), { kind: failed.length > 0 ? "warn" : "ok" });
  }, [memberOf, selClear]);
  const onScrapItems = useCallback((items: DisplayItem[]) => { void runBulkScrap(items); }, [runBulkScrap]);

  const listShown = view.kind === "home" || view.kind === "group";

  return (
    <div className="scr-screen scr-activity-screen">
      {view.kind === "game" && (
        <GameDetailPage
          key={view.path} idText={view.idText}
          onBack={nav.backFromDetail} onClose={nav.closeGame} onGone={nav.gameGone} onMiss={nav.miss}
        />
      )}
      {view.kind === "detail" && (
        <ActivityDetailPage
          key={view.path} group={view.group} id={view.id}
          onBack={nav.backFromDetail} onClose={nav.closeDetail} onMiss={nav.miss}
        />
      )}
      {view.kind === "group" && (
        <ActivityGroupPage
          groupKey={view.key}
          members={members}
          view={rowView}
          act={rowAct}
          gameTab={gameTab}
          onGameTabChange={setGameTab}
          onBack={nav.closeGroup}
          selection={selection}
          canPick={canPick}
          onDeleteItems={askBulkDelete}
          onHideItems={askBulkHide}
          onScrapItems={onScrapItems}
          scrapBusy={scrapBusy}
          refreshKey={groupRefreshKey}
        />
      )}
      {listShown && (view.kind === "home" || directAdd) && (
      <div className={cx(
        "scr-activity-add-fab-wrap scr-activity-add-wrap",
        fabHidden && "scr-activity-add-fab-wrap-hidden",
      )}>
        {/* ★ 선택 중에는 **선택 끝내기**(2026-10-13, 요청: "선택 중에 등록 버튼을 선택 끝내기로 변경") — 폰 선택 모드(sel.mode)에서 등록 대신 선택 모드를 닫는다. 둥근 단추라 두 줄. */}
        {sel.mode ? (
          <button
            type="button" key="fab-exit"
            className={cx("scr-activity-add-fab scr-circle-btn scr-activity-add-fab-exit", fabSwap && "scr-fab-swap")}
            onClick={() => { setAddMenuOpen(false); sel.exit(); }}
          >
            <span>선택<br />끝내기</span>
          </button>
        ) : (
          <button
            type="button" key="fab-add"
            className={cx("scr-activity-add-fab scr-circle-btn", fabSwap && "scr-fab-swap")}
            onClick={directAdd ?? (() => setAddMenuOpen((v) => !v))}
            aria-expanded={directAdd ? undefined : addMenuOpen}
          >
            {parsingReplays ? <Spinner size={18} /> : "등록"}
          </button>
        )}
        {view.kind === "home" && addMenuOpen && !sel.mode && (
          <>
            <div className="scr-activity-add-backdrop" onClick={() => setAddMenuOpen(false)} aria-hidden />
            <div className="scr-activity-add-menu scr-activity-add-menu-up" role="menu">
              <button
                type="button" role="menuitem"
                onClick={() => { setAddMenuOpen(false); replayInputRef.current?.click(); }}
              >
                <Upload size={14} aria-hidden /> 게임결과 등록
              </button>
              <button
                type="button" role="menuitem"
                onClick={() => { setAddMenuOpen(false); setChallengeFormOpen(true); }}
              >
                <Phone size={14} aria-hidden /> 너 나와! 등록
              </button>
              <button
                type="button" role="menuitem"
                onClick={() => { setAddMenuOpen(false); setScheduleFormOpen(true); }}
              >
                <CalendarPlus size={14} aria-hidden /> 일정 등록
              </button>
            </div>
          </>
        )}
      </div>
      )}
      <input
        ref={replayInputRef} type="file" accept=".rep" multiple hidden
        onChange={handleReplayFilesChosen}
      />

      {view.kind === "home" && (
        <ActivityHome
          gameTab={gameTab} onGameTab={setGameTab} error={error}
          onOpenGroup={nav.openGroup} onOpenLeague={nav.openLeague}
          view={rowView} act={rowAct}
        />
      )}

      {bulkConfirm && (
        <ConfirmDialog
          title={`선택한 ${bulkConfirm.length}개를 삭제할까요?`}
          message={bulkDeleteMessageOf(bulkConfirm)}
          confirmLabel={bulkProgress ? `삭제 중... ${bulkProgress.done}/${bulkProgress.total}` : "삭제"}
          error={bulkErr}
          onConfirm={() => { if (!bulkProgress) void runBulkDelete(bulkConfirm); }}
          onCancel={() => { if (!bulkProgress) { setBulkConfirm(null); setBulkErr(null); } }}
        />
      )}

      {bulkHide && (
        <ConfirmDialog
          title={bulkHide.length === 1 && !sel.picked.size ? "이 게임을 숨길까요?" : `선택한 게임 ${bulkHide.length}개를 숨길까요?`}
          message=""
          confirmLabel={bulkProgress ? `숨기는 중... ${bulkProgress.done}/${bulkProgress.total}` : "숨김"}
          error={bulkErr}
          onConfirm={() => { if (!bulkProgress) void runBulkHide(bulkHide); }}
          onCancel={() => { if (!bulkProgress) { setBulkHide(null); setBulkErr(null); } }}
        />
      )}

      {challengeFormOpen && (
        <ChallengeFormModal
          onClose={() => setChallengeFormOpen(false)}
          onCreated={(c) => { feed.upsertChallenge(c); setChallengeFormOpen(false); }}
        />
      )}

      {scheduleFormOpen && (
        <ScheduleFormModal
          initial={null}
          onClose={() => setScheduleFormOpen(false)}
          onSaved={feed.upsertSchedule}
        />
      )}

      {reviewDrafts && (
        <ReplayReviewModal
          drafts={reviewDrafts}
          onClose={() => {
            setReviewDrafts(null);
            const pending = pendingNoticeRef.current;
            pendingNoticeRef.current = null;
            if (pending) showToast(pending.text, { kind: "ok" });
          }}
          onSaved={async () => { feed.reload(); }}
        />
      )}
    </div>
  );
}
