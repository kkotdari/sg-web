/* ★ 게임 목록의 **승리 확률**(2026-11-17, 요청: "피시와 폰 게임목록의 로스터 부분에 승패 위에다가 예측 승리확률 · 팀 구성하기 그 로직 · wpa 검증에도 썼던 로직 ·
   종족까지 반영 · 라벨은 승리 확률") — 팀 구성하기(utils/teamBalance.ts)의 식 그대로:
     편의 힘 T = 머릿수 × (인분 Q 제곱 평균)^{1/Q}(Q 2) · P(1팀 승) = σ(γ · ln(T₁/T₂) + 종족 몫₁ − 종족 몫₂)(γ 5.0 · 프로토스 +0.55 · 저그 −0.25)
   인분은 sg-api scripts/wpa_review `team`(README '팀 구성하기 승률 모형')이 검증한 때와 같게 **그 판 앞 달까지의 티어**다 — 그 달 판은 안 쓴다(결과를 아는 판으로
   그 판을 맞히지 않게). 앞 달 티어는 서버 달별 줄(trend · 앞 달을 섞은 한 달 조회와 같은 값)이고, 사람마다 **그 판에 선 종족의 인분**(팀 구성하기와 같음 · tierByRace)을
   앞 달부터 PAST_MONTHS 달 거슬러 찾는다 → 없으면 같은 달들의 다른 종족 인분(판이 가장 많은 것) → 그래도 없으면 1인분(검증과 같음).
   팀전(0102) 두 편 판만 · 컴퓨터가 낀 판 · 개인전 · 1:1 은 안 낸다 · 자리 절반 넘게 티어를 못 찾으면 안 낸다(거의 다 1인분이면 의미 없는 50%라서).
   서버 한 번(세션마다) — 이번 달까지 TREND_MONTHS 달의 달별 줄. 그보다 오래된 판은 안 낸다. */
import { useMemo, useSyncExternalStore } from "react";
import { api } from "../api/client";
import { winProb } from "./teamBalance";
import { isComputerSlot } from "../constants/computerSlot";
import { isUnregisteredSlot } from "../constants/unregisteredSlot";
import { currentMonthValue, monthEnd, monthStart } from "./date";
import type { GameResult, TierEntry } from "../types";

const TEAM_TYPE = "0102";
/** 앞 달부터 몇 달까지 거슬러 찾나(서버 PAST_MONTHS 와 같은 4). */
const PAST_MONTHS = 4;
/** 받아 둘 달 수(이번 달 포함 · 서버 상한 24) — 그 앞 달의 판까지 확률이 선다. */
const TREND_MONTHS = 12;

/** 달 → 사람 → 종족 → (인분, 판 수). */
type Tables = Map<string, Map<string, Map<string, { inbun: number; plays: number }>>>;

let tables: Tables | null = null;
let loading = false;
const subs = new Set<() => void>();

function load(): void {
  if (loading || tables) return;
  loading = true;
  const cur = currentMonthValue();
  const [y, m] = cur.split("-").map(Number);
  /* 본 조회는 이번 달 한 달로 좁혀 가볍게 — 쓰는 것은 달별 줄(trend)뿐이다. */
  api.getGameResultStats({ matchType: TEAM_TYPE, race: "all", dateFrom: monthStart(y, m - 1), dateTo: monthEnd(y, m - 1), trendMonths: TREND_MONTHS, tierByRace: true })
    .then((res) => {
      const out: Tables = new Map();
      for (const [month, rows] of Object.entries(res.trend ?? {})) {
        const byMember = new Map<string, Map<string, { inbun: number; plays: number }>>();
        for (const e of rows ?? []) {
          const byRace = new Map<string, { inbun: number; plays: number }>();
          for (const [race, t] of Object.entries(e.tierByRace ?? {}) as [string, TierEntry | null][]) {
            const ib = t?.inbun;
            if (typeof ib === "number" && ib > 0 && (t?.plays ?? 0) > 0) byRace.set(race, { inbun: ib, plays: t!.plays });
          }
          if (byRace.size) byMember.set(e.memberId, byRace);
        }
        out.set(month, byMember);
      }
      tables = out;
    })
    .catch(() => { tables = new Map(); })
    .finally(() => { loading = false; subs.forEach((f) => f()); });
}

/** useSyncExternalStore 용 — 처음 구독하면 한 번 받는다. */
export function subscribeWinTables(f: () => void): () => void {
  subs.add(f);
  load();
  return () => { subs.delete(f); };
}
export const winTablesSnapshot = (): Tables | null => tables;

const prevMonths = (ym: string, n: number): string[] => {
  let [y, m] = ym.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    m -= 1; if (m === 0) { m = 12; y -= 1; }
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
};

/** 1팀 승리 확률(0~1) — 낼 수 없으면 null(위 머리말의 조건). */
export function gameWinProb(g: GameResult, t: Tables | null): number | null {
  if (!t || g.matchType !== TEAM_TYPE || !g.team1.length || !g.team2.length) return null;
  if (g.team1.length === 1 && g.team2.length === 1) return null;
  const all = [...g.team1, ...g.team2];
  if (all.some((s) => isComputerSlot(s.memberId))) return null;
  const month = (g.date || g.gameStartedAt || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const months = prevMonths(month, PAST_MONTHS);
  if (!months.some((k) => t.has(k))) return null;   // 받아 둔 달보다 오래된 판
  let found = 0;
  const inbunOf = (memberId: string, race: string): number => {
    if (isUnregisteredSlot(memberId)) return 1;
    for (const k of months) { const r = t.get(k)?.get(memberId)?.get(race); if (r) { found += 1; return r.inbun; } }
    for (const k of months) {
      const rs = t.get(k)?.get(memberId);
      if (rs && rs.size) { found += 1; return [...rs.values()].sort((a, b) => b.plays - a.plays)[0].inbun; }
    }
    return 1;
  };
  const a = g.team1.map((s) => inbunOf(s.memberId, s.race));
  const b = g.team2.map((s) => inbunOf(s.memberId, s.race));
  if (found * 2 < all.length) return null;
  return winProb(a, b, g.team1.map((s) => s.race), g.team2.map((s) => s.race));
}

/** 그 판의 1팀 승리 확률(목록 줄 · 받는 동안 · 못 내면 null). */
export function useGameWinProb(g: GameResult): number | null {
  const t = useSyncExternalStore(subscribeWinTables, winTablesSnapshot);
  return useMemo(() => gameWinProb(g, t), [g, t]);
}
