import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft } from "lucide-react";
import { LoadingMark } from "../../components/common/Feedback";
import SearchFilterBar from "../../components/common/SearchFilterBar";
import { SelectionBar } from "../../components/common/Selection";
import {
  activeMemberSearchTerms, memberMatchesTerm, normalizeSearchText, splitSearchTerms,
} from "../../utils/memberSearch";
import { buildLexicon, decodeGameSearch, encodeGameSearch, formToServer, gameSuggestions, legacyToForm } from "../../utils/gameSearch";
import GameSearchForm from "./GameSearchForm";
import { api } from "../../api/client";
import { useUrlState } from "../../hooks/useUrlState";
import type { Selection } from "../../hooks/useSelection";
import { takeListScroll, type ActivityGroupKey } from "../../utils/route";
import type { GameResultSlot, Member } from "../../types";
import { GameTableHead } from "./GameTable";
import { cx } from "../../utils/format";
import { ActivityRow, rowPropsOf, useRowClock, type RowAct, type RowView } from "./ActivityRow";
import { useFeedData } from "./activityFeed";
import {
  GROUP_DEFS, GameTabs, SEARCHABLE_GROUPS, feedOfTab, gameResultItem, groupKeyOf, rowKeyOf,
  type ActivityItem, type DisplayItem, type GameTab,
} from "./activityItems";

/* ★ 묶음 목록(일정·게임) — 2026-10-19 ActivityScreen 에서 뗐다(요청: "…목록과 상세등 모두 컴포넌트 분리").
   일정은 피드에서 제 묶음을 고르고, 게임은 서버 쪽수(아래)로 받는다. 줄은 memo(ActivityRow). */

/* ★ 선택 막대 단추 = **숨김 · 삭제**(2026-10-14 컴팩트 네모 · 스크랩은 2026-10-22 기능째 걷었다 — 요청: "스크랩 기능 완전 제거"). 숨김은 게임만 골랐을 때 켜진다. */
function SelectionActions({ picked, all, onDelete, onHide }: {
  picked: DisplayItem[];
  all: GameBulkAll | null;
  onDelete: (items: DisplayItem[], all?: GameBulkAll) => void;
  onHide: (items: DisplayItem[], all?: GameBulkAll) => void;
}) {
  const games = picked.filter((it) => it.kind === "gameResult");
  const onlyGames = picked.length > 0 && games.length === picked.length;
  return (
    <>
      <button
        type="button" className="scr-compact-rect-btn"
        disabled={!onlyGames}
        onClick={() => onHide(games, all ?? undefined)}
        title={onlyGames ? "고른 게임을 숨겨요" : "게임만 골랐을 때 켜져요"}
      >
        숨김
      </button>
      <button
        type="button" className="scr-compact-rect-btn"
        disabled={picked.length === 0}
        onClick={() => onDelete(picked, all ?? undefined)}
        title={picked.length === 0 ? "고른 것이 없어요" : undefined}
      >
        삭제
      </button>
    </>
  );
}

/** 게임 목록 '전체 선택' 명령 — 받아 둔 쪽만이 아니라 그 조건의 판 전부(서버가 filter 로 다시 찾고 exclude 를 뺀다 · count 는 확인 창 수). */
export type GameBulkAll = { filter: ReturnType<typeof tabQuery> & { any?: string; linked?: string }; exclude: number[]; count: number };

/** 게임 목록 한 쪽 — 무한 스크롤로 이만큼씩 더 받는다. */
const GAME_PAGE9 = 50;

/** 탭 → 서버 목록 조건 — 리그 판은 리그 탭에만(leagueOnly), 내전·공방은 리그 판을 뺀다(noLeague). 명예의 전당 탭은 fameOnly(그 판은 제 탭에도 선다). */
export const tabQuery = (tab: GameTab) => (tab === "fame" ? { fameOnly: true } : {
  membersOnly: tab === "clan" || undefined,
  pubOnly: tab === "pub" || undefined,
  leagueOnly: tab === "league" || undefined,
  noLeague: tab !== "league" || undefined,
});

export default memo(function ActivityGroupPage({
  groupKey, members, onBack, view, act,
  gameTab, onGameTabChange,
  selection, canPick, onDeleteItems, onHideItems, refreshKey,
}: {
  groupKey: ActivityGroupKey;
  members: Member[];
  view: RowView;
  act: RefObject<RowAct>;
  selection: Selection | null;
  canPick: (it: DisplayItem) => boolean;
  onDeleteItems: (items: DisplayItem[], all?: GameBulkAll) => void;
  onHideItems: (items: DisplayItem[], all?: GameBulkAll) => void;
  refreshKey: number;
  gameTab: GameTab;
  onGameTabChange: (next: GameTab) => void;
  onBack: () => void;
}) {
  const memberOf = view.memberOf;
  const label = GROUP_DEFS.find((g) => g.key === groupKey)?.label ?? "";
  const { feedAll } = useFeedData();
  const minute = useRowClock();
  const items = useMemo<ActivityItem[]>(
    () => feedOfTab(feedAll, gameTab, memberOf).filter((it) => groupKeyOf(it) === groupKey),
    [feedAll, gameTab, memberOf, groupKey]);
  const searchable = SEARCHABLE_GROUPS.has(groupKey);
  const suggestions = useMemo(() => activeMemberSearchTerms(members), [members]);
  const [searchApplied, setSearchApplied] = useUrlState("u");
  const [search, setSearch] = useState(() => searchApplied);
  const searchTerms = useMemo(() => splitSearchTerms(searchApplied), [searchApplied]);
  const [legacyQ, setLegacyQ] = useUrlState("q");
  useEffect(() => { setSearch(searchApplied); }, [searchApplied]);
  useEffect(() => {
    if (!legacyQ) return;
    setSearchApplied([searchApplied, legacyQ].filter(Boolean).join(", "));
    setLegacyQ("");
  }, [legacyQ]);
  const gameOptions = useMemo(() => gameSuggestions(
    new Set(items.flatMap((it) => {
      if (it.kind !== "gameResult") return [];
      const name9 = it.gameResult.mapCanonName ?? it.gameResult.mapName;
      return name9 ? [name9] : [];
    })),
  ), [items]);
  const lexicon = useMemo(
    () => buildLexicon(suggestions.flatMap((s9) => s9.matchTexts), gameOptions),
    [suggestions, gameOptions],
  );
  const lexRef = useRef(lexicon);
  lexRef.current = lexicon;
  /* ★★ 게임 목록은 검색폼(GameSearchForm · 2026-10-20) — 조건은 주소 f= (JSON). 옛 한 줄 검색어(u=)로 들어오면 한 번 폼으로 옮긴다. */
  const onGames9 = groupKey === "gameResult";
  const [formRaw, setFormRaw] = useUrlState("f");
  const gameForm = useMemo(() => decodeGameSearch(formRaw), [formRaw]);
  useEffect(() => {
    if (!onGames9 || !searchApplied) return;
    const next = legacyToForm(searchApplied, lexicon, gameOptions);
    setSearchApplied("");
    setFormRaw(encodeGameSearch(next));
  }, [onGames9, searchApplied]);
  const searchKey9 = onGames9 ? formRaw : searchApplied;
  /* ★ 게임 목록은 **50개씩 무한 스크롤 · 전체 개수는 첫 쪽에서**(2026-10-23, 요청: "게임 목록 검색을 100개 무한스크롤로 복귀하고 대신 전체 개수는 가져오기" →
     "100개도 많은듯 50개씩" · 한때 2026-10-22 한 번에 다 받기). 상세에서 뒤로 온 칸이면 적어 둔 스크롤 y(route.ts takeListScroll — 읽는 즉시 칸에서 지운다) —
     새로 받아 그려 보고 페이지가 y 까지 내려갈 만큼 길어질 때까지 더 받은 뒤 y 로(더 받을 게 없으면 끝까지), 그 밖의 목록은 바로 y 로. */
  const [restoreY9] = useState(takeListScroll);
  const restore9 = useRef(restoreY9);
  type GamesPage9 = { items: ActivityItem[]; total: number; cursor: string | null };
  const [serverGames, setServerGames] = useState<GamesPage9 | null>(null);
  const [serverBusy, setServerBusy] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const listQuery9 = useMemo<GameBulkAll["filter"]>(() => {
    const merged = formToServer(decodeGameSearch(formRaw));
    return { any: merged.any, linked: merged.linked, ...tabQuery(gameTab) };
  }, [formRaw, gameTab]);
  useEffect(() => {
    if (groupKey !== "gameResult") { setServerGames(null); setServerBusy(false); return undefined; }
    const y9 = restore9.current;
    let dead = false;
    setServerGames(null);
    setServerBusy(true);
    (async () => {
      const q9 = { ...listQuery9, limit: GAME_PAGE9, sort: "latest" as const };
      let page = await api.getGameResultsPage(q9);
      const items = page.items.map((m) => gameResultItem(m));
      const total = page.total ?? items.length;   // 전체 개수는 첫 쪽(커서 없음)에만 온다
      const show = () => flushSync(() => setServerGames({ items: [...items], total, cursor: page.nextCursor }));
      if (dead) return;
      show();
      if (y9 === null) return;
      // 더 받을 게 없거나(커서 없음) 받다 실패하면 그만 — 받은 만큼 둔 채 y 로(짧으면 브라우저가 끝으로 맞춘다).
      while (document.documentElement.scrollHeight < y9 + window.innerHeight && page.nextCursor && !dead) {
        try { page = await api.getGameResultsPage({ ...q9, cursor: page.nextCursor }); } catch { break; }
        items.push(...page.items.map((m) => gameResultItem(m)));
        if (!dead) show();
      }
      if (dead) return;
      restore9.current = null;
      window.scrollTo({ top: y9, behavior: "instant" });
    })()
      .catch(() => { if (!dead) setServerGames(null); })
      .finally(() => { if (!dead) setServerBusy(false); });
    return () => { dead = true; };
  }, [groupKey, searchKey9, gameTab, refreshKey]);

  /* ★ 전체 선택(게임 목록)은 **받은 쪽이 아니라 그 조건의 판 전부**(같은 날 요청: "전체 선택 후 어떤 명령을 내리면 전체라는 파라미터를 전달해서 서버에서 처리") —
     켜진 동안 더 받은 쪽도 골라 두고, 받은 판 가운데 고르지 않은 것(풀었거나 못 고르는 것)을 exclude 로 넘긴다. 다 풀면 꺼진다. */
  const [allPick, setAllPick] = useState(false);
  const allPickRef = useRef(false);
  allPickRef.current = allPick;
  const loadMoreGames = useCallback(async () => {
    const cursor = serverGames?.cursor;
    if (!cursor || moreBusy || serverBusy) return;
    setMoreBusy(true);
    try {
      const page = await api.getGameResultsPage({ ...listQuery9, limit: GAME_PAGE9, sort: "latest", cursor });
      const more = page.items.map((m) => gameResultItem(m));
      setServerGames((prev) => (prev && prev.cursor === cursor ? {
        total: prev.total, items: [...prev.items, ...more], cursor: page.nextCursor,
      } : prev));
      if (allPickRef.current) selection?.setMany(more.filter(canPick).map(rowKeyOf), true);
    } catch {
    } finally {
      setMoreBusy(false);
    }
  }, [serverGames?.cursor, moreBusy, serverBusy, listQuery9, selection, canPick]);

  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = moreRef.current;
    if (!el || !serverGames?.cursor) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMoreGames();
    }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [serverGames?.cursor, loadMoreGames]);

  const slotMatchesTerm = (slot: GameResultSlot, term: string): boolean => {
    const m = memberOf(slot.memberId);
    if (m && memberMatchesTerm(m, term)) return true;
    return !!slot.rawName && normalizeSearchText(slot.rawName).includes(term);
  };

  const serverSearch = groupKey === "gameResult";
  const base = serverGames ? serverGames.items
    : (serverSearch ? [] : items);
  const filtered = useMemo(() => {
    if (serverSearch) return base;
    if (!searchable || searchTerms.length === 0) return base;
    return base.filter((item) => {
      if (item.kind === "gameResult") {
        const slots = [...item.gameResult.team1, ...item.gameResult.team2];
        return searchTerms.every((term) => slots.some((slot) => slotMatchesTerm(slot, term)));
      }
      if (item.kind === "leagueMatch") {
        const names = [item.match.teamA, item.match.teamB]
          .flatMap((t) => (t ? t.members.map((x) => x.nickname) : []));
        const text = normalizeSearchText([...names, item.match.leagueName].join(" "));
        return searchTerms.every((term) => text.includes(term));
      }
      return true;
    });
  }, [base, searchTerms, serverGames, serverSearch, searchable, memberOf]);

  const selectable = useMemo(() => filtered.filter(canPick), [filtered, canPick]);
  const pickedSet = selection?.picked;
  const pickedItems = useMemo(
    () => (pickedSet ? selectable.filter((it) => pickedSet.has(rowKeyOf(it))) : []),
    [pickedSet, selectable],
  );
  const keepOnly = selection?.keepOnly;
  useEffect(() => { keepOnly?.(selectable.map(rowKeyOf)); }, [keepOnly, selectable]);
  useEffect(() => { if (allPick && !pickedSet?.size) setAllPick(false); }, [allPick, pickedSet]);
  const bulkAll = useMemo<GameBulkAll | null>(() => {
    if (!allPick || !serverGames) return null;
    const exclude = serverGames.items.flatMap((it) => (
      it.kind === "gameResult" && !pickedSet?.has(rowKeyOf(it)) ? [it.gameResult.id] : []));
    return { filter: listQuery9, exclude, count: Math.max(0, serverGames.total - exclude.length) };
  }, [allPick, serverGames, pickedSet, listQuery9]);
  // 전체 선택 앞 수 — 서버 목록이면 아직 안 받은 판까지(받은 것 중 못 고르는 줄은 뺀다).
  const pickTotal = serverGames ? Math.max(0, serverGames.total - (filtered.length - selectable.length)) : selectable.length;

  useLayoutEffect(() => {
    const y9 = groupKey !== "gameResult" ? restore9.current : null;
    if (groupKey !== "gameResult") restore9.current = null;
    window.scrollTo({ top: y9 ?? 0, behavior: "instant" });
  }, [groupKey]);

  return (
    <div className="scr-activity-group-page">
      <div className="scr-v2-toolbar scr-v2-toolbar-crumb">
        <div className="scr-v2-toolbar-title-row scr-crumb">
          <button type="button" className="scr-crumb-back" onClick={onBack}>
            <ArrowLeft size={14} />
            <span>활동</span>
          </button>
          <h1 className="scr-title scr-crumb-title">{label}</h1>
        </div>
      </div>
      {onGames9 && (
        <GameSearchForm
          value={gameForm}
          onApply={(next) => setFormRaw(encodeGameSearch(next))}
          members={suggestions.map((s9) => s9.member)}
          terms={gameOptions}
          maps={gameOptions.filter((o) => o.tag === "맵").map((o) => o.value)}
        />
      )}
      {searchable && (
        <SearchFilterBar
          showSearch={!onGames9}
          count={serverSearch ? (serverGames?.total ?? 0) : filtered.length}
          countLabel="건"
          countLoading={serverBusy}
          searchValue={search}
          onSearchChange={setSearch}
          onSearchEnter={(v9) => setSearchApplied(v9)}
          suggestions={suggestions}
          termSuggestions={groupKey === "gameResult" ? gameOptions : undefined}
          lexicon={groupKey === "gameResult" ? lexicon : undefined}
          searchLabel={groupKey === "gameResult" ? "검색" : "유저"}
          searchPlaceholder={groupKey === "gameResult"
            ? "⌕  검색어 입력"
            : "유저 검색 (쉼표로 여럿, 엔터로 검색)"}
          heading={groupKey === "gameResult" ? (
            <GameTabs value={gameTab} onChange={onGameTabChange} />
          ) : undefined}
        />
      )}
      {selection && filtered.length > 0 && (
        <SelectionBar
          total={pickTotal} count={bulkAll ? bulkAll.count : pickedItems.length}
          onSelectAll={() => {
            if (serverGames) setAllPick(true);
            selection.setMany(selectable.map(rowKeyOf), true);
          }}
          onClear={selection.clear}
          /* 안내 줄(selectionNote)은 안 띄운다(2026-10-13, 요청: "안내 문구도 굳이 안 보여 주기") — 못 고르는 줄은 눌렀을 때의 풍선(disabledTitle)이 말한다. */
          mode={selection.mode} onExit={selection.exit}
        >
          <SelectionActions
            picked={pickedItems} all={bulkAll} onDelete={onDeleteItems} onHide={onHideItems}
          />
        </SelectionBar>
      )}
      <div className={cx("scr-activity-rows scr-activity-group-page-rows", groupKey === "gameResult" && !view.isMobile && "scr-gtab-list", view.leagueCol && "has-league")}>
        {groupKey === "gameResult" && !view.isMobile && filtered.length > 0 && <GameTableHead selecting={!!selection} leagueCol={view.leagueCol} />}
        {filtered.length === 0 ? (
          <div className="scr-empty">{serverBusy ? "찾는 중…" : "결과가 없어요"}</div>
        ) : (
          filtered.map((item) => {
            const { key, ...p } = rowPropsOf(item, { selecting: !!selection, canPick, picked: pickedSet ?? null });
            return <ActivityRow key={key} {...p} minute={minute} view={view} act={act} />;
          })
        )}
        {serverGames?.cursor && (
          <div ref={moreRef} className="scr-activity-more-sentinel">
            {moreBusy && <LoadingMark />}
          </div>
        )}
      </div>
    </div>
  );
});
