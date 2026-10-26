import { decodeMapTerrain, drawMapGrid, terrainFace, type ReplayMapGrid } from "scplay";

export const EXPORT_PX_PER_TILE = 16;

export async function renderMinimapCanvas(
  grid: ReplayMapGrid, pxPerTile = EXPORT_PX_PER_TILE,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = grid.width * pxPerTile;
  canvas.height = grid.height * pxPerTile;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("캔버스를 못 얻었습니다.");
  const mt = await decodeMapTerrain(grid.terrain);
  drawMapGrid(ctx, grid, mt ? terrainFace(mt) : null, pxPerTile);
  return canvas;
}

export async function downloadMinimapPng(
  grid: ReplayMapGrid, fileName: string, pxPerTile = EXPORT_PX_PER_TILE,
): Promise<void> {
  const canvas = await renderMinimapCanvas(grid, pxPerTile);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("그림을 만들지 못했습니다.");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".png") ? fileName : `${fileName}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
