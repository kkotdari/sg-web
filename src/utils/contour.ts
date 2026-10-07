export type Loop = number[];

const Q = 256;

export function contoursOf(f: Float32Array, w: number, h: number): Loop[] {
  const F = (x: number, y: number): number =>
    (x < 0 || y < 0 || x >= w || y >= h ? 0 : f[y * w + x]);
  const cut = (a: number, b: number): number => {
    const d = b - a;
    return Math.abs(d) < 1e-6 ? 0.5 : Math.max(0, Math.min(1, (0.5 - a) / d));
  };
  const key = (x: number, y: number): string =>
    `${Math.round(x * Q)},${Math.round(y * Q)}`;
  const ax: number[] = [];
  const ay: number[] = [];
  const bx: number[] = [];
  const by: number[] = [];
  const startAt = new Map<string, number[]>();
  const seg = (p: [number, number], q: [number, number]): void => {
    const i = ax.length;
    ax.push(p[0]); ay.push(p[1]); bx.push(q[0]); by.push(q[1]);
    const k = key(p[0], p[1]);
    const arr = startAt.get(k);
    if (arr) arr.push(i); else startAt.set(k, [i]);
  };
  for (let cy = -1; cy < h; cy += 1) {
    for (let cx = -1; cx < w; cx += 1) {
      const a = F(cx, cy);
      const b = F(cx + 1, cy);
      const c = F(cx + 1, cy + 1);
      const d = F(cx, cy + 1);
      const m = (a >= 0.5 ? 8 : 0) | (b >= 0.5 ? 4 : 0)
        | (c >= 0.5 ? 2 : 0) | (d >= 0.5 ? 1 : 0);
      if (m === 0 || m === 15) continue;
      const tx = cx + 0.5;
      const ty = cy + 0.5;
      const pT: [number, number] = [tx + cut(a, b), ty];
      const pR: [number, number] = [tx + 1, ty + cut(b, c)];
      const pB: [number, number] = [tx + cut(d, c), ty + 1];
      const pL: [number, number] = [tx, ty + cut(a, d)];
      switch (m) {
        case 1: seg(pL, pB); break;
        case 2: seg(pB, pR); break;
        case 3: seg(pL, pR); break;
        case 4: seg(pR, pT); break;
        case 5: seg(pL, pT); seg(pR, pB); break;
        case 6: seg(pB, pT); break;
        case 7: seg(pL, pT); break;
        case 8: seg(pT, pL); break;
        case 9: seg(pT, pB); break;
        case 10: seg(pT, pR); seg(pB, pL); break;
        case 11: seg(pT, pR); break;
        case 12: seg(pR, pL); break;
        case 13: seg(pR, pB); break;
        case 14: seg(pB, pL); break;
        default: break;
      }
    }
  }
  const used = new Uint8Array(ax.length);
  const loops: Loop[] = [];
  for (let i0 = 0; i0 < ax.length; i0 += 1) {
    if (used[i0]) continue;
    const loop: Loop = [ax[i0], ay[i0]];
    let i = i0;
    for (let guard = 0; guard <= ax.length; guard += 1) {
      used[i] = 1;
      loop.push(bx[i], by[i]);
      const cand = startAt.get(key(bx[i], by[i]));
      let nxt = -1;
      if (cand) {
        for (const j of cand) if (!used[j]) { nxt = j; break; }
      }
      if (nxt < 0) break;
      i = nxt;
    }
    const n9 = loop.length;
    if (n9 >= 8) {
      if (Math.abs(loop[n9 - 2] - loop[0]) < 1e-6 && Math.abs(loop[n9 - 1] - loop[1]) < 1e-6) {
        loop.length = n9 - 2;
      }
      loops.push(loop);
    }
  }
  return loops;
}

export function chaikin(loop: Loop): Loop {
  const n = loop.length / 2;
  if (n < 4) return loop;
  const out: Loop = [];
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const x0 = loop[i * 2];
    const y0 = loop[i * 2 + 1];
    const x1 = loop[j * 2];
    const y1 = loop[j * 2 + 1];
    out.push(x0 + (x1 - x0) * 0.25, y0 + (y1 - y0) * 0.25);
    out.push(x0 + (x1 - x0) * 0.75, y0 + (y1 - y0) * 0.75);
  }
  return out;
}

export function maskPath(
  test: (i: number) => boolean, w: number, h: number, scale: number, smooth = 3,
): Path2D {
  const f = new Float32Array(w * h);
  for (let i = 0; i < f.length; i += 1) f[i] = test(i) ? 1 : 0;
  let loops = contoursOf(f, w, h);
  for (let q = 0; q < smooth; q += 1) loops = loops.map(chaikin);
  const p = new Path2D();
  for (const lp of loops) {
    const m = lp.length / 2;
    if (m < 3) continue;
    p.moveTo(lp[0] * scale, lp[1] * scale);
    for (let i = 1; i < m; i += 1) p.lineTo(lp[i * 2] * scale, lp[i * 2 + 1] * scale);
    p.closePath();
  }
  return p;
}
