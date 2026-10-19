import { type ReactNode } from "react";
import { cx } from "../../utils/format";
import { serverMs } from "../../utils/date";
import { parseRoute, type ActivityGroupKey } from "../../utils/route";
import type { Challenge, ActivityTargetType, GameResult, LeagueMatchActivity, Member, RankingShift, Schedule } from "../../types";

/* 활동 화면들(홈·묶음 목록·상세·게임 상세)이 함께 쓰는 항목 꼴과 셈 — 2026-10-19 화면을 컴포넌트로 나누며 ActivityScreen 에서 옮겼다. */

export const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;
export const STATUS_FADED = new Set(["거절", "버림", "만료", "취소", "미실시", "완료"]);
export const ROW_VOID = new Set(["거절", "버림", "만료", "취소", "미실시"]);
export const TOUCHED_SLACK_MS = 5000;

export interface ChallengeItem {
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

export interface RankingShiftItem {
  kind: "rankingShift";
  time: number;
  withClock: boolean;
  shift: RankingShift;
}

export interface LeagueMatchItem {
  kind: "leagueMatch";
  time: number;
  withClock: boolean;
  match: LeagueMatchActivity;
}

export interface ScheduleItem {
  kind: "schedule";
  time: number;
  withClock: boolean;
  sortTime: number;
  schedule: Schedule;
}

export type ActivityItem =
  | ChallengeItem | GameResultItem | RankingShiftItem | LeagueMatchItem | ScheduleItem;

export type DisplayItem = ActivityItem;

export function sortMsOf(it: ActivityItem): number {
  return it.kind === "challenge" || it.kind === "schedule" ? it.sortTime : it.time;
}

export function challengeItem(c: Challenge): ChallengeItem {
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

export function scheduleItem(s: Schedule): ScheduleItem {
  const at = new Date(`${s.scheduledDate}T${s.scheduledTime || "23:59:59"}`).getTime();
  return {
    kind: "schedule",
    time: at,
    withClock: !!s.scheduledTime,
    sortTime: at > Date.now() ? Math.max(at, Date.now() + 1) : at,
    schedule: s,
  };
}

export function leagueMatchItem(m: LeagueMatchActivity): LeagueMatchItem {
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
export function detailIdOf(it: DisplayItem): number | null {
  return it.kind === "challenge" ? it.challenge.id
    : it.kind === "schedule" ? it.schedule.id
      : it.kind === "rankingShift" ? it.shift.id
        : it.kind === "leagueMatch" ? it.match.id
          : null;
}

export function detailGroupOf(it: DisplayItem): ActivityGroupKey | null {
  return it.kind === "challenge" ? "call"
    : it.kind === "schedule" ? "schedule"
      : it.kind === "rankingShift" ? "notice"
        : it.kind === "leagueMatch" ? "league"
          : null;
}

export const GROUP_ITEM_KIND: Record<ActivityGroupKey, string> = {
  notice: "rankingShift",
  schedule: "schedule",
  league: "leagueMatch",
  call: "challenge",
  gameResult: "gameResult",
};

export function gameParamOf(): string | null {
  const r = parseRoute();
  return r.group === "gameResult" ? r.item : null;
}

export function commentTargetOf(it: DisplayItem): { type: ActivityTargetType; id: number } {
  return it.kind === "challenge" ? { type: "challenge", id: it.challenge.id }
    : it.kind === "schedule" ? { type: "schedule", id: it.schedule.id }
      : it.kind === "rankingShift" ? { type: "rankingShift", id: it.shift.id }
        : it.kind === "leagueMatch" ? { type: "leagueMatch", id: it.match.id }
          : { type: "gameResult", id: it.gameResult.id };
}

export function rowKeyOf(it: DisplayItem): string {
  return it.kind === "challenge" ? `c-${it.challenge.id}`
    : it.kind === "rankingShift" ? `rs-${it.shift.id}`
      : it.kind === "leagueMatch" ? `lm-${it.match.id}`
        : it.kind === "schedule" ? `sc-${it.schedule.id}`
          : `m-${it.gameResult.id}`;
}

export function deletableOf(it: DisplayItem): boolean {
  return it.kind === "gameResult" || it.kind === "challenge" || it.kind === "schedule";
}

export function bulkDeleteMessageOf(items: DisplayItem[]): string {
  const games = items.filter((it) => it.kind === "gameResult").length;
  const others = items.length - games;
  const parts: string[] = [];
  if (games > 0) parts.push(`게임 ${games}개는 목록·통계에서 사라지고, 운영자가 제어판의 '삭제된 경기'에서 복원할 수 있어요.`);
  if (others > 0) parts.push(`너 나와·일정 ${others}개는 되돌릴 수 없어요.`);
  return parts.join(" ");
}

export const HIDE_FORMS = { did: "숨겼어요", couldNot: "숨기지 못했어요" };
export const SCRAP_FORMS = { did: "스크랩했어요", couldNot: "스크랩하지 못했어요" };

const ROW_NAME_MAX = 1;

export function nameNodes(names: string[]): ReactNode[] {
  return names.flatMap((n, i) => [
    ...(i > 0 ? [<span className="scr-activity-row-sep" key={`s${i}`}>·</span>] : []),
    <span className="scr-activity-row-em" key={`n${i}`}>{n}</span>,
  ]);
}

export function namesWithRest(names: string[]): ReactNode {
  if (names.length === 0) return null;
  const rest = names.length - ROW_NAME_MAX;
  return (
    <>
      {nameNodes(names.slice(0, ROW_NAME_MAX))}
      {rest > 0 && <>{" 외 "}<span className="scr-activity-row-em">{rest}</span>{"명"}</>}
    </>
  );
}

export function rowPhoto(item: DisplayItem): string | null {
  return item.kind === "challenge" ? item.challenge.backdropUrl : null;
}

export function sessionDateLabel(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}
/* (걷어냄 · 2026-10-13, 요청: 알림 묶음 걷어 내기 — "알림이 뭐야? 그런 기능 본 적이 없어" → "2") 알림(랭킹 변동 · rankingShift) 묶음.
   서버는 그대로 만들지만 활동 화면에 싣지 않는다(feedAll · 상세 링크). 타입·카드(RankingShiftCard)는 남겨 둔다. */
export const GROUP_DEFS: { key: ActivityGroupKey; label: string }[] = [
  { key: "schedule", label: "일정" },
  { key: "league", label: "리그" },
  { key: "call", label: "너 나와!" },
  { key: "gameResult", label: "게임" },
];

export const GROUP_SCREEN_CODE: Record<ActivityGroupKey, string> = {
  notice: "activity_notice",
  schedule: "activity_schedule",
  league: "activity_league",
  call: "activity_call",
  gameResult: "activity_game",
};

export function groupKeyOf(item: ActivityItem): ActivityGroupKey {
  return item.kind === "gameResult" ? "gameResult"
    : item.kind === "challenge" ? "call"
    : item.kind === "leagueMatch" ? "league"
    : item.kind === "schedule" ? "schedule"
    : "notice";
}

const GROUP_PREVIEW_MAX = 3;
const GAME_PREVIEW_MAX = 10;
export const previewMaxOf = (k: ActivityGroupKey): number =>
  (k === "gameResult" ? GAME_PREVIEW_MAX : GROUP_PREVIEW_MAX);

export const SEARCHABLE_GROUPS = new Set<ActivityGroupKey>(["league", "call", "gameResult"]);

/* ★ 내전·공방은 **서버가 실어 준 clan** 으로 가른다(2026-10-12, 지적: "활동 화면과 게임 목록에서 내전·공방 목록이 달라 — 원래 공방에 있던 게 내전에") — 비공개(숨긴) 판은
   팀을 비워 내려와 옛 셈(슬롯 전원이 회원)이 빈 목록에서 늘 참이라 공방 판이 내전 탭에 들었다. 게임 목록(서버 membersOnly)과 같은 셈이다. 옛 서버(clan 없음)만 슬롯으로 잰다. */
export function isClanGame(item: ActivityItem, memberOf: (id: string) => Member | undefined): boolean {
  if (item.kind !== "gameResult") return true;
  if (typeof item.gameResult.clan === "boolean") return item.gameResult.clan;
  const slots = [...item.gameResult.team1, ...item.gameResult.team2];
  return slots.every((slot) => !!memberOf(slot.memberId));
}

export type GameTab = "clan" | "pub";
const GAME_TAB_OPTIONS: { value: GameTab; label: string }[] = [
  { value: "clan", label: "내전" },
  { value: "pub", label: "공방" },
];
export function inGameTab(item: ActivityItem, tab: GameTab, memberOf: (id: string) => Member | undefined): boolean {
  if (item.kind !== "gameResult") return true;
  return isClanGame(item, memberOf) === (tab === "clan");
}
export function GameTabs({ value, onChange }: { value: GameTab; onChange: (next: GameTab) => void }) {
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

export const dateLabelOf = (item: { time: number }): string => {
  const d = new Date(item.time);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
};

export function touchMsOf(it: DisplayItem): number {
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
}

export function rowFlagsOf(it: DisplayItem): ("new" | "update")[] {
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
}

/** 그 묶음의 이 홈·목록에 실을 항목 — 내전·공방 탭으로 거른 것. */
export function feedOfTab(feedAll: ActivityItem[], tab: GameTab, memberOf: (id: string) => Member | undefined): ActivityItem[] {
  return feedAll.filter((it) => inGameTab(it, tab, memberOf));
}
