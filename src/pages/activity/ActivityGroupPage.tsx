import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, BookOpen, Bookmark } from "lucide-react";
import { LoadingMark } from "../../components/common/Feedback";
import SearchFilterBar from "../../components/common/SearchFilterBar";
import { SelectionBar } from "../../components/common/Selection";
import { useAppStore } from "../../store/appStore";
import {
  activeMemberSearchTerms, memberMatchesTerm, normalizeSearchText, splitSearchTerms,
} from "../../utils/memberSearch";
import { buildLexicon, decodeGameSearch, encodeGameSearch, formToServer, gameSuggestions, legacyToForm } from "../../utils/gameSearch";
import GameSearchForm from "./GameSearchForm";
import { api } from "../../api/client";
import { useUrlState } from "../../hooks/useUrlState";
import type { Selection } from "../../hooks/useSelection";
import { takeListScroll, type ActivityGroupKey } from "../../utils/route";
import type { Challenge, GameResultSlot, Member } from "../../types";
import { GameTableHead } from "./GameTable";
import { cx } from "../../utils/format";
import { ActivityRow, rowPropsOf, useRowClock, type RowAct, type RowView } from "./ActivityRow";
import { useFeedData } from "./activityFeed";
import {
  GROUP_DEFS, GameTabs, SEARCHABLE_GROUPS, feedOfTab, gameResultItem, groupKeyOf, rowKeyOf,
  type ActivityItem, type DisplayItem, type GameTab,
} from "./activityItems";

/* ★ 묶음 목록(일정·너 나와!·게임) — 2026-10-19 ActivityScreen 에서 뗐다(요청: "…목록과 상세등 모두 컴포넌트 분리").
   일정·너 나와!는 피드에서 제 묶음을 고르고, 게임은 서버 쪽수(아래)로 받는다. 줄은 memo(ActivityRow). */

/* ★ 선택 막대 단추 = **스크랩 · 숨김 · 삭제**(2026-10-14, 요청: "게임 목록 선택 모드에 스크랩/숨김/삭제로 버튼 변경 · 버튼 모양 둥근 네모 컴팩트") —
   알약(.scr-pill-btn) → 컴팩트 네모(.scr-compact-rect-btn). 스크랩은 고른 게임마다 **처음(0초) 장면 스크랩**을 하나씩 담는다(재생 화면의 장면 스크랩과
   같은 API · 같은 '스크랩한 장면' 목록). 스크랩·숨김은 게임만 골랐을 때 켜진다. */
function SelectionActions({ picked, onDelete, onHide, onScrap, scrapBusy }: {
  picked: DisplayItem[];
  onDelete: (items: DisplayItem[]) => void;
  onHide: (items: DisplayItem[]) => void;
  onScrap: (items: DisplayItem[]) => void;
  scrapBusy: boolean;
}) {
  const games = picked.filter((it) => it.kind === "gameResult");
  const onlyGames = picked.length > 0 && games.length === picked.length;
  return (
    <>
      <button
        type="button" className="scr-compact-rect-btn"
        disabled={!onlyGames || scrapBusy}
        onClick={() => onScrap(games)}
        title={onlyGames ? "고른 게임을 처음부터 보는 장면으로 스크랩해요" : "게임만 골랐을 때 켜져요"}
      >
        {scrapBusy ? "스크랩 중…" : "스크랩"}
      </button>
      <button
        type="button" className="scr-compact-rect-btn"
        disabled={!onlyGames}
        onClick={() => onHide(games)}
        title={onlyGames ? "고른 게임을 숨겨요" : "게임만 골랐을 때 켜져요"}
      >
        숨김
      </button>
      <button
        type="button" className="scr-compact-rect-btn"
        disabled={picked.length === 0}
        onClick={() => onDelete(picked)}
        title={picked.length === 0 ? "고른 것이 없어요" : undefined}
      >
        삭제
      </button>
    </>
  );
}

/** 탭 → 서버 목록 조건 — 리그 판은 리그 탭에만(leagueOnly), 내전·공방은 리그 판을 뺀다(noLeague). */
const tabQuery = (tab: GameTab) => ({
  membersOnly: tab === "clan" || undefined,
  pubOnly: tab === "pub" || undefined,
  leagueOnly: tab === "league" || undefined,
  noLeague: tab !== "league" || undefined,
});

export default memo(function ActivityGroupPage({
  groupKey, members, onBack, view, act,
  gameTab, onGameTabChange,
  selection, canPick, onDeleteItems, onHideItems, onScrapItems, scrapBusy, refreshKey,
}: {
  groupKey: ActivityGroupKey;
  members: Member[];
  view: RowView;
  act: RefObject<RowAct>;
  selection: Selection | null;
  canPick: (it: DisplayItem) => boolean;
  onDeleteItems: (items: DisplayItem[]) => void;
  onHideItems: (items: DisplayItem[]) => void;
  onScrapItems: (items: DisplayItem[]) => void;
  scrapBusy: boolean;
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
  const requestScreen = useAppStore((s) => s.requestScreen);
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
  /* 상세에서 뒤로 온 칸이면 적어 둔 스크롤 y(route.ts takeListScroll — 읽는 즉시 칸에서 지운다). 게임 목록은 새로 받아 그려 보고 페이지가 y 까지
     내려갈 만큼 길어질 때까지 더 받은 뒤 y 로(줄 높이·새 판 수와 무관 · 더 받을 게 없으면 끝까지), 그 밖의 목록은 바로 y 로. */
  const [restoreY9] = useState(takeListScroll);
  const restore9 = useRef(restoreY9);
  type GamesPage9 = { items: ActivityItem[]; total: number; cursor: string | null };
  const [serverGames, setServerGames] = useState<GamesPage9 | null>(null);
  const [serverBusy, setServerBusy] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  useEffect(() => {
    const onGames = groupKey === "gameResult";
    const merged = onGames ? formToServer(decodeGameSearch(formRaw))
      : { any: undefined, linked: undefined };
    if (!onGames) { setServerGames(null); setServerBusy(false); return undefined; }
    const y9 = restore9.current;
    let dead = false;
    setServerGames(null);
    setServerBusy(true);
    (async () => {
      const q9 = { any: merged.any, linked: merged.linked, limit: 100, sort: "latest" as const, ...tabQuery(gameTab) };
      let page = await api.getGameResultsPage(q9);
      const items = page.items.map((m) => gameResultItem(m));
      const show = () => flushSync(() => setServerGames({ items: [...items], total: page.total ?? items.length, cursor: page.nextCursor }));
      if (dead) return;
      show();
      if (y9 === null) return;
      while (document.documentElement.scrollHeight < y9 + window.innerHeight && page.nextCursor && !dead) {
        page = await api.getGameResultsPage({ ...q9, cursor: page.nextCursor });
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

  const loadMoreGames = useCallback(async () => {
    const cursor = serverGames?.cursor;
    if (!cursor || moreBusy || serverBusy) return;
    setMoreBusy(true);
    try {
      const merged = formToServer(decodeGameSearch(formRaw));
      const page = await api.getGameResultsPage({
        any: merged.any, linked: merged.linked, limit: 100, sort: "latest",
        ...tabQuery(gameTab), cursor,
      });
      setServerGames((prev) => (prev && prev.cursor === cursor ? {
        total: prev.total,
        items: [...prev.items, ...page.items.map((m) => gameResultItem(m))],
        cursor: page.nextCursor,
      } : prev));
    } catch {
    } finally {
      setMoreBusy(false);
    }
  }, [serverGames?.cursor, moreBusy, serverBusy, formRaw, gameTab]);

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
  const challengeMatchesTerm = (c: Challenge, term: string): boolean => {
    const names = [c.createdBy.nickname, ...c.ownMembers.map((m) => m.nickname), ...c.targets.map((t) => t.nickname)];
    if (names.some((n) => normalizeSearchText(n).includes(term))) return true;
    const ids = [c.createdBy.id, ...c.ownMembers.map((m) => m.memberId), ...c.targets.map((t) => t.memberId)];
    return ids.some((id) => { const m = memberOf(id); return !!m && memberMatchesTerm(m, term); });
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
      if (item.kind === "challenge") {
        return searchTerms.every((term) => challengeMatchesTerm(item.challenge, term));
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
          {groupKey === "gameResult" && (
            <div className="scr-crumb-tools">
              <button
                type="button" className="scr-compact-rect-btn"
                onClick={() => requestScreen("scraps")}
              >
                <Bookmark size={13} />
                <span>스크랩</span>
              </button>
              <button
                type="button" className="scr-compact-rect-btn"
                onClick={() => requestScreen("guide")}
              >
                <BookOpen size={13} />
                <span>사용법</span>
              </button>
            </div>
          )}
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
          total={selectable.length} count={pickedItems.length}
          onSelectAll={() => selection.setMany(selectable.map(rowKeyOf), true)}
          onClear={selection.clear}
          /* 안내 줄(selectionNote)은 안 띄운다(2026-10-13, 요청: "안내 문구도 굳이 안 보여 주기") — 못 고르는 줄은 눌렀을 때의 풍선(disabledTitle)이 말한다. */
          mode={selection.mode} onExit={selection.exit}
        >
          <SelectionActions
            picked={pickedItems} onDelete={onDeleteItems} onHide={onHideItems}
            onScrap={onScrapItems} scrapBusy={scrapBusy}
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
