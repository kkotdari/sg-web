import { primeReplayMap, replayPrewarm9 } from "scplay";
import { api, type GameShort } from "../../../api/client";
import type { GameResult } from "../../../types";

/* ★ 쇼츠 미리 받기(2026-11-19, 지적: "로딩이 좀 느리고") — 쇼츠 하나를 여는 데 드는 것: 토막(clip) · 경기(GameResult · 지도 해시 · 로스터) · 참값(unit-tracks · 판 전체라 가장 크다) ·
   지도(useReplayMap 캐시). 보는 쇼츠가 도는 동안 **다음 쇼츠**의 것을 당겨 두고(ShortsViewer), 카드를 누르는 순간(pointerdown) 그 쇼츠의 것을 먼저 출발시킨다(ShortsStrip).
   같은 약속(Promise)을 나눠 쓰므로 두 번 받지 않는다. 참값은 커서 최근 셋만 쥔다. 실패한 약속은 걷어 다음에 다시 받는다. */
const shorts = new Map<number, Promise<GameShort>>();
const games = new Map<number, Promise<GameResult>>();
const tracks = new Map<number, Promise<{ motion: string | null }>>();
/** 쇼츠 참값 꾸러미(쇼츠 id · 2026-11-21 — 구간만 잘라 작다 · api.getShortTracks). 최근 몇 개만 쥔다. */
const shortTracks = new Map<number, Promise<Awaited<ReturnType<typeof api.getShortTracks>>>>();
const SHORT_TRACKS_KEEP = 6;
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
  /* 경기가 오면 곧장 그 지도도 부른다(2026-11-20 · scplay primeReplayMap) — 옛: 보기 화면이 경기를 받은 뒤에야 useReplayMap 이 지도를 물어 왕복 한 번이 더 줄을 섰다. */
  return keep(games, id, () => api.getGameResult(id).then((g) => { primeReplayMap(g.mapHash); return g; }));
}

export function tracksOf(gameId: number): Promise<{ motion: string | null }> {
  const p = keep(tracks, gameId, () => api.getGameUnitTracks(gameId));
  // 최근 것을 맨 뒤로 — 넘치면 오래된 것부터 놓는다
  tracks.delete(gameId); tracks.set(gameId, p);
  while (tracks.size > TRACKS_KEEP) { const k = tracks.keys().next().value; if (k === undefined) break; tracks.delete(k); }
  return p;
}

export function shortTracksOf(item: GameShort): Promise<Awaited<ReturnType<typeof api.getShortTracks>>> {
  const p = keep(shortTracks, item.id, () => api.getShortTracks(item.id));
  shortTracks.delete(item.id); shortTracks.set(item.id, p);
  while (shortTracks.size > SHORT_TRACKS_KEEP) { const k = shortTracks.keys().next().value; if (k === undefined) break; shortTracks.delete(k); }
  return p;
}

/** 쇼츠 재생기에 넘길 참값 — 꾸러미(truthPack)가 있으면 그것 · 없으면 경기 전체 참값(옛 길). */
export function shortLoadTracks(item: GameShort): Promise<{ motion: string | null; truthPack?: string | null; chats?: { sec: number; name: string; text: string; scope?: "team" | "all" }[] }> {
  return shortTracksOf(item)
    .then((r) => (r.pack ? { motion: null, truthPack: r.pack, ...(r.chats ? { chats: r.chats } : {}) } : tracksOf(item.gameResultId)))
    .catch(() => tracksOf(item.gameResultId).catch(() => ({ motion: null })));
}

/** 한 쇼츠를 여는 데 드는 것을 다 출발시킨다(기다리지 않는다). */
export function prefetchShort(item: GameShort | undefined | null): void {
  if (!item) return;
  replayPrewarm9();   // 재생기 채비(이미 열었으면 아무것도 안 한다)
  void shortOf(item).catch(() => undefined);
  void gameOf(item.gameResultId).catch(() => undefined);
  void shortTracksOf(item).catch(() => undefined);   // 경기 전체 참값(tracksOf) 대신 쇼츠 꾸러미(구간만 · 2026-11-21) — 없으면 그때 전체를 받는다(shortLoadTracks)
}
