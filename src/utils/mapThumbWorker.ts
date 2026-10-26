/// <reference lib="webworker" />
import { decodeMapTerrain, terrainFace } from "./mapTerrain";
import { drawMapGrid } from "./mapTiles";

/* 게임 목록 배치 칸의 맵 그림(한 타일 1px)을 메인 밖에서 굽는다 — mapThumb.ts ★. OffscreenCanvas 에 같은 붓(drawMapGrid)으로 그리고 PNG 로 돌려준다. */
export interface ThumbJob {
  id: number;
  grid: { width: number; height: number; palette: number[]; tiles: string; terrain?: string | null;
    resources?: [number, number, 0 | 1][] | null };
}
export interface ThumbResult { id: number; blob: Blob | null }

self.onmessage = async (e: MessageEvent<ThumbJob>) => {
  const { id, grid } = e.data;
  try {
    const cv = new OffscreenCanvas(grid.width, grid.height);
    const ctx = cv.getContext("2d");
    if (!ctx) throw new Error("no 2d");
    const mt = await decodeMapTerrain(grid.terrain);
    drawMapGrid(ctx as unknown as CanvasRenderingContext2D, grid, mt ? terrainFace(mt) : null, 1);
    const blob = await cv.convertToBlob({ type: "image/png" });
    (self as unknown as Worker).postMessage({ id, blob } satisfies ThumbResult);
  } catch {
    (self as unknown as Worker).postMessage({ id, blob: null } satisfies ThumbResult);   // 일꾼에서 못 그리면(옛 사파리의 Path2D 등) 메인이 이어 굽는다
  }
};
