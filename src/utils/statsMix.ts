export const DEFENSE_BUILDINGS = new Set([
  "Bunker", "Missile Turret",
  "Photon Cannon", "Shield Battery",
  "Creep Colony", "Sunken Colony", "Spore Colony",
]);

export const CASTER_UNITS = new Set([
  "High Templar", "Dark Archon", "Arbiter", "Science Vessel", "Defiler", "Queen",
]);

export const AIR_UNITS = new Set([
  "Wraith", "Dropship", "Science Vessel", "Valkyrie", "Battlecruiser",
  "Shuttle", "Observer", "Scout", "Corsair", "Carrier", "Arbiter",
  "Mutalisk", "Guardian", "Devourer", "Scourge", "Queen",
]);

export interface TruthMix {
  bProd: number;
  bDef: number;
  uBasic: number;
  uAdv: number;
  uCaster: number;
  uGround: number;
  uAir: number;
  worker5: number;
  btGround?: number;
  btGroundWon?: number;
  btAir?: number;
  btAirWon?: number;
  btMagic?: number;
  btMagicWon?: number;
  upGw: number;
  upGa: number;
  upAw: number;
  upAa: number;
  upSh: number;
  ups: Record<string, number>;
  upCounts: Record<string, number>;
  buildings: Record<string, number>;
  units: Record<string, number>;
  skills: Record<string, number>;
  skillsWon?: Record<string, number>;
  buildingSecs: Record<string, number>;
  unitSecs: Record<string, number>;
  skillSecs: Record<string, number>;
  coreSeconds: number | null;
  coreCmd: number;
  coreBuild: number;
  coreUnit: number;
}

export function topEntries(
  d: Record<string, number> | undefined, ko: Record<string, string>, n: number,
  secs?: Record<string, number>, exclude?: Set<string>,
): TopEntry[] {
  const merged: Record<string, number> = {};
  const mergedSecs: Record<string, number> = {};
  for (const [key, v] of Object.entries(d ?? {})) {
    if (exclude?.has(key)) continue;
    const name = ko[key];
    if (!name || !(v > 0)) continue;
    merged[name] = (merged[name] ?? 0) + v;
    const sv = secs?.[key];
    if (typeof sv === "number" && sv > 0) mergedSecs[name] = (mergedSecs[name] ?? 0) + sv;
  }
  return Object.entries(merged)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([name, count]) => ({
      name,
      perMin: mergedSecs[name] > 0 ? (count / mergedSecs[name]) * PER_WINDOW_SECONDS : null,
    }));
}

export const PER_WINDOW_SECONDS = 60;

export interface TopEntry { name: string; perMin: number | null }
