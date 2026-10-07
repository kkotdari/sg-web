export interface BalancePlayer {
  id: string;
  rating: number;
}

export interface BalanceSplit {
  teamA: string[];
  teamB: string[];
  joker: string | null;
  gap: number;
  boardGap: number;
}

export interface BalanceResult {
  splits: BalanceSplit[];
  exact: boolean;
}

const COMBO_BUDGET = 400_000;

function comboCount(m: number): number {
  const pick = m / 2 - 1;
  let out = 1;
  for (let i = 0; i < pick; i += 1) out = (out * (m - 1 - i)) / (i + 1);
  return out;
}

function canBeExact(n: number): boolean {
  const m = n % 2 === 1 ? n - 1 : n;
  if (m < 2) return true;
  return comboCount(m) * (n % 2 === 1 ? n : 1) <= COMBO_BUDGET;
}

const scaled = (v: number): number => Math.round(v * 10);

function boardGapOf(a: number[], b: number[]): number {
  const x = [...a].sort((p, q) => q - p);
  const y = [...b].sort((p, q) => q - p);
  let sum = 0;
  for (let i = 0; i < x.length; i += 1) sum += Math.abs(x[i] - y[i]);
  return sum;
}

const better = (a: { gap: number; boardGap: number }, b: { gap: number; boardGap: number }): number =>
  a.gap - b.gap || a.boardGap - b.boardGap;

interface RawSplit { a: number[]; b: number[]; gap: number; boardGap: number }

function exhaustive(values: number[], limit: number): RawSplit[] {
  const n = values.length;
  const half = n / 2;
  const best: RawSplit[] = [];
  const push = (s: RawSplit): void => {
    if (best.length >= limit && better(s, best[best.length - 1]) >= 0) return;
    let i = best.length;
    while (i > 0 && better(s, best[i - 1]) < 0) i -= 1;
    best.splice(i, 0, s);
    if (best.length > limit) best.pop();
  };

  const pool = n - 1;
  const pick = half - 1;
  const idx = Array.from({ length: pick }, (_, i) => i);
  for (;;) {
    const a = [0, ...idx.map((i) => i + 1)];
    const inA = new Set(a);
    const b: number[] = [];
    for (let i = 0; i < n; i += 1) if (!inA.has(i)) b.push(i);
    const av = a.map((i) => values[i]);
    const bv = b.map((i) => values[i]);
    const sum = (xs: number[]) => xs.reduce((p, q) => p + q, 0);
    push({ a, b, gap: Math.abs(sum(av) - sum(bv)), boardGap: boardGapOf(av, bv) });

    let k = pick - 1;
    while (k >= 0 && idx[k] === pool - pick + k) k -= 1;
    if (k < 0) break;
    idx[k] += 1;
    for (let j = k + 1; j < pick; j += 1) idx[j] = idx[j - 1] + 1;
  }
  return best;
}

function heuristic(values: number[], limit: number): RawSplit[] {
  const n = values.length;
  const half = n / 2;
  const found: RawSplit[] = [];
  const seen = new Set<string>();
  const evaluate = (a: number[], b: number[]): RawSplit => {
    const av = a.map((i) => values[i]);
    const bv = b.map((i) => values[i]);
    const sum = (xs: number[]) => xs.reduce((p, q) => p + q, 0);
    return { a, b, gap: Math.abs(sum(av) - sum(bv)), boardGap: boardGapOf(av, bv) };
  };

  for (let round = 0; round < 60; round += 1) {
    const order = Array.from({ length: n }, (_, i) => i);
    if (round > 0) {
      for (let i = order.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
    }
    const sorted = [...order].sort((p, q) => values[q] - values[p]);
    const a: number[] = [];
    const b: number[] = [];
    let sa = 0;
    let sb = 0;
    for (const i of sorted) {
      if (a.length < half && (b.length >= half || sa <= sb)) { a.push(i); sa += values[i]; }
      else { b.push(i); sb += values[i]; }
    }
    let cur = evaluate(a, b);
    for (let step = 0; step < 400; step += 1) {
      let moved = false;
      for (let i = 0; i < cur.a.length && !moved; i += 1) {
        for (let j = 0; j < cur.b.length && !moved; j += 1) {
          const na = [...cur.a];
          const nb = [...cur.b];
          [na[i], nb[j]] = [nb[j], na[i]];
          const next = evaluate(na, nb);
          if (better(next, cur) < 0) { cur = next; moved = true; }
        }
      }
      if (!moved) break;
    }
    const key = [...cur.a].sort((p, q) => p - q).join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(cur);
  }
  found.sort(better);
  return found.slice(0, limit);
}

const splitAll = (values: number[], limit: number, exact: boolean): RawSplit[] =>
  (exact ? exhaustive(values, limit) : heuristic(values, limit));

export function buildTeams(players: BalancePlayer[], limit = 12): BalanceResult {
  if (players.length < 2) return { splits: [], exact: true };
  const vals = players.map((p) => scaled(p.rating));
  const odd = players.length % 2 === 1;
  const exact = canBeExact(players.length);

  if (!odd) {
    const raws = splitAll(vals, limit, exact);
    return {
      exact,
      splits: raws.map((r) => ({
        teamA: r.a.map((i) => players[i].id),
        teamB: r.b.map((i) => players[i].id),
        joker: null,
        gap: r.gap / 10,
        boardGap: r.boardGap / 10,
      })),
    };
  }

  const mean = vals.reduce((p, q) => p + q, 0) / vals.length;
  let jokerAt = -1;
  let jokerScore: { gap: number; boardGap: number } | null = null;
  for (let k = 0; k < players.length; k += 1) {
    const rest = vals.filter((_, i) => i !== k);
    const one = splitAll(rest, 1, exact)[0];
    if (!one) continue;
    const score = { gap: one.gap, boardGap: one.boardGap };
    const cmp = jokerScore === null ? -1 : better(score, jokerScore);
    const farther = jokerAt >= 0
      && Math.abs(vals[k] - mean) > Math.abs(vals[jokerAt] - mean);
    if (cmp < 0 || (cmp === 0 && farther)) { jokerAt = k; jokerScore = score; }
  }
  if (jokerAt < 0) return { splits: [], exact };

  const restPlayers = players.filter((_, i) => i !== jokerAt);
  const restVals = restPlayers.map((p) => scaled(p.rating));
  const raws = splitAll(restVals, limit, exact);
  return {
    exact,
    splits: raws.map((r) => ({
      teamA: r.a.map((i) => restPlayers[i].id),
      teamB: r.b.map((i) => restPlayers[i].id),
      joker: players[jokerAt].id,
      gap: r.gap / 10,
      boardGap: r.boardGap / 10,
    })),
  };
}
