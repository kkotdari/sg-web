const R = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296); };
const fmt = (v) => Math.round(v * 10) / 10;

function tendril(rnd, x, y, heading, len, seg = 2.6, jitter = 0.9) {
  const pts = [[x, y]];
  let h = heading;
  let d = 0;
  while (d < len) {
    const step = seg * (0.7 + rnd() * 0.7);
    h += (rnd() - 0.5) * jitter + (rnd() < 0.18 ? (rnd() < 0.5 ? 1 : -1) * 1.1 : 0);
    const nx = x + Math.cos(h) * step;
    const ny = y + Math.sin(h) * step;
    if (Math.hypot(nx - 24, ny - 24) > 21) break;
    x = nx; y = ny;
    pts.push([x, y]);
    d += step;
  }
  return pts;
}
const path = (pts) => "M" + pts.map(([a, b]) => `${fmt(a)} ${fmt(b)}`).join(" L");

function cluster(rnd, cx, cy, mainDir) {
  const out = { main: [], fork: [] };
  const nMain = 1 + (rnd() < 0.65 ? 1 : 0);
  for (let i = 0; i < nMain; i += 1) {
    const dir = mainDir + (i === 0 ? 0 : (rnd() - 0.5) * 2.2) + (rnd() - 0.5) * 0.5;
    const pts = tendril(rnd, cx, cy, dir, 10 + rnd() * 7);
    out.main.push(pts);
    const nF = 1 + (rnd() < 0.6 ? 1 : 0);
    for (let f = 0; f < nF; f += 1) {
      const at = pts[1 + Math.floor(rnd() * Math.max(1, pts.length - 3))];
      if (!at) continue;
      const fd = dir + (rnd() < 0.5 ? 1 : -1) * (0.7 + rnd() * 0.9);
      out.fork.push(tendril(rnd, at[0], at[1], fd, 4 + rnd() * 6, 2.2, 1.1));
    }
  }
  return out;
}

export function frame(seed, cores) {
  const rnd = R(seed);
  const bolt = [];
  const halo = [];
  const core = [];
  const stub = [];
  for (const [cx, cy, dir] of cores) {
    const c = cluster(rnd, cx, cy, dir);
    rnd();
    core.push(`<circle className="scr-storm-core" cx="${cx}" cy="${cy}" r="${fmt(1.1 + rnd() * 0.5)}" />`);
    const nS = 1 + Math.floor(rnd() * 2);
    for (let s = 0; s < nS; s += 1) {
      core.push(`<circle className="scr-storm-fleck" cx="${fmt(cx + (rnd() - 0.5) * 6)}" cy="${fmt(cy + (rnd() - 0.5) * 6)}" r="${fmt(0.4 + rnd() * 0.4)}" />`);
    }
    stub.push(`<path className="scr-storm-main" d="M${cx} ${cy} L${fmt(cx + (rnd() - 0.5) * 1.6)} ${fmt(cy - 2.4 - rnd() * 1.6)}" />`);
    for (const m of c.main) bolt.push(`<path className="scr-storm-main" d="${path(m)}" />`);
    for (const f of c.fork) bolt.push(`<path className="scr-storm-fork" d="${path(f)}" />`);
  }
  const spark = [];
  for (let i = 0; i < 5; i += 1) {
    const a = rnd() * Math.PI * 2;
    const rr = 16 + rnd() * 6;
    spark.push(`<circle className="scr-storm-spark" cx="${fmt(24 + Math.cos(a) * rr)}" cy="${fmt(24 + Math.sin(a) * rr)}" r="${fmt(0.4 + rnd() * 0.3)}" />`);
  }
  const rc = R((seed * 2654435761) >>> 0);
  const cols = [];
  for (const [cx, cy] of cores) {
    const pts = [[cx, cy]];
    let x = cx;
    let y = cy;
    const H = 16 + rc() * 9;
    while (cy - y < H && y > -24) {
      x += (rc() - 0.5) * 2.4;
      y -= 2.6 + rc() * 1.6;
      pts.push([x, y]);
    }
    cols.push(`<path className="scr-storm-col" d="${path(pts)}" />`);
    const at = pts[1 + Math.floor(rc() * Math.max(1, pts.length - 2))];
    if (at) {
      let sh = (rc() < 0.5 ? 1 : -1) * (0.9 + rc() * 0.5) - Math.PI / 2;
      let sx9 = at[0];
      let sy9 = at[1];
      const spts = [[sx9, sy9]];
      const nSeg = 2 + Math.floor(rc() * 2);
      for (let s9 = 0; s9 < nSeg; s9 += 1) {
        sh += (rc() - 0.5) * 0.8;
        sx9 += Math.cos(sh) * (1.6 + rc() * 1.4);
        sy9 += Math.sin(sh) * (1.6 + rc() * 1.4);
        spts.push([sx9, sy9]);
      }
      cols.push(`<path className="scr-storm-colspur" d="${path(spts)}" />`);
    }
    const top = pts[pts.length - 1];
    cols.push(`<circle className="scr-storm-fleck" cx="${fmt(top[0])}" cy="${fmt(top[1])}" r="${fmt(0.5 + rc() * 0.3)}" />`);
  }
  const colGroup = `<g className="scr-storm-cols">\n${cols.join("\n")}\n</g>`;
  return [...halo, ...bolt, ...stub, colGroup, ...core, ...spark].join("\n");
}

const CORES_A = [[11, 12, 0.7], [35, 9, 1.9], [25, 27, 0.15], [10, 35, -0.5], [39, 35, 2.8]];
const CORES_B = [[17, 9, 2.5], [38, 15, 2.6], [8, 25, -0.3], [26, 38, -0.9], [33, 28, 1.7]];

const seedA = Number(process.argv[2] ?? 41);
const seedB = Number(process.argv[3] ?? 87);
console.log(`<!-- 판 A (시드 ${seedA}) -->`);
console.log(frame(seedA, CORES_A));
console.log(`<!-- 판 B (시드 ${seedB}) -->`);
console.log(frame(seedB, CORES_B));
