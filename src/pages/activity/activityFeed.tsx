import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { primeReplayMaps } from "scplay";
import { api } from "../../api/client";
import { useCursorPagination } from "../../hooks/useCursorPagination";
import { primeActivityComments } from "./ActivityComments";
import { pickComingMatches } from "./ComingMatches";
import {
  challengeItem, gameResultItem, leagueMatchItem, scheduleItem, sortMsOf,
  type ActivityItem,
} from "./activityItems";
import type { ActivityFeedItem, Challenge, GameResult, LeagueMatchActivity, Schedule } from "../../types";

/* ★ 활동 피드(홈·묶음 목록이 보는 서버 목록) — 2026-10-19(요청: "활동과 일정 너나와 리그 게임 목록과 상세등 모두 컴포넌트 분리").
   피드는 이 Provider 하나가 들고, 값(FeedData)과 손잡이(FeedActions)를 **다른 문맥**으로 나눠 준다. 목록 화면만 값을 구독하고,
   상세 화면·라우터는 손잡이만 쓴다 — 손잡이 문맥은 한 번 만든 그대로라 피드가 바뀌어도 상세·라우터는 다시 그려지지 않는다. */

const PAGE_SIZE = 100;

export interface FeedData {
  /** 탭(내전·공방)으로 거르기 **전**의 전부(새 소식 순 차례). */
  feedAll: ActivityItem[];
  comingMatches: LeagueMatchActivity[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
}

export interface FeedActions {
  reload: () => void;
  patch: (updater: (prev: ActivityFeedItem[]) => ActivityFeedItem[]) => void;
  upsertChallenge: (c: Challenge) => void;
  upsertSchedule: (s: Schedule) => void;
  /** 목록의 그 게임만 갈아 끼운다(상세가 제 것을 따로 고친다). */
  patchGameResult: (g: GameResult) => void;
}

const DataCtx = createContext<FeedData | null>(null);
const ActionsCtx = createContext<FeedActions | null>(null);
/** 최근 7일 안에 리그 판(리그 세트에 쓰인 게임)이 있나 — 게임 탭 기본값(리그 / 내전)을 정한다. 불러오는 동안은 null.
 *  값이 참·거짓 하나라 바뀔 때만 구독자가 다시 그린다(피드 전체를 구독하지 않는 라우터가 쓴다). */
const RecentLeagueCtx = createContext<boolean | null>(null);
const RECENT_LEAGUE_MS = 7 * 24 * 60 * 60 * 1000;
export function useRecentLeague(): boolean | null {
  return useContext(RecentLeagueCtx);
}

export function useFeedData(): FeedData {
  const v = useContext(DataCtx);
  if (!v) throw new Error("FeedProvider 밖");
  return v;
}
export function useFeedActions(): FeedActions {
  const v = useContext(ActionsCtx);
  if (!v) throw new Error("FeedProvider 밖");
  return v;
}

export function FeedProvider({ children }: { children: ReactNode }) {
  const fetchPage = useCallback(async (cursor: string | null) => {
    const page = await api.listActivityFeed({ cursor: cursor ?? undefined, limit: PAGE_SIZE });
    return { ...page, hasMore: page.nextCursor !== null, total: page.totalActivities };
  }, []);
  const {
    items: feedItems, loading: feedLoading, loadingMore, hasMore, loadMore, reload, patch,
  } = useCursorPagination(fetchPage, []);

  const challenges = useMemo(() => feedItems.flatMap((it) => (it.challenge ? [it.challenge] : [])), [feedItems]);
  const gameResults = useMemo(() => feedItems.flatMap((it) => it.gameResults), [feedItems]);
  const leagueMatches = useMemo(() => feedItems.flatMap((it) => (it.leagueMatch ? [it.leagueMatch] : [])), [feedItems]);
  const comingMatches = useMemo(() => pickComingMatches(leagueMatches), [leagueMatches]);
  const schedules = useMemo(() => feedItems.flatMap((it) => (it.schedule ? [it.schedule] : [])), [feedItems]);
  useEffect(() => {
    if (feedItems.length === 0) return;
    void primeActivityComments(feedItems.flatMap((it) => it.comments));
  }, [feedItems]);

  const [mapsLoading, setMapsLoading] = useState(true);
  const didPrimeMapsRef = useRef(false);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);
  useEffect(() => {
    if (feedLoading || didPrimeMapsRef.current) return;
    didPrimeMapsRef.current = true;
    primeReplayMaps(gameResults.map((g) => g.mapHash))
      .catch(() => {}).finally(() => { if (aliveRef.current) setMapsLoading(false); });
  }, [feedLoading, gameResults]);

  const feedAll = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [
      ...challenges.map(challengeItem),
      ...gameResults.map(gameResultItem),
      ...leagueMatches.map(leagueMatchItem),
      ...schedules.map(scheduleItem),
    ];
    return items.sort((a, b) => sortMsOf(b) - sortMsOf(a));
  }, [challenges, gameResults, leagueMatches, schedules]);

  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const actions = useMemo<FeedActions>(() => ({
    reload: () => reloadRef.current(),
    patch,
    upsertChallenge: (updated) => patch((prev) => {
      if (prev.some((it) => it.challenge?.id === updated.id)) {
        return prev.map((it) => (it.challenge?.id === updated.id ? { ...it, challenge: updated } : it));
      }
      reloadRef.current();
      return [{ key: `c-${updated.id}`, kind: "challenge" as const, challenge: updated, gameResults: [], comments: [] }, ...prev];
    }),
    upsertSchedule: (updated) => patch((prev) => {
      if (prev.some((it) => it.schedule?.id === updated.id)) {
        return prev.map((it) => (it.schedule?.id === updated.id ? { ...it, schedule: updated } : it));
      }
      reloadRef.current();
      return [{ key: `sc-${updated.id}`, kind: "schedule" as const, schedule: updated, gameResults: [], comments: [] }, ...prev];
    }),
    patchGameResult: (updated) => patch((prev) => prev.map((it) => (it.gameResults.some((g) => g.id === updated.id)
      ? { ...it, gameResults: it.gameResults.map((g) => (g.id === updated.id ? updated : g)) }
      : it))),
  }), [patch]);

  const recentLeague = useMemo<boolean | null>(() => {
    if (feedLoading) return null;
    const since = Date.now() - RECENT_LEAGUE_MS;
    return feedAll.some((it) => it.kind === "gameResult" && !!it.gameResult.league && it.time >= since);
  }, [feedAll, feedLoading]);

  const data = useMemo<FeedData>(() => ({
    feedAll, comingMatches, loading: feedLoading || mapsLoading, loadingMore, hasMore, loadMore,
  }), [feedAll, comingMatches, feedLoading, mapsLoading, loadingMore, hasMore, loadMore]);

  return (
    <ActionsCtx.Provider value={actions}>
      <RecentLeagueCtx.Provider value={recentLeague}>
        <DataCtx.Provider value={data}>{children}</DataCtx.Provider>
      </RecentLeagueCtx.Provider>
    </ActionsCtx.Provider>
  );
}
