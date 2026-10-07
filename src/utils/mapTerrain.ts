import type { TerrainGrid } from "scplay";
import type { MapTerrainLike } from "./mapTiles";

export const TILE = {
  walkable: 1 << 0,
  partial: 1 << 1,
  middle: 1 << 2,
  high: 1 << 3,
  veryHigh: 1 << 4,
  unbuildable: 1 << 5,
  creep: 1 << 6,
  ramp: 1 << 7,
} as const;

export const TILESET_NAME = [
  "badlands", "platform", "install", "ashworld", "jungle", "desert", "ice", "twilight",
] as const;

export interface MapTerrain {
  w: number;
  h: number;
  tileset: number;
  ver: number;
  tile: Uint8Array;
  walkBits: Uint8Array;
  rgb: Uint8Array | null;
}

export function levelAt(t: MapTerrain, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= t.w || ty >= t.h) return 0;
  const f = t.tile[ty * t.w + tx];
  if (f & TILE.veryHigh) return 3;
  if (f & TILE.high) return 2;
  if (f & TILE.middle) return 1;
  return 0;
}

export function walkAtMini(t: MapTerrain, mx: number, my: number): boolean {
  const mw = t.w * 4;
  if (mx < 0 || my < 0 || mx >= mw || my >= t.h * 4) return false;
  const k = my * mw + mx;
  return (t.walkBits[k >> 3] & (1 << (k & 7))) !== 0;
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream;
  if (!DS) throw new Error("이 브라우저는 DecompressionStream이 없다");
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DS("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function decodeMapTerrain(b64: string | null | undefined): Promise<MapTerrain | null> {
  if (!b64) return null;
  try {
    const raw = await inflate(fromBase64(b64));
    if (raw.length < 11) return null;
    if (raw[0] !== 0x4f || raw[1] !== 0x42 || raw[2] !== 0x57 || raw[3] !== 0x4d) return null;
    const ver = raw[4];
    if (ver < 1 || ver > 3) return null;
    const w = raw[5] | (raw[6] << 8);
    const h = raw[7] | (raw[8] << 8);
    const tileset = raw[9];
    if (!(w > 0) || !(h > 0) || w > 512 || h > 512) return null;
    const tileAt = 11;
    const tileLen = w * h;
    const bitsLen = ((w * 4) * (h * 4) + 7) >> 3;
    if (raw.length < tileAt + tileLen + bitsLen) return null;
    const rgbAt = tileAt + tileLen + bitsLen;
    const hasRgb = ver >= 3 && raw.length >= rgbAt + tileLen * 3;
    return {
      w, h, tileset, ver,
      tile: raw.subarray(tileAt, tileAt + tileLen),
      walkBits: raw.subarray(tileAt + tileLen, rgbAt),
      rgb: hasRgb ? raw.subarray(rgbAt, rgbAt + tileLen * 3) : null,
    };
  } catch {
    return null;
  }
}

export function terrainGridOfMap(t: MapTerrain): TerrainGrid {
  const n = t.w * t.h;
  const walk = new Uint8Array(n);
  const high = new Uint8Array(n);
  const creep = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const f = t.tile[i];
    walk[i] = (f & (TILE.walkable | TILE.partial)) ? 1 : 0;
    high[i] = (f & (TILE.high | TILE.veryHigh)) ? 1 : 0;
    creep[i] = (f & TILE.partial) ? 1 : 0;
  }
  return { w: t.w, h: t.h, walk, high, creep };
}

const SHOW_GAMMA = 0.55;
const SHOW_SAT = 1.8;
const SHOW_LUT = ((): Uint8Array => {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) t[i] = Math.round(255 * (i / 255) ** SHOW_GAMMA);
  return t;
})();
const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
function showRGB(r0: number, g0: number, b0: number): [number, number, number] {
  const r = SHOW_LUT[r0];
  const g = SHOW_LUT[g0];
  const b = SHOW_LUT[b0];
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  return [
    clamp255(l + (r - l) * SHOW_SAT),
    clamp255(l + (g - l) * SHOW_SAT),
    clamp255(l + (b - l) * SHOW_SAT),
  ];
}

export function terrainFace(t: MapTerrain): MapTerrainLike {
  return {
    w: t.w, h: t.h, tileset: t.tileset,
    levelAt: (x, y) => levelAt(t, x, y),
    walkAt: (x, y) => (x < 0 || y < 0 || x >= t.w || y >= t.h
      ? false : (t.tile[y * t.w + x] & (TILE.walkable | TILE.partial)) !== 0),
    partialAt: (x, y) => (x < 0 || y < 0 || x >= t.w || y >= t.h
      ? false : (t.tile[y * t.w + x] & TILE.partial) !== 0),
    rgbAt: t.rgb
      ? (x, y) => {
        if (x < 0 || y < 0 || x >= t.w || y >= t.h) return null;
        const o = (y * t.w + x) * 3;
        return showRGB(t.rgb![o], t.rgb![o + 1], t.rgb![o + 2]);
      }
      : undefined,
    rampAt: t.ver >= 2
      ? (x, y) => (x < 0 || y < 0 || x >= t.w || y >= t.h
        ? false : (t.tile[y * t.w + x] & TILE.ramp) !== 0)
      : undefined,
    walkAtMini: (mx, my) => walkAtMini(t, mx, my),
  };
}
