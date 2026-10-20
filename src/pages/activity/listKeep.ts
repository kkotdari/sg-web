import type { GameResult } from "../../types";
import { gameResultItem, type ActivityItem } from "./activityItems";
import { isSecretGame } from "../../utils/gameAccess";

/* ★ 받아 둔 게임 목록(2026-10-20, 요청: "게임 목록 보다가 상세 갔다가 뒤로 가면 스크롤 위치 기억") — 상세에서 뒤로 오면 ActivityGroupPage 가 다시 받지 않고
   이것으로 바로 그려 스크롤 자리(route.ts rememberListScroll)를 되찾는다. 열쇠 = 묶음 · 검색 · 탭 · 새로고침 번호. 탭 안 메모리라 새로고침하면 비고,
   최근 몇 벌만 둔다. 상세에서 고치거나 지운 게임은 여기에도 반영한다(뒤로 와서 옛 줄이 보이지 않게). */
export type GamesPage9 = { items: ActivityItem[]; total: number; cursor: string | null };

const kept9 = new Map<string, GamesPage9>();

export function keptGames(key: string): GamesPage9 | null {
  return kept9.get(key) ?? null;
}

export function keepGames(key: string, page: GamesPage9): void {
  kept9.delete(key);
  kept9.set(key, page);
  while (kept9.size > 4) kept9.delete(kept9.keys().next().value as string);
}

/** 상세에서 바뀐 게임 — 받아 둔 목록의 그 줄을 갈아 끼운다(숨김이 되면 뺀다). */
export function patchKeptGame(updated: GameResult): void {
  if (isSecretGame(updated)) { dropKeptGame(updated.id); return; }
  for (const [k, page] of kept9) {
    if (!page.items.some((it) => it.kind === "gameResult" && it.gameResult.id === updated.id)) continue;
    kept9.set(k, {
      ...page,
      items: page.items.map((it) => (it.kind === "gameResult" && it.gameResult.id === updated.id ? gameResultItem(updated) : it)),
    });
  }
}

/** 상세에서 지운 게임 — 받아 둔 목록에서 뺀다. */
export function dropKeptGame(id: number): void {
  for (const [k, page] of kept9) {
    const items = page.items.filter((it) => !(it.kind === "gameResult" && it.gameResult.id === id));
    if (items.length !== page.items.length) kept9.set(k, { ...page, items, total: Math.max(0, page.total - 1) });
  }
}
