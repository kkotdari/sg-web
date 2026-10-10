import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
import RankingShiftCard, { RankingShiftMenu } from "./RankingShiftCard";
import LeagueMatchCard from "./LeagueMatchCard";
import ComingMatches, { pickComingMatches } from "./ComingMatches";
import { ArrowLeft, BookOpen, CalendarPlus, ClipboardList, MoreHorizontal, Phone, Upload, Bookmark } from "lucide-react";
import { Spinner, LoadingMark } from "../../components/common/Feedback";
import SearchFilterBar from "../../components/common/SearchFilterBar";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import KakaoShareButton from "../../components/common/KakaoShareButton";
import { challengePhoto, shareThumb } from "../../utils/kakaoShare";
import GameResultCardBody, { GameResultActionsMenu, type SearchListRow } from "./GameResultCardBody";
import { GameDetailCloseContext } from "./gameDetailClose";
import { GameRowNames, GameRowStatus, ListRow } from "./GameRow";
import { ActivityCard } from "./ActivityCard";
import GameResultStory from "./GameResultStory";
import { isMeleeGame, meleeLineup, teamSummaryName } from "./GameResultSides";
import { ChallengeCard, ChallengeTimeHeadEdit, challengeStatusInfo } from "../challenge/ChallengeScreen";
import ReplayReviewModal from "../../modals/ReplayReviewModal";
import ActivityComments, { primeActivityComments, commentStatOf, subscribeComments } from "./ActivityComments";
import { primeReplayMaps, useReplayMapTick, SCENE_LINK_KEYS9 } from "scplay";
import ChallengeFormModal from "../../modals/ChallengeFormModal";
import ScheduleFormModal from "../../modals/ScheduleFormModal";
import ScheduleCard from "./ScheduleCard";
import { formatWhen, formatAgo, serverMs } from "../../utils/date";
import { useAppStore } from "../../store/appStore";
import { isAdminRole } from "../../constants/roles";
import {
  activeMemberSearchTerms, memberMatchesTerm, normalizeSearchText, splitSearchTerms,
} from "../../utils/memberSearch";
import { buildLexicon, gameSuggestions, toServerMerged } from "../../utils/gameSearch";
import { cx } from "../../utils/format";
import { api } from "../../api/client";
import { navigateTo, parseRoute, pathOf, type ActivityGroupKey } from "../../utils/route";
import { gamePlayable } from "../../utils/gamePlayable";
import { showAlert } from "../../components/common/AlertDialog";
import { showToast } from "../../components/common/Toast";
import { useUrlState } from "../../hooks/useUrlState";
import { useCursorPagination } from "../../hooks/useCursorPagination";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useEditableFocused } from "../../hooks/useEditableFocused";
import { useSelection, type Selection } from "../../hooks/useSelection";
import { RowCheck, SelectionBar } from "../../components/common/Selection";
import { batchSummary, runBatch } from "../../utils/batch";
import { canManageGame, isSecretGame } from "../../utils/gameAccess";
import {
  buildReplayDrafts, type ReplayDraft,
} from "../../utils/replayDraft";
import { hasAppUpdatePreloadErrorOccurred } from "../../utils/appUpdate";
import type {
  ActivityFeedItem, Challenge, ActivityTargetType, GameResult, GameResultSlot,
  ActivityNotice, LeagueMatchActivity, Member, RankingShift, Schedule,
} from "../../types";

const PAGE_SIZE = 100;
const MAX_REPLAY_FILES = 20;



const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;
const STATUS_FADED = new Set(["거절", "버림", "만료", "취소", "미실시", "완료"]);
const ROW_VOID = new Set(["거절", "버림", "만료", "취소", "미실시"]);
const TOUCHED_SLACK_MS = 5000;

interface ChallengeItem {
  kind: "challenge";
  time: number;
  withClock: boolean;
  sortTime: number;
  undated: boolean;
  challenge: Challenge;
}

export interface GameResultItem {
  kind: "gameResult";
  time: number;
  withClock: boolean;
  gameResult: GameResult;
}

interface RankingShiftItem {
  kind: "rankingShift";
  time: number;
  withClock: boolean;
  shift: RankingShift;
}

interface LeagueMatchItem {
  kind: "leagueMatch";
  time: number;
  withClock: boolean;
  match: LeagueMatchActivity;
}

interface ScheduleItem {
  kind: "schedule";
  time: number;
  withClock: boolean;
  sortTime: number;
  schedule: Schedule;
}

type ActivityItem =
  | ChallengeItem | GameResultItem | RankingShiftItem | LeagueMatchItem | ScheduleItem;

type DisplayItem = ActivityItem;

function sortMsOf(it: ActivityItem): number {
  return it.kind === "challenge" || it.kind === "schedule" ? it.sortTime : it.time;
}

function rankShiftItem(shift: RankingShift): RankingShiftItem {
  return {
    kind: "rankingShift",
    time: serverMs(shift.createdAt),
    withClock: true,
    shift,
  };
}

function challengeItem(c: Challenge): ChallengeItem {
  const ended = c.status === "discarded" && c.discardedAt;
  const iso = c.scheduledAt ?? (ended ? c.discardedAt! : c.createdAt);
  return {
    kind: "challenge",
    time: serverMs(iso),
    withClock: false,
    sortTime: challengeSortMs(c),
    undated: !c.scheduledDate && !ended,
    challenge: c,
  };
}

export function isUpcomingChallenge(it: { kind: string; challenge?: Challenge }): boolean {
  return it.kind === "challenge"
    && (it.challenge!.status === "pending" || it.challenge!.status === "confirmed");
}

const UNDATED_SORT_BASE = 4e15;

function challengeSortMs(c: Challenge): number {
  const base = serverMs(c.scheduledAt ?? c.createdAt);
  if (c.status === "pending" || c.status === "confirmed") {
    if (!c.scheduledDate) return UNDATED_SORT_BASE + serverMs(c.createdAt);
    const endOfDay = new Date(`${c.scheduledDate}T23:59:59`).getTime();
    return Math.max(endOfDay, Date.now() + 1);
  }
  if (!c.scheduledDate) {
    if (c.status === "discarded" && c.discardedAt) return serverMs(c.discardedAt);
    return base;
  }
  return new Date(`${c.scheduledDate}T00:00:00`).getTime() + SESSION_DAY_START_HOUR * 3600_000;
}

function scheduleItem(s: Schedule): ScheduleItem {
  const at = new Date(`${s.scheduledDate}T${s.scheduledTime || "23:59:59"}`).getTime();
  return {
    kind: "schedule",
    time: at,
    withClock: !!s.scheduledTime,
    sortTime: at > Date.now() ? Math.max(at, Date.now() + 1) : at,
    schedule: s,
  };
}

function leagueMatchItem(m: LeagueMatchActivity): LeagueMatchItem {
  return {
    kind: "leagueMatch",
    time: serverMs(m.scheduledAt ?? m.postedAt),
    withClock: true,
    match: m,
  };
}

export function gameResultItem(m: GameResult): GameResultItem {
  const started = m.gameStartedAt ? serverMs(m.gameStartedAt) : null;
  return {
    kind: "gameResult",
    time: started ?? new Date(`${m.date}T00:00:00`).getTime(),
    withClock: started != null,
    gameResult: m,
  };
}

const SESSION_DAY_START_HOUR = 8;
export function sessionDateOf(it: GameResultItem): string {
  const d = new Date(it.time);
  if (it.withClock && d.getHours() < SESSION_DAY_START_HOUR) d.setDate(d.getDate() - 1);
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function detailIdOf(it: DisplayItem): number | null {
  return it.kind === "challenge" ? it.challenge.id
    : it.kind === "schedule" ? it.schedule.id
      : it.kind === "rankingShift" ? it.shift.id
        : it.kind === "leagueMatch" ? it.match.id
          : null;
}

function detailGroupOf(it: DisplayItem): ActivityGroupKey | null {
  return it.kind === "challenge" ? "call"
    : it.kind === "schedule" ? "schedule"
      : it.kind === "rankingShift" ? "notice"
        : it.kind === "leagueMatch" ? "league"
          : null;
}

const GROUP_ITEM_KIND: Record<ActivityGroupKey, string> = {
  notice: "rankingShift",
  schedule: "schedule",
  league: "leagueMatch",
  call: "challenge",
  gameResult: "gameResult",
};

function rankShiftOfNotice(notice: ActivityNotice | null | undefined): RankingShift | null {
  if (!notice || notice.kind !== "rankingShift") return null;
  return {
    id: notice.id,
    reason: notice.payload.reason ?? "daily",
    createdAt: notice.createdAt,
    matchIds: notice.payload.matchIds ?? [],
    sections: notice.payload.sections ?? [],
  } as RankingShift;
}

function gameParamOf(): string | null {
  const r = parseRoute();
  return r.group === "gameResult" ? r.item : null;
}

function commentTargetOf(it: DisplayItem): { type: ActivityTargetType; id: number } {
  return it.kind === "challenge" ? { type: "challenge", id: it.challenge.id }
    : it.kind === "schedule" ? { type: "schedule", id: it.schedule.id }
      : it.kind === "rankingShift" ? { type: "rankingShift", id: it.shift.id }
        : it.kind === "leagueMatch" ? { type: "leagueMatch", id: it.match.id }
          : { type: "gameResult", id: it.gameResult.id };
}

function rowKeyOf(it: DisplayItem): string {
  return it.kind === "challenge" ? `c-${it.challenge.id}`
    : it.kind === "rankingShift" ? `rs-${it.shift.id}`
      : it.kind === "leagueMatch" ? `lm-${it.match.id}`
        : it.kind === "schedule" ? `sc-${it.schedule.id}`
          : `m-${it.gameResult.id}`;
}

function deletableOf(it: DisplayItem): boolean {
  return it.kind === "gameResult" || it.kind === "challenge" || it.kind === "schedule";
}

function bulkDeleteMessageOf(items: DisplayItem[]): string {
  const games = items.filter((it) => it.kind === "gameResult").length;
  const others = items.length - games;
  const parts: string[] = [];
  if (games > 0) parts.push(`게임 ${games}개는 목록·통계에서 사라지고, 운영자가 제어판의 '삭제된 경기'에서 복원할 수 있어요.`);
  if (others > 0) parts.push(`너 나와·일정 ${others}개는 되돌릴 수 없어요.`);
  return parts.join(" ");
}

const HIDE_FORMS = { did: "숨겼어요", couldNot: "숨기지 못했어요" };

function SelectionActions({ picked, onDelete, onHide }: {
  picked: DisplayItem[];
  onDelete: (items: DisplayItem[]) => void;
  onHide: (items: DisplayItem[]) => void;
}) {
  const games = picked.filter((it) => it.kind === "gameResult");
  const onlyGames = picked.length > 0 && games.length === picked.length;
  return (
    <>
      <button
        type="button" className="scr-pill-btn"
        disabled={!onlyGames}
        onClick={() => onHide(games)}
        title={onlyGames ? "고른 게임을 숨겨요" : "게임만 골랐을 때 켜져요"}
      >
        숨김
      </button>
      <button
        type="button" className="scr-pill-btn"
        disabled={picked.length === 0}
        onClick={() => onDelete(picked)}
        title={picked.length === 0 ? "고른 것이 없어요" : undefined}
      >
        삭제
      </button>
    </>
  );
}

const ROW_NAME_MAX = 1;

function nameNodes(names: string[]): ReactNode[] {
  return names.flatMap((n, i) => [
    ...(i > 0 ? [<span className="scr-activity-row-sep" key={`s${i}`}>·</span>] : []),
    <span className="scr-activity-row-em" key={`n${i}`}>{n}</span>,
  ]);
}

function namesWithRest(names: string[]): ReactNode {
  if (names.length === 0) return null;
  const rest = names.length - ROW_NAME_MAX;
  return (
    <>
      {nameNodes(names.slice(0, ROW_NAME_MAX))}
      {rest > 0 && <>{" 외 "}<span className="scr-activity-row-em">{rest}</span>{"명"}</>}
    </>
  );
}

function rowPhoto(item: DisplayItem): string | null {
  return item.kind === "challenge" ? item.challenge.backdropUrl : null;
}

export function sessionDateLabel(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

function ChallengeActionsMenu({ challenge, isAdmin, myId, onDeleted, onChanged }: {
  challenge: Challenge;
  isAdmin: boolean;
  myId: string;
  onDeleted: (id: number) => void;
  onChanged: (c: Challenge) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canCancel = (challenge.createdBy.id === myId || isAdmin)
    && (challenge.status === "pending" || challenge.status === "confirmed");

  const shareContent = () => {
    const caller = challenge.createdBy.nickname;
    return {
      title: `${caller ? `${caller}님` : "누군가"}의 호출`,
      description: "누가 호출됐을까요? 👀 탭해서 확인하기",
      ...shareThumb("challengeCall", challengePhoto(challenge)),
      link: `${window.location.origin}/?sv=challenge&sid=${challenge.id}`,
      fallbackText: `[스타게이트] ${caller ? `${caller}님` : "누군가"}의 호출이 도착했어요! 열어서 확인해보세요.`,
    };
  };

  const remove = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.deleteChallenge(challenge.id);
      onDeleted(challenge.id);
      setConfirmOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    setErr(null);
    try {
      onChanged(await api.cancelChallenge(challenge.id));
      setCancelOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "취소하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scr-activity-chal-menu">
      <button
        type="button" className="scr-activity-post-menu-btn scr-activity-kebab-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="더보기" aria-haspopup="menu" aria-expanded={open}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <>
          <div
            className="scr-activity-add-backdrop"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            aria-hidden
          />
          <div className="scr-menu-pop-drop scr-activity-chal-menu-drop" role="menu">
            <KakaoShareButton variant="menu" content={shareContent} onDone={() => setOpen(false)} />
            {canCancel && (
              <button
                type="button" role="menuitem" className="scr-menu-pop-opt"
                onClick={() => { setOpen(false); setCancelOpen(true); }}
              >
                취소
              </button>
            )}
            {isAdmin && (
              <button
                type="button" role="menuitem"
                className={cx("scr-menu-pop-opt", "scr-activity-post-menu-opt-danger")}
                onClick={() => { setOpen(false); setConfirmOpen(true); }}
              >
                삭제
              </button>
            )}
          </div>
        </>
      )}
      {confirmOpen && (
        <ConfirmDialog
          title="너 나와! 삭제"
          message="이 너 나와!를 완전히 삭제할까요? 되돌릴 수 없어요."
          confirmLabel={busy ? "삭제 중..." : "삭제"}
          error={err}
          onConfirm={() => void remove()}
          onCancel={() => { setConfirmOpen(false); setErr(null); }}
        />
      )}
      {cancelOpen && (
        <ConfirmDialog
          title="너 나와! 취소"
          message="이 호출을 거둬들일까요? 활동에는 취소로 남아요."
          confirmLabel={busy ? "취소 중..." : "취소하기"}
          cancelLabel="그냥 둘래요"
          error={err}
          onConfirm={() => void cancel()}
          onCancel={() => { setCancelOpen(false); setErr(null); }}
        />
      )}
    </div>
  );
}

function ActivityCardComments({ targetType, targetId, overModal }: {
  targetType: ActivityTargetType; targetId: number; overModal?: boolean;
}) {
  return <ActivityComments targetType={targetType} targetId={targetId} overModal={overModal} />;
}

export const GameResultCard = memo(function GameResultCard({ item, memberOf, onDeleted, onChanged, dateLabel, highlightMemberIds, highlightTerms, active = true, className }: {
  item: GameResultItem;
  memberOf: (id: string) => Member | undefined;
  onDeleted: (id: number) => void;
  onChanged: (m: GameResult) => void;
  dateLabel: string;
  highlightMemberIds?: Set<string>;
  highlightTerms?: string[];
  active?: boolean;
  className?: string;
}) {
  const rows: SearchListRow[] = useMemo(() => {
    const m = item.gameResult;
    return [{ id: m.id, date: m.date, team1: m.team1, team2: m.team2, result: m.result, raw: m }];
  }, [item.gameResult]);

  return (
    <ActivityCard
      className={className}
      dateLabel={dateLabel}
      icon={<ClipboardList size={16} aria-hidden />}
      label="게임결과"
      timeText={formatWhen(item.time, { clock: item.withClock })}
      bodyClassName="scr-activity-game-result-body"
      comment={<ActivityCardComments targetType="gameResult" targetId={item.gameResult.id} />}
    >
      <GameResultCardBody rows={rows} memberOf={memberOf} onDeleted={onDeleted} onChanged={onChanged} highlightMemberIds={highlightMemberIds} highlightTerms={highlightTerms} active={active} />
    </ActivityCard>
  );
});

const GROUP_DEFS: { key: ActivityGroupKey; label: string }[] = [
  { key: "notice", label: "알림" },
  { key: "schedule", label: "일정" },
  { key: "league", label: "리그" },
  { key: "call", label: "너 나와!" },
  { key: "gameResult", label: "게임" },
];

const GROUP_SCREEN_CODE: Record<ActivityGroupKey, string> = {
  notice: "activity_notice",
  schedule: "activity_schedule",
  league: "activity_league",
  call: "activity_call",
  gameResult: "activity_game",
};

function groupFromUrl(): ActivityGroupKey | null {
  const r = parseRoute();
  return r.item !== null || r.group === "league" ? null : r.group;
}

function groupKeyOf(item: ActivityItem): ActivityGroupKey {
  return item.kind === "gameResult" ? "gameResult"
    : item.kind === "challenge" ? "call"
    : item.kind === "leagueMatch" ? "league"
    : item.kind === "schedule" ? "schedule"
    : "notice";
}

const GROUP_PREVIEW_MAX = 3;
const GAME_PREVIEW_MAX = 10;
const previewMaxOf = (k: ActivityGroupKey): number =>
  (k === "gameResult" ? GAME_PREVIEW_MAX : GROUP_PREVIEW_MAX);

const SEARCHABLE_GROUPS = new Set<ActivityGroupKey>(["league", "call", "gameResult"]);

function isClanGame(item: ActivityItem, memberOf: (id: string) => Member | undefined): boolean {
  if (item.kind !== "gameResult") return true;
  const slots = [...item.gameResult.team1, ...item.gameResult.team2];
  return slots.every((slot) => !!memberOf(slot.memberId));
}

type GameTab = "clan" | "pub";
const GAME_TAB_OPTIONS: { value: GameTab; label: string }[] = [
  { value: "clan", label: "내전" },
  { value: "pub", label: "공방" },
];
function inGameTab(item: ActivityItem, tab: GameTab, memberOf: (id: string) => Member | undefined): boolean {
  if (item.kind !== "gameResult") return true;
  return isClanGame(item, memberOf) === (tab === "clan");
}
function GameTabs({ value, onChange }: { value: GameTab; onChange: (next: GameTab) => void }) {
  return (
    <div className="scr-activity-game-tabs" role="tablist" aria-label="내전·공방">
      {GAME_TAB_OPTIONS.map((o) => (
        <button
          key={o.value} type="button" role="tab"
          aria-selected={o.value === value}
          className={cx("scr-activity-game-tab", o.value === value && "is-on")}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ActivityGroupPage({
  groupKey, label, items, memberOf, members, renderRow, onBack,
  gameTab, onGameTabChange,
  selection, canPick, selectionNote, onDeleteItems, onHideItems, refreshKey,
}: {
  groupKey: ActivityGroupKey;
  label: string;
  items: ActivityItem[];
  memberOf: (id: string) => Member | undefined;
  members: Member[];
  selection: Selection | null;
  canPick: (it: DisplayItem) => boolean;
  selectionNote: string;
  onDeleteItems: (items: DisplayItem[]) => void;
  onHideItems: (items: DisplayItem[]) => void;
  refreshKey: number;
  gameTab: GameTab;
  onGameTabChange: (next: GameTab) => void;
  renderRow: (item: DisplayItem) => ReactNode;
  onBack: () => void;
}) {
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
  const [serverGames, setServerGames] = useState<
    { items: ActivityItem[]; total: number; cursor: string | null } | null
  >(null);
  const [serverBusy, setServerBusy] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  useEffect(() => {
    const onGames = groupKey === "gameResult";
    const merged = onGames ? toServerMerged(searchApplied, lexRef.current)
      : { any: undefined, linked: undefined };
    if (!onGames) { setServerGames(null); setServerBusy(false); return undefined; }
    let dead = false;
    setServerGames(null);
    setServerBusy(true);
    api.getGameResultsPage({
      any: merged.any, linked: merged.linked, limit: 100, sort: "latest",
      membersOnly: gameTab === "clan" || undefined,
      pubOnly: gameTab === "pub" || undefined,
    })
      .then((page) => {
        if (dead) return;
        setServerGames({
          items: page.items.map((m) => gameResultItem(m)),
          total: page.total ?? page.items.length,
          cursor: page.nextCursor,
        });
      })
      .catch(() => { if (!dead) setServerGames(null); })
      .finally(() => { if (!dead) setServerBusy(false); });
    return () => { dead = true; };
  }, [groupKey, searchApplied, gameTab, refreshKey]);

  const loadMoreGames = useCallback(async () => {
    const cursor = serverGames?.cursor;
    if (!cursor || moreBusy || serverBusy) return;
    setMoreBusy(true);
    try {
      const merged = toServerMerged(searchApplied, lexRef.current);
      const page = await api.getGameResultsPage({
        any: merged.any, linked: merged.linked, limit: 100, sort: "latest",
        membersOnly: gameTab === "clan" || undefined, pubOnly: gameTab === "pub" || undefined, cursor,
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
  }, [serverGames?.cursor, moreBusy, serverBusy, searchApplied, gameTab]);

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

  useLayoutEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [groupKey]);

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
      {searchable && (
        <SearchFilterBar
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
          note={selectable.length < filtered.length ? selectionNote : undefined}
        >
          <SelectionActions
            picked={pickedItems} onDelete={onDeleteItems} onHide={onHideItems}
          />
        </SelectionBar>
      )}
      <div className="scr-activity-rows scr-activity-group-page-rows">
        {filtered.length === 0 ? (
          <div className="scr-empty">{serverBusy ? "찾는 중…" : "결과가 없어요"}</div>
        ) : (
          filtered.map((item) => renderRow(item))
        )}
        {serverGames?.cursor && (
          <div ref={moreRef} className="scr-activity-more-sentinel">
            {moreBusy && <LoadingMark />}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ActivityScreen() {
  useReplayMapTick();
  const [openGroupKey, setOpenGroupKey] = useState<ActivityGroupKey | null>(groupFromUrl);
  const pushedGroupRef = useRef(false);
  const isMobile = useIsMobile();
  const homeScrollRef = useRef(0);
  const openGroup = (key: ActivityGroupKey) => {
    homeScrollRef.current = window.scrollY;
    setOpenGroupKey(key);
    const params = new URLSearchParams(window.location.search);
    params.delete("u");
    params.delete("q");
    navigateTo(pathOf({ screen: "activity", group: key }), { search: params.toString(), notify: false });
    pushedGroupRef.current = true;
    void api.pingAccess(GROUP_SCREEN_CODE[key]);
  };
  const closeGroup = () => {
    if (pushedGroupRef.current) {
      window.history.back();
      return;
    }
    navigateTo("/", { replace: true, search: window.location.search, notify: false });
    setOpenGroupKey(null);
  };
  useEffect(() => {
    const onPop = () => {
      pushedGroupRef.current = false;
      setOpenGroupKey(groupFromUrl());
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (openGroupKey) void api.pingAccess(GROUP_SCREEN_CODE[openGroupKey]);
  }, []);

  const [gameItem, setGameItem] = useState<DisplayItem | null>(null);
  const pushedGameRef = useRef(false);
  const [itemMiss, setItemMiss] = useState(false);
  const directAdd: (() => void) | null =
    openGroupKey === "gameResult" ? () => replayInputRef.current?.click()
      : openGroupKey === "call" ? () => setChallengeFormOpen(true)
        : openGroupKey === "schedule" ? () => setScheduleForm("new")
          : null;
  const openGamePage = (item: DisplayItem) => {
    if (item.kind !== "gameResult") return;
    setGameItem(item);
    const params = new URLSearchParams(window.location.search);
    for (const k9 of SCENE_LINK_KEYS9) params.delete(k9);
    params.delete("u");
    params.delete("q");
    navigateTo(
      pathOf({ screen: "activity", group: "gameResult", item: item.gameResult.matchNo || String(item.gameResult.id) }),
      { search: params.toString(), notify: false },
    );
    pushedGameRef.current = true;
  };
  const pingedGameRef = useRef<number | null>(null);
  useEffect(() => {
    if (!gameItem || gameItem.kind !== "gameResult") {
      pingedGameRef.current = null;
      return;
    }
    const id = gameItem.gameResult.id;
    if (pingedGameRef.current === id) return;
    pingedGameRef.current = id;
    const no9 = gameItem.gameResult.matchNo || String(id);
    void api.pingAccess("activity_game", `game#${no9}`);
    void api.markGameViewed(id).catch(() => {});
  }, [gameItem]);
  const closeGamePage = () => {
    if (pushedGameRef.current) {
      window.history.back();
      return;
    }
    const params = new URLSearchParams(window.location.search);
    for (const k9 of SCENE_LINK_KEYS9) params.delete(k9);
    navigateTo("/games", { replace: true, search: params.toString(), notify: false });
    setGameItem(null);
  };
  useLayoutEffect(() => {
    if (gameItem) window.scrollTo({ top: 0, behavior: "instant" });
  }, [gameItem]);
  const gotoGroupList = (key: ActivityGroupKey) => {
    if (pushedGameRef.current || pushedDetailRef.current) {
      pushedGameRef.current = false;
      pushedDetailRef.current = false;
      window.history.back();
      return;
    }
    const params = new URLSearchParams(window.location.search);
    for (const k9 of SCENE_LINK_KEYS9) params.delete(k9);
    if (key === "league") {
      navigateTo(pathOf({ screen: "activity" }), { replace: true, search: params.toString(), notify: false });
      setGameItem(null);
      setDetailItem(null);
      setOpenGroupKey(null);
      return;
    }
    navigateTo(pathOf({ screen: "activity", group: key }), { replace: true, search: params.toString(), notify: false });
    setGameItem(null);
    setDetailItem(null);
    if (openGroupKey !== key) {
      setOpenGroupKey(key);
      void api.pingAccess(GROUP_SCREEN_CODE[key]);
    }
    pushedGroupRef.current = pushedGameRef.current || pushedDetailRef.current || pushedGroupRef.current;
    pushedGameRef.current = false;
    pushedDetailRef.current = false;
  };
  const gotoGameList = () => gotoGroupList("gameResult");
  useLayoutEffect(() => {
    if (openGroupKey === null && homeScrollRef.current > 0) {
      window.scrollTo({ top: homeScrollRef.current, behavior: "instant" });
    }
  }, [openGroupKey]);

  const [detailItem, setDetailItem] = useState<DisplayItem | null>(null);
  const routeItemPending = parseRoute().item !== null && gameItem === null && detailItem === null && !itemMiss;
  const pushedDetailRef = useRef(false);
  const openDetailPage = (item: DisplayItem) => {
    const id9 = detailIdOf(item);
    if (id9 === null) return;
    const group9 = detailGroupOf(item);
    if (group9 === null) return;
    setDetailItem(item);
    const params = new URLSearchParams(window.location.search);
    for (const k9 of SCENE_LINK_KEYS9) params.delete(k9);
    params.delete("u");
    params.delete("q");
    navigateTo(pathOf({ screen: "activity", group: group9, item: String(id9) }), { search: params.toString(), notify: false });
    pushedDetailRef.current = true;
  };
  const closeDetailPage = () => {
    if (pushedDetailRef.current) {
      window.history.back();
      return;
    }
    navigateTo(pathOf({ screen: "activity", group: parseRoute().group }), { replace: true, search: window.location.search, notify: false });
    setDetailItem(null);
  };
  useEffect(() => {
    const onNav = () => { pushedDetailRef.current = false; setDetailItem(null); };
    window.addEventListener("scr-screen-nav", onNav);
    return () => window.removeEventListener("scr-screen-nav", onNav);
  }, []);
  useLayoutEffect(() => {
    if (detailItem) window.scrollTo({ top: 0, behavior: "instant" });
  }, [detailItem]);
  const pingedDetailRef = useRef<string | null>(null);
  useEffect(() => {
    if (!detailItem) { pingedDetailRef.current = null; return; }
    const id9 = detailIdOf(detailItem);
    if (id9 === null) return;
    const group9 = detailGroupOf(detailItem);
    if (group9 === null) return;
    const mark9 = `${group9}#${id9}`;
    if (pingedDetailRef.current === mark9) return;
    pingedDetailRef.current = mark9;
    void api.pingAccess(GROUP_SCREEN_CODE[group9], mark9);
  }, [detailItem]);

  const user = useAppStore((s) => s.user);
  const isAdmin = !!user && isAdminRole(user.roles);
  const sel = useSelection();
  const selection = user && openGroupKey ? sel : null;
  const selClear = sel.clear;
  useEffect(() => { selClear(); }, [selClear, openGroupKey, gameItem, detailItem]);
  const canPick = useCallback((it: DisplayItem): boolean => {
    if (it.kind === "gameResult" && isSecretGame(it.gameResult)) return false;
    if (isAdmin) return deletableOf(it);
    return it.kind === "gameResult" && canManageGame(it.gameResult, user);
  }, [isAdmin, user]);
  const selectionNote = isAdmin ? "알림·리그 경기는 여기서 지울 수 없어요." : "내가 뛴 게임만 고를 수 있어요.";
  const memberOf = useAppStore((s) => s.memberOf);
  const [gameTabRaw, setGameTabRaw] = useUrlState("tab");
  const gameTab: GameTab = gameTabRaw === "pub" ? "pub" : "clan";
  const setGameTab = useCallback(
    (next: GameTab) => setGameTabRaw(next === "pub" ? "pub" : ""), [setGameTabRaw],
  );
  const deleteGameResultAction = useAppStore((s) => s.deleteGameResult);
  const [gamePageDelete, setGamePageDelete] = useState<GameResult | null>(null);
  const [gamePageDeleting, setGamePageDeleting] = useState(false);
  const [gamePageDeleteErr, setGamePageDeleteErr] = useState<string | null>(null);
  const members = useAppStore((s) => s.members);

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const fabHidden = useEditableFocused();
  useEffect(() => {
    if (fabHidden) setAddMenuOpen(false);
  }, [fabHidden]);

  const replayInputRef = useRef<HTMLInputElement>(null);
  const [parsingReplays, setParsingReplays] = useState(false);
  const [reviewDrafts, setReviewDrafts] = useState<ReplayDraft[] | null>(null);
  const pendingNoticeRef = useRef<{ text: string; kind: "success" | "error" } | null>(null);
  const [challengeFormOpen, setChallengeFormOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState<Schedule | "new" | null>(null);

  const [error, setError] = useState("");

  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const fetchPage = useCallback(
    async (cursor: string | null): Promise<{
      items: ActivityFeedItem[]; nextCursor: string | null; hasMore: boolean; total: number;
    }> => {
      const page = await api.listActivityFeed({ cursor: cursor ?? undefined, limit: PAGE_SIZE });
      return { ...page, hasMore: page.nextCursor !== null, total: page.totalActivities };
    },
    [],
  );
  const {
    items: feedItems, loading: feedLoading, loadingMore, hasMore, loadMore, reload,
    patch: patchFeed,
  } = useCursorPagination(fetchPage, []);

  const challenges = useMemo(
    () => feedItems.flatMap((it) => (it.challenge ? [it.challenge] : [])),
    [feedItems],
  );
  const gameResults = useMemo(() => feedItems.flatMap((it) => it.gameResults), [feedItems]);
  const rankShifts = useMemo(
    () => feedItems.flatMap((it) => {
      const made = rankShiftOfNotice(it.notice);
      return made ? [made] : [];
    }),
    [feedItems],
  );
  const leagueMatches = useMemo(
    () => feedItems.flatMap((it) => (it.leagueMatch ? [it.leagueMatch] : [])),
    [feedItems],
  );
  const comingMatches = useMemo(() => pickComingMatches(leagueMatches), [leagueMatches]);
  const schedules = useMemo(
    () => feedItems.flatMap((it) => (it.schedule ? [it.schedule] : [])),
    [feedItems],
  );
  useEffect(() => {
    if (feedItems.length === 0) return;
    void primeActivityComments(feedItems.flatMap((it) => it.comments));
  }, [feedItems]);

  const upsertChallenge = (updated: Challenge) => {
    patchFeed((prev) => {
      const hit = prev.some((it) => it.challenge?.id === updated.id);
      if (hit) {
        return prev.map((it) => (it.challenge?.id === updated.id ? { ...it, challenge: updated } : it));
      }
      reload();
      return [{
        key: `c-${updated.id}`, kind: "challenge" as const,
        challenge: updated, gameResults: [], comments: [],
      }, ...prev];
    });
  };

  const upsertSchedule = (updated: Schedule) => {
    patchFeed((prev) => {
      const hit = prev.some((it) => it.schedule?.id === updated.id);
      if (hit) {
        return prev.map((it) => (it.schedule?.id === updated.id ? { ...it, schedule: updated } : it));
      }
      reload();
      return [{
        key: `sc-${updated.id}`, kind: "schedule" as const,
        schedule: updated, gameResults: [], comments: [],
      }, ...prev];
    });
  };

  const sentinelRef = useRef<HTMLDivElement>(null);

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

  const loading = feedLoading || mapsLoading;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && hasMore && !feedLoading && !loadingMore) {
        loadMore();
      }
    }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, feedLoading, loadingMore, loadMore]);

  const handleReplaysSaved = useCallback(async () => { reload(); }, [reload]);

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

  const feed = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [
      ...challenges.map(challengeItem),
      ...gameResults.map(gameResultItem),
      ...rankShifts.map(rankShiftItem),
      ...leagueMatches.map(leagueMatchItem),
      ...schedules.map(scheduleItem),
    ];
    const sorted = items.sort((a, b) => sortMsOf(b) - sortMsOf(a));
    return sorted.filter((it) => inGameTab(it, gameTab, memberOf));
  }, [challenges, gameResults, rankShifts, leagueMatches, schedules, gameTab, memberOf]);

  const feedRef = useRef<DisplayItem[]>([]);
  feedRef.current = feed;
  useEffect(() => {
    if (gameItem) return undefined;
    const idText = gameParamOf();
    if (!idText) return undefined;
    const id = Number(idText);
    const hit = feed.find((it) => it.kind === "gameResult"
      && (it.gameResult.matchNo === idText || it.gameResult.id === id));
    if (hit) {
      setGameItem(hit);
      return undefined;
    }
    let cancelled = false;
    api.getGameResult(id)
      .then((gr) => { if (!cancelled) setGameItem(gameResultItem(gr)); })
      .catch(() => { if (!cancelled) setItemMiss(true); });
    return () => { cancelled = true; };
  }, [feed, gameItem]);
  useEffect(() => {
    if (detailItem) return undefined;
    const r9 = parseRoute();
    const idText = r9.item;
    const group9 = r9.group;
    if (!idText || !group9 || group9 === "gameResult" || !(group9 in GROUP_ITEM_KIND)) {
      return undefined;
    }
    const id9 = Number(idText);
    if (!Number.isFinite(id9)) return undefined;
    const hit = feed.find((it) => detailGroupOf(it) === group9 && detailIdOf(it) === id9);
    if (hit) { setDetailItem(hit); return undefined; }
    let cancelled = false;
    api.getActivityItem(GROUP_ITEM_KIND[group9], id9)
      .then((row) => {
        if (cancelled) return;
        const shift9 = rankShiftOfNotice(row.notice);
        const made = row.challenge ? challengeItem(row.challenge)
          : row.schedule ? scheduleItem(row.schedule)
            : row.leagueMatch ? leagueMatchItem(row.leagueMatch)
              : shift9 ? rankShiftItem(shift9) : null;
        if (made) setDetailItem(made);
      })
      .catch(() => { if (!cancelled) setItemMiss(true); });
    return () => { cancelled = true; };
  }, [feed, detailItem]);
  useEffect(() => {
    const onPop = () => {
      pushedDetailRef.current = false;
      setItemMiss(false);
      const r9 = parseRoute();
      const idText = r9.item;
      const group9 = r9.group;
      setDetailItem((cur) => {
        if (!idText || !group9 || group9 === "gameResult") return null;
        const id9 = Number(idText);
        if (cur && detailGroupOf(cur) === group9 && detailIdOf(cur) === id9) return cur;
        return feedRef.current.find(
          (it) => detailGroupOf(it) === group9 && detailIdOf(it) === id9,
        ) ?? null;
      });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    const onPop = () => {
      pushedGameRef.current = false;
      setItemMiss(false);
      const idText = gameParamOf();
      const id = idText ? Number(idText) : null;
      setGameItem((cur) => {
        if (id === null || !idText) return null;
        const match = (gr: { matchNo: string; id: number }): boolean =>
          gr.matchNo === idText || gr.id === id;
        if (cur && cur.kind === "gameResult" && match(cur.gameResult)) return cur;
        return feedRef.current.find((it) => it.kind === "gameResult" && match(it.gameResult)) ?? null;
      });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (!gameItem || gameItem.kind !== "gameResult") return undefined;
    const gr = gameItem.gameResult;
    const melee9 = isMeleeGame({ matchType: gr.matchType, team1: gr.team1, team2: gr.team2 });
    const line9 = melee9
      ? meleeLineup(gr.team1, gr.team2, memberOf)
      : `${teamSummaryName(gr.team1, memberOf) || "팀1"} vs ${teamSummaryName(gr.team2, memberOf) || "팀2"}`;
    const [, mo, da] = gr.date.split("-").map(Number);
    const prev = document.title;
    document.title = `${line9} ${mo}월 ${da}일`;
    return () => { document.title = prev; };
  }, [gameItem, memberOf]);

  const touchMsOf = (it: DisplayItem): number => {
    if (it.kind === "challenge") {
      return Math.max(serverMs(it.challenge.createdAt), serverMs(it.challenge.updatedAt));
    }
    if (it.kind === "leagueMatch") {
      return Math.max(serverMs(it.match.postedAt), serverMs(it.match.updatedAt));
    }
    if (it.kind === "schedule") {
      return Math.max(serverMs(it.schedule.createdAt), serverMs(it.schedule.updatedAt));
    }
    if (it.kind === "rankingShift") return serverMs(it.shift.createdAt);
    return it.time;
  };

  const [, bumpComments] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribeComments(bumpComments), []);

  const rowFlagsOf = (it: DisplayItem): ("new" | "update")[] => {
    const now = Date.now();
    const fresh = (ms: number) => now - ms >= 0 && now - ms <= NEW_WINDOW_MS;
    if (it.kind === "challenge") {
      const created = serverMs(it.challenge.createdAt);
      const updated = serverMs(it.challenge.updatedAt);
      const flags: ("new" | "update")[] = [];
      if (fresh(created)) flags.push("new");
      if (updated - created > TOUCHED_SLACK_MS && fresh(updated)) flags.push("update");
      return flags;
    }
    if (it.kind === "leagueMatch") {
      const posted = serverMs(it.match.postedAt);
      const updated = serverMs(it.match.updatedAt);
      const flags: ("new" | "update")[] = [];
      if (fresh(posted)) flags.push("new");
      if (updated - posted > TOUCHED_SLACK_MS && fresh(updated)) flags.push("update");
      return flags;
    }
    if (it.kind === "schedule") {
      const created = serverMs(it.schedule.createdAt);
      const updated = serverMs(it.schedule.updatedAt);
      const flags: ("new" | "update")[] = [];
      if (fresh(created)) flags.push("new");
      if (updated - created > TOUCHED_SLACK_MS && fresh(updated)) flags.push("update");
      return flags;
    }
    if (it.kind === "rankingShift") return fresh(serverMs(it.shift.createdAt)) ? ["new"] : [];
    return fresh(it.time) ? ["new"] : [];
  };

  const liveDetailItem = useMemo(() => {
    if (!detailItem) return null;
    const key = rowKeyOf(detailItem);
    return feed.find((it) => rowKeyOf(it) === key) ?? detailItem;
  }, [detailItem, feed]);

  const groupedSections = useMemo(() => {
    const buckets = new Map<ActivityGroupKey, ActivityItem[]>();
    for (const g of GROUP_DEFS) buckets.set(g.key, []);
    for (const item of feed) buckets.get(groupKeyOf(item))!.push(item);
    const withFlags = GROUP_DEFS
      .map((g, order) => {
        const items = buckets.get(g.key)!;
        let freshAt = 0;
        for (const it of items) { if (rowFlagsOf(it).length > 0) freshAt = Math.max(freshAt, it.time); }
        return { ...g, order, items, freshAt };
      })
      .filter((s) => s.items.length > 0 && s.key !== "league");
    withFlags.sort((a, b) => {
      if ((a.freshAt > 0) !== (b.freshAt > 0)) return a.freshAt > 0 ? -1 : 1;
      if (a.freshAt !== b.freshAt) return b.freshAt - a.freshAt;
      return a.order - b.order;
    });
    return withFlags;
  }, [feed]);

  const homePreview = useMemo(() => groupedSections.map((section) => ({
    ...section,
    rows: [...section.items].sort((a, b) => touchMsOf(b) - touchMsOf(a)).slice(0, previewMaxOf(section.key)),
  })), [groupedSections]);

  const handleGameResultDeleted = useCallback((id: number) => {
    setDetailItem((it) => (it && it.kind === "gameResult" && it.gameResult.id === id ? null : it));
    setGameItem((it) => {
      if (it && it.kind === "gameResult" && it.gameResult.id === id) {
        navigateTo("/games", { replace: true, notify: false });
        return null;
      }
      return it;
    });
    patchFeed((prev) => prev
      .map((it) => (it.gameResults.some((g) => g.id === id)
        ? { ...it, gameResults: it.gameResults.filter((g) => g.id !== id) }
        : it))
      .filter((it) => !!it.challenge || !!it.notice || it.gameResults.length > 0));
    reload();
  }, [patchFeed, feed, reload]);

  const [bulkConfirm, setBulkConfirm] = useState<DisplayItem[] | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkErr, setBulkErr] = useState<string | null>(null);
  const [groupRefreshKey, setGroupRefreshKey] = useState(0);
  const askBulkDelete = useCallback((items: DisplayItem[]) => {
    if (items.length === 0) return;
    setBulkErr(null);
    setBulkConfirm(items);
  }, []);
  const runBulkDelete = useCallback(async (items: DisplayItem[]) => {
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
      patchFeed((prev) => prev
        .map((it) => (it.gameResults.some((g) => gameIds.has(g.id))
          ? { ...it, gameResults: it.gameResults.filter((g) => !gameIds.has(g.id)) }
          : it))
        .filter((it) => !(it.challenge && challengeIds.has(it.challenge.id)))
        .filter((it) => !(it.schedule && scheduleIds.has(it.schedule.id)))
        .filter((it) => it.kind !== "gameResultPost" || it.gameResults.length > 0));
      setGroupRefreshKey((k) => k + 1);
      reload();
    }
    setBulkProgress(null);
    if (failed.length > 0 && done.length === 0) {
      setBulkErr(batchSummary("삭제", 0, failed.length));
      return;
    }
    setBulkConfirm(null);
    selClear();
    showToast(batchSummary("삭제", done.length, failed.length), { kind: failed.length > 0 ? "warn" : "ok" });
  }, [patchFeed, reload, selClear]);

  const upsertGameResult = useCallback((updated: GameResult) => {
    if (isSecretGame(updated)) {
      setDetailItem((it) => (it && it.kind === "gameResult" && it.gameResult.id === updated.id ? null : it));
      setGameItem((it) => {
        if (it && it.kind === "gameResult" && it.gameResult.id === updated.id) {
          navigateTo("/games", { replace: true, notify: false });
          return null;
        }
        return it;
      });
    } else {
      setDetailItem((it) => (it && it.kind === "gameResult" && it.gameResult.id === updated.id
        ? { ...it, gameResult: updated } : it));
      setGameItem((it) => (it && it.kind === "gameResult" && it.gameResult.id === updated.id
        ? { ...it, gameResult: updated } : it));
    }
    patchFeed((prev) => prev.map((it) => (it.gameResults.some((g) => g.id === updated.id)
      ? { ...it, gameResults: it.gameResults.map((g) => (g.id === updated.id ? updated : g)) }
      : it)));
  }, [patchFeed]);

  const dateLabelOf = (item: { time: number }) => {
    const d = new Date(item.time);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  };

  const rowVoid = (item: DisplayItem): boolean => (
    item.kind === "challenge" && ROW_VOID.has(challengeStatusInfo(item.challenge).text)
  );

  const rowStatusOf = (item: DisplayItem) => {
    if (item.kind === "leagueMatch") {
      const done = item.match.setsWonA !== null && item.match.setsWonB !== null;
      return (
        <span className={cx("scr-activity-row-status", done && "scr-activity-row-status-faded")}>
          {done ? "Finish" : "Ready"}
        </span>
      );
    }
    if (item.kind === "gameResult") return <GameRowStatus game={item.gameResult} />;
    if (item.kind !== "challenge") return null;
    const s = challengeStatusInfo(item.challenge);
    const text = s.text === "대기중" ? "대기" : s.text;
    return (
      <span className={cx("scr-activity-row-status", STATUS_FADED.has(text) && "scr-activity-row-status-faded")}>
        {text}
      </span>
    );
  };

  const rowDesc = (item: DisplayItem) => {
    if (item.kind === "challenge") {
      const c = item.challenge;
      const mine = [c.createdBy.nickname, ...c.ownMembers.map((m) => m.nickname)];
      const theirs = c.targets.map((t) => t.nickname);
      return (
        <>
          <span className="scr-activity-row-name">
            <span className="scr-activity-row-name-main">{nameNodes(mine)}</span>
          </span>
          <span className="scr-activity-row-arrow" aria-hidden>→</span>
          <span className="scr-activity-row-name">
            <span className="scr-activity-row-name-main">{nameNodes(theirs)}</span>
          </span>
        </>
      );
    }
    if (item.kind === "leagueMatch") {
      const m = item.match;
      const sideText = (t: typeof m.teamA) => (
        t === null ? "미정"
          : t.members.length === 1 ? t.members[0].nickname
            : t.members.length > 1 ? `${t.label}팀`
              : t.label
      );
      return (
        <>
          <span className="scr-activity-row-name scr-activity-row-name-clip">
            <span className="scr-activity-row-name-main">{sideText(m.teamA)}</span>
          </span>
          <span className="scr-activity-row-arrow scr-activity-row-colon" aria-hidden>:</span>
          <span className="scr-activity-row-name scr-activity-row-name-clip">
            <span className="scr-activity-row-name-main">{sideText(m.teamB)}</span>
          </span>
        </>
      );
    }
    if (item.kind === "schedule") {
      return (
        <span className="scr-activity-row-names scr-activity-row-name-clip">
          <span className="scr-activity-row-em">{item.schedule.title}</span>
        </span>
      );
    }
    if (item.kind === "rankingShift") {
      const names: string[] = [];
      const seen = new Set<string>();
      for (const sec of item.shift.sections) {
        for (const e of sec.shifts) {
          if (seen.has(e.memberId)) continue;
          seen.add(e.memberId); names.push(e.nickname);
        }
      }
      return <span className="scr-activity-row-names">{namesWithRest(names)}{" 변동"}</span>;
    }
    return (
      <GameRowNames
        game={item.gameResult} memberOf={memberOf} mobile={isMobile}
        playable={gamePlayable(item.gameResult)}
      />
    );
  };

  const [bulkHide, setBulkHide] = useState<DisplayItem[] | null>(null);
  const askBulkHide = useCallback((items: DisplayItem[]) => {
    if (items.length === 0) return;
    setBulkErr(null);
    setBulkHide(items);
  }, []);
  const runBulkHide = useCallback(async (items: DisplayItem[]) => {
    setBulkErr(null);
    setBulkProgress({ done: 0, total: items.length });
    const { done, failed } = await runBatch(items, async (it) => {
      if (it.kind !== "gameResult") return;
      upsertGameResult(await api.hideGameResult(it.gameResult.id));
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
  }, [upsertGameResult, selClear]);

  const renderCard = (item: DisplayItem) => (
    item.kind === "schedule" ? (
      <div
        className="scr-activity-card-head-off"
        key={`sc-${item.schedule.id}`}
      >
        <ScheduleCard
          schedule={item.schedule}
          timeText={formatWhen(item.time, { clock: item.withClock })}
          dateLabel={dateLabelOf(item)}
          canEdit={!!user}
          canDelete={!!user && (item.schedule.createdBy.id === user.id || isAdmin)}
          onChanged={upsertSchedule}
          onDeleted={(id) => {
            patchFeed((prev) => prev.filter((it) => it.schedule?.id !== id));
            reload();
          }}
          footer={<ActivityCardComments targetType="schedule" targetId={item.schedule.id} overModal />}
        />
      </div>
    ) : item.kind === "leagueMatch" ? (
      <div
        className="scr-activity-card-head-off"
        key={`lm-${item.match.id}`}
      >
        <LeagueMatchCard
          match={item.match}
          timeText={formatWhen(item.time, { clock: item.withClock })}
          dateLabel={dateLabelOf(item)}
          footer={<ActivityCardComments targetType="leagueMatch" targetId={item.match.id} overModal />}
        />
      </div>
    ) : item.kind === "rankingShift" ? (
      <div
        className="scr-activity-card-head-off"
        key={`rs-${item.shift.id}`}
      >
        <RankingShiftCard
          shift={item.shift}
          timeText={formatWhen(item.time, { clock: item.withClock })}
          dateLabel={dateLabelOf(item)}
          actions={<RankingShiftMenu shift={item.shift} />}
          footer={<ActivityCardComments targetType="rankingShift" targetId={item.shift.id} overModal />}
        />
      </div>
    ) : item.kind === "challenge" ? (
      <div
        className="scr-activity-card-head-off"
        key={`c-${item.challenge.id}`}
      >
        <ActivityCard
          className={item.challenge.resultWinnerSide === "not_held" ? "scr-activity-card-void" : undefined}
          dateLabel={item.undated ? "미정" : dateLabelOf(item)}
          icon={<Phone size={16} aria-hidden />}
          label="너 나와!"
          timeText={item.undated ? "미정" : formatWhen(item.time, { clock: item.withClock })}
          headMeta={<>
            <ChallengeTimeHeadEdit
              challenge={item.challenge}
              timeLabel={null}
              myId={user?.id}
              onUpdated={upsertChallenge}
            />
          </>}
          actions={
            <ChallengeActionsMenu
              challenge={item.challenge}
              isAdmin={isAdmin}
              myId={user?.id ?? ""}
              onDeleted={(id) => {
                patchFeed((prev) => prev.filter((it) => it.challenge?.id !== id));
                reload();
              }}
              onChanged={upsertChallenge}
            />
          }
          comment={<ActivityCardComments targetType="challenge" targetId={item.challenge.id} overModal />}
          bodyClassName={item.challenge.backdropUrl ? "scr-activity-card-body-photo" : undefined}
        >
          {item.challenge.backdropUrl && (
            <div
              className="scr-activity-card-photo" aria-hidden="true"
              style={{ "--card-photo": `url("${item.challenge.backdropUrl}")` } as CSSProperties}
            />
          )}
          <ChallengeCard
            challenge={item.challenge}
            myId={user?.id}
            onResponded={upsertChallenge}
          />
        </ActivityCard>
      </div>
    ) : (
      <GameResultCard
        key={`m-${item.gameResult.id}`}
        item={item}
        memberOf={memberOf}
        onDeleted={handleGameResultDeleted}
        onChanged={upsertGameResult}
        dateLabel={dateLabelOf(item)}
      />
    )
  );

  const renderRow = (item: DisplayItem) => {
    const key = rowKeyOf(item);
    const flags = rowFlagsOf(item);
    const target = commentTargetOf(item);
    const notes = commentStatOf(target.type, target.id).count;
    const selecting = !!selection;
    const secret = item.kind === "gameResult" && isSecretGame(item.gameResult);
    const pickable = selecting && canPick(item);
    const picked = pickable && !!selection?.picked.has(key);
    return (
      <ListRow
        key={key}
        check={selecting && (
          <RowCheck
            checked={picked} disabled={!pickable}
            disabledTitle={secret ? "숨긴 경기는 고를 수 없어요" : selectionNote}
            onChange={() => selection?.toggle(key)}
          />
        )}
        picked={picked}
        className={cx(
          item.kind === "gameResult" && "scr-activity-row-game",
          rowVoid(item) && "scr-activity-row-void", secret && "scr-activity-row-secret",
        )}
        disabled={secret}
        onClick={() => {
          if (item.kind === "gameResult") openGamePage(item);
          else openDetailPage(item);
        }}
        status={rowStatusOf(item)}
        desc={<>
          {rowDesc(item)}
          {notes > 0 && (
            <span className="scr-activity-row-notes" title={`댓글 ${notes}개`}>[{notes}]</span>
          )}
        </>}
        top={flags.length > 0 && (
          <span className={cx("scr-activity-row-flag", `scr-activity-row-flag-${flags[0]}`)}>
            {flags[0] === "new" ? "NEW" : "UPDATE"}
          </span>
        )}
        side={item.kind === "challenge" && item.undated ? "미정" : formatAgo(item.time)}
      />
    );
  };

  const groupPage = openGroupKey
    ? {
      def: GROUP_DEFS.find((g) => g.key === openGroupKey)!,
      items: groupedSections.find((s) => s.key === openGroupKey)?.items ?? [],
    }
    : null;

  /* 게임 페이지 제목 줄의 머리 칸 — GameResultStory 가 시각·맵·승패·등록자를 여기에 포털로 그린다(2026-10-09). */
  const [gameHeadSlot9, setGameHeadSlot9] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!gameItem) return undefined;
    document.body.classList.add("scr-gamepage-open");
    return () => document.body.classList.remove("scr-gamepage-open");
  }, [gameItem]);

  return (
    <div className="scr-screen scr-activity-screen">
      {gameItem && (
        <div className="scr-activity-group-page">
          <div className="scr-v2-toolbar scr-v2-toolbar-crumb">
            <div className="scr-v2-toolbar-title-row scr-crumb scr-crumb-notitle">
              <button type="button" className="scr-crumb-back" onClick={gotoGameList}>
                <ArrowLeft size={14} />
                <span>게임</span>
              </button>
              <div className="scr-crumb-meta" ref={setGameHeadSlot9} />
            </div>
            {gameItem.kind === "gameResult" && (
              <div className="scr-v2-toolbar-actions">
                <GameResultActionsMenu
                  gameResult={gameItem.gameResult}
                  canDelete={canManageGame(gameItem.gameResult, user)}
                  isAdmin={isAdmin}
                  memberOf={memberOf}
                  onDelete={setGamePageDelete}
                  onChanged={upsertGameResult}
                  showNo
                />
              </div>
            )}
          </div>
          {gameItem.kind === "gameResult" && (
            <>
              <div className="scr-game-page-card">
                <GameResultStory
                  headSlot={gameHeadSlot9}
                  gameResult={gameItem.gameResult}
                  team1={gameItem.gameResult.team1}
                  team2={gameItem.gameResult.team2}
                  result={gameItem.gameResult.result}
                  memberOf={memberOf}
                  menu={(
                    <GameResultActionsMenu
                      gameResult={gameItem.gameResult}
                      canDelete={canManageGame(gameItem.gameResult, user)}
                      isAdmin={isAdmin}
                      memberOf={memberOf}
                      onDelete={setGamePageDelete}
                      onChanged={upsertGameResult}
                      showNo
                    />
                  )}
                />
              </div>
              <div className="scr-activity-card-comment scr-game-page-comment">
                <ActivityCardComments targetType="gameResult" targetId={gameItem.gameResult.id} />
              </div>
            </>
          )}
          {gamePageDelete && (
            <ConfirmDialog
              title="게임결과를 삭제할까요?"
              message="목록·통계에서 사라지고, 등록기가 같은 리플레이를 다시 올려도 등록되지 않아요. 운영자가 제어판의 '삭제된 경기'에서 복원하거나 완전히 지울 수 있어요."
              confirmLabel={gamePageDeleting ? "삭제 중..." : "삭제"}
              cancelLabel="취소"
              error={gamePageDeleteErr}
              onConfirm={async () => {
                if (!gamePageDelete) return;
                setGamePageDeleting(true);
                setGamePageDeleteErr(null);
                try {
                  await deleteGameResultAction(gamePageDelete.id);
                  setGamePageDelete(null);
                  closeGamePage();
                } catch (e) {
                  setGamePageDeleteErr(e instanceof Error ? e.message : "삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
                } finally {
                  setGamePageDeleting(false);
                }
              }}
              onCancel={() => { setGamePageDelete(null); setGamePageDeleteErr(null); }}
            />
          )}
        </div>
      )}
      {!gameItem && liveDetailItem && detailGroupOf(liveDetailItem) && (
        <div className="scr-activity-group-page">
          <div className="scr-v2-toolbar scr-v2-toolbar-crumb">
            <div className="scr-v2-toolbar-title-row scr-crumb">
              {(() => {
                const g9 = GROUP_DEFS.find((d) => d.key === detailGroupOf(liveDetailItem));
                return (
                  <>
                    <button
                      type="button" className="scr-crumb-back"
                      onClick={() => gotoGroupList(detailGroupOf(liveDetailItem)!)}
                    >
                      <ArrowLeft size={14} />
                      <span>{detailGroupOf(liveDetailItem) === "league" ? "활동" : g9?.label ?? "활동"}</span>
                    </button>
                    <h1 className="scr-title scr-crumb-title">{g9?.label ?? ""}</h1>
                  </>
                );
              })()}
            </div>
          </div>
          <div className="scr-activity-list">
            <div
              className={cx("scr-activity-row-body",
                rowPhoto(liveDetailItem) && "scr-activity-detail-photo")}
              {...(rowPhoto(liveDetailItem)
                ? { style: { "--card-photo": `url("${rowPhoto(liveDetailItem)}")` } as CSSProperties }
                : {})}
            >
              {rowPhoto(liveDetailItem) && <div className="scr-activity-card-photo" aria-hidden="true" />}
              <GameDetailCloseContext.Provider value={closeDetailPage}>
                {renderCard(liveDetailItem)}
              </GameDetailCloseContext.Provider>
            </div>
          </div>
        </div>
      )}
      {routeItemPending && <div className="scr-activity-list"><LoadingMark /></div>}
      {!gameItem && !detailItem && !routeItemPending && groupPage && openGroupKey && (
        <ActivityGroupPage
          groupKey={openGroupKey}
          label={groupPage.def.label}
          items={groupPage.items}
          memberOf={memberOf}
          gameTab={gameTab}
          onGameTabChange={setGameTab}
          members={members}
          renderRow={renderRow}
          onBack={closeGroup}
          selection={selection}
          canPick={canPick}
          selectionNote={selectionNote}
          onDeleteItems={askBulkDelete}
          onHideItems={askBulkHide}
          refreshKey={groupRefreshKey}
        />
      )}
      {!gameItem && !detailItem && (!groupPage || directAdd) && (
      <div className={cx(
        "scr-activity-add-fab-wrap scr-activity-add-wrap",
        fabHidden && "scr-activity-add-fab-wrap-hidden",
      )}>
        {(
          <button
            type="button"
            className="scr-activity-add-fab scr-circle-btn"
            onClick={directAdd ?? (() => setAddMenuOpen((v) => !v))}
            aria-expanded={directAdd ? undefined : addMenuOpen}
          >
            {parsingReplays ? <Spinner size={18} /> : "등록"}
          </button>
        )}
        {!groupPage && addMenuOpen && (
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
                onClick={() => { setAddMenuOpen(false); setScheduleForm("new"); }}
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

      {!groupPage && !gameItem && !detailItem && !routeItemPending && (
      <>
      <div className="scr-v2-toolbar">
        <div className="scr-v2-toolbar-title-row">
          <h1 className="scr-title scr-v2-toolbar-title">활동</h1>
        </div>
      </div>

      {!loading && comingMatches.length > 0 && (
        <ComingMatches matches={comingMatches} onOpen={(m) => openDetailPage(leagueMatchItem(m))} />
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
                onClick={() => openGroup(section.key)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  openGroup(section.key);
                }}
              >
                <h2 className="scr-activity-group-title">{section.label}</h2>
                <span className="scr-activity-group-viewall" aria-hidden>전체 보기</span>
              </div>
              {section.key === "gameResult" && <GameTabs value={gameTab} onChange={setGameTab} />}
              <div className="scr-activity-rows">
                {section.rows.map((item) => renderRow(item))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && loadingMore && <LoadingMark />}
      {!loading && <div ref={sentinelRef} aria-hidden />}
      </>
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
          title={`선택한 게임 ${bulkHide.length}개를 숨길까요?`}
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
          onCreated={(c) => { upsertChallenge(c); setChallengeFormOpen(false); }}
        />
      )}

      {scheduleForm && (
        <ScheduleFormModal
          initial={scheduleForm === "new" ? null : scheduleForm}
          onClose={() => setScheduleForm(null)}
          onSaved={upsertSchedule}
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
          onSaved={handleReplaysSaved}
        />
      )}


    </div>
  );
}
