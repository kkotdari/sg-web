import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { LoadingMark } from "../../components/common/Feedback";
import { useAppStore } from "../../store/appStore";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useEditableFocused } from "../../hooks/useEditableFocused";
import { cx } from "../../utils/format";
import { navigateTo, parseRoute, pathOf, rememberListScroll, takeListScroll, type Route } from "../../utils/route";
import type { Post } from "../../types";
import { FeedRow, rowPropsOf, useRowClock, type RowAct, type RowView } from "../feed/FeedRow";
import { FeedProvider, useFeedActions, useFeedData } from "../feed/feed";
import type { DisplayItem, FeedItem } from "../feed/feedItems";
import PostDetailPage, { NEW_POST_ITEM } from "./PostDetailPage";

/* ★ 게시판 화면(2026-10-26, 요청: "일정과 게시판을 합치고 · 활동 화면 제거 · 게임 게시판 두개의 메뉴로" ·
   "보드와 게임은 자체 컴포넌트로 분리 · 보드는 꼭지구분없이 전체 섞여서 시간순 표시").
   /board 목록 · /board/<글> 상세 · /board/new 글쓰기(등록 단추가 곧장 — 요청: "등록시 바로 등록폼으로 가고 제목과 분류같은거도 거기서 입력").
   목록은 꼭지(잡담·질문·공략·일정)를 가르지 않고 새 글 순 한 줄 — 공지 속성 글만 맨 위에 선다.
   피드는 글 몫(kind post)만 받는다 · 상세는 목록과 무관하게 제가 받는다(PostDetailPage ★). */

type View = { kind: "list" } | { kind: "detail"; item: string; path: string };

const viewOf = (r: Route, path: string, miss: string | null): View =>
  (r.item !== null && path !== miss ? { kind: "detail", item: r.item, path } : { kind: "list" });

export default function BoardScreen() {
  return (
    <FeedProvider kinds={["post"]}>
      <BoardRouter />
    </FeedProvider>
  );
}

const NO_PICK = { selecting: false, canPick: () => false, picked: null };

function BoardRouter() {
  const feed = useFeedActions();
  const [route, setRoute] = useState<{ r: Route; path: string }>(() => ({ r: parseRoute(), path: window.location.pathname }));
  const [miss, setMiss] = useState<string | null>(null);
  const view = useMemo(() => viewOf(route.r, route.path, miss), [route, miss]);
  const pushed = useRef(false);
  const sync = useCallback(() => {
    setMiss(null);
    setRoute({ r: parseRoute(), path: window.location.pathname });
  }, []);
  const go = (path: string, replace = false): void => {
    navigateTo(path, { replace, notify: false });
    sync();
  };
  useEffect(() => {
    const onPop = (): void => { pushed.current = false; sync(); };
    window.addEventListener("popstate", onPop);
    window.addEventListener("scr-screen-nav", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("scr-screen-nav", onPop);
    };
  }, [sync]);

  const open = (item: DisplayItem): void => {
    if (item.kind !== "post") return;
    rememberListScroll();   // 뒤로 오면 목록이 이 자리로(route.ts)
    go(pathOf({ screen: "board", item: String(item.post.id) }));
    pushed.current = true;
  };
  const openNew = (): void => {
    rememberListScroll();
    go(pathOf({ screen: "board", item: NEW_POST_ITEM }));
    pushed.current = true;
  };
  const back = (): void => {
    if (pushed.current) { window.history.back(); return; }
    go(pathOf({ screen: "board" }), true);
  };
  /** 등록하면 — 글쓰기 주소를 그 글의 주소로 갈아 끼운다(뒤로 가면 목록) · 목록에도 곧장 싣는다. */
  const created = (p: Post): void => {
    feed.upsertPost(p);
    go(pathOf({ screen: "board", item: String(p.id) }), true);
  };

  const act = useRef<RowAct>({ open, toggle: () => {}, setMany: () => {}, hide: () => {} });
  act.current = { open, toggle: () => {}, setMany: () => {}, hide: () => {} };
  const fabHidden = useEditableFocused();

  if (view.kind === "detail") {
    return (
      <div className="scr-screen scr-board-screen">
        <PostDetailPage
          key={view.path} item={view.item}
          onBack={back} onClose={back} onMiss={() => setMiss(view.path)} onCreated={created}
        />
      </div>
    );
  }
  return (
    <div className="scr-screen scr-board-screen">
      <BoardList act={act} />
      <div className={cx("scr-feed-add-fab-wrap scr-feed-add-wrap", fabHidden && "scr-feed-add-fab-wrap-hidden")}>
        <button type="button" className="scr-feed-add-fab scr-circle-btn" onClick={openNew}>등록</button>
      </div>
    </div>
  );
}

const BoardList = memo(function BoardList({ act }: { act: RefObject<RowAct> }) {
  const { feedAll, loading, loadingMore, hasMore, loadMore } = useFeedData();
  const isMobile = useIsMobile();
  const memberOf = useAppStore((s) => s.memberOf);
  const minute = useRowClock();
  const view = useMemo<RowView>(() => ({
    isMobile, memberOf, selecting: false, selMode: false, selectionNote: "", leagueCol: false,
  }), [isMobile, memberOf]);
  /* 꼭지는 가르지 않는다 — 새 글 순 그대로(피드 차례) · 공지 글만 위로(sort 는 안정이라 공지끼리·나머지끼리는 새 글 순). */
  const rows = useMemo<FeedItem[]>(() => {
    const posts = feedAll.filter((it) => it.kind === "post");
    const pinned = (it: FeedItem): number => (it.kind === "post" && it.post.notice ? 0 : 1);
    return [...posts].sort((a, b) => pinned(a) - pinned(b));
  }, [feedAll]);

  const [restoreY] = useState(takeListScroll);
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (loading || restored.current) return;
    restored.current = true;
    window.scrollTo({ top: restoreY ?? 0, behavior: "instant" });
  }, [loading]);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || loading) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !loadingMore) loadMore();
    }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, loadingMore, loadMore]);

  return (
    <>
      <div className="scr-v2-toolbar">
        <div className="scr-v2-toolbar-title-row">
          <h1 className="scr-title scr-v2-toolbar-title">게시판</h1>
        </div>
      </div>
      {loading ? <LoadingMark /> : (
        <div className="scr-feed-rows scr-feed-group-page-rows">
          {rows.length === 0 ? <div className="scr-empty">글이 없어요</div> : rows.map((item) => {
            const { key, ...p } = rowPropsOf(item, NO_PICK);
            return <FeedRow key={key} {...p} minute={minute} view={view} act={act} />;
          })}
          {hasMore && <div ref={sentinel} className="scr-feed-more-sentinel">{loadingMore && <LoadingMark />}</div>}
        </div>
      )}
    </>
  );
});
