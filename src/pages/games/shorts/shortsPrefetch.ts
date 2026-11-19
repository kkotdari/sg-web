import { api, type GameShort } from "../../../api/client";
import type { GameResult } from "../../../types";

/* ★ 쇼츠 미리 받기(2026-11-19, 지적: "로딩이 좀 느리고") — 쇼츠 하나를 여는 데 드는 것: 토막(clip) · 경기(GameResult · 지도 해시 · 로스터) · 참값(unit-tracks · 판 전체라 가장 크다) ·
   지도(useReplayMap 캐시). 보는 쇼츠가 도는 동안 **다음 쇼츠**의 것을 당겨 두고(ShortsViewer), 카드를 누르는 순간(pointerdown) 그 쇼츠의 것을 먼저 출발시킨다(ShortsStrip).
   같은 약속(Promise)을 나눠 쓰므로 두 번 받지 않는다. 참값은 커서 최근 셋만 쥔다. 실패한 약속은 걷어 다음에 다시 받는다. */
const shorts = new Map<number, Promise<GameShort>>();
const games = new Map<number, Promise<GameResult>>();
const tracks = new Map<number, Promise<{ motion: string | null }>>();
const TRACKS_KEEP = 3;

function keep<K, V>(m: Map<K, Promise<V>>, k: K, make: () => Promise<V>): Promise<V> {
  const hit = m.get(k);
  if (hit) return hit;
  const p = make();
  m.set(k, p);
  p.catch(() => { if (m.get(k) === p) m.delete(k); });
  return p;
}

export function shortOf(item: GameShort): Promise<GameShort> {
  if (item.clip) return Promise.resolve(item);
  return keep(shorts, item.id, () => api.getShort(item.id));
}

export function gameOf(id: number): Promise<GameResult> {
  return keep(games, id, () => api.getGameResult(id));
}

export function tracksOf(gameId: number): Promise<{ motion: string | null }> {
  const p = keep(tracks, gameId, () => api.getGameUnitTracks(gameId));
  // 최근 것을 맨 뒤로 — 넘치면 오래된 것부터 놓는다
  tracks.delete(gameId); tracks.set(gameId, p);
  while (tracks.size > TRACKS_KEEP) { const k = tracks.keys().next().value; if (k === undefined) break; tracks.delete(k); }
  return p;
}

/** 한 쇼츠를 여는 데 드는 것을 다 출발시킨다(기다리지 않는다). */
export function prefetchShort(item: GameShort | undefined | null): void {
  if (!item) return;
  void shortOf(item).catch(() => undefined);
  void gameOf(item.gameResultId).catch(() => undefined);
  void tracksOf(item.gameResultId).catch(() => undefined);
}
