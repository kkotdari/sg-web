import { memo, useEffect, useMemo, useRef, type RefObject } from "react";
import { LoadingMark } from "../../components/common/Feedback";
import ComingMatches from "./ComingMatches";
import { GameTableHead } from "./GameTable";
import { cx } from "../../utils/format";
import { ActivityRow, rowPropsOf, useRowClock, type RowAct, type RowView } from "./ActivityRow";
import { useFeedData } from "./activityFeed";
import {
  GROUP_DEFS, GameTabs, feedOfTab, groupKeyOf, previewMaxOf, rowFlagsOf, touchMsOf,
  type ActivityItem, type GameTab,
} from "./activityItems";
import type { ActivityGroupKey } from "../../utils/route";
import type { LeagueMatchActivity } from "../../types";

/* ★ 활동 홈(묶음마다 몇 줄씩) — 2026-10-19 컴포넌트로 뗐다. 피드 값을 구독하는 건 홈·묶음 목록뿐이다(activityFeed ★). */

const NO_PICK = { selecting: false, canPick: () => false, picked: null };

export default memo(function ActivityHome({ gameTab, onGameTab, error, onOpenGroup, onOpenLeague, view, act }: {
  gameTab: GameTab;
  onGameTab: (next: GameTab) => void;
  error: string;
  onOpenGroup: (key: ActivityGroupKey) => void;
  onOpenLeague: (m: LeagueMatchActivity) => void;
  view: RowView;
  act: RefObject<RowAct>;
}) {
  const { feedAll, comingMatches, loading, loadingMore, hasMore, loadMore } = useFeedData();
  const minute = useRowClock();
  const feed = useMemo(() => feedOfTab(feedAll, gameTab, view.memberOf), [feedAll, gameTab, view.memberOf]);

  const homePreview = useMemo(() => {
    const buckets = new Map<ActivityGroupKey, ActivityItem[]>();
    for (const g of GROUP_DEFS) buckets.set(g.key, []);
    for (const item of feed) buckets.get(groupKeyOf(item))!.push(item);
    /* ★ 새 소식 순 차례는 **탭과 무관하게** 잰다(2026-10-11, 지적: "게임목록 탭 내전·공방 선택 시 게임목록과 일정목록 순서가 바뀌는 문제") — 거른 목록으로 재면
       공방에만 새 게임이 있을 때 내전 탭에서는 게임 묶음이 새 소식을 잃어 일정 아래로 내려갔다. 목록(items)은 그대로 거른 것. */
    const freshOf = new Map<ActivityGroupKey, number>();
    for (const it of feedAll) {
      if (rowFlagsOf(it).length === 0) continue;
      const k = groupKeyOf(it);
      freshOf.set(k, Math.max(freshOf.get(k) ?? 0, it.time));
    }
    const sections = GROUP_DEFS
      .map((g, order) => ({ ...g, order, items: buckets.get(g.key)!, freshAt: freshOf.get(g.key) ?? 0 }))
      .filter((s) => s.items.length > 0 && s.key !== "league");
    sections.sort((a, b) => {
      if ((a.freshAt > 0) !== (b.freshAt > 0)) return a.freshAt > 0 ? -1 : 1;
      if (a.freshAt !== b.freshAt) return b.freshAt - a.freshAt;
      return a.order - b.order;
    });
    return sections.map((section) => ({
      ...section,
      rows: [...section.items].sort((a, b) => touchMsOf(b) - touchMsOf(a)).slice(0, previewMaxOf(section.key)),
    }));
  }, [feed, feedAll, minute]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && hasMore && !loadingMore) loadMore();
    }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, loadingMore, loadMore]);

  return (
    <>
      <div className="scr-v2-toolbar">
        <div className="scr-v2-toolbar-title-row">
          <h1 className="scr-title scr-v2-toolbar-title">활동</h1>
        </div>
      </div>

      {!loading && comingMatches.length > 0 && (
        <ComingMatches matches={comingMatches} onOpen={onOpenLeague} />
      )}

      {error && <div className="scr-err">{error}</div>}

      {loading ? (
        <LoadingMark />
      ) : feed.length === 0 ? (
        <div className="scr-empty">활동이 없어요</div>
      ) : (
        <div className="scr-activity-groups">
          {homePreview.map((section) => (
            <div className="scr-activity-group" key={section.key}>
              <div
                className="scr-activity-group-head"
                role="button" tabIndex={0}
                aria-label={`${section.label} 전체 보기`}
                onClick={() => onOpenGroup(section.key)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  onOpenGroup(section.key);
                }}
              >
                <h2 className="scr-activity-group-title">{section.label}</h2>
                <span className="scr-activity-group-viewall" aria-hidden>전체 보기</span>
              </div>
              {section.key === "gameResult" && <GameTabs value={gameTab} onChange={onGameTab} />}
              <div className={cx("scr-activity-rows", section.key === "gameResult" && !view.isMobile && "scr-gtab-list")}>
                {section.key === "gameResult" && !view.isMobile && <GameTableHead selecting={false} />}
                {section.rows.map((item) => {
                  const { key, ...p } = rowPropsOf(item, NO_PICK);
                  return <ActivityRow key={key} {...p} minute={minute} view={view} act={act} />;
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && loadingMore && <LoadingMark />}
      {!loading && <div ref={sentinelRef} aria-hidden />}
    </>
  );
});
