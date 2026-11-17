/* ★ 게임 목록의 **승리 확률**(2026-11-17, 요청: "피시와 폰 게임목록의 로스터 부분에 승패 위에다가 예측 승리확률 · 팀 구성하기 그 로직 · wpa 검증에도 썼던 로직 ·
   종족까지 반영 · 라벨은 승리 확률") — 팀 구성하기(utils/teamBalance.ts)의 식 그대로:
     편의 힘 T = 머릿수 × (인분 Q 제곱 평균)^{1/Q}(Q 2) · P(1팀 승) = σ(γ · ln(T₁/T₂) + 종족 몫₁ − 종족 몫₂)(γ 5.0 · 프로토스 +0.55 · 저그 −0.25)
   인분은 sg-api scripts/wpa_review `team`(README '팀 구성하기 승률 모형')이 검증한 때와 같게 **그 판 앞 달까지의 티어**다 — 그 달 판은 안 쓴다(결과를 아는 판으로
   그 판을 맞히지 않게). 앞 달 티어는 서버 달별 줄(trend · 앞 달을 섞은 한 달 조회와 같은 값)이고, 사람마다 **그 판에 선 종족의 인분**(팀 구성하기와 같음 · tierByRace)이다.
   ★ 판 수 보강(같은 날 되요청: "종족은 종족인분으로 하는게 맞아 그런데 판수가 적은경우가 있으니 그런걸 만회할 방법을 찾자 · 검증과 달리 전월들 기록을 더 두텁게") —
     옛: 앞 달부터 4달 거슬러 그 종족 인분이 처음 나오는 달 하나만 썼다(3판짜리 달이어도 그 값 그대로). 서버 종족 인분은 판이 적으면 1인분 쪽으로 당겨진다
     (tier CBT_SHRINK 6 · EAPM 몫은 그 달 판만) — 부종족 몇 판이면 센 사람도 1인분 언저리로 나왔다. 이제 사람 · 종족마다:
       ① 종족 증거 = 앞 LOOKBACK(6) 달의 그 종족 인분을 로그로 평균 — 무게 = 그 달 판 수 × RHO^(몇 달 전 − 1)(RHO 0.6 · 옛 달일수록 덜 믿기).
       ② 사람 증거 = 같은 달들의 **종합 인분**(tier · 주종족 판 전부)을 같은 무게로(없으면 그 달 모든 종족 줄을 판 수로).
       ③ 인분 = exp((n · ①+ K · ②) ÷ (n + K)) — n = ① 무게 합(실효 판 수) · K 6(서버 CBT_SHRINK 와 같은 자 · 6판이면 반반).
          판이 넉넉한 종족은 제 값 · 몇 판뿐인 종족은 그 사람 종합 쪽으로 · 그 종족 판이 없으면 종합 그대로.
     RHO · K 는 어림(이 꼴은 아직 `team` 검증에 안 넣었다 — 운영 자료가 있는 곳에서 견줄 것).
   팀전(0102) 두 편 판만 · 컴퓨터가 낀 판 · 개인전 · 1:1 은 안 낸다 · 자리 절반 넘게 티어를 못 찾으면 안 낸다(거의 다 1인분이면 의미 없는 50%라서).
   서버 한 번(세션마다) — 이번 달까지 TREND_MONTHS 달의 달별 줄. 그보다 오래된 판은 안 낸다.
   ★ 자리 잡기(같은 날 지적: "예상 줄 자리가 지정돼있지 않아서 승패줄이 위에있다가 로딩후 내려가는 문제") — 낼 수 있는 꼴의 판(winSlot · 표 없이 가른다)은
     받기 전부터 그 줄 자리를 비워 둔다(GameRow · 숨긴 칸). 받기에 실패하면 자리를 거둔다. */
import { useMemo, useSyncExternalStore } from "react";
import { api } from "../api/client";
import { winProb } from "./teamBalance";
import { isComputerSlot } from "../constants/computerSlot";
import { isUnregisteredSlot } from "../constants/unregisteredSlot";
import { currentMonthValue, monthEnd, monthStart } from "./date";
import type { GameResult, TierEntry } from "../types";

const TEAM_TYPE = "0102";
/** 앞 달부터 몇 달까지 증거로 쓰나(판 수 보강 · 위 ①②). */
const LOOKBACK = 6;
/** 한 달 옛 달마다 곱하는 믿음(어림 · 1달 전 1 · 2달 전 0.6 · 3달 전 0.36 …). */
const RHO = 0.6;
/** 종족 증거를 사람 종합 쪽으로 당기는 판 수(어림 · 서버 CBT_SHRINK 와 같은 6). */
const K_SHRINK = 6;
/** 받아 둘 달 수(이번 달 포함 · 서버 상한 24) — 그 앞 달의 판까지 확률이 선다. */
const TREND_MONTHS = 12;

type Ib = { inbun: number; plays: number };
/** 달 → 사람 → (종합 인분, 종족 → 인분). */
type Tables = Map<string, Map<string, { all: Ib | null; races: Map<string, Ib> }>>;

let tables: Tables | null = null;
let loading = false;
const subs = new Set<() => void>();

const ibOf = (t: TierEntry | null | undefined): Ib | null => {
  const ib = t?.inbun;
  return typeof ib === "number" && ib > 0 && (t?.plays ?? 0) > 0 ? { inbun: ib, plays: t!.plays } : null;
};

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
        const byMember = new Map<string, { all: Ib | null; races: Map<string, Ib> }>();
        for (const e of rows ?? []) {
          const races = new Map<string, Ib>();
          for (const [race, t] of Object.entries(e.tierByRace ?? {}) as [string, TierEntry | null][]) {
            const v = ibOf(t);
            if (v) races.set(race, v);
          }
          const all = ibOf(e.tier);
          if (races.size || all) byMember.set(e.memberId, { all, races });
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

/** 받아 둘 가장 옛 달("YYYY-MM") — 이번 달에서 TREND_MONTHS − 1 달 앞. */
const firstFetchedMonth = (): string => prevMonths(currentMonthValue(), TREND_MONTHS - 1).pop() ?? currentMonthValue();

/** 그 판의 달("YYYY-MM") — 확률을 낼 수 있는 꼴이 아니면 null(표 없이 가른다 · 위 머리말의 조건). */
function eligibleMonth(g: GameResult): string | null {
  if (g.matchType !== TEAM_TYPE || !g.team1.length || !g.team2.length) return null;
  if (g.team1.length === 1 && g.team2.length === 1) return null;
  if ([...g.team1, ...g.team2].some((s) => isComputerSlot(s.memberId))) return null;
  const month = (g.date || g.gameStartedAt || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  if (prevMonths(month, 1)[0] < firstFetchedMonth()) return null;   // 받아 둘 달보다 오래된 판
  return month;
}

/** 사람 · 종족의 인분(위 ★ 판 수 보강 ①②③) — 앞 달들에 그 사람 줄이 하나도 없으면 null. */
function blendedInbun(t: Tables, months: string[], memberId: string, race: string): number | null {
  let rn = 0, rs = 0, pn = 0, ps = 0;
  months.forEach((k, i) => {
    const row = t.get(k)?.get(memberId);
    if (!row) return;
    const decay = RHO ** i;
    const r = row.races.get(race);
    if (r) { rn += decay * r.plays; rs += decay * r.plays * Math.log(r.inbun); }
    const all: Ib[] = row.all ? [row.all] : [...row.races.values()];
    for (const v of all) { pn += decay * v.plays; ps += decay * v.plays * Math.log(v.inbun); }
  });
  if (pn <= 0) return null;
  const prior = ps / pn;
  return Math.exp(rn > 0 ? (rs + K_SHRINK * prior) / (rn + K_SHRINK) : prior);
}

/** 1팀 승리 확률(0~1) — 낼 수 없으면 null(위 머리말의 조건). */
export function gameWinProb(g: GameResult, t: Tables | null): number | null {
  const month = eligibleMonth(g);
  if (!t || !month) return null;
  const months = prevMonths(month, LOOKBACK);
  const all = [...g.team1, ...g.team2];
  let found = 0;
  const inbunOf = (memberId: string, race: string): number => {
    if (isUnregisteredSlot(memberId)) return 1;
    const v = blendedInbun(t, months, memberId, race);
    if (v == null) return 1;
    found += 1;
    return v;
  };
  const a = g.team1.map((s) => inbunOf(s.memberId, s.race));
  const b = g.team2.map((s) => inbunOf(s.memberId, s.race));
  if (found * 2 < all.length) return null;
  return winProb(a, b, g.team1.map((s) => s.race), g.team2.map((s) => s.race));
}

/** 그 판의 승리 확률 — p: 1팀 확률(받는 동안 · 못 내면 null) · slot: 그 줄 자리를 비워 둘까(낼 수 있는 꼴 · 받기에 실패하면 거둔다). */
export function useGameWinProb(g: GameResult): { p: number | null; slot: boolean } {
  const t = useSyncExternalStore(subscribeWinTables, winTablesSnapshot);
  return useMemo(() => {
    const slot = eligibleMonth(g) != null && (t == null || t.size > 0);
    return { p: slot ? gameWinProb(g, t) : null, slot };
  }, [g, t]);
}
