import { maskPath } from "./contour";

const TILESET_TONE: [number, number, string, number, number, string, number][] = [
  [80, 16, "hsl(205 42% 20%)", 33, -7, "238,228,198", 11],
  [222, 10, "hsl(220 24% 7%)", 40, 10, "255,255,255", 11],
  [210, 6, "hsl(210 12% 8%)", 30, 8, "255,255,255", 11],
  [15, 12, "hsl(18 66% 26%)", 28, -6, "240,214,190", 11],
  [33, 23, "hsl(232 30% 55%)", 40, 14, "214,205,178", 7],
  [38, 28, "hsl(190 40% 24%)", 42, -8, "255,246,214", 9],
  [198, 12, "hsl(205 44% 26%)", 48, -10, "255,255,255", 9],
  [265, 10, "hsl(232 34% 22%)", 31, -6, "235,230,245", 11],
];

export const GROUP_SCALE = Math.log2(1 + 1024);

export function rampOf(group: number): string {
  const t = Math.min(1, Math.log2(1 + group) / GROUP_SCALE);
  return `hsl(${190 - t * 90} ${14 + t * 22}% ${16 + t * 44}%)`;
}

const DOODAD_GROUP = 1024;
const FILL_PASSES = 4;

export function terrainTiles(src: Uint8Array, palette: number[], w: number, h: number): Uint8Array {
  const n = w * h;
  let cur = new Int16Array(n);
  for (let i = 0; i < n; i += 1) {
    cur[i] = (palette[src[i]] ?? 0) >= DOODAD_GROUP ? -1 : src[i];
  }
  const count = new Int32Array(256);
  const mode = (grid: Int16Array, x: number, y: number, fallback: number): number => {
    let best = fallback;
    let bestN = 0;
    const seen: number[] = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -1; dx <= 1; dx += 1) {
        const xx = x + dx;
        if (xx < 0 || xx >= w) continue;
        const v = grid[yy * w + xx];
        if (v < 0) continue;
        if (count[v] === 0) seen.push(v);
        count[v] += 1;
        if (count[v] > bestN || (count[v] === bestN && v === fallback)) { best = v; bestN = count[v]; }
      }
    }
    seen.forEach((v) => { count[v] = 0; });
    return best;
  };

  for (let pass = 0; pass < FILL_PASSES; pass += 1) {
    let left = 0;
    const next = new Int16Array(cur);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x;
        if (cur[i] >= 0) continue;
        const v = mode(cur, x, y, -1);
        if (v < 0) left += 1;
        else next[i] = v;
      }
    }
    cur = next;
    if (left === 0) break;
  }

  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) out[i] = cur[i] < 0 ? src[i] : cur[i];
  const smoothed = new Uint8Array(n);
  const asI16 = new Int16Array(out);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) smoothed[y * w + x] = mode(asI16, x, y, out[y * w + x]);
  }
  return smoothed;
}

export function terrainFill(
  tileset: number, level: number, walkable: boolean, partial: boolean,
): string {
  const [hue, sat, water, groundL, cliffD, , levelStep] = TILESET_TONE[tileset] ?? TILESET_TONE[0];
  if (!walkable) {
    if (level === 0) return water;
    const cliffL = Math.max(12, Math.min(78, groundL + level * levelStep + cliffD));
    return `hsl(${hue} ${Math.round(sat * 0.6)}% ${cliffL}%)`;
  }
  const light = groundL + level * levelStep;
  if (partial) {
    const shift = Math.round(20 * Math.min(1, sat / 20));
    return `hsl(${(hue + shift) % 360} ${Math.min(40, Math.round(sat * 1.3))}% ${light + 18}%)`;
  }
  return `hsl(${hue} ${sat}% ${light}%)`;
}

export function drawMapGrid(
  ctx: CanvasRenderingContext2D,
  grid: { width: number; height: number; palette: number[]; tiles: string;
    resources?: [number, number, 0 | 1][] | null },
  mt: MapTerrainLike | null,
  pxPerTile: number,
  drawResources = true,
  wallScale = 1,
): void {
  const { width: w, height: h, palette } = grid;
  const bin = atob(grid.tiles);
  const idxs = new Uint8Array(w * h);
  for (let i = 0; i < idxs.length; i += 1) idxs[i] = bin.charCodeAt(i);

  if (mt && mt.w === w && mt.h === h) {
    const n9 = w * h;
    const lvl = new Uint8Array(n9);
    const walk = new Uint8Array(n9);
    const ramp = new Uint8Array(n9);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x;
        lvl[i] = mt.levelAt(x, y);
        walk[i] = mt.walkAt(x, y) ? 1 : 0;
        ramp[i] = mt.rampAt ? (mt.rampAt(x, y) ? 1 : 0) : ((): number => {
          if (!mt.partialAt(x, y) || !mt.walkAt(x, y)) return 0;
          const lv = mt.levelAt(x, y);
          for (let d = 1; d <= 2; d += 1) {
            if (mt.levelAt(x - d, y) !== lv || mt.levelAt(x + d, y) !== lv
              || mt.levelAt(x, y - d) !== lv || mt.levelAt(x, y + d) !== lv) return 1;
          }
          return 0;
        })();
      }
    }
    const P = pxPerTile;
    const pathOf = (test: (i: number) => boolean): Path2D => maskPath(test, w, h, P);
    const isLand = (i: number): boolean => walk[i] === 1 || lvl[i] > 0;
    const realRGB = mt.rgbAt;
    const midColor = (test: (i: number) => boolean, fallback: string): string => {
      if (!realRGB) return fallback;
      const rs: number[] = [];
      const gs: number[] = [];
      const bs: number[] = [];
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          if (!test(y * w + x)) continue;
          const c = realRGB(x, y);
          if (!c) continue;
          rs.push(c[0]); gs.push(c[1]); bs.push(c[2]);
        }
      }
      if (rs.length === 0) return fallback;
      const mid = (a: number[]): number => {
        a.sort((p9, q9) => p9 - q9);
        return a[a.length >> 1];
      };
      return `rgb(${mid(rs)},${mid(gs)},${mid(bs)})`;
    };

    ctx.fillStyle = midColor((i) => !isLand(i), terrainFill(mt.tileset, 0, false, false));
    ctx.fillRect(0, 0, w * P, h * P);

    const landPath = pathOf(isLand);
    const lip = Math.max(1, P * 0.22);
    ctx.strokeStyle = "rgba(0,0,0,0.30)";
    ctx.lineWidth = lip * 2;
    ctx.lineJoin = "round";
    ctx.stroke(landPath);
    ctx.fillStyle = midColor((i) => walk[i] === 1 && lvl[i] === 0,
      terrainFill(mt.tileset, 0, true, false));
    ctx.fill(landPath, "evenodd");

    const wallUnit = P * 0.55 * wallScale;
    for (let L = 1; L <= 3; L += 1) {
      const has = (): boolean => {
        for (let i = 0; i < n9; i += 1) if (lvl[i] >= L && isLand(i)) return true;
        return false;
      };
      if (!has()) continue;
      const pL = pathOf((i) => lvl[i] >= L && isLand(i));
      ctx.save();
      ctx.translate(0, wallUnit * 0.45);
      ctx.fillStyle = "rgba(6,10,20,0.30)";
      ctx.fill(pL, "evenodd");
      ctx.translate(0, wallUnit * 0.55);
      ctx.fillStyle = "rgba(6,10,20,0.14)";
      ctx.fill(pL, "evenodd");
      ctx.restore();
      ctx.fillStyle = midColor((i) => walk[i] === 1 && lvl[i] === L,
        terrainFill(mt.tileset, L, true, false));
      ctx.fill(pL, "evenodd");
      ctx.strokeStyle = "rgba(255,255,255,0.34)";
      ctx.lineWidth = Math.max(1, P * 0.09);
      ctx.stroke(pL);
    }

    for (let L = 1; L <= 3; L += 1) {
      let any = false;
      for (let i = 0; i < n9; i += 1) if (lvl[i] === L && walk[i] === 0) { any = true; break; }
      if (!any) continue;
      ctx.fillStyle = midColor((i) => lvl[i] === L && walk[i] === 0,
        terrainFill(mt.tileset, L, false, false));
      ctx.fill(pathOf((i) => lvl[i] === L && walk[i] === 0), "evenodd");
    }

    for (let L = 0; L <= 3; L += 1) {
      let any = false;
      for (let i = 0; i < n9; i += 1) if (ramp[i] === 1 && lvl[i] === L) { any = true; break; }
      if (!any) continue;
      ctx.fillStyle = midColor((i) => ramp[i] === 1 && lvl[i] === L,
        terrainFill(mt.tileset, L, true, true));
      ctx.fill(pathOf((i) => ramp[i] === 1 && lvl[i] === L), "evenodd");
    }

    {
      ctx.save();
      ctx.clip(landPath, "evenodd");
      if (realRGB) {
        ctx.globalAlpha = 0.62;
        for (let y = 0; y < h; y += 1) {
          let runStart = 0;
          let runC = "";
          for (let x = 0; x <= w; x += 1) {
            const c9 = x < w && walk[y * w + x] === 1 ? realRGB(x, y) : null;
            const col = c9 ? `rgb(${c9[0]},${c9[1]},${c9[2]})` : "";
            if (col === runC) continue;
            if (runC) {
              ctx.fillStyle = runC;
              ctx.fillRect(runStart * P, y * P, (x - runStart) * P, P);
            }
            runStart = x;
            runC = col;
          }
        }
        ctx.globalAlpha = 1;
      } else {
        const tiles = terrainTiles(idxs, palette, w, h);
        const lightRGB = (TILESET_TONE[mt.tileset] ?? TILESET_TONE[0])[5];
        const jitter = palette.map((group) => {
          const g = (group * 2654435761) >>> 0;
          const mag = 0.6 + ((g >>> 13) % 1000) / 2500;
          return (group & 1) === 1 ? -mag : mag;
        });
        for (let y = 0; y < h; y += 1) {
          let runStart = 0;
          let runJ = 0;
          for (let x = 0; x <= w; x += 1) {
            const on = x < w && walk[y * w + x] === 1 ? (jitter[tiles[y * w + x]] ?? 0) : 0;
            if (on === runJ) continue;
            if (runJ !== 0) {
              ctx.fillStyle = runJ > 0
                ? `rgba(${lightRGB},${(runJ * 0.14).toFixed(3)})`
                : `rgba(22,29,45,${(-runJ * 0.32).toFixed(3)})`;
              ctx.fillRect(runStart * P, y * P, (x - runStart) * P, P);
            }
            runStart = x;
            runJ = on;
          }
        }
      }
      ctx.restore();
    }
  } else {
    const tiles = terrainTiles(idxs, palette, w, h);
    const colors = palette.map((group) => rampOf(group));
    for (let y = 0; y < h; y += 1) {
      let runStart = 0;
      let runIdx = -1;
      for (let x = 0; x <= w; x += 1) {
        const idx = x < w ? tiles[y * w + x] : -2;
        if (idx === runIdx) continue;
        if (runIdx >= 0) {
          ctx.fillStyle = colors[runIdx] ?? colors[0];
          ctx.fillRect(runStart * pxPerTile, y * pxPerTile, (x - runStart) * pxPerTile, pxPerTile);
        }
        runStart = x;
        runIdx = idx;
      }
    }
  }

  for (const [rx, ry, gas] of (drawResources ? grid.resources ?? [] : [])) {
    ctx.fillStyle = gas ? "rgba(90,220,140,0.9)" : "rgba(140,230,240,0.9)";
    ctx.beginPath();
    ctx.arc(rx * pxPerTile, ry * pxPerTile, Math.max(1, pxPerTile * 0.55), 0, Math.PI * 2);
    ctx.fill();
  }
}

export interface MapTerrainLike {
  w: number;
  h: number;
  tileset: number;
  levelAt: (x: number, y: number) => number;
  walkAt: (x: number, y: number) => boolean;
  partialAt: (x: number, y: number) => boolean;
  rampAt?: (x: number, y: number) => boolean;
  rgbAt?: (x: number, y: number) => [number, number, number] | null;
  walkAtMini: (mx: number, my: number) => boolean;
}
