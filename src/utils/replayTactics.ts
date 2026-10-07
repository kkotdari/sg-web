import type { BuildPos, ParsedReplayPlayer, ReplayPlayerSignals } from "./replayParser";
import { hasTech, hasUpgrade } from "./replayTechNames";

const SECONDS_PER_FRAME = 0.042;

const SUNKEN_RUSH_SEC = 3 * 60;
const CANNON_RUSH_SEC = 20 * 60;
const CANNON_RUSH_EARLY_SEC = 6 * 60;
const CANNON_RUSH_LATE_MIN = 2;

const WALL_IN_SEC = 10 * 60;
const WALL_IN_MIN = 2;
const WALL_KIND_MIN = 2;
const WALL_SPAN = 5;
const WALL_MAX = 6;
const WALL_BURST_SEC = 180;
const WALL_MORPH_SEC = 90;
const WALL_IN_GROW_MIN = 2;

export interface Tactic {
  key: string;
  weight: number;
  at: number | null;
  who: string;
  whom?: string;
  who2?: string;
  p?: Record<string, string | number | boolean | string[] | number[]>;
}






type Zone = "home" | "ally" | "mid" | "enemy" | "unknown";

export type BuildSpot =
  | "myBase" | "myFront"
  | "allyBase" | "allyFront"
  | "enemyBase" | "enemyFront"
  | "mid"
  | "unknown";

const BURST_GAP_SEC = 3 * 60;

export function burstsOf(frames: number[]): { from: number; to: number; n: number }[] {
  if (frames.length === 0) return [];
  const sorted = [...frames].sort((a, b) => a - b);
  const gap = BURST_GAP_SEC / SECONDS_PER_FRAME;
  const out: { from: number; to: number; n: number }[] = [{ from: sorted[0], to: sorted[0], n: 1 }];
  for (let i = 1; i < sorted.length; i += 1) {
    const cur = out[out.length - 1];
    if (sorted[i] - sorted[i - 1] > gap) out.push({ from: sorted[i], to: sorted[i], n: 1 });
    else { cur.to = sorted[i]; cur.n += 1; }
  }
  return out;
}

const UNIT_BUILD_FRAMES: Record<string, { frames: number; from?: string }> = {
  Carrier: { frames: 2100, from: "Stargate" },
  Battlecruiser: { frames: 2000, from: "Starport" },
  Zealot: { frames: 952, from: "Gateway" },
  Dragoon: { frames: 1190, from: "Gateway" },
  "High Templar": { frames: 1190, from: "Gateway" },
  "Dark Templar": { frames: 1190, from: "Gateway" },
  Marine: { frames: 571, from: "Barracks" },
  Firebat: { frames: 571, from: "Barracks" },
  Medic: { frames: 714, from: "Barracks" },
  Ghost: { frames: 1190, from: "Barracks" },
  Vulture: { frames: 714, from: "Factory" },
  "Siege Tank (Tank Mode)": { frames: 1190, from: "Factory" },
  Goliath: { frames: 952, from: "Factory" },
  Wraith: { frames: 1428, from: "Starport" },
  Valkyrie: { frames: 1190, from: "Starport" },
  Dropship: { frames: 1190, from: "Starport" },
  "Science Vessel": { frames: 1904, from: "Starport" },
  Scout: { frames: 1904, from: "Stargate" },
  Corsair: { frames: 952, from: "Stargate" },
  Arbiter: { frames: 3809, from: "Stargate" },
  Shuttle: { frames: 1428, from: "Robotics Facility" },
  Reaver: { frames: 1666, from: "Robotics Facility" },
  Observer: { frames: 952, from: "Robotics Facility" },
  Probe: { frames: 476, from: "Nexus" },
  SCV: { frames: 476, from: "Command Center" },
  Drone: { frames: 476 },
  Zergling: { frames: 667 },
  Hydralisk: { frames: 667 },
  Scourge: { frames: 714 },
  Overlord: { frames: 952 },
  Mutalisk: { frames: 952 },
  Queen: { frames: 1190 },
  Defiler: { frames: 1190 },
  Ultralisk: { frames: 1428 },
};

const PRODUCERS: Record<string, { ready: number; start?: true }> = {
  Gateway: { ready: 1428 },
  Barracks: { ready: 1904 },
  Factory: { ready: 1904 },
  Starport: { ready: 1666 },
  Stargate: { ready: 1666 },
  "Robotics Facility": { ready: 1904 },
  Nexus: { ready: 2857, start: true },
  "Command Center": { ready: 2857, start: true },
};

const producedCache = new WeakMap<ReplayPlayerSignals, Map<number, Map<string, number[]>>>();

function producedAll(s: ReplayPlayerSignals, endFrame: number | null): Map<string, number[]> {
  const key = endFrame ?? -1;
  let byEnd = producedCache.get(s);
  if (!byEnd) { byEnd = new Map(); producedCache.set(s, byEnd); }
  const hit = byEnd.get(key);
  if (hit) return hit;

  const pools = new Map<string, number[]>();
  const poolOf = (from: string): number[] => {
    const seen = pools.get(from);
    if (seen) return seen;
    const spec = PRODUCERS[from];
    const ready = spec?.ready ?? 0;
    const starts = [...(s.buildingFrames[from] ?? [])];
    if (spec?.start) starts.push(-ready);
    const free = starts.map((f) => f + ready);
    pools.set(from, free);
    return free;
  };

  const jobs: { f: number; unit: string }[] = [];
  for (const [unit, fs] of Object.entries(s.unitFrames)) {
    if (!UNIT_BUILD_FRAMES[unit]) continue;
    for (const f of fs) jobs.push({ f, unit });
  }
  jobs.sort((a, b) => a.f - b.f);

  const out = new Map<string, number[]>();
  const put = (unit: string, f: number) => {
    const at = out.get(unit);
    if (at) at.push(f); else out.set(unit, [f]);
  };
  for (const j of jobs) {
    const spec = UNIT_BUILD_FRAMES[j.unit];
    const free = spec.from === undefined ? null : poolOf(spec.from);
    let start = j.f;
    if (free !== null && free.length > 0) {
      let idx = 0;
      for (let i = 1; i < free.length; i += 1) if (free[i] < free[idx]) idx = i;
      start = Math.max(j.f, free[idx]);
      free[idx] = start + spec.frames;
    }
    const at = start + spec.frames;
    if (endFrame === null || at <= endFrame) put(j.unit, at);
  }
  byEnd.set(key, out);
  return out;
}

export function producedFrames(
  s: ReplayPlayerSignals,
  unit: string,
  endFrame: number | null
): number[] {
  const cmds = [...(s.unitFrames[unit] ?? [])].sort((a, b) => a - b);
  if (!UNIT_BUILD_FRAMES[unit] || cmds.length === 0) return cmds;
  return producedAll(s, endFrame).get(unit) ?? [];
}

const CONCURRENT_WINDOW_SEC = 150;

export function windowPeak(frames: number[], seconds = CONCURRENT_WINDOW_SEC): number {
  if (frames.length === 0) return 0;
  const sorted = [...frames].sort((a, b) => a - b);
  const w = seconds / SECONDS_PER_FRAME;
  let best = 0;
  let lo = 0;
  for (let hi = 0; hi < sorted.length; hi += 1) {
    while (sorted[hi] - sorted[lo] > w) lo += 1;
    best = Math.max(best, hi - lo + 1);
  }
  return best;
}

export function biggestBurst(frames: number[]): { from: number; to: number; n: number } | null {
  const bs = burstsOf(frames);
  if (bs.length === 0) return null;
  return bs.reduce((a, b) => (b.n > a.n ? b : a));
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function medoid(pts: { x: number; y: number }[]): { x: number; y: number } | null {
  if (pts.length === 0) return null;
  let best = pts[0];
  let bestSum = Infinity;
  for (const a of pts) {
    let sum = 0;
    for (const b of pts) sum += dist(a, b);
    if (sum < bestSum) { bestSum = sum; best = a; }
  }
  return best;
}

function spreadOf(p: ParsedReplayPlayer): number | null {
  const pts = p.signals?.buildPositions ?? [];
  const h = homeOf(p);
  if (!h || pts.length < MIN_BUILDINGS_FOR_HOME) return null;
  const ds = pts.map((b) => dist(b, h)).sort((a, b) => a - b);
  return ds[Math.floor(ds.length / 2)];
}

const MIN_BUILDINGS_FOR_HOME = 4;
const HOME_RADIUS = 0.33;
const TOWN_HALLS = new Set(["Nexus", "Hatchery", "Command Center"]);
const ENEMY_RADIUS = 0.22;
const TURF_RADIUS = 0.3;
const MID_MAP_RATIO = 0.22;
const MID_AWAY_RATIO = 0.35;
const FRONT_MIN = 0.1;
const FRONT_COS = 0.5;
const FIREBAT_RUSH_MIN = 6;
const ZLING_RUSH_MIN = 6;
const ZLING_RUSH_WINDOW_SEC = 120;
const ZLING_RUSH_SPAN_SEC = 30;

const GREEDY_BUILD_SEC = 6 * 60;
const GREEDY_MASS_SEC = GREEDY_BUILD_SEC;
const GREEDY_BARE_EXPANDS_Z = 2;
const GREEDY_MIN_EXPANDS_Z = 4;
const GREEDY_MIN_EXPANDS = 2;
const GREEDY_ARMY_PER_BASE = 2;
const GREEDY_SPAN_SEC = 90;
const GREEDY_WORKER_GROW = 4;
const GREEDY_DEF_WORTH = 2;
const DEF_BUILDINGS = [
  "Creep Colony", "Sunken Colony", "Spore Colony", "Photon Cannon", "Bunker", "Missile Turret",
];
const TECH_BUILDINGS: Record<string, string[]> = {
  저그: [
    "Lair", "Hive", "Evolution Chamber", "Hydralisk Den", "Spire", "Greater Spire",
    "Queen's Nest", "Defiler Mound", "Ultralisk Cavern", "Nydus Canal",
  ],
  프로토스: [
    "Forge", "Cybernetics Core", "Citadel of Adun", "Templar Archives",
    "Robotics Support Bay", "Observatory", "Fleet Beacon", "Arbiter Tribunal",
  ],
  테란: [
    "Engineering Bay", "Academy", "Armory", "Science Facility",
    "Machine Shop", "Control Tower", "Covert Ops", "Physics Lab",
  ],
};
const GREEDY_TECH_WORTH = 0.5;
const GREEDY_TECH_MIN_Z = 1;
const PEACE_UNITS = new Set([
  "SCV", "Probe", "Drone", "Larva", "Egg", "Overlord", "Cocoon", "Mutalisk Cocoon", "Lurker Egg",
  "Shuttle", "Dropship", "Observer", "Science Vessel", "Medic",
]);

const ALLY_CANNON_MIN = 2;

const DROP_WINDOW_FRAMES = 40 / 0.042;

const RECALL_SAME_SEC = 60;
const RECALL_MAX_BEATS = 3;
const SIDE_TANK_MIN = 5;
const SIDE_TANK_ORDERS = 4;
const SIDE_TANK_SPOT_TILES = 6;

const SNEAK_WEIGHT = 20;

const FAST_UNITS: [string, number][] = [
  ["Dark Templar", 8 * 60], ["Reaver", 9 * 60], ["Lurker", 7 * 60],
  ["Dragoon", 5 * 60], ["Vulture", 4 * 60], ["Mutalisk", 7 * 60],
];
const FAST_MIN_UNITS = 3;
const POWER_UNITS: [string, number][] = [
  ["Dragoon", 0.17], ["Hydralisk", 0.22], ["Zealot", 0.22], ["Marine", 0.28],
  ["Vulture", 0.17], ["Zergling", 0.33],
];
const POWER_SHARE = 0.6;
const POWER_SOLO: { unit: string; min: number; keys?: string[] }[] = [
  { unit: "Zealot", min: 1.2 },
  { unit: "Marine", min: 1 },
  { unit: "Dragoon", min: 0.6 },
  { unit: "Hydralisk", min: 0.55 },
  {
    unit: "Siege Tank (Tank Mode)", min: 0.5,
    keys: ["Siege Tank (Tank Mode)", "Siege Tank (Siege Mode)"],
  },
  { unit: "Goliath", min: 0.45 },
  { unit: "Scout", min: 0.33 },
  { unit: "Vulture", min: 0.28 },
  { unit: "Zergling", min: 0.22 },
  { unit: "Mutalisk", min: 0.17 },
];
const MASS_RATE_MIN = 20;
const MASS_RATE_RATIO = 1.6;
const MASS_TOTAL_MIN = 200;
const MASS_PAIR_SHARE = 0.7;
const WRAITH_MIN = 4;
const CARRIER_MIN = 4;
const BC_PEAK_MIN = 2;
const GUARDIAN_MIN = 4;

const MUTA_MASS_SHARE = 0.1;
const MUTA_MASS_FLOOR = 6;
const CARRIER_SHARE = 0.03;
const WRAITH_SHARE = 0.03;
const GUARDIAN_SHARE = 0.03;
const SIDE_TANK_SHARE = 0.02;
const POWER_FLOOR = 24;
const POWER_SOLO_FLOOR = 24;
const WORKER_OF = new Map<string, string>([
  ["Probe", "프로토스"], ["Drone", "저그"], ["SCV", "테란"],
]);
const MIND_WORKER_MIN = 3;
const SOLO_EXCLUDE = new Set([
  "SCV", "Probe", "Drone", "Overlord", "Larva", "Egg",
  "Interceptor", "Scarab", "Spider Mine", "Scanner Sweep",
]);
const LODGING_LATE_SEC = 3 * 60;

function homeOf(p: ParsedReplayPlayer): { x: number; y: number } | null {
  const pts = p.signals?.buildPositions ?? [];
  return pts.length >= MIN_BUILDINGS_FOR_HOME ? medoid(pts) : null;
}

const HOME_EARLY_BUILDINGS = 8;
function startHomeOf(p: ParsedReplayPlayer): { x: number; y: number } | null {
  const pts = p.signals?.buildPositions ?? [];
  if (pts.length < MIN_BUILDINGS_FOR_HOME) return null;
  const early = [...pts]
    .sort((a, b) => (a.frame ?? 0) - (b.frame ?? 0))
    .slice(0, HOME_EARLY_BUILDINGS);
  return medoid(early);
}

const PUSH_RADIUS = 0.3;
const PUSH_ORDER_MIN = 12;
const RUSH_GO_ORDERS = 12;
const RUSH_GO_SEC = 180;
const RUSH_SIZE_SEC = 90;
const RAID_WINDOW_SEC = 120;
const RAID_ORDERS_MIN = 30;
const TANK_HOLD_ORDERS = 60;
const TANK_HOLD_SHARE = 0.3;
const TANK_HOLD_MIN = 4;
const WENT_WITH_SEC = 120;
const RAID_UNIT_EXCLUDE = new Set([
  "SCV", "Probe", "Drone", "Supply Depot", "Pylon", "Overlord", "Larva",
  "Observer", "Scanner Sweep", "Medic", "Shuttle", "Dropship", "Overlord (Transport)",
]);

export function pushersOn(
  victim: ParsedReplayPlayer,
  movers: ParsedReplayPlayer[],
  from: number,
  to: number,
  scaleWith?: ParsedReplayPlayer[],
): string[] {
  const home = startHomeOf(victim);
  if (!home) return [];
  const moverHomes = movers.map(startHomeOf).filter((h): h is { x: number; y: number } => h !== null);
  if (moverHomes.length === 0) return [];
  const scaleHomes = (scaleWith ?? movers)
    .map(startHomeOf).filter((h): h is { x: number; y: number } => h !== null);
  if (scaleHomes.length === 0) return [];
  const base = Math.min(...scaleHomes.map((h) => dist(home, h)));
  if (!(base > 0)) return [];
  const r = base * PUSH_RADIUS;
  return movers
    .filter((f) => {
      let n = 0;
      for (const o of f.signals?.orderPositions ?? []) {
        if (o.frame < from || o.frame > to) continue;
        if (o.by === "Building") continue;
        if (o.by === "Worker" && o.kind === undefined) continue;
        if (dist(o, home) < r && ++n >= PUSH_ORDER_MIN) return true;
      }
      return false;
    })
    .map((f) => f.rawName);
}

const FIGHT_RADIUS = 14;
const FIGHT_WINDOW_SEC = 60;
export const GG_RE = /(^|[^a-z])(g{2,}|w{2,})(?!\.[a-z])([^a-z]|$)|ㅈ{2,}|(^|[^가-힣])(지지|쥐쥐)|잘{1,2}했|잘하시네/i;
export const NO_ELIM_RE = /노\s*엘|(^|[^가-힣])ㄴ\s*ㅇ(ㄹ)?([^가-힣]|$)/;

const FIGHT_MIN_ORDERS = 3;
const FIGHT_UNIT_UNKNOWN = new Set(["Worker", "Building", "Transport"]);
export const FIGHT_TECHS = new Set([
  "Psionic Storm", "Dark Swarm", "Plague", "Irradiate", "EMP Shockwave", "Stasis Field",
  "Maelstrom", "Ensnare", "Lockdown", "Disruption Web", "Spawn Broodlings", "Yamato Gun",
]);

export function fightersAt(
  at: { x: number; y: number },
  frames: number[],
  players: ParsedReplayPlayer[],
): { raw: string; n: number; units: string[] }[] {
  if (frames.length === 0) return [];
  const window = FIGHT_WINDOW_SEC / SECONDS_PER_FRAME;
  const moments = [...frames].sort((a, b) => a - b);
  const inWindow = (f: number): boolean => {
    let lo = 0;
    let hi = moments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (moments[mid] < f) lo = mid + 1; else hi = mid;
    }
    return Math.abs(moments[lo] - f) <= window
      || (lo > 0 && Math.abs(moments[lo - 1] - f) <= window);
  };
  const out: { raw: string; n: number; units: string[] }[] = [];
  for (const p of players) {
    const sg = p.signals;
    if (!sg) continue;
    let n = 0;
    const tally = new Map<string, number>();
    for (const o of sg.orderPositions ?? []) {
      if (o.kind !== "attack" || o.by === "Building") continue;
      if (dist(o, at) > FIGHT_RADIUS || !inWindow(o.frame)) continue;
      n += 1;
      if (o.by && !FIGHT_UNIT_UNKNOWN.has(o.by)) tally.set(o.by, (tally.get(o.by) ?? 0) + 1);
    }
    for (const c of sg.castPositions ?? []) {
      if (!FIGHT_TECHS.has(c.tech)) continue;
      if (dist(c, at) > FIGHT_RADIUS || !inWindow(c.frame)) continue;
      n += 1;
    }
    if (n < FIGHT_MIN_ORDERS) continue;
    out.push({
      raw: p.rawName, n,
      units: [...tally].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([u]) => u),
    });
  }
  return out.sort((a, b) => b.n - a.n);
}

interface Geo {
  zone: (b: BuildPos) => Zone;
  allyAt: (b: BuildPos) => string | null;
  enemyAt: (b: { x: number; y: number }) => string | null;
  foeTurfAt: (b: { x: number; y: number }) => string | null;
  front: (b: BuildPos) => boolean;
  spot: (b: { x: number; y: number }) => BuildSpot;
  allyFrontOf: (b: { x: number; y: number }) => { ally: string; foe: string | null } | null;
  lodgingHost: string | null;
  lodgingLost: boolean;
}

function geoOf(
  me: ParsedReplayPlayer,
  allies: ParsedReplayPlayer[],
  foes: ParsedReplayPlayer[],
  startSpots?: [number, number][],
): Geo | null {
  const home = startHomeOf(me);
  if (!home) return null;
  const foeHomes = foes.map(startHomeOf).filter((h): h is { x: number; y: number } => h !== null);
  if (foeHomes.length === 0) return null;
  const allyHomes = allies
    .map((a) => ({ raw: a.rawName, h: startHomeOf(a) }))
    .filter((a): a is { raw: string; h: { x: number; y: number } } => a.h !== null);
  const base = Math.min(...foeHomes.map((h) => dist(home, h)));
  if (!(base > 0)) return null;
  const near = foeHomes.reduce((a, b) => (dist(home, b) < dist(home, a) ? b : a));
  const dir = { x: (near.x - home.x) / base, y: (near.y - home.y) / base };

  const foeHomeOf = foes
    .map((f) => ({ raw: f.rawName, h: startHomeOf(f) }))
    .filter((f): f is { raw: string; h: { x: number; y: number } } => f.h !== null);

  const seatHomes = [home, ...allyHomes.map((a) => a.h), ...foeHomes];
  const allHomes = (startSpots ?? []).length >= 2
    ? (startSpots as [number, number][]).map(([x, y]) => ({ x, y }))
    : seatHomes;
  const mapMid = {
    x: (Math.min(...allHomes.map((h) => h.x)) + Math.max(...allHomes.map((h) => h.x))) / 2,
    y: (Math.min(...allHomes.map((h) => h.y)) + Math.max(...allHomes.map((h) => h.y))) / 2,
  };
  const ring = allHomes.reduce((n, h) => n + dist(h, mapMid), 0) / allHomes.length;
  const atMapMid = (b: { x: number; y: number }): boolean => {
    if (!(ring > 0)) return false;
    if (dist(b, mapMid) >= ring * MID_MAP_RATIO) return false;
    return seatHomes.every((h) => dist(b, h) > ring * MID_AWAY_RATIO);
  };

  const myBases = [home, ...(me.signals?.buildPositions ?? [])
    .filter((b) => TOWN_HALLS.has(b.unit))
    .map((b) => ({ x: b.x, y: b.y }))];
  const nearMyBase = (b: { x: number; y: number }): boolean => myBases.some((h) => dist(b, h) < base * HOME_RADIUS);

  const enemyAt = (b: { x: number; y: number }): string | null => {
    let best: { raw: string; d: number } | null = null;
    for (const f of foeHomeOf) {
      const d = dist(b, f.h);
      if (d < base * ENEMY_RADIUS && (!best || d < best.d)) best = { raw: f.raw, d };
    }
    return best?.raw ?? null;
  };

  const foeTurfAt = (b: { x: number; y: number }): string | null => {
    let best: { raw: string; d: number } | null = null;
    for (const f of foeHomeOf) {
      const d = dist(b, f.h);
      if (d < base * TURF_RADIUS && (!best || d < best.d)) best = { raw: f.raw, d };
    }
    if (!best) return null;
    const ours = Math.min(
      ...myBases.map((h) => dist(b, h)),
      ...allyHomes.map((a) => dist(b, a.h)),
    );
    return best.d < ours ? best.raw : null;
  };

  const allyAt = (b: BuildPos): string | null => {
    let best: { raw: string; d: number } | null = null;
    for (const a of allyHomes) {
      const d = dist(b, a.h);
      if (d < base * HOME_RADIUS && (!best || d < best.d)) best = { raw: a.raw, d };
    }
    return best?.raw ?? null;
  };

  const zone = (b: BuildPos): Zone => {
    if (nearMyBase(b)) return "home";
    const toFoe = Math.min(...foeHomes.map((h) => dist(b, h)));
    if (toFoe < base * ENEMY_RADIUS) return "enemy";
    if (allyAt(b) !== null) return "ally";
    if (atMapMid(b)) return "mid";
    return "unknown";
  };

  const front = (b: { x: number; y: number }): boolean => {
    const v = { x: b.x - home.x, y: b.y - home.y };
    const len = Math.hypot(v.x, v.y);
    if (len < base * FRONT_MIN) return false;
    if (len > base * HOME_RADIUS) return false;
    return (v.x * dir.x + v.y * dir.y) / len > FRONT_COS;
  };

  const towardFront = (
    origin: { x: number; y: number }, target: { x: number; y: number },
    b: { x: number; y: number }, radius: number,
  ): boolean => {
    const len = Math.hypot(b.x - origin.x, b.y - origin.y);
    if (len < base * FRONT_MIN || len > base * radius) return false;
    const tl = Math.hypot(target.x - origin.x, target.y - origin.y);
    if (!(tl > 0)) return false;
    const cos = ((b.x - origin.x) * (target.x - origin.x) + (b.y - origin.y) * (target.y - origin.y))
      / (len * tl);
    return cos > FRONT_COS;
  };

  const spot = (b: { x: number; y: number }): BuildSpot => {
    if (nearMyBase(b)) return front(b) ? "myFront" : "myBase";
    let nearFoe: { h: { x: number; y: number }; d: number } | null = null;
    for (const h of foeHomes) {
      const d = dist(b, h);
      if (!nearFoe || d < nearFoe.d) nearFoe = { h, d };
    }
    if (nearFoe && nearFoe.d < base * ENEMY_RADIUS) {
      return towardFront(nearFoe.h, home, b, ENEMY_RADIUS) ? "enemyFront" : "enemyBase";
    }
    for (const a of allyHomes) {
      if (dist(b, a.h) >= base * HOME_RADIUS) continue;
      const foe = foeHomes.reduce((x, y) => (dist(a.h, y) < dist(a.h, x) ? y : x));
      return towardFront(a.h, foe, b, HOME_RADIUS) ? "allyFront" : "allyBase";
    }
    if (atMapMid(b)) return "mid";
    return "unknown";
  };

  const allyFrontOf = (b: { x: number; y: number }): { ally: string; foe: string | null } | null => {
    if (spot(b) !== "allyFront") return null;
    const a = allyHomes.find((x) => dist(b, x.h) < base * HOME_RADIUS);
    if (!a) return null;
    const foe = foeHomeOf.length > 0
      ? foeHomeOf.reduce((x, y) => (dist(a.h, y.h) < dist(a.h, x.h) ? y : x)).raw : null;
    return { ally: a.raw, foe };
  };

  const lodging = (() => {
    const myPts = me.signals?.buildPositions ?? [];
    const firstNear = (p: ParsedReplayPlayer, at: { x: number; y: number }, r: number) => {
      const fs = (p.signals?.buildPositions ?? [])
        .filter((b) => dist(b, at) <= r && b.frame !== null)
        .map((b) => b.frame as number);
      return fs.length > 0 ? Math.min(...fs) : null;
    };
    const early = [...myPts].sort((a, b) => (a.frame ?? 0) - (b.frame ?? 0)).slice(0, 5);
    const start = medoid(early) ?? home;
    const mySpread = spreadOf(me) ?? 0;

    let best: { raw: string; lost: boolean; d: number } | null = null;
    for (const a of allies) {
      const h = homeOf(a);
      const spread = spreadOf(a);
      if (!h || spread === null || !(spread > 0)) continue;
      if (dist(home, h) >= base * HOME_RADIUS) continue;
      const mine = firstNear(me, h, spread);
      const theirs = firstNear(a, h, spread);
      if (mine === null || theirs === null || sec(mine - theirs) < LODGING_LATE_SEC) continue;

      const inside = dist(home, h) <= spread;
      const mineThere = myPts.filter((b) => dist(b, h) <= spread);
      const backHome = myPts.filter(
        (b) => (b.frame ?? 0) > mine && mySpread > 0 && dist(b, start) <= mySpread
      );
      const moved = dist(start, h) > spread && mineThere.length >= 3 && backHome.length <= 1;
      if (!inside && !moved) continue;
      const d = dist(home, h);
      if (!best || d < best.d) best = { raw: a.rawName, lost: moved, d };
    }
    return best;
  })();
  const lodgingHost = lodging?.raw ?? null;
  const lodgingLost = lodging?.lost ?? false;

  return {
    zone, allyAt, enemyAt, foeTurfAt, front, spot, allyFrontOf, lodgingHost, lodgingLost,
  };
}

interface Ctx {
  rawName: string;
  s: ReplayPlayerSignals;
  race: string;
  foeRaces: string[];
  geo: Geo | null;
  soleFoe: string | null;
  neighbor: { raw: string; fellAt: number } | null;
  foeFightingAt: (at: { x: number; y: number }, frames: number[])
    => { raw: string; units: string[] } | null;
  endFrame: number;
  massRateBar: number;
  armyMid: number;
}

const sec = (frame: number) => frame * SECONDS_PER_FRAME;

export function midOf(values: number[]): number {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const h = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[h] : (v[h - 1] + v[h]) / 2;
}


function detectFor(c: Ctx): Tactic[] {
  const {
    rawName, s, race, foeRaces, soleFoe, geo, neighbor, endFrame, foeFightingAt, massRateBar,
    armyMid,
  } = c;
  const unitBar = (share: number, floor: number) =>
    Math.max(floor, Math.round(armyMid * share));
  const out: Tactic[] = [];
  const u = (n: string) => s.unitCounts[n] ?? 0;
  const firstU = (n: string): number | null => s.firstUnitFrame[n] ?? null;
  const rushSize = (unit: string, from: number): number => {
    const made = producedFrames(s, unit, endFrame);
    if (made.length === 0) return 0;
    const start = Math.max(from, Math.min(...made));
    return made.filter((f) => f <= start + RUSH_SIZE_SEC / SECONDS_PER_FRAME).length;
  };
  const firstB = (n: string): number | null => s.firstBuildingFrame[n] ?? null;
  const tanks = u("Siege Tank (Tank Mode)") + u("Siege Tank (Siege Mode)");
  const who = rawName;
  const target = soleFoe ? { whom: soleFoe } : {};
  const army = Object.entries(s.unitCounts).filter(([u]) => !SOLO_EXCLUDE.has(u));
  const armyTotal = army.reduce((acc, [, n]) => acc + n, 0);
  const topArmy = army.map(([, n]) => n).sort((a, b) => b - a)[0] ?? 0;
  const solo = armyTotal >= 12 && topArmy / armyTotal >= 0.8;
  const dropped = s.unloadCount >= 2;
  const wentWith = (at: number): { unit: string; n: number } | null => {
    const from = at - WENT_WITH_SEC / SECONDS_PER_FRAME;
    let best: { unit: string; n: number } | null = null;
    for (const unit of Object.keys(s.unitFrames)) {
      if (RAID_UNIT_EXCLUDE.has(unit)) continue;
      const fs = producedFrames(s, unit, endFrame);
      const n = fs.filter((f) => f >= from && f <= at).length;
      if (n > 0 && (!best || n > best.n)) best = { unit, n };
    }
    return best;
  };
  const wentAt = (from: number | null, withinSec: number): boolean => {
    if (!geo) return true;
    if (from === null) return false;
    const to = from + withinSec / SECONDS_PER_FRAME;
    let n = 0;
    for (const o of s.orderPositions) {
      if (o.frame < from || o.frame > to) continue;
      if (geo.enemyAt(o) === null) continue;
      n += 1;
      if (n >= RUSH_GO_ORDERS) return true;
    }
    return false;
  };
  const castAt = (
    tech: string,
  ): { frame: number; xy: [number, number]; whom?: string } | null => {
    const hits = (s.castPositions ?? [])
      .filter((c) => c.tech === tech)
      .sort((a, b) => a.frame - b.frame);
    if (hits.length === 0) return null;
    const owned = geo
      ? hits.map((c) => ({ c, whom: geo.enemyAt(c) })).find((x) => x.whom !== null)
      : undefined;
    const hit = owned?.c ?? hits[0];
    return {
      frame: hit.frame, xy: [hit.x, hit.y],
      ...(owned?.whom ? { whom: owned.whom } : {}),
    };
  };

  const dropSpot = (): { xy: [number, number]; whom?: string } | null => {
    const unload = s.firstUnloadFrame;
    if (unload === null || !geo) return null;
    const near = (s.orderPositions ?? [])
      .filter((o) => o.by === "Transport" && Math.abs(o.frame - unload) <= DROP_WINDOW_FRAMES)
      .filter((o) => { const sp = geo.spot(o); return sp !== "myBase" && sp !== "myFront"; })
      .sort((a, b) => Math.abs(a.frame - unload) - Math.abs(b.frame - unload));
    if (near.length === 0) return null;
    const owned = near.map((o) => ({ o, whom: geo.enemyAt(o) })).find((x) => x.whom !== null);
    const pick = owned?.o ?? near[0];
    return { xy: [pick.x, pick.y], ...(owned?.whom ? { whom: owned.whom } : {}) };
  };

  const spotOf = (bs: BuildPos[]): { spot: BuildSpot } | Record<string, never> => {
    if (!geo || bs.length === 0) return {};
    const tally = new Map<BuildSpot, number>();
    for (const b of bs) {
      const sp = geo.spot(b);
      if (sp !== "unknown") tally.set(sp, (tally.get(sp) ?? 0) + 1);
    }
    if (tally.size === 0) return {};
    const best = [...tally].sort((a, b) => b[1] - a[1])[0][0];
    return { spot: best };
  };

  const inZone = (z: Zone, unit?: string, beforeSec?: number): BuildPos[] => {
    if (!geo) return [];
    return s.buildPositions.filter(
      (p) =>
        (unit === undefined || p.unit === unit) &&
        (beforeSec === undefined || (p.frame !== null && sec(p.frame) < beforeSec)) &&
        geo.zone(p) === z
    );
  };
  const atFront = (unit: string): BuildPos[] =>
    geo ? inZone("home", unit).filter(geo.front) : [];
  const foeAt = (b: BuildPos[]): { whom: string } | typeof target => {
    if (geo) {
      for (const x of b) {
        const f = geo.enemyAt(x);
        if (f) return { whom: f };
      }
    }
    return target;
  };
  const firstOf = (b: BuildPos[]): number | null => {
    const f = b.map((x) => x.frame).filter((x): x is number => x !== null);
    return f.length > 0 ? Math.min(...f) : null;
  };
  const lastOf = (b: BuildPos[]): number | null => {
    const f = b.map((x) => x.frame).filter((x): x is number => x !== null);
    return f.length > 0 ? Math.max(...f) : null;
  };

  {
    const base = race === "저그" ? "Hatchery" : race === "프로토스" ? "Nexus" : "Command Center";
    const military = race === "저그" ? "Spawning Pool" : race === "프로토스" ? "Gateway" : "Barracks";
    const prod = race === "저그" ? [] : race === "프로토스"
      ? ["Gateway", "Robotics Facility", "Stargate"] : ["Barracks", "Factory", "Starport"];
    const before = (b: string, f: number) => (s.buildingFrames[b] ?? []).filter((x) => x < f).length;
    const made = new Map<string, number[]>();
    const madeOf = (unit: string): number[] => {
      const hit = made.get(unit);
      if (hit) return hit;
      const fs = producedFrames(s, unit, endFrame);
      made.set(unit, fs);
      return fs;
    };
    const upto = (unit: string, f: number) => madeOf(unit).filter((x) => x < f).length;
    const guarded = (f: number) => {
      const troops = Object.keys(s.unitFrames)
        .filter((n) => !PEACE_UNITS.has(n))
        .reduce((n, u) => n + upto(u, f), 0);
      return troops + DEF_BUILDINGS.reduce((n, b) => n + before(b, f), 0) * GREEDY_DEF_WORTH;
    };
    const teched = (f: number) =>
      (TECH_BUILDINGS[race] ?? []).reduce((n, b) => n + before(b, f), 0);
    const grown = (f: number, i: number) =>
      i + 1
      + Math.max(0, prod.reduce((n, b) => n + before(b, f), 0) - 1) * 0.5
      + teched(f) * GREEDY_TECH_WORTH;
    const workers = (f: number) => [...WORKER_OF.keys()].reduce((n, w) => n + upto(w, f), 0);

    const milFrame = firstB(military);
    const expands = [...(s.buildingFrames[base] ?? [])].sort((a, b) => a - b);
    const bareFrom = race === "저그" ? GREEDY_BARE_EXPANDS_Z : 1;
    const greedy = expands.find((f, i) => {
      if (sec(f) >= GREEDY_MASS_SEC) return false;
      const bare = milFrame !== null && milFrame > f;
      const least = bare ? bareFrom
        : race === "저그" ? GREEDY_MIN_EXPANDS_Z : GREEDY_MIN_EXPANDS;
      if (i + 1 < least) return false;
      const to = f + GREEDY_SPAN_SEC / SECONDS_PER_FRAME;
      if (workers(to) - workers(f) < GREEDY_WORKER_GROW) return false;
      if (race === "저그" && !bare && teched(to) < GREEDY_TECH_MIN_Z) return false;
      return guarded(to) < grown(to, i) * GREEDY_ARMY_PER_BASE;
    }) ?? null;
    if (greedy !== null) {
      out.push({
        key: "greedy-build", weight: 12, at: greedy, who,
        p: { kind: race === "저그" ? "hatch" : race === "프로토스" ? "nexus" : "command" },
      });
    }
  }

  for (const [unit, bySec] of FAST_UNITS) {
    const f = firstU(unit);
    if (f !== null && sec(f) <= bySec && u(unit) >= FAST_MIN_UNITS) {
      out.push({ key: "fast-tech", ...target, weight: 12, at: f, who, p: { unit, min: Math.max(1, Math.round(sec(f) / 60)) } });
      break;
    }
  }
  const foreign = ([...WORKER_OF] as [string, string][])
    .filter(([w, r]) => r !== race && u(w) >= MIND_WORKER_MIN)
    .map(([, r]) => r);
  if (foreign.length > 0) {
    const mc = castAt("Mind Control");
    out.push({
      key: "mind-control", weight: 16,
      ...(mc?.whom ? { whom: mc.whom } : {}),
      at: firstU([...WORKER_OF].find(([, r]) => r === foreign[0])?.[0] ?? "") ?? null,
      who, p: { race: foreign[0], ...(mc ? { xy: mc.xy } : {}) },
    });
  }
  const dominant = (() => {
    for (const [unit, min] of POWER_UNITS) {
      if (u(unit) >= unitBar(min, POWER_FLOOR)
        && armyTotal > 0 && u(unit) / armyTotal >= POWER_SHARE) {
        return { unit, keys: [unit], n: u(unit), solo: false };
      }
    }
    return null;
  })();
  const pushPower = (power: { unit: string; keys: string[]; n: number; solo: boolean }) => {
    const frames = power.keys.flatMap((k) => s.unitFrames[k] ?? []).sort((a, b) => a - b);
    const burst = biggestBurst(frames);
    const inBurst = burst ? frames.filter((f) => f >= burst.from && f <= burst.to) : [];
    const mid = inBurst.length > 0 ? inBurst[Math.floor(inBurst.length / 2)] : null;
    out.push({
      key: "power-unit", weight: 11, at: mid, who,
      p: {
        unit: power.unit, n: power.n,
        ...(power.solo ? { solo: true } : {}),
        ...(burst && burst.n < power.n && mid !== null
          ? { burst: burst.n, min: Math.round((mid * SECONDS_PER_FRAME) / 60) }
          : {}),
      },
    });
  };
  if (dominant) pushPower(dominant);
  if (!out.some((t) => t.key === "power-unit")) {
    const mins = sec(endFrame) / 60;
    const rate = mins > 0 ? armyTotal / mins : 0;
    if (armyTotal >= MASS_TOTAL_MIN && rate >= massRateBar) {
      const top = [...army].sort((a, b) => b[1] - a[1]).slice(0, 2);
      const pair = top.length === 2 && (top[0][1] + top[1][1]) / armyTotal >= MASS_PAIR_SHARE
        ? top : null;
      const frames = (pair ?? top).flatMap(([unit]) => s.unitFrames[unit] ?? []).sort((a, b) => a - b);
      const mid = frames.length > 0 ? frames[Math.floor(frames.length / 2)] : null;
      out.push({
        key: "mass-army", weight: 12, at: mid, who,
        p: {
          n: armyTotal, rate: Math.round(rate),
          ...(pair ? { units: pair.map(([unit]) => unit), ns: pair.map(([, n]) => n) } : {}),
        },
      });
    }
  }
  if (!out.some((t) => t.key === "power-unit" || t.key === "mass-army")) {
    let best: { unit: string; keys: string[]; n: number; solo: boolean } | null = null;
    for (const e of POWER_SOLO) {
      const keys = e.keys ?? [e.unit];
      const n = keys.reduce((sum, k) => sum + u(k), 0);
      const min = unitBar(e.min, POWER_SOLO_FLOOR);
      if (n >= min && (!best || n > best.n)) best = { unit: e.unit, keys, n, solo: true };
    }
    if (best) pushPower(best);
  }

  if (race === "저그") {
    const pool = firstB("Spawning Pool");
    const ling = firstU("Zergling");
    const rushLings = ling === null
      ? []
      : (s.unitFrames["Zergling"] ?? [])
        .filter((f) => f <= ling + ZLING_RUSH_WINDOW_SEC / SECONDS_PER_FRAME)
        .sort((a, b) => a - b);
    const rushSpan = rushLings.length > 0
      ? (rushLings[rushLings.length - 1] - rushLings[0]) * SECONDS_PER_FRAME
      : 0;
    if (
      pool !== null && ling !== null && sec(pool) < 210 && sec(ling) < 300
      && rushLings.length >= ZLING_RUSH_MIN && rushSpan >= ZLING_RUSH_SPAN_SEC
    ) {
      const drones = 4 + (s.unitFrames["Drone"] ?? []).filter((f) => f < pool).length;
      if (drones >= 7 && drones <= 14 && wentAt(ling, RUSH_GO_SEC)) {
        out.push({
          key: "zling-rush", ...target, weight: 12, at: ling,
          who, p: { drones, solo, n: rushSize("Zergling", ling) },
        });
      }
    }
    const swarmUses = s.techUses["Dark Swarm"] ?? 0;
    const swarmArmy = u("Zergling") >= 12 || u("Lurker") >= 4 || u("Ultralisk") >= 3;
    if (swarmUses > 0 && swarmArmy) {
      out.push({
        key: "moka", weight: 11, at: s.firstTechUseFrame["Dark Swarm"] ?? null,
        who,
      });
    } else if (swarmUses > 0) {
      out.push({
        key: "swarm", weight: 6, at: s.firstTechFrame["Dark Swarm"] ?? null,
        who,
      });
    }
    if (u("Devourer") >= 3 && u("Mutalisk") >= 6) {
      out.push({
        key: "devourer", weight: 9, at: firstU("Devourer"),
        who,
      });
    }
    if (dropped && hasUpgrade(s, "Ventral Sacs") && (u("Lurker") >= 3 || u("Hydralisk") >= 8)) {
      const at = dropSpot();
      out.push({
        key: "zerg-drop", ...target, ...(at?.whom ? { whom: at.whom } : {}), weight: 11,
        at: s.firstUnloadFrame,
        who, p: { lurker: u("Lurker") >= 3, ...(at ? { xy: at.xy } : {}) },
      });
    }
    const nydusSpots = s.buildPositions.filter((b) => b.unit === "Nydus Canal");
    if (nydusSpots.length >= 1) {
      const into = foeAt(nydusSpots);
      const intoFoe = "whom" in into && !!into.whom && geo !== null
        && nydusSpots.some((b) => geo.enemyAt(b) !== null);
      const intoSpots = geo ? nydusSpots.filter((b) => geo.enemyAt(b) !== null) : [];
      out.push({
        key: "nydus",
        ...(intoFoe ? into : target),
        weight: intoFoe ? 12 : 5,
        at: (intoFoe ? firstOf(intoSpots) : null) ?? s.firstBuildingFrame["Nydus Canal"] ?? null,
        who, p: { intoFoe, ...(intoFoe && intoSpots.length > 0
          ? { xy: [intoSpots[0].x, intoSpots[0].y] as [number, number] } : {}) },
      });
    }
    const sunkenRush = inZone("enemy", "Creep Colony", SUNKEN_RUSH_SEC)
      .filter((b) => geo !== null && geo.foeTurfAt(b) !== null);
    if (sunkenRush.length > 0) {
      out.push({
        key: "sunken-rush", ...foeAt(sunkenRush), weight: SNEAK_WEIGHT, at: firstOf(sunkenRush), who,
        p: { ...spotOf(sunkenRush) },
      });
    }
    const mutas = u("Mutalisk");
    if (mutas >= unitBar(MUTA_MASS_SHARE, MUTA_MASS_FLOOR)) {
      out.push({
        key: "muta", weight: 11, at: firstU("Mutalisk"), who,
        p: { n: mutas, squads: Math.floor(mutas / 12) },
      });
    }
    if (u("Guardian") >= unitBar(GUARDIAN_SHARE, GUARDIAN_MIN - 1)) {
      out.push({
        key: "guardian", weight: 10, at: firstU("Guardian"), who,
        p: { n: u("Guardian") },
      });
    }
    if (u("Infested Terran") >= 1) {
      const inf = castAt("Infestation");
      out.push({
        key: "infested", ...target, ...(inf?.whom ? { whom: inf.whom } : {}), weight: 16,
        at: firstU("Infested Terran"), who,
        p: { n: u("Infested Terran"), ...(inf ? { xy: inf.xy } : {}) },
      });
    }
    if (u("Lurker") >= 3 && u("Hydralisk") >= 8) {
      out.push({
        key: "lurker", weight: 7, at: firstU("Lurker"),
        who,
      });
    }
    const queenCasts = (s.techUses["Spawn Broodlings"] ?? 0)
      + (s.techUses["Ensnare"] ?? 0)
      + (s.techUses["Parasite"] ?? 0);
    if (u("Queen") >= 2 && queenCasts >= 3) {
      out.push({
        key: "queen", weight: 9, at: firstU("Queen"),
        who, p: { n: queenCasts },
      });
    }
  }

  if (race === "테란") {
    if (u("Marine") >= 16 && u("Medic") >= 5) {
      const withTank = tanks >= 4;
      out.push({
        key: "bionic", weight: 10, at: firstU("Medic"),
        who, p: { tank: withTank },
      });
    } else if (tanks >= 6 && u("Vulture") + u("Goliath") >= 8 && u("Marine") < 10) {
      out.push({
        key: "mech", weight: 9, at: firstU("Siege Tank (Tank Mode)") ?? firstU("Goliath"),
        who,
      });
    }
    const vesselCasts = (s.techUses["Irradiate"] ?? 0)
      + (s.techUses["EMP Shockwave"] ?? 0)
      + (s.techUses["Defensive Matrix"] ?? 0);
    if (u("Science Vessel") >= 2 && vesselCasts >= 3) {
      out.push({
        key: "vessel", weight: 9, at: firstU("Science Vessel"),
        who, p: { n: vesselCasts },
      });
    }
    const bcs = producedFrames(s, "Battlecruiser", endFrame);
    const bcPeak = windowPeak(bcs);
    if (bcPeak >= BC_PEAK_MIN) {
      out.push({
        key: "bc", weight: 11, at: firstU("Battlecruiser"), who,
        p: { n: bcPeak },
      });
    }
    if (u("Valkyrie") >= 3 && foeRaces.includes("저그")) {
      out.push({
        key: "valkyrie", weight: 8, at: firstU("Valkyrie"),
        who, p: { unit: "Valkyrie" },
      });
    } else if (u("Wraith") >= 4 && foeRaces.includes("저그")) {
      out.push({
        key: "valkyrie", weight: 8, at: firstU("Wraith"),
        who, p: { unit: "Wraith" },
      });
    }
    const firebats = u("Firebat");
    const rushFirebat = firebats >= FIREBAT_RUSH_MIN;
    const atFoe = inZone("enemy", "Barracks", 300);
    const sneaky = [...atFoe, ...(rushFirebat ? inZone("mid", "Barracks", 300) : [])];
    if (sneaky.length > 0) {
      out.push({
        key: "sneak-rax", ...foeAt(sneaky), weight: rushFirebat ? SNEAK_WEIGHT + 1 : SNEAK_WEIGHT,
        at: firstOf(sneaky), who, p: { firebat: rushFirebat, ...spotOf(sneaky) },
      });
    }
    const sideFactory = inZone("ally", "Factory");
    const firstTank = firstU("Siege Tank (Tank Mode)") ?? firstU("Siege Tank (Siege Mode)");
    const tankPark = (() => {
      if (!geo || tanks < unitBar(SIDE_TANK_SHARE, SIDE_TANK_MIN)) return null;
      const tankOrders = (s.orderPositions ?? []).filter((o) => o.by === "Siege Tank");
      const busiest = (parked: typeof tankOrders) => {
        if (parked.length < SIDE_TANK_ORDERS) return null;
        const seed = parked.reduce((best, o) => {
          const n = parked.filter((x) => dist(x, o) <= SIDE_TANK_SPOT_TILES).length;
          return n > best.n ? { o, n } : best;
        }, { o: parked[0], n: 0 });
        const near = parked.filter((x) => dist(x, seed.o) <= SIDE_TANK_SPOT_TILES);
        return {
          frame: Math.min(...near.map((o) => o.frame)),
          xy: [
            near.reduce((a, o) => a + o.x, 0) / near.length,
            near.reduce((a, o) => a + o.y, 0) / near.length,
          ] as [number, number],
        };
      };
      const ally = busiest(tankOrders.filter((o) => geo.spot(o) === "allyFront"));
      if (ally) {
        const at = geo.allyFrontOf({ x: ally.xy[0], y: ally.xy[1] });
        if (at) return { ...ally, ally: at.ally, foe: at.foe };
      }
      const mine = busiest(tankOrders.filter((o) => geo.spot(o) === "myFront"));
      return mine ? { ...mine, ally: null as string | null, foe: null as string | null } : null;
    })();
    const tankHold = (() => {
      if (!geo || tanks < 3) return null;
      const tankOrders = (s.orderPositions ?? []).filter((o) => o.by === "Siege Tank");
      if (tankOrders.length === 0) return null;
      const mid = tankOrders.filter((o) => geo.spot(o) === "mid");
      if (mid.length < TANK_HOLD_ORDERS || mid.length / tankOrders.length < TANK_HOLD_SHARE) return null;
      const frames = mid.map((o) => o.frame);
      const span = (Math.max(...frames) - Math.min(...frames)) * SECONDS_PER_FRAME / 60;
      if (span < TANK_HOLD_MIN) return null;
      return {
        at: Math.min(...frames), min: Math.round(span),
        xy: [
          Math.round((mid.reduce((a, o) => a + o.x, 0) / mid.length) * 10) / 10,
          Math.round((mid.reduce((a, o) => a + o.y, 0) / mid.length) * 10) / 10,
        ] as [number, number],
      };
    })();
    if (tankHold) {
      out.push({
        key: "center-tank", weight: 12, at: tankHold.at, who,
        p: { xy: tankHold.xy, min: tankHold.min },
      });
    }
    if (tankHold) {
    } else if (sideFactory.length > 0 && tanks >= 3) {
      const helped = geo?.allyAt(sideFactory[0]) ?? null;
      out.push({
        key: "side-tank", weight: 11, at: firstOf(sideFactory), who,
        ...(helped ? { who2: helped } : {}), p: { at: "ally" },
      });
    } else if (tankPark !== null) {
      out.push({
        key: "side-tank", weight: tankPark.ally ? 12 : 11, at: tankPark.frame, who,
        ...(tankPark.ally ? { who2: tankPark.ally } : {}),
        ...(tankPark.foe ? { whom: tankPark.foe } : {}),
        p: { at: tankPark.ally ? "allyFront" : "front", xy: tankPark.xy },
      });
    } else if (neighbor && tanks >= 3 && firstTank !== null && neighbor.fellAt > firstTank) {
      out.push({
        key: "side-tank", weight: 12, at: firstTank, who,
        whom: neighbor.raw, p: { at: "home" },
      });
    }
    if (dropped && u("Dropship") >= 2) {
      const at = dropSpot();
      out.push({
        key: "dropship", ...target, ...(at?.whom ? { whom: at.whom } : {}),
        weight: 7, at: s.firstUnloadFrame,
        who, ...(at ? { p: { xy: at.xy } } : {}),
      });
    }
  }

  if (race === "테란" && u("Wraith") >= unitBar(WRAITH_SHARE, WRAITH_MIN) && hasTech(s, "Cloaking Field")) {
    out.push({
      key: "cloak-wraith", ...target, weight: 12,
      at: firstU("Wraith"), who, p: { n: u("Wraith") },
    });
  }
  if (race === "프로토스") {
    const zealot = firstU("Zealot");
    if (zealot !== null && sec(zealot) < 260 && u("Zealot") >= 6) {
      const gates = (s.buildingFrames["Gateway"] ?? []).filter((f) => f < zealot).length;
      if (gates >= 2 && wentAt(zealot, RUSH_GO_SEC)) {
        out.push({
          key: "zealot-rush", ...target, weight: 12, at: zealot,
          who, p: { gates, solo, n: rushSize("Zealot", zealot) },
        });
      }
    }
    const forward = inZone("enemy", "Photon Cannon", CANNON_RUSH_SEC)
      .filter((b) => geo !== null && geo.foeTurfAt(b) !== null);
    const earlyCannon = forward.some(
      (b) => b.frame !== null && sec(b.frame) < CANNON_RUSH_EARLY_SEC,
    );
    if (forward.length >= (earlyCannon ? 1 : CANNON_RUSH_LATE_MIN)) {
      out.push({
        key: "cannon-rush", ...foeAt(forward), weight: SNEAK_WEIGHT, at: firstOf(forward),
        who, p: { ...spotOf(forward) },
      });
    }
    if (geo && u("Arbiter") >= 1 && hasTech(s, "Recall")) {
      const aimOf = (c: { x: number; y: number; frame: number }) => {
        const turf = geo.foeTurfAt(c);
        if (turf) return { whom: turf, into: true, units: [] as string[] };
        const met = foeFightingAt(c, [c.frame]);
        return met ? { whom: met.raw, into: false, units: met.units } : null;
      };
      const landed = (s.castPositions ?? [])
        .filter((c) => c.tech === "Recall")
        .sort((a, b) => a.frame - b.frame)
        .map((c) => ({ c, aim: aimOf(c) }))
        .filter((x): x is { c: typeof x.c; aim: NonNullable<ReturnType<typeof aimOf>> } =>
          x.aim !== null);
      const drops: {
        whom: string; into: boolean; units: string[];
        frame: number; xy: [number, number]; n: number;
      }[] = [];
      for (const { c, aim } of landed) {
        const last = drops[drops.length - 1];
        if (last && last.whom === aim.whom && sec(c.frame - last.frame) <= RECALL_SAME_SEC) {
          last.n += 1;
          continue;
        }
        drops.push({ ...aim, frame: c.frame, xy: [c.x, c.y], n: 1 });
      }
      drops.slice(0, RECALL_MAX_BEATS).forEach((d, i) => {
        out.push({
          key: "recall", weight: 15 - i, whom: d.whom,
          at: d.frame, who,
          p: {
            xy: d.xy, ...(d.n > 1 ? { n: d.n } : {}), ...(i > 0 ? { nth: i + 1 } : {}),
            ...(d.into ? {} : { fight: true, ...(d.units.length > 0 ? { vs: d.units } : {}) }),
          },
        });
      });
    }
    const darks = u("Dark Templar");
    if (darks >= 4 || (darks >= 3 && u("Corsair") >= 3)) {
      out.push({
        key: "dark-templar", weight: 9, at: firstU("Dark Templar"),
        who, p: { corsair: u("Corsair") >= 3 },
      });
    }
    const arbiterCasts = (s.techUses["Stasis Field"] ?? 0) + (s.techUses["Recall"] ?? 0);
    if (u("Arbiter") >= 2 && arbiterCasts >= 2) {
      out.push({
        key: "arbiter", weight: 9, at: firstU("Arbiter"),
        who, p: { n: arbiterCasts },
      });
    }
    if (u("Zealot") >= 8 && u("High Templar") >= 2 && (s.techUses["Psionic Storm"] ?? 0) >= 2) {
      out.push({
        key: "zealot-templar", weight: 10, at: firstU("High Templar"), who,
      });
    }
    const carriers = producedFrames(s, "Carrier", endFrame);
    const carrierPeak = windowPeak(carriers);
    if (carrierPeak >= unitBar(CARRIER_SHARE, CARRIER_MIN)) {
      const burst = biggestBurst(carriers);
      out.push({
        key: "carrier", weight: 13, at: burst ? burst.from : firstU("Carrier"),
        who, p: { n: carrierPeak },
      });
    }
    if (u("Corsair") >= 3 && foeRaces.includes("저그")) {
      out.push({ key: "valkyrie", weight: 8, at: firstU("Corsair"), who, p: { unit: "Corsair" } });
    } else if (u("Scout") >= 3 && foeRaces.includes("저그")) {
      out.push({ key: "valkyrie", weight: 8, at: firstU("Scout"), who, p: { unit: "Scout" } });
    }
    const shuttleAt = dropped && u("Shuttle") >= 2 ? dropSpot() : null;
    const shuttleWhom = shuttleAt?.whom ? { whom: shuttleAt.whom } : {};
    const shuttleP = shuttleAt ? { p: { xy: shuttleAt.xy } } : {};
    if (dropped && u("Shuttle") >= 2 && u("Reaver") >= 3) {
      out.push({
        key: "shuttle-reaver", ...target, ...shuttleWhom, weight: 11,
        at: s.firstUnloadFrame, who, ...shuttleP,
      });
    } else if (dropped && u("Shuttle") >= 2 && u("High Templar") >= 4) {
      out.push({
        key: "templar-drop", ...target, ...shuttleWhom, weight: 11,
        at: s.firstUnloadFrame, who, ...shuttleP,
      });
    } else if (dropped && u("Shuttle") >= 2) {
      out.push({
        key: "shuttle", ...target, ...shuttleWhom, weight: 6,
        at: s.firstUnloadFrame, who, ...shuttleP,
      });
    }
  }

  const allyCannons = inZone("ally", "Photon Cannon");
  if (allyCannons.length >= ALLY_CANNON_MIN) {
    const helped = geo?.allyAt(allyCannons[0]) ?? null;
    out.push({
      key: "ally-cannon", weight: 11, at: lastOf(allyCannons), who,
      ...(helped ? { who2: helped } : {}), p: { n: allyCannons.length },
    });
  }
  const midGuard = (["Photon Cannon", "Sunken Colony", "Missile Turret"] as const)
    .map((b) => ({ b, at: inZone("mid", b) }))
    .filter((x) => x.at.length >= 2)
    .sort((a, b) => b.at.length - a.at.length)[0];
  if (midGuard) {
    out.push({
      key: "center-photon", ...target, weight: 16, at: lastOf(midGuard.at), who,
      p: { n: midGuard.at.length, b: midGuard.b },
    });
  } else {
    const mid = inZone("mid");
    if (mid.length >= 3) {
      const byKind = new Map<string, number>();
      for (const b of mid) byKind.set(b.unit, (byKind.get(b.unit) ?? 0) + 1);
      const top = [...byKind.entries()].sort((a, b) => b[1] - a[1])[0];
      out.push({
        key: "center", weight: 8, at: lastOf(mid), who,
        p: { n: mid.length, ...(top ? { b: top[0] } : {}) },
      });
    }
  }

  const wallIn = ((): { at: number; n: number; kinds: string[] } | null => {
    const live = race === "저그"
      ? ["Hatchery", "Evolution Chamber", "Spawning Pool"]
      : race === "프로토스"
        ? ["Pylon", "Gateway", "Forge"]
        : ["Supply Depot", "Barracks"];
    const guard = race === "저그"
      ? ["Sunken Colony", "Creep Colony", "Spore Colony"]
      : race === "프로토스" ? ["Photon Cannon"] : ["Bunker"];
    const cand = [...live, ...guard]
      .flatMap((b) => atFront(b))
      .filter((b) => b.frame !== null && sec(b.frame) < WALL_IN_SEC)
      .sort((a, b) => (a.frame ?? 0) - (b.frame ?? 0));
    const near = (a: BuildPos, b: BuildPos) => Math.hypot(a.x - b.x, a.y - b.y) <= WALL_SPAN;
    const wall = cand
      .map((seed) => cand.filter((b) => near(seed, b)
        && Math.abs((b.frame ?? 0) - (seed.frame ?? 0)) * SECONDS_PER_FRAME <= WALL_BURST_SEC))
      .filter((g) => {
        if (g.length < WALL_IN_MIN || g.length > WALL_MAX) return false;
        if (new Set(g.map((b) => b.unit)).size < WALL_KIND_MIN) return false;
        const fs = g.map((b) => b.frame ?? 0);
        return sec(Math.max(...fs) - Math.min(...fs)) <= WALL_BURST_SEC;
      })
      .sort((a, b) => new Set(b.map((x) => x.unit)).size - new Set(a.map((x) => x.unit)).size)[0];
    const closed = wall ? lastOf(wall) : null;
    if (!wall || closed === null) return null;
    const base = race === "저그" ? "Hatchery" : race === "프로토스" ? "Nexus" : "Command Center";
    const tech = race === "저그"
      ? ["Lair", "Hive", "Spire", "Hydralisk Den", "Queen's Nest"]
      : race === "프로토스"
        ? ["Robotics Facility", "Stargate", "Citadel of Adun", "Templar Archives"]
        : ["Factory", "Starport", "Science Facility", "Armory"];
    const grew = [base, ...tech]
      .reduce((n, b) => n + (s.buildingFrames[b] ?? []).filter((f) => f > closed).length, 0);
    if (grew < WALL_IN_GROW_MIN) return null;
    const tally = new Map<string, number>();
    for (const b of wall) tally.set(b.unit, (tally.get(b.unit) ?? 0) + 1);
    if (tally.has("Sunken Colony") || tally.has("Spore Colony")) tally.delete("Creep Colony");
    const creep = tally.get("Creep Colony");
    if (creep !== undefined) {
      const from = Math.min(...wall.map((b) => b.frame ?? 0));
      const to = closed + WALL_MORPH_SEC / SECONDS_PER_FRAME;
      const morphed = (name: string): number =>
        (s.buildingFrames[name] ?? []).filter((f) => f >= from && f <= to).length;
      const sunk = morphed("Sunken Colony");
      const spore = morphed("Spore Colony");
      const grown = sunk >= spore * 2 && sunk > 0 ? "Sunken Colony"
        : spore >= sunk * 2 && spore > 0 ? "Spore Colony" : null;
      if (grown) { tally.delete("Creep Colony"); tally.set(grown, creep); }
    }
    const kinds = [...tally].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([u]) => u);
    return { at: closed, n: wall.length, kinds };
  })();
  if (wallIn) {
    out.push({
      key: "wall-in", weight: 11, at: wallIn.at, who,
      p: { n: wallIn.n, min: Math.max(1, Math.round(sec(wallIn.at) / 60)), bs: wallIn.kinds.join(",") },
    });
  }

  const frontDef = wallIn ? undefined
    : (["Bunker", "Photon Cannon", "Sunken Colony", "Missile Turret"] as const)
      .map((b) => ({ b, at: atFront(b) }))
      .filter((x) => x.at.length >= 2).sort((a, b) => b.at.length - a.at.length)[0];
  if (frontDef) {
    out.push({
      key: "front-defense", weight: 8, at: lastOf(frontDef.at), who,
      p: { b: frontDef.b, n: frontDef.at.length },
    });
  }

  const raidOn = (): Tactic[] => {
    if (!geo) return [];
    const byFoe = new Map<string, { frame: number; x: number; y: number }[]>();
    for (const o of s.orderPositions) {
      if (o.by === "Building" || o.kind === undefined) continue;
      const f = geo.enemyAt(o);
      if (!f) continue;
      const list = byFoe.get(f);
      if (list) list.push(o); else byFoe.set(f, [o]);
    }
    const win = RAID_WINDOW_SEC / SECONDS_PER_FRAME;
    const res: Tactic[] = [];
    for (const [foe, list] of byFoe) {
      list.sort((a, b) => a.frame - b.frame);
      let best: { i: number; n: number } | null = null;
      for (let i = 0; i < list.length; i += 1) {
        let j = i;
        while (j < list.length && list[j].frame - list[i].frame <= win) j += 1;
        if (!best || j - i > best.n) best = { i, n: j - i };
      }
      if (!best || best.n < RAID_ORDERS_MIN) continue;
      const burst = list.slice(best.i, best.i + best.n);
      const at = burst[0].frame;
      const armed = Object.entries(s.unitFrames).some(([unit, fs]) => (
        !RAID_UNIT_EXCLUDE.has(unit) && fs.some((f) => f <= at)
      ));
      if (!armed) continue;
      const went = wentWith(at);
      res.push({
        key: "base-raid", weight: 10 + Math.min(4, Math.floor(best.n / RAID_ORDERS_MIN)),
        at, who, whom: foe,
        p: {
          xy: [
            burst.reduce((n, o) => n + o.x, 0) / burst.length,
            burst.reduce((n, o) => n + o.y, 0) / burst.length,
          ] as [number, number],
          ...(() => {
            const w = went;
            return (w ? { unit: w.unit, n: w.n } : {}) as Record<string, string | number>;
          })(),
        },
      });
    }
    return res;
  };
  out.push(...raidOn());

  if (geo?.lodgingHost) {
    out.push({
      key: "lodging", weight: 9, who, who2: geo.lodgingHost,
      at: firstOf(s.buildPositions),
      ...(geo.lodgingLost ? { p: { lost: true } } : {}),
    });
  }

  const gg = s.chats.find((c) => GG_RE.test(c.text));
  if (gg) {
    out.push({ key: "gg", weight: 6, at: gg.frame, who });
  }
  const noElim = s.chats.find((c) => NO_ELIM_RE.test(c.text));
  if (noElim) {
    out.push({ key: "no-elim", weight: 6, at: noElim.frame, who });
  }

  if (out.some((t) => t.key === "sunken-rush")) {
    return out.filter((t) => t.key !== "zling-rush");
  }
  return out;
}

const NEIGHBOR_MARGIN = 1.3;
const FELL_EARLY_SEC = 2 * 60;

function neighborOf(
  me: ParsedReplayPlayer,
  foes: ParsedReplayPlayer[],
  endFrame: number
): { raw: string; fellAt: number } | null {
  if (foes.length < 2) return null;
  const home = startHomeOf(me);
  if (!home) return null;
  const ranked = foes
    .map((f) => ({ f, h: startHomeOf(f) }))
    .filter((x): x is { f: ParsedReplayPlayer; h: { x: number; y: number } } => x.h !== null)
    .map((x) => ({ f: x.f, d: dist(home, x.h) }))
    .sort((a, b) => a.d - b.d);
  if (ranked.length < 2) return null;
  if (!(ranked[1].d >= ranked[0].d * NEIGHBOR_MARGIN)) return null;
  const last = ranked[0].f.signals?.lastCmdFrame ?? null;
  if (last === null || sec(endFrame - last) < FELL_EARLY_SEC) return null;
  return { raw: ranked[0].f.rawName, fellAt: last };
}

export interface TacticScanInput {
  sidePlayers: ParsedReplayPlayer[];
  foePlayers: ParsedReplayPlayer[];
  startSpots?: [number, number][];
}

export function scanTactics({ sidePlayers, foePlayers, startSpots }: TacticScanInput): Tactic[] {
  const foeRaces = [...new Set(foePlayers.map((p) => p.race).filter(Boolean))];
  const soleFoe = foePlayers.length === 1 ? foePlayers[0].rawName : null;
  const endFrame = Math.max(
    0,
    ...[...sidePlayers, ...foePlayers].map((p) => p.signals?.lastCmdFrame ?? 0)
  );

  const mins = sec(endFrame) / 60;
  const armyOf = (p: ParsedReplayPlayer) => Object.entries(p.signals?.unitCounts ?? {})
    .filter(([u]) => !SOLO_EXCLUDE.has(u))
    .reduce((a, [, v]) => a + v, 0);
  const massRateBar = Math.max(
    MASS_RATE_MIN,
    midOf([...sidePlayers, ...foePlayers].map((p) => (mins > 0 ? armyOf(p) / mins : 0)))
      * MASS_RATE_RATIO,
  );
  const armyMid = midOf([...sidePlayers, ...foePlayers].map(armyOf));

  const all: Tactic[] = [];
  for (const p of sidePlayers) {
    if (!p.signals) continue;
    all.push(
      ...detectFor({
        rawName: p.rawName, s: p.signals, race: p.race, foeRaces, soleFoe,
        geo: geoOf(p, sidePlayers.filter((x) => x !== p), foePlayers, startSpots),
        neighbor: neighborOf(p, foePlayers, endFrame),
        foeFightingAt: (at, frames) => {
          const f = fightersAt(at, frames, foePlayers)[0];
          return f ? { raw: f.raw, units: f.units } : null;
        },
        endFrame, massRateBar, armyMid,
      })
    );
  }
  const seen = new Set<string>();
  return all
    .sort((a, b) => b.weight - a.weight)
    .filter((t) => {
      const key = t.key === "gg" ? `gg|${t.who}`
        : t.key === "base-raid" ? `base-raid|${t.who}|${t.whom ?? ""}`
          : t.key === "recall" ? `recall|${t.who}|${t.at}`
            : t.key;
      return seen.has(key) ? false : (seen.add(key), true);
    });
}
