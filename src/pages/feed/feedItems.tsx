import { type ReactNode } from "react";
import { cx } from "../../utils/format";
import { serverMs } from "../../utils/date";
import { parseRoute, type FeedGroup } from "../../utils/route";
import type { CommentTargetType, GameResult, LeagueMatchEntry, Member, Post, RankingShift } from "../../types";

/* 게임·게시판 화면(목록·상세·게임 상세)이 함께 쓰는 항목 꼴과 셈 — 2026-10-19 화면을 컴포넌트로 나누며 GamesScreen 에서 옮겼다.
   (2026-10-26 활동 화면을 게임 · 게시판 두 화면으로 나누고 일정은 꼭지 '일정' 글이 됐다 — 옛 일정 항목·홈 미리보기 셈은 걷었다.) */

export const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;
export const TOUCHED_SLACK_MS = 5000;

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
  match: LeagueMatchEntry;
}

/** 게시판 글(2026-10-26) — 시각은 쓴 때. */
export interface PostItem {
  kind: "post";
  time: number;
  withClock: boolean;
  post: Post;
}

export type FeedItem =
  | GameResultItem | RankingShiftItem | LeagueMatchItem | PostItem;

export type DisplayItem = FeedItem;

export function sortMsOf(it: FeedItem): number {
  return it.time;
}

export function postItem(p: Post): PostItem {
  return { kind: "post", time: serverMs(p.createdAt), withClock: true, post: p };
}

export function leagueMatchItem(m: LeagueMatchEntry): LeagueMatchItem {
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
  return it.kind === "post" ? it.post.id
      : it.kind === "rankingShift" ? it.shift.id
        : it.kind === "leagueMatch" ? it.match.id
          : null;
}

export function detailGroupOf(it: DisplayItem): FeedGroup | null {
  return it.kind === "post" ? "board"
          : null;
}

export const GROUP_ITEM_KIND: Record<FeedGroup, string> = {
  gameResult: "gameResult",
  board: "post",
};

export function gameParamOf(): string | null {
  const r = parseRoute();
  return r.group === "gameResult" ? r.item : null;
}

export function commentTargetOf(it: DisplayItem): { type: CommentTargetType; id: number } {
  return it.kind === "post" ? { type: "post", id: it.post.id }
      : it.kind === "rankingShift" ? { type: "rankingShift", id: it.shift.id }
        : it.kind === "leagueMatch" ? { type: "leagueMatch", id: it.match.id }
          : { type: "gameResult", id: it.gameResult.id };
}

export function rowKeyOf(it: DisplayItem): string {
  return it.kind === "rankingShift" ? `rs-${it.shift.id}`
      : it.kind === "leagueMatch" ? `lm-${it.match.id}`
        : it.kind === "post" ? `po-${it.post.id}`
          : `m-${it.gameResult.id}`;
}

/* 글은 쓴 사람만 지운다(운영자도 못 지운다 — 요청: "수정삭제는 본인만") — 그래서 묶어 고르기에서 빠진다. */
export function deletableOf(it: DisplayItem): boolean {
  return it.kind === "gameResult";
}

/** gameCount 는 게임 목록 '전체 선택'일 때 — 받은 줄이 아니라 서버 조건의 수. */
export function bulkDeleteMessageOf(items: DisplayItem[], gameCount?: number): string {
  const games = gameCount ?? items.filter((it) => it.kind === "gameResult").length;
  return games > 0 ? `게임 ${games}개는 목록·통계에서 사라지고, 운영자가 제어판의 '삭제된 경기'에서 복원할 수 있어요.` : "";
}

export const HIDE_FORMS = { did: "숨겼어요", couldNot: "숨기지 못했어요" };

const ROW_NAME_MAX = 1;

export function nameNodes(names: string[]): ReactNode[] {
  return names.flatMap((n, i) => [
    ...(i > 0 ? [<span className="scr-feed-row-sep" key={`s${i}`}>·</span>] : []),
    <span className="scr-feed-row-em" key={`n${i}`}>{n}</span>,
  ]);
}

export function namesWithRest(names: string[]): ReactNode {
  if (names.length === 0) return null;
  const rest = names.length - ROW_NAME_MAX;
  return (
    <>
      {nameNodes(names.slice(0, ROW_NAME_MAX))}
      {rest > 0 && <>{" 외 "}<span className="scr-feed-row-em">{rest}</span>{"명"}</>}
    </>
  );
}

export function sessionDateLabel(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}
/* (걷어냄 · 2026-10-13, 요청: 알림 묶음 걷어 내기 — "알림이 뭐야? 그런 기능 본 적이 없어" → "2") 알림(랭킹 변동 · rankingShift) 묶음.
   서버는 그대로 만들지만 활동 화면에 싣지 않는다(feedAll · 상세 링크). 타입·카드(RankingShiftCard)는 남겨 둔다. */
export const GROUP_DEFS: { key: FeedGroup; label: string }[] = [
  { key: "gameResult", label: "게임" },
  { key: "board", label: "게시판" },
];

/* 접속 기록의 화면 열쇠 — 화면 이름 그대로(2026-10-26, 요청: "activity라는 파일이나 클래스를 다 변경"). */
export const GROUP_SCREEN_CODE: Record<FeedGroup, string> = {
  gameResult: "games",
  board: "board",
};

export function groupKeyOf(item: FeedItem): FeedGroup | null {
  return item.kind === "gameResult" ? "gameResult"
    : item.kind === "post" ? "board"
    : null;
}

export const SEARCHABLE_GROUPS = new Set<FeedGroup>(["gameResult"]);

/* ★ 내전·공방은 **서버가 실어 준 clan** 으로 가른다(2026-10-12, 지적: "활동 화면과 게임 목록에서 내전·공방 목록이 달라 — 원래 공방에 있던 게 내전에") — 비공개(숨긴) 판은
   팀을 비워 내려와 옛 셈(슬롯 전원이 회원)이 빈 목록에서 늘 참이라 공방 판이 내전 탭에 들었다. 게임 목록(서버 membersOnly)과 같은 셈이다. 옛 서버(clan 없음)만 슬롯으로 잰다. */
export function isClanGame(item: FeedItem, memberOf: (id: string) => Member | undefined): boolean {
  if (item.kind !== "gameResult") return true;
  if (typeof item.gameResult.clan === "boolean") return item.gameResult.clan;
  const slots = [...item.gameResult.team1, ...item.gameResult.team2];
  return slots.every((slot) => !!memberOf(slot.memberId));
}

/* ★ 탭 셋 — 리그 / 내전 / 공방(2026-10-19, 요청: "경기 탭 순서 내전 / 리그 / 공방으로 나누기" → "탭 순서 리그/내전/공방 순으로 변경").
   리그 판(서버 league — 리그 경기 세트에 고른 게임)은 리그 탭에만 서고, 내전·공방은 리그 판을 뺀 나머지를 clan 으로 가른다. */
/* ★ 명예의 전당(fame) — 마감 때 추천 3 이상이라 지우지 않고 옮긴 판(2026-10-22, 요청: "추천게임목록으로 이동(화면 표시 이름은 명예의 전당으로 게임 탭에 추가)").
   그 판은 명예의 전당 탭에도 서고 리그 판은 리그 탭에도 선다(2026-10-23, 요청: "명예의 전당 올라가도 다른 탭에도 나와야함").
   내전·공방에는 안 선다 — 서버가 목록·피드에 아예 안 내린다(같은 날 요청: "마감 후엔 명예의 전당에만 · api 부터 안 내려와야지"). */
export type GameTab = "league" | "clan" | "pub" | "fame";
const GAME_TAB_OPTIONS: { value: GameTab; label: string }[] = [
  { value: "league", label: "리그" },
  { value: "clan", label: "내전" },
  { value: "pub", label: "공방" },
  { value: "fame", label: "명예의 전당" },
];
export function inGameTab(item: FeedItem, tab: GameTab, memberOf: (id: string) => Member | undefined): boolean {
  if (item.kind !== "gameResult") return true;
  if (tab === "fame") return !!item.gameResult.fame;
  if (item.gameResult.league) return tab === "league";
  if (tab === "league") return false;
  return isClanGame(item, memberOf) === (tab === "clan");
}
export function GameTabs({ value, onChange }: { value: GameTab; onChange: (next: GameTab) => void }) {
  return (
    <div className="scr-feed-game-tabs" role="tablist" aria-label="게임 탭">
      {GAME_TAB_OPTIONS.map((o) => (
        <button
          key={o.value} type="button" role="tab"
          aria-selected={o.value === value}
          className={cx("scr-feed-game-tab", o.value === value && "is-on")}
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
  if (it.kind === "leagueMatch") {
    return Math.max(serverMs(it.match.postedAt), serverMs(it.match.updatedAt));
  }
  if (it.kind === "post") return Math.max(serverMs(it.post.createdAt), serverMs(it.post.updatedAt));
  if (it.kind === "rankingShift") return serverMs(it.shift.createdAt);
  return it.time;
}

export function rowFlagsOf(it: DisplayItem): ("new" | "update")[] {
  const now = Date.now();
  const fresh = (ms: number) => now - ms >= 0 && now - ms <= NEW_WINDOW_MS;
  if (it.kind === "leagueMatch") {
    const posted = serverMs(it.match.postedAt);
    const updated = serverMs(it.match.updatedAt);
    const flags: ("new" | "update")[] = [];
    if (fresh(posted)) flags.push("new");
    if (updated - posted > TOUCHED_SLACK_MS && fresh(updated)) flags.push("update");
    return flags;
  }
  if (it.kind === "post") {
    const created = serverMs(it.post.createdAt);
    const updated = serverMs(it.post.updatedAt);
    const flags: ("new" | "update")[] = [];
    if (fresh(created)) flags.push("new");
    if (updated - created > TOUCHED_SLACK_MS && fresh(updated)) flags.push("update");
    return flags;
  }
  if (it.kind === "rankingShift") return fresh(serverMs(it.shift.createdAt)) ? ["new"] : [];
  return fresh(it.time) ? ["new"] : [];
}

/** 그 묶음의 이 홈·목록에 실을 항목 — 내전·공방 탭으로 거른 것. */
export function feedOfTab(feedAll: FeedItem[], tab: GameTab, memberOf: (id: string) => Member | undefined): FeedItem[] {
  return feedAll.filter((it) => inGameTab(it, tab, memberOf));
}
