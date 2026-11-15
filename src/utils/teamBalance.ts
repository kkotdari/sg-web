/* ★ 팀 가르기 — **팀전 티어의 셈을 그대로**(2026-10-31, 요청: "팀구성하기 로직을 티어 계산 로직을 재사용 · 홀수면 n:n+1로 짜기 최대한 전력이 비슷하게").
   sg-api domain/game_results/tier.py 와 같은 식:
     편의 힘 T = 머릿수 × (인분들의 Q 제곱 평균)^{1/Q}   (Q = 2 · 센 사람에게 무게)
     P(1팀 승) = σ(γ · ln(T₁ / T₂) + 종족 몫₁ − 종족 몫₂)  (γ = 5.0 · 종족 몫 = 프로토스 +0.55 · 저그 −0.25 의 합 — 아래 ★ 2026-11-15)
   Q = 2 라 T = √(머릿수 × 인분 제곱의 합) — 편마다 '인분 제곱의 합'만 쌓으면 된다.
   머릿수가 힘에 들어가므로 홀수 인원은 n : n+1 로 바로 짠다(옛 깍두기 걷음) — 적은 편엔 센 사람이 모여야 50:50 에 든다.
   고르는 자: |P − 0.5| 가 작은 차례 → 같으면 두 편의 인분을 센 차례로 맞대 본 차이 합(boardGap · 비슷한 사람끼리 마주 서게). */

export const TIER_Q = 2;
/* ★ 승률 식 다시 맞춤(2026-11-15, 요청: "Q2 + 종족으로 옮기고 프로토스 제약은 없애" · sg-api scripts/wpa_review `team` · README 12절 '팀 구성하기 승률 모형') —
   앞 달까지의 티어로 8 ~ 11월 224판을 가려 맞힌 결과: Q 2 그대로 · γ 4.6 → 5.0 · 편의 종족 수 차를 더한다(프로토스 +0.55 · 저그 −0.25 — ln 승산 · 테란 기준).
   50:50 근처에서 편 한 명이 테란 대신 프로토스면 ≈ +13%p · 저그면 ≈ −6%p. 로그손실 0.6112 → 0.5833(나은 비율 92%) · 서버 식(Q 1.5)은 더 나빴다(0.6224).
   머릿수 항(n:n+1)은 29판으로 못 갈라 지금 식(머릿수를 힘에 곱함) 그대로. */
export const TIER_GAMMA = 5.0;
export const RACE_LOGIT: Readonly<Record<string, number>> = { 프로토스: 0.55, 저그: -0.25 };

export interface BalancePlayer {
  id: string;
  /** 몇 인분(팀전 티어의 잣대 · > 0). */
  inbun: number;
  /** 서는 종족(주종) — 승률 식의 종족 항(RACE_LOGIT ★). 없으면 테란과 같다(0). */
  race?: string | null;
}

export interface BalanceSplit {
  /** 1팀(홀수면 적은 쪽 · n) · 2팀(n+1). */
  teamA: string[];
  teamB: string[];
  /** 1팀 승리 확률(0~1). */
  pA: number;
  boardGap: number;
}

export interface BalanceResult {
  splits: BalanceSplit[];
  exact: boolean;
}

/** 조합 제약(팀 구성하기의 '프로토스는 팀당 2명까지') — 거짓이면 그 조합은 안 센다. */
export type SplitOk = (a: string[], b: string[]) => boolean;

/** 편의 힘(tier.py team_power 와 같은 식). */
export function teamPower(inbuns: number[], q = TIER_Q): number {
  const n = inbuns.length;
  if (n === 0) return 0;
  return n * (inbuns.reduce((s, x) => s + x ** q, 0) / n) ** (1 / q);
}

/** 편의 종족 몫(ln 승산 · RACE_LOGIT 의 합). */
export function raceLogit(races: readonly (string | null | undefined)[]): number {
  return races.reduce((s, r) => s + (r ? RACE_LOGIT[r] ?? 0 : 0), 0);
}
/** 1팀 승리 확률 — σ(γ · ln(T₁/T₂) + 1팀 종족 몫 − 2팀 종족 몫). 종족을 안 주면 힘 비만. */
export function winProb(a: number[], b: number[], ra: readonly (string | null | undefined)[] = [], rb: readonly (string | null | undefined)[] = []): number {
  const ta = teamPower(a); const tb = teamPower(b);
  if (!(ta > 0) || !(tb > 0)) return 0.5;
  return 1 / (1 + Math.exp(-(TIER_GAMMA * Math.log(ta / tb) + raceLogit(ra) - raceLogit(rb))));
}

const COMBO_BUDGET = 400_000;

function choose(n: number, k: number): number {
  let out = 1;
  for (let i = 0; i < k; i += 1) out = (out * (n - i)) / (i + 1);
  return out;
}

function boardGapOf(a: number[], b: number[]): number {
  const x = [...a].sort((p, q) => q - p);
  const y = [...b].sort((p, q) => q - p);
  let sum = 0;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) sum += Math.abs((x[i] ?? 0) - (y[i] ?? 0));
  return sum;
}

interface Raw { a: number[]; b: number[]; off: number; boardGap: number; pA: number }
const better = (p: Raw, q: Raw): number => p.off - q.off || p.boardGap - q.boardGap;

function evalSplit(vals: number[], a: number[], b: number[], races?: readonly (string | null | undefined)[]): Raw {
  const av = a.map((i) => vals[i]); const bv = b.map((i) => vals[i]);
  const pA = races ? winProb(av, bv, a.map((i) => races[i]), b.map((i) => races[i])) : winProb(av, bv);
  /* 확률을 0.1%p 눈금으로 — 아주 작은 차는 같은 것으로 쳐 boardGap 이 가린다. */
  return { a, b, pA, off: Math.round(Math.abs(pA - 0.5) * 1000), boardGap: boardGapOf(av, bv) };
}

function keep(best: Raw[], s: Raw, limit: number): void {
  if (best.length >= limit && better(s, best[best.length - 1]) >= 0) return;
  let i = best.length;
  while (i > 0 && better(s, best[i - 1]) < 0) i -= 1;
  best.splice(i, 0, s);
  if (best.length > limit) best.pop();
}

/** 1팀 크기 k 를 다 훑는다 — 짝수면 0번을 1팀에 묶어 같은 가름을 두 번 안 센다(1팀·2팀 이름만 바뀐 판). */
function exhaustive(vals: number[], k: number, limit: number, ok?: (a: number[], b: number[]) => boolean, races?: readonly (string | null | undefined)[]): Raw[] {
  const n = vals.length;
  const even = n === 2 * k;
  const best: Raw[] = [];
  const fixed = even ? [0] : [];
  const pool = even ? n - 1 : n;
  const pick = even ? k - 1 : k;
  const off = even ? 1 : 0;
  const idx = Array.from({ length: pick }, (_, i) => i);
  for (;;) {
    const a = [...fixed, ...idx.map((i) => i + off)];
    const inA = new Set(a);
    const b: number[] = [];
    for (let i = 0; i < n; i += 1) if (!inA.has(i)) b.push(i);
    if (!ok || ok(a, b)) keep(best, evalSplit(vals, a, b, races), limit);
    if (pick === 0) break;
    let j = pick - 1;
    while (j >= 0 && idx[j] === pool - pick + j) j -= 1;
    if (j < 0) break;
    idx[j] += 1;
    for (let t = j + 1; t < pick; t += 1) idx[t] = idx[t - 1] + 1;
  }
  return best;
}

/** 인원이 많으면 — 무작위 출발 + 한 사람씩 맞바꾸는 내리막(제약 밖 출발은 안으로 드는 걸음을 받는다). */
function heuristic(vals: number[], k: number, limit: number, ok?: (a: number[], b: number[]) => boolean, races?: readonly (string | null | undefined)[]): Raw[] {
  const n = vals.length;
  const found: Raw[] = [];
  const seen = new Set<string>();
  for (let round = 0; round < 80; round += 1) {
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    let cur = evalSplit(vals, order.slice(0, k), order.slice(k), races);
    for (let step = 0; step < 400; step += 1) {
      let moved = false;
      for (let i = 0; i < cur.a.length && !moved; i += 1) {
        for (let j = 0; j < cur.b.length && !moved; j += 1) {
          const na = [...cur.a]; const nb = [...cur.b];
          [na[i], nb[j]] = [nb[j], na[i]];
          if (ok && !ok(na, nb)) continue;
          const next = evalSplit(vals, na, nb, races);
          if (better(next, cur) < 0 || (ok && !ok(cur.a, cur.b))) { cur = next; moved = true; }
        }
      }
      if (!moved) break;
    }
    if (ok && !ok(cur.a, cur.b)) continue;
    const key = [...cur.a].sort((p, q) => p - q).join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    keep(found, cur, limit);
  }
  return found;
}

/** 팀을 가른다 — 홀수면 1팀 n · 2팀 n+1. @param ok 조합 제약(선수 id 로). */
export function buildTeams(players: BalancePlayer[], limit = 12, ok?: SplitOk): BalanceResult {
  if (players.length < 2) return { splits: [], exact: true };
  const n = players.length;
  const k = Math.floor(n / 2);
  const vals = players.map((p) => Math.max(0.05, p.inbun));
  const exact = choose(n, k) / (n % 2 === 0 ? 2 : 1) <= COMBO_BUDGET;
  const okIdx = ok ? (a: number[], b: number[]) => ok(a.map((i) => players[i].id), b.map((i) => players[i].id)) : undefined;
  const races = players.map((p) => p.race ?? null);
  const raws = exact ? exhaustive(vals, k, limit, okIdx, races) : heuristic(vals, k, limit, okIdx, races);
  return {
    exact,
    splits: raws.map((r) => ({
      teamA: r.a.map((i) => players[i].id),
      teamB: r.b.map((i) => players[i].id),
      pA: r.pA,
      boardGap: r.boardGap,
    })),
  };
}
