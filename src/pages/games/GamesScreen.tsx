import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { PenLine, Upload } from "lucide-react";
import { Spinner } from "../../components/common/Feedback";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import ReplayReviewModal from "../../modals/ReplayReviewModal";
import GameResultManualModal from "../../modals/GameResultManualModal";
import { SCENE_LINK_KEYS9 } from "scplay";
import { useAppStore } from "../../store/appStore";
import { isAdminRole } from "../../constants/roles";
import { cx } from "../../utils/format";
import { api } from "../../api/client";
import { gamePath, navigateTo, parseRoute, pathOf, rememberListScroll, type Route } from "../../utils/route";
import { showAlert } from "../../components/common/AlertDialog";
import { showToast } from "../../components/common/Toast";
import { useUrlState } from "../../hooks/useUrlState";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useEditableFocused } from "../../hooks/useEditableFocused";
import { useSelection } from "../../hooks/useSelection";
import { batchSummary, runBatch } from "../../utils/batch";
import { canManageGame, isSecretGame } from "../../utils/gameAccess";
import { buildReplayDrafts, type ReplayDraft } from "../../utils/replayDraft";
import { hasAppUpdatePreloadErrorOccurred } from "../../utils/appUpdate";
import GameListPage, { type GameBulkAll } from "./GameListPage";
import GameDetailPage from "./GameDetailPage";
import type { RowAct, RowView } from "../feed/FeedRow";
import { FeedProvider, useFeedActions, useRecentLeague } from "../feed/feed";
import {
  HIDE_FORMS, bulkDeleteMessageOf, deletableOf, type DisplayItem, type GameTab,
} from "../feed/feedItems";

export { GameResultCard } from "./GameResultCard";

const MAX_REPLAY_FILES = 20;

/* ★ 게임 화면 = **주소로 고르는 라우터**(2026-10-19 화면을 컴포넌트로 나눔 → 2026-10-26, 요청: "활동 화면 제거 · 게임 게시판 두개의
   메뉴로 탄생" · "액티비티 다 제거 · 보드와 게임은 자체 컴포넌트로 분리"). /games 목록(GameListPage) · /games/<게임번호> 상세(GameDetailPage).
   피드(목록 데이터)는 FeedProvider 가 게임 몫만 들고 목록만 구독한다 — 상세는 제 항목을 제 상태로 든다. 게시판은 BoardScreen. */

type View =
  | { kind: "list" }
  | { kind: "game"; idText: string; path: string };

function viewOf(r: Route, path: string, miss: string | null): View {
  return r.item !== null && path !== miss ? { kind: "game", idText: r.item, path } : { kind: "list" };
}

export default function GamesScreen() {
  return (
    <FeedProvider kinds={["gameResultPost"]}>
      <GamesRouter />
    </FeedProvider>
  );
}

function GamesRouter() {
  const feed = useFeedActions();
  const [route, setRoute] = useState<{ r: Route; path: string }>(() => ({ r: parseRoute(), path: window.location.pathname }));
  /** 서버에 없던 상세 주소 — 그 주소에선 목록을 그린다. */
  const [miss, setMiss] = useState<string | null>(null);
  const view = useMemo(() => viewOf(route.r, route.path, miss), [route, miss]);
  const viewKey = view.kind === "list" ? "list" : view.path;
  const listPath = pathOf({ screen: "games" });

  const pushedItemRef = useRef(false);
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

  const openItem = (item: DisplayItem): void => {
    rememberListScroll();   // 뒤로 오면 목록이 이 자리로(GameListPage · route.ts)
    // 게임 목록의 공방/내전 탭은 목록 주소의 것 — 상세 주소엔 안 싣는다(뒤로 가면 목록 주소에서 되살아난다)
    const search = linkParams([...SCENE_LINK_KEYS9, "f", "tab"]);
    if (item.kind !== "gameResult") return;
    go(gamePath(item.gameResult.matchNo || String(item.gameResult.id)), { search });
    pushedItemRef.current = true;
  };
  /** 상세를 닫을 때(게임으로 가기 · GameDetailCloseContext) — 들어온 목록으로. */
  const closeDetail = (): void => {
    if (pushedItemRef.current) { window.history.back(); return; }
    go(listPath, { replace: true, search: linkParams([...SCENE_LINK_KEYS9]) });
  };
  const gameGone = (): void => go(listPath, { replace: true });

  useEffect(() => {
    const onPop = (): void => {
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

  /* 화면마다 넘기는 손잡이는 늘 같은 함수다(아래 nav) — 상세·목록이 memo 라 라우터가 다시 그려져도 따라 그리지 않는다. */
  const navRef = useRef({ openItem, closeDetail, gameGone, setMiss, view });
  navRef.current = { openItem, closeDetail, gameGone, setMiss, view };
  const nav = useMemo(() => ({
    closeDetail: () => navRef.current.closeDetail(),
    gameGone: () => navRef.current.gameGone(),
    miss: () => {
      const v = navRef.current.view;
      if (v.kind === "game") navRef.current.setMiss(v.path);
    },
  }), []);

  const isMobile = useIsMobile();
  const user = useAppStore((s) => s.user);
  const isAdmin = !!user && isAdminRole(user.roles);
  const memberOf = useAppStore((s) => s.memberOf);
  const members = useAppStore((s) => s.members);
  const sel = useSelection();
  const selection = user && view.kind === "list" ? sel : null;
  const selClear = sel.clear;   // 일괄 지우기·숨기기 뒤 — 고른 것만 풀고 선택 모드는 둔다
  const selExit = sel.exit;
  useEffect(() => { selExit(); }, [selExit, viewKey]);
  const canPick = useCallback((it: DisplayItem): boolean => {
    if (it.kind === "gameResult" && isSecretGame(it.gameResult)) return false;
    if (isAdmin) return deletableOf(it);
    return it.kind === "gameResult" && canManageGame(it.gameResult, user);
  }, [isAdmin, user]);
  const selectionNote = isAdmin ? "리그 경기는 여기서 지울 수 없어요." : "내가 뛴 게임만 고를 수 있어요.";
  const hideOne = useCallback((it: DisplayItem) => { setBulkErr(null); setBulkAll(null); setBulkHide([it]); }, []);
  const rowAct = useRef<RowAct>({ open: openItem, toggle: sel.toggle, setMany: sel.setMany, hide: hideOne });
  rowAct.current = { open: openItem, toggle: sel.toggle, setMany: sel.setMany, hide: hideOne };

  /* ★ 게임 탭 기본값은 **내전**, 전날 리그 판이 등록됐을 때만 **리그**(2026-10-21, 요청: "활동이랑 게임에서 기본탭 내전으로 하고 리그는 전날경기 등록됐을때만" ·
     한때 2026-10-19 "기본 리그 · 일주일 안에 리그 판이 없으면 내전").
     주소에 탭이 없을 때만 이 셈을 타고, 사람이 고른 탭은 주소(tab=league|clan|pub|fame)에 남아 그대로 선다. */
  const recentLeague = useRecentLeague();
  const [gameTabRaw, setGameTabRaw] = useUrlState("tab");
  const gameTab: GameTab = gameTabRaw === "pub" || gameTabRaw === "league" || gameTabRaw === "clan" || gameTabRaw === "fame"
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
  /* 게임 목록의 등록은 메뉴(리플레이 등록 · 수기 입력 · 2026-10-23, 요청: "경기결과 수기 입력 폼 필요") — 옛: 곧바로 리플레이 고르기. */
  const [manualOpen, setManualOpen] = useState(false);

  const handleReplayFilesChosen = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    const chosen = picked.filter((f) => f.name.toLowerCase().endsWith(".rep"));
    if (chosen.length === 0) {
      showAlert("리플레이(.rep) 파일이 아니에요 — .rep 파일을 골라 주세요.");
      return;
    }
    const truncated = chosen.length > MAX_REPLAY_FILES;
    const batch = chosen.slice(0, MAX_REPLAY_FILES);
    setParsingReplays(true);
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
  /* 게임 목록 '전체 선택' 뒤의 명령은 한 번에 서버로(api.bulkGames · all = 목록 조건 · exclude = 받은 판 중 안 고른 것 — GameListPage ★). */
  const [bulkAll, setBulkAll] = useState<GameBulkAll | null>(null);
  const runBulkAll = async (action: "delete" | "hide", all: GameBulkAll): Promise<boolean> => {
    const verb = action === "delete" ? "삭제" : "";
    const forms = action === "delete" ? undefined : HIDE_FORMS;
    setBulkErr(null);
    setBulkProgress({ done: 0, total: all.count });
    let r: { done: number; failed: number };
    try {
      r = await api.bulkGames({ action, all: all.filter, exclude: all.exclude });
    } catch {
      setBulkProgress(null);
      setBulkErr(batchSummary(verb, 0, all.count, "개", forms));
      return false;
    }
    if (r.done > 0) { setGroupRefreshKey((k) => k + 1); feed.reload(); }
    setBulkProgress(null);
    if (r.done === 0 && r.failed > 0) {
      setBulkErr(batchSummary(verb, 0, r.failed, "개", forms));
      return false;
    }
    selClear();
    showToast(batchSummary(verb, r.done, r.failed, "개", forms), { kind: r.failed > 0 ? "warn" : "ok" });
    return true;
  };
  const askBulkDelete = useCallback((items: DisplayItem[], all?: GameBulkAll) => {
    if (items.length === 0 && !all) return;
    setBulkErr(null);
    setBulkAll(all ?? null);
    setBulkConfirm(items);
  }, []);
  const runBulkDelete = async (items: DisplayItem[]) => {
    if (bulkAll) {
      if (await runBulkAll("delete", bulkAll)) { setBulkConfirm(null); setBulkAll(null); }
      return;
    }
    setBulkErr(null);
    setBulkProgress({ done: 0, total: items.length });
    const { done, failed } = await runBatch(items, async (it) => {
      if (it.kind === "gameResult") await api.deleteGameResult(it.gameResult.id);
    }, { onProgress: (n) => setBulkProgress({ done: n, total: items.length }) });
    if (done.length > 0) {
      const gameIds = new Set(done.flatMap((it) => (it.kind === "gameResult" ? [it.gameResult.id] : [])));
      feed.patch((prev) => prev
        .map((it) => (it.gameResults.some((g) => gameIds.has(g.id))
          ? { ...it, gameResults: it.gameResults.filter((g) => !gameIds.has(g.id)) }
          : it))
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
  const askBulkHide = useCallback((items: DisplayItem[], all?: GameBulkAll) => {
    if (items.length === 0 && !all) return;
    setBulkErr(null);
    setBulkAll(all ?? null);
    setBulkHide(items);
  }, []);
  const runBulkHide = async (items: DisplayItem[]) => {
    if (bulkAll) {
      if (await runBulkAll("hide", bulkAll)) { setBulkHide(null); setBulkAll(null); }
      return;
    }
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

  const listShown = view.kind === "list";
  /* PC 등록 단추(타이틀 아래 줄 · 라이팅 기본 네모 = 채움) — 누르면 아래로 펼치는 같은 차림표(게임결과 등록 · 수기 입력). 선택 끝내기는 폰 선택 모드 것이라 없다. */
  const pcAdd = useMemo(() => (isMobile ? undefined : (
    <div className="scr-title-action">
      <button type="button" className="scr-rect-btn" onClick={() => setAddMenuOpen((v) => !v)} aria-expanded={addMenuOpen}>
        {parsingReplays ? <Spinner size={14} /> : "등록"}
      </button>
      {addMenuOpen && (
        <>
          <div className="scr-feed-add-backdrop" onClick={() => setAddMenuOpen(false)} aria-hidden />
          <div className="scr-feed-add-menu scr-feed-add-menu-right" role="menu">
            <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); replayInputRef.current?.click(); }}>
              <Upload size={14} aria-hidden /> 게임결과 등록
            </button>
            <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); setManualOpen(true); }}>
              <PenLine size={14} aria-hidden /> 게임결과 수기 입력
            </button>
          </div>
        </>
      )}
    </div>
  )), [isMobile, addMenuOpen, parsingReplays]);

  return (
    <div className="scr-screen scr-feed-screen">
      {view.kind === "game" && (
        <GameDetailPage
          key={view.path} idText={view.idText}
          onBack={nav.closeDetail} onClose={nav.closeDetail} onGone={nav.gameGone} onMiss={nav.miss}
        />
      )}
      {view.kind === "list" && (
        <GameListPage
          members={members}
          view={rowView}
          act={rowAct}
          gameTab={gameTab}
          onGameTabChange={setGameTab}
          selection={selection}
          canPick={canPick}
          onDeleteItems={askBulkDelete}
          onHideItems={askBulkHide}
          refreshKey={groupRefreshKey}
          titleAction={pcAdd}
        />
      )}
      {/* ★ PC 는 둥근 등록 단추(FAB) 대신 타이틀 아래 줄의 네모 단추(2026-10-27, 요청: "피시에서 게임, 게시판, 리그의 등록/생성 플로팅 버튼을 제거하고 타이틀 아래줄
         고정 버튼으로 변경(라이팅테마 기본 네모 버튼)") — 위 pcAdd(GameListPage titleAction). 폰은 FAB 그대로. */}
      {listShown && isMobile && (
      <div className={cx(
        "scr-feed-add-fab-wrap scr-feed-add-wrap",
        fabHidden && "scr-feed-add-fab-wrap-hidden",
      )}>
        {/* ★ 선택 중에는 **선택 끝내기**(2026-10-13, 요청: "선택 중에 등록 버튼을 선택 끝내기로 변경") — 폰 선택 모드(sel.mode)에서 등록 대신 선택 모드를 닫는다. 둥근 단추라 두 줄. */}
        {sel.mode ? (
          <button
            type="button" key="fab-exit"
            className={cx("scr-feed-add-fab scr-circle-btn scr-feed-add-fab-exit", fabSwap && "scr-fab-swap")}
            onClick={() => { setAddMenuOpen(false); sel.exit(); }}
          >
            <span>선택<br />끝내기</span>
          </button>
        ) : (
          <button
            type="button" key="fab-add"
            className={cx("scr-feed-add-fab scr-circle-btn", fabSwap && "scr-fab-swap")}
            onClick={() => setAddMenuOpen((v) => !v)}
            aria-expanded={addMenuOpen}
          >
            {parsingReplays ? <Spinner size={18} /> : "등록"}
          </button>
        )}
        {addMenuOpen && !sel.mode && (
          <>
            <div className="scr-feed-add-backdrop" onClick={() => setAddMenuOpen(false)} aria-hidden />
            <div className="scr-feed-add-menu scr-feed-add-menu-up" role="menu">
              <button
                type="button" role="menuitem"
                onClick={() => { setAddMenuOpen(false); replayInputRef.current?.click(); }}
              >
                <Upload size={14} aria-hidden /> 게임결과 등록
              </button>
              <button
                type="button" role="menuitem"
                onClick={() => { setAddMenuOpen(false); setManualOpen(true); }}
              >
                <PenLine size={14} aria-hidden /> 게임결과 수기 입력
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

      {bulkConfirm && (
        <ConfirmDialog
          title={`선택한 ${bulkAll ? bulkAll.count : bulkConfirm.length}개를 삭제할까요?`}
          message={bulkDeleteMessageOf(bulkConfirm, bulkAll?.count)}
          confirmLabel={bulkProgress ? (bulkAll ? "삭제 중..." : `삭제 중... ${bulkProgress.done}/${bulkProgress.total}`) : "삭제"}
          error={bulkErr}
          onConfirm={() => { if (!bulkProgress) void runBulkDelete(bulkConfirm); }}
          onCancel={() => { if (!bulkProgress) { setBulkConfirm(null); setBulkAll(null); setBulkErr(null); } }}
        />
      )}

      {bulkHide && (
        <ConfirmDialog
          title={bulkAll ? `선택한 게임 ${bulkAll.count}개를 숨길까요?`
            : bulkHide.length === 1 && !sel.picked.size ? "이 게임을 숨길까요?" : `선택한 게임 ${bulkHide.length}개를 숨길까요?`}
          message=""
          confirmLabel={bulkProgress ? (bulkAll ? "숨기는 중..." : `숨기는 중... ${bulkProgress.done}/${bulkProgress.total}`) : "숨김"}
          error={bulkErr}
          onConfirm={() => { if (!bulkProgress) void runBulkHide(bulkHide); }}
          onCancel={() => { if (!bulkProgress) { setBulkHide(null); setBulkAll(null); setBulkErr(null); } }}
        />
      )}

      {manualOpen && (
        <GameResultManualModal
          onClose={() => setManualOpen(false)}
          onSaved={() => { setGroupRefreshKey((k) => k + 1); feed.reload(); showToast("게임결과를 등록했어요.", { kind: "ok" }); }}
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
