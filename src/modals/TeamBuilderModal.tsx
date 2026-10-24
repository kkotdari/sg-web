import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, Shuffle, Users } from "lucide-react";
import ModalHash from "../utils/modalHash";
import Avatar from "../components/common/Avatar";
import RaceBadge from "../components/common/RaceBadge";
import ChipInput, { type ChipOpt } from "../components/common/ChipInput";
import { Spinner } from "../components/common/Feedback";
import { SelectAllToggle } from "../components/common/Selection";
import { api } from "../api/client";
import { showAlert } from "../components/common/AlertDialog";
import { useAppStore } from "../store/appStore";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import { buildTeams } from "../utils/teamBalance";
import { normalizeSearchText } from "../utils/memberSearch";
import { cx } from "../utils/format";
import type { BalanceSplit } from "../utils/teamBalance";
import type { BaseRace, ClanCompEntry, GameType, Member, Race } from "../types";

const CLAN_TYPE: GameType = "0102";

interface Row {
  member: Member;
  plays: number;
  winRate: number;
  /** 평균 APM(없으면 null) · 준 데미지(경기 평균 대비 % · 100 = 평균 · 없으면 null). */
  apm: number | null;
  dmg: number | null;
  /** 주종족(가장 많이 한 종족 · 없으면 null) — 승률·APM·데미지·판 수는 **이 종족으로 한 경기만**(2026-10-24, 요청: "각자의 주종족에 대한 승률과 기록만 따짐") ·
   *  주종족이 랜덤이거나 종족별 기록이 없으면 전체 기록으로 뗀다. 결과 로스터의 종족 글자이자 팀 종족 구성의 재료. */
  race: Race | null;
  blocked: boolean;
  /** 부종(두 번째로 많이 한 종족)의 기록 — 프로토스 상한에 걸려 부종으로 설 때 쓴다(아래 PROTOSS_CAP ★). 기록이 없으면 null. */
  alt: { race: BaseRace; plays: number; winRate: number; apm: number | null; dmg: number | null } | null;
}

/* ★ 프로토스는 **팀당 2명까지**(2026-10-24, 요청: "종족은 프 2까지만 가능 · 프 주종이 4명을 넘으면 한 명은 부종으로 — 가장 부종이 높은 사람이") —
   고른 사람 중 프 주종이 팀 수 × 2(= 4)를 넘으면 넘친 수만큼 **부종 기록(승률 · 판 수)이 가장 좋은 사람**부터 부종으로 세운다(기록·종족 글자·종족 구성 모두 부종으로).
   부종 기록이 없는 사람은 못 바꾼다 — 그래도 넘치면 상한을 못 지킨 채 짠다(결과에 적는다). 팀 가름(buildTeams)에는 '양 팀 다 프 ≤ 2' 제약을 건다(깍두기는 양 팀 몫). */
const PROTOSS_CAP = 2;
const RACE_ORDER: BaseRace[] = ["테란", "프로토스", "저그"];
const protossOk = (rows: Map<string, Row>) => (a: string[], b: string[]): boolean =>
  [a, b].every((ids) => ids.filter((id) => rows.get(id)?.race === "프로토스").length <= PROTOSS_CAP);
/** 상한에 맞춰 부종으로 세운 뒤의 줄 — 바뀐 사람 id 목록과 함께. */
function applyProtossCap(chosen: Row[]): { rows: Row[]; switched: string[]; short: number } {
  const over = chosen.filter((r) => r.race === "프로토스").length - PROTOSS_CAP * 2;
  if (over <= 0) return { rows: chosen, switched: [], short: 0 };
  const cands = chosen.filter((r) => r.race === "프로토스" && r.alt)
    .sort((a, b) => (b.alt!.winRate - a.alt!.winRate) || (b.alt!.plays - a.alt!.plays));
  const pick = new Set(cands.slice(0, over).map((r) => r.member.id));
  const rows = chosen.map((r) => (pick.has(r.member.id) && r.alt
    ? { ...r, race: r.alt.race, plays: r.alt.plays, winRate: r.alt.winRate, apm: r.alt.apm, dmg: r.alt.dmg }
    : r));
  return { rows, switched: [...pick], short: Math.max(0, over - pick.size) };
}

/* ★ 팀 종족 구성(2026-10-24, 요청: "그걸로 따진 종족 구성에 따라 승패 확률도 적용") — 통계의 '종족 구성 전적'(clanComps · 서버 _clan_comps)과 **같은 이름표**를 짓는다:
   수 많은 종족부터 · 같으면 프 → 저 → 테 → 랜 차례 · "2테 1저" 꼴 · 판 꼴은 적은 쪽:많은 쪽("3:4"). 그 구성이 내전에서 거둔 승률을 두 팀 점수에 보태 승리 확률에 넣는다. */
const COMP_SHORT: Record<string, string> = { "프로토스": "프", "테란": "테", "저그": "저", "랜덤": "랜" };
const COMP_ORDER: Record<string, number> = { "프로토스": 0, "저그": 1, "테란": 2, "랜덤": 3 };
/** 구성 전적을 믿는 최소 판 수 — 그보다 적으면 구성 승률은 '모름'(50 으로 친다). */
const COMP_MIN_PLAYS = 3;
/** 구성 승률 1%p 를 점수 몇 점으로 치나 — 10%p 유리 ≈ 5점 ≈ 57:43(winProbA). */
const COMP_K = 0.5;
export function compLabelOf(races: (Race | null)[]): string | null {
  if (races.length === 0 || races.some((r) => r === null)) return null;
  const n = new Map<string, number>();
  for (const r of races) n.set(r as string, (n.get(r as string) ?? 0) + 1);
  return [...n.entries()]
    .sort((a, b) => b[1] - a[1] || (COMP_ORDER[a[0]] ?? 9) - (COMP_ORDER[b[0]] ?? 9))
    .map(([r, k]) => `${k}${COMP_SHORT[r] ?? r.slice(0, 1)}`)
    .join(" ");
}
export interface CompRecord { label: string; winRate: number | null; plays: number }
/** 한 팀의 종족 구성 전적 — 이름표가 안 서면(종족 모름) null · 전적이 없거나 적으면 winRate null. */
export function compRecordOf(ids: string[], otherCount: number, rows: Map<string, Row>, comps: ClanCompEntry[]): CompRecord | null {
  const label = compLabelOf(ids.map((id) => rows.get(id)?.race ?? null));
  if (!label) return null;
  const [lo, hi] = ids.length <= otherCount ? [ids.length, otherCount] : [otherCount, ids.length];
  const hit = comps.find((c) => c.format === `${lo}:${hi}` && c.label === label);
  return { label, winRate: hit && hit.plays >= COMP_MIN_PLAYS ? hit.winRate : null, plays: hit?.plays ?? 0 };
}
/** 팀 점수 = 사람 점수 평균 + 구성 승률 보정(COMP_K · (승률 − 50)). */
const teamScoreOf = (ids: string[], otherCount: number, ratings: Map<string, number>, rows: Map<string, Row>, comps: ClanCompEntry[]): number => {
  const rec = compRecordOf(ids, otherCount, rows, comps);
  return avgRating(ids, ratings) + COMP_K * ((rec?.winRate ?? 50) - 50);
};

const THIN_PLAYS = 5;

/* ★ 실력 점수(2026-10-24, 요청: "팀 가르는 방식은 승률뿐 아니라 APM·데미지 등도 고려") — 고른 사람들 안에서 승률·APM·준 데미지(평균 대비)를 각각 표준화(z)해
   승률 0.5 · APM 0.25 · 데미지 0.25 로 섞고 50 ± 15·z 로 편다(0~100). 값이 없는 자(APM·데미지 기록 없음)는 그 자에서 평균(z 0)으로 친다 — 벌도 상도 없다.
   표준화는 **고른 무리 안**에서라 같은 사람도 누구와 섞이느냐에 따라 점수가 달라진다(팀을 가르는 데만 쓰는 상대 자다). */
const RATING_W = { win: 0.5, apm: 0.25, dmg: 0.25 } as const;
export function ratingsOf(rows: Row[]): Map<string, number> {
  const z = (vals: (number | null)[]): number[] => {
    const have = vals.filter((v): v is number => v !== null);
    if (have.length < 2) return vals.map(() => 0);
    const mean = have.reduce((a, b) => a + b, 0) / have.length;
    const sd = Math.sqrt(have.reduce((a, b) => a + (b - mean) ** 2, 0) / have.length);
    return vals.map((v) => (v === null || sd < 1e-9 ? 0 : (v - mean) / sd));
  };
  const zw = z(rows.map((r) => r.winRate));
  const za = z(rows.map((r) => r.apm));
  const zd = z(rows.map((r) => r.dmg));
  const out = new Map<string, number>();
  rows.forEach((r, i) => {
    const v = 50 + 15 * (RATING_W.win * zw[i] + RATING_W.apm * za[i] + RATING_W.dmg * zd[i]);
    out.set(r.member.id, Math.max(0, Math.min(100, v)));
  });
  return out;
}

const dmgText = (v: number | null): string => (v === null ? "-" : `${(v / 100).toFixed(1)}배`);

/* ★ 승리 확률(2026-10-24, 요청: "승리 확률 몇 대 몇으로 보여주기") — 두 팀 평균 점수 차를 로지스틱(10^(−차/40))으로 편다: 차 5점 ≈ 57:43 · 10점 ≈ 64:36 · 20점 ≈ 76:24.
   점수는 고른 무리 안의 상대 자(ratingsOf · 50 ± 15·z)라 그 자에서만 뜻이 있다. */
export function winProbA(avgA: number, avgB: number): number {
  return 1 / (1 + 10 ** (-(avgA - avgB) / 40));
}
const avgRating = (ids: string[], ratings: Map<string, number>): number => (ids.length ? ids.reduce((a, id) => a + (ratings.get(id) ?? 50), 0) / ids.length : 50);
/** 조합의 1팀 승리 확률(사람 점수 + 종족 구성 보정). */
const probOf = (sp: BalanceSplit, ratings: Map<string, number>, rows: Map<string, Row>, comps: ClanCompEntry[]): number =>
  winProbA(teamScoreOf(sp.teamA, sp.teamB.length, ratings, rows, comps), teamScoreOf(sp.teamB, sp.teamA.length, ratings, rows, comps));
/** 조합의 승리 확률 차(%p · 반올림) — 같은 값이면 동률 조합이다. */
const probGapOf = (sp: BalanceSplit, ratings: Map<string, number>, rows: Map<string, Row>, comps: ClanCompEntry[]): number => {
  const pA = probOf(sp, ratings, rows, comps);
  return Math.abs(Math.round(pA * 100) - Math.round((1 - pA) * 100));
};

/** 결과의 한쪽 — 경기 결과의 로스터(GameResultSides)와 같은 꼴: 아바타 · 이름 · 종족 글자(요청: "결과는 로스터식으로"). */
function RosterTeam({ ids, rows, ratings, right }: { ids: string[]; rows: Map<string, Row>; ratings: Map<string, number>; right?: boolean }) {
  const members = ids.map((id) => rows.get(id)).filter((r): r is Row => !!r);
  return (
    <div className={cx("scr-roster-side", right && "scr-roster-side-target", "scr-tb-roster-side", right && "is-right")}>
      {members.map((r) => (
        <div key={r.member.id} className="scr-roster-block">
          <div className="scr-roster-row">
            <span className="scr-roster-person" title={`점수 ${(ratings.get(r.member.id) ?? 50).toFixed(0)} · 승률 ${r.winRate.toFixed(1)}% · APM ${r.apm === null ? "-" : Math.round(r.apm)} · 데미지 ${dmgText(r.dmg)}`}>
              <Avatar member={r.member} size={20} />
              <span className="scr-roster-name">{r.member.nickname}</span>
              <RaceBadge race={r.race ?? ""} size={13} circleLetter className="scr-team-name-race" />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TeamBuilderModal({ onClose }: { onClose: () => void }) {
  useLockBodyScroll();
  const members = useAppStore((s) => s.members);
  const [rows, setRows] = useState<Row[] | null>(null);
  /** 내전 종족 구성 전적(통계 응답 · 위 compRecordOf ★). */
  const [comps, setComps] = useState<ClanCompEntry[]>([]);
  /** 고른 사람(누른 차례 — 맨 위로 올라간다). */
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<{ splits: BalanceSplit[]; ratings: Map<string, number>; rows: Map<string, Row>; switched: string[]; short: number; capped: boolean; at: number; exact: boolean } | null>(null);

  useEffect(() => {
    const active = members.filter((m) => m.status !== "withdrawn" && m.status !== "suspended");
    if (active.length === 0) { setRows([]); return; }
    let dead = false;
    api.getGameResultStats({ memberIds: active.map((m) => m.id), matchType: CLAN_TYPE, race: "all" })
      .then((res) => {
        if (dead) return;
        const entries = new Map(res.members.map((e) => [e.memberId, e]));
        const list: Row[] = active.map((m) => {
          const e = entries.get(m.id);
          const race = e?.mostPlayedRace ?? null;
          /* 주종족 기록만(위 Row.race ★) — 종족별 표에 그 종족이 있고 판이 있으면 그것, 아니면(랜덤 · 기록 없음) 전체. */
          const byRace = race && e ? e.byRace[race as BaseRace] : undefined;
          const s = byRace && byRace.plays > 0 ? byRace : e?.overall;
          const plays = s?.plays ?? 0;
          /* 부종 = 주종족 말고 가장 많이 한 종족(판이 있어야) — 위 Row.alt ★. */
          const altRace = e ? RACE_ORDER.filter((r) => r !== race && (e.byRace[r]?.plays ?? 0) > 0).sort((x, y) => e.byRace[y].plays - e.byRace[x].plays)[0] : undefined;
          const a = altRace && e ? e.byRace[altRace] : undefined;
          const alt = altRace && a ? { race: altRace, plays: a.plays, winRate: a.winRate, apm: a.avgApm ?? null, dmg: a.dmgDealtRel ?? null } : null;
          return { member: m, plays, winRate: s?.winRate ?? 0, apm: s?.avgApm ?? null, dmg: s?.dmgDealtRel ?? null, race, blocked: plays === 0, alt };
        });
        list.sort((a, b) => b.plays - a.plays || a.member.nickname.localeCompare(b.member.nickname));
        setRows(list);
        setComps(res.clanComps ?? []);
      })
      .catch((e: Error) => { if (!dead) { setRows([]); showAlert(e.message || "내전 기록을 불러오지 못했어요."); } });
    return () => { dead = true; };
  }, [members]);

  const byId = useMemo(() => new Map((rows ?? []).map((r) => [r.member.id, r])), [rows]);
  const pickable = useMemo(() => (rows ?? []).filter((r) => !r.blocked), [rows]);
  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const allPicked = pickable.length > 0 && pickable.every((r) => pickedSet.has(r.member.id));
  /* ★ 고른 사람은 **맨 위**(2026-10-24, 요청: "개인 칩 누르면 추가돼서 맨 위로 올라가고 색깔 변경 — 체크박스식 아님") — 누른 차례 그대로 위에, 나머지는 판 수 차례. */
  const ordered = useMemo(() => {
    const list = rows ?? [];
    const top = picked.map((id) => byId.get(id)).filter((r): r is Row => !!r);
    return [...top, ...list.filter((r) => !pickedSet.has(r.member.id))];
  }, [rows, picked, byId, pickedSet]);
  /* 이름 검색(요청: "맨 위에 이름으로 검색창 · 자동완성 · 엔터 누르면 바로 추가") — 칩 입력의 자동완성을 빌리고 담긴 값은 바로 고름으로 옮긴다(칸은 늘 비어 있다). */
  const searchOpts = useMemo<ChipOpt[]>(() => pickable.filter((r) => !pickedSet.has(r.member.id)).map((r) => ({ value: r.member.nickname, member: r.member })), [pickable, pickedSet]);
  const addByName = (names: string[]): void => {
    const name = names[names.length - 1];
    if (!name) return;
    const hit = pickable.find((r) => normalizeSearchText(r.member.nickname) === normalizeSearchText(name));
    if (!hit) return;
    setPicked((prev) => (prev.includes(hit.member.id) ? prev : [hit.member.id, ...prev]));
  };

  const toggle = (id: string): void => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev]));

  const build = (): void => {
    const picked0 = pickable.filter((r) => pickedSet.has(r.member.id));
    if (picked0.length < 2) { showAlert("두 명 이상 골라 주세요."); return; }
    /* 프로토스 상한(위 PROTOSS_CAP ★) — 넘치면 부종으로 세운 줄로 점수를 매긴다. */
    const cap = applyProtossCap(picked0);
    const chosen = cap.rows;
    const rowsMap = new Map(chosen.map((r) => [r.member.id, r]));
    const ratings = ratingsOf(chosen);
    const players = chosen.map((r) => ({ id: r.member.id, rating: ratings.get(r.member.id) ?? 50 }));
    /* 후보는 넉넉히(40) 받는다 — 사람 점수로 고른 뒤 **종족 구성 보정까지 넣은 승리 확률**로 다시 줄 세우므로(위 probGapOf ★) 점수 차 2위가 구성 덕에 1위가 될 수 있다.
       '양 팀 다 프 ≤ 2' 제약으로 먼저 짜고, 그 제약으로 한 조합도 안 나오면(부종 기록이 모자람) 제약 없이 짠다(capped 거짓 · 결과에 적는다). */
    let out = buildTeams(players, 40, protossOk(rowsMap));
    let capped = true;
    if (out.splits.length === 0) { out = buildTeams(players, 40); capped = false; }
    if (out.splits.length === 0) { showAlert("팀을 나누지 못했어요."); return; }
    /* ★ 다른 조합은 **승리 확률 차가 가장 작은 것과 동률인 것만**(요청: "최소 승리 확률 차 1개 또는 동률인 경우만 다른 조합 보여주기") — 그 밖(차가 더 큰 조합)은 버린다. */
    const gaps = out.splits.map((sp) => probGapOf(sp, ratings, rowsMap, comps));
    const best = Math.min(...gaps);
    const splits = out.splits.filter((_, i) => gaps[i] === best);
    setResult({ splits, ratings, rows: rowsMap, switched: cap.switched, short: cap.short, capped, at: 0, exact: out.exact });
  };

  const split = result ? result.splits[result.at] : null;
  const joker = split?.joker ? byId.get(split.joker) ?? null : null;
  /** 결과가 보는 줄 — 부종으로 세운 사람은 그 종족·기록이다(위 applyProtossCap ★). */
  const resRows = result?.rows ?? byId;

  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash="team-builder" onClose={onClose} />
      <div className="scr-modal scr-tb-modal">
        <div className="scr-modal-head">
          <span className="scr-tb-title">
            팀 구성하기
            <span className="scr-tb-beta">beta</span>
          </span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>

        <div className="scr-modal-body">
          {rows === null ? <Spinner /> : split && result ? (
            <>
              {/* ★ 결과는 로스터식(요청) — 왼쪽 1팀 · 가운데 승리 확률 "54 : 46" · 오른쪽 2팀. 깍두기는 아래 한 줄. */}
              {((): ReactNode => {
                const pA = probOf(split, result.ratings, resRows, comps);
                const a = Math.round(pA * 100); const b = 100 - a;
                const compA = compRecordOf(split.teamA, split.teamB.length, resRows, comps);
                const compB = compRecordOf(split.teamB, split.teamA.length, resRows, comps);
                /* 종족 구성 한 줄(위 compRecordOf ★) — "2테 1저 · 58%(12판)" · 전적이 적으면 "(기록 n판)" · 종족을 모르는 사람이 있으면 안 쓴다. */
                const compText = (c: CompRecord | null): ReactNode => c && (
                  <span className="scr-tb-match-comp">
                    <b>{c.label}</b>{c.winRate !== null ? ` · ${c.winRate.toFixed(0)}%(${c.plays}판)` : c.plays > 0 ? ` · 기록 ${c.plays}판` : " · 기록 없음"}
                  </span>
                );
                return (
                  <div className="scr-tb-match">
                    <div className="scr-tb-match-head">
                      <span className="scr-tb-match-team scr-tb-team-a-txt">1팀{compText(compA)}</span>
                      <span className="scr-tb-match-prob" aria-label={`승리 확률 1팀 ${a} 대 2팀 ${b}`}>
                        <span className="scr-tb-match-prob-label">승리 확률</span>
                        <b className={cx(a > b && "is-up")}>{a}</b><i>:</i><b className={cx(b > a && "is-up")}>{b}</b>
                      </span>
                      <span className="scr-tb-match-team scr-tb-team-b-txt">2팀{compText(compB)}</span>
                    </div>
                    <div className="scr-roster-matchup scr-tb-roster">
                      <RosterTeam ids={split.teamA} rows={resRows} ratings={result.ratings} />
                      <span className="scr-tb-match-vs" aria-hidden>vs</span>
                      <RosterTeam ids={split.teamB} rows={resRows} ratings={result.ratings} right />
                    </div>
                  </div>
                );
              })()}

              <div className="scr-tb-gap">
                {!result.exact && <span className="scr-tb-gap-note">인원이 많아 어림으로 찾았어요</span>}
                {result.splits.length > 1 && (
                  <span className="scr-tb-gap-note">동률 조합 {result.splits.length}개 중 {result.at + 1}번째</span>
                )}
              </div>

              {(result.switched.length > 0 || result.short > 0 || !result.capped) && (
                <p className="scr-tb-note">
                  프로토스는 팀당 {PROTOSS_CAP}명까지예요.
                  {result.switched.length > 0 && (
                    <> {result.switched.map((id, i) => <span key={id}>{i > 0 && ", "}<b>{byId.get(id)?.member.nickname}</b> 님은 부종({resRows.get(id)?.race})으로</span>)} 세웠어요(부종 기록이 가장 좋은 분부터).</>
                  )}
                  {result.short > 0 && <> 부종 기록이 있는 분이 모자라 {result.short}명은 그대로 두었어요.</>}
                  {!result.capped && <> 이 인원으로는 상한을 지키는 조합이 없어 상한 없이 짰어요.</>}
                </p>
              )}

              {joker && (
                <p className="scr-tb-note">
                  <b>{joker.member.nickname}</b> 님이 깍두기(양팀 소속)입니다 — 못해서가 아니라,
                  이 분을 빼야 나머지가 가장 고르게 갈려서예요. 양쪽에 다 서므로 점수는 어느 팀에도 안 더했습니다.
                </p>
              )}

              <div className="scr-tb-actions">
                <button type="button" className="scr-rect-btn" onClick={() => setResult(null)}>
                  다시 고르기
                </button>
                {result.splits.length > 1 && (
                  <button
                    type="button" className="scr-rect-btn"
                    onClick={() => setResult((r) => (r ? { ...r, at: (r.at + 1) % r.splits.length } : r))}
                  >
                    <Shuffle size={13} /> 다른 조합
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="scr-tb-search">
                <ChipInput values={[]} onChange={addByName} options={searchOpts} placeholder="이름으로 찾아 추가" single />
              </div>
              <div className="scr-tb-pickhead">
                <span className="scr-tb-picked">{picked.length}명 선택</span>
                {pickable.length > 0 && (
                  <SelectAllToggle
                    className="scr-tb-all" all={allPicked} count={picked.length}
                    onToggle={() => setPicked(allPicked ? [] : pickable.map((r) => r.member.id))}
                  />
                )}
              </div>

              <ul className="scr-tb-pick-list">
                {rows.length === 0 && <li className="scr-tb-empty">회원이 없어요</li>}
                {ordered.map((r) => (
                  <li key={r.member.id}>
                    <button
                      type="button" disabled={r.blocked} aria-pressed={pickedSet.has(r.member.id)}
                      className={cx("scr-tb-pick", r.blocked && "is-off", pickedSet.has(r.member.id) && "is-on")}
                      onClick={() => toggle(r.member.id)}
                    >
                      <Avatar member={r.member} size={26} />
                      <span className="scr-tb-pick-name">{r.member.nickname}</span>
                      {r.blocked ? (
                        <span className="scr-tb-pick-meta">내전 기록 없음</span>
                      ) : (
                        <span className="scr-tb-pick-meta">
                          {r.winRate.toFixed(1)}% · {r.plays}판
                          {r.apm !== null && ` · ${Math.round(r.apm)}APM`}
                          {r.dmg !== null && ` · ${dmgText(r.dmg)}`}
                          {r.plays < THIN_PLAYS && <b className="scr-tb-thin"> 표본 적음</b>}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>

              <div className="scr-tb-actions">
                <span className="scr-tb-hint">주종족으로 한 내전의 승률 · APM · 데미지(평균 대비)와 팀 종족 구성 전적을 함께 봅니다.</span>
                <button
                  type="button" className="scr-rect-btn"
                  disabled={picked.length < 2} onClick={build}
                >
                  <Users size={13} /> 팀 짜기
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
