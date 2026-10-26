/* ★ 게임 목록 배치 칸의 맵 그림은 **서버가 굽는다**(2026-10-26, 지적: "게임목록 사진 뜨기 전까지 화면 멈추고 뜨면 풀려" → "지도도 노드로").
   앱은 그림 고리만 붙인다 — 옛 판은 맵 격자(타일 · 지형 수백 KB)를 받아 맵마다 지형을 풀고 윤곽을 그었다(일꾼으로 옮겨도 판마다 수백 ms).
   목록 응답(/api/activities?mapsLite=1)이 그 쪽 경기들의 맵을 **격자 없이**(크기 · 이름 · 썸네일 표식) 싣고, 여기 맡긴다.
   표식(thumb)이 그림 주소에 들어 내용이 바뀌면 주소가 바뀐다(서버가 오래 붙잡게 해도 된다). */
import { API_BASE } from "../api/client";

export interface MapThumb {
  hash: string;
  name: string | null;
  width: number;
  height: number;
  canonId: number | null;
  canonName: string | null;
  thumb: string;
}

/** 해시 → 맵(null = 서버가 없다고 한 해시 · 옛 판 · 맵 없는 수동 등록). */
const store = new Map<string, MapThumb | null>();

export function putMapThumbs(maps: MapThumb[], asked: Iterable<string>): void {
  for (const m of maps) store.set(m.hash, m);
  for (const h of asked) if (!store.has(h)) store.set(h, null);
}

/** undefined = 모름(목록 밖에서 연 판 — 부르는 쪽이 격자로 물러난다) · null = 맵 없음. */
export function mapThumbOf(hash: string | null | undefined): MapThumb | null | undefined {
  return hash ? store.get(hash) : null;
}

export function mapThumbSrc(hash: string, thumb: string): string {
  return `${API_BASE}/api/game-results/replay-maps/${encodeURIComponent(hash)}/thumb.png?k=${encodeURIComponent(thumb)}`;
}
