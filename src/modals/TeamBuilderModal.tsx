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
import { currentMonthValue } from "../utils/date";
import type { BalanceSplit } from "../utils/teamBalance";
import type { BaseRace, GameType, Member, Race, TierEntry } from "../types";

const CLAN_TYPE: GameType = "0102";

interface Row {
  member: Member;
  /** 몇 인분(팀전 티어의 잣대) — 기준 달부터 거슬러 판이 넉넉한 첫 달 것(아래 pickMonth ★). 없으면 고를 수 없다. */
  inbun: number | null;
  tier: number | null;
  /** 인분을 잰 판 수(그 달 · 또는 전체 기간). */
  plays: number;
  /** 인분을 가져온 달("YYYY-MM") · 전체 기간이면 "all". */
  month: string;
  /** 주종족(가장 많이 한 종족 · 전체 기간) — 결과 로스터의 종족 글자 · 프로토스 상한(PROTOSS_CAP ★)의 재료. */
  race: Race | null;
  blocked: boolean;
  /** 부종(두 번째로 많이 한 종족) — 프로토스 상한에 걸려 부종으로 설 때. */
  alt: { race: BaseRace; plays: number; winRate: number } | null;
}

/* ★ 프로토스는 **팀당 2명까지**(2026-10-24, 요청: "종족은 프 2까지만 가능 · 프 주종이 4명을 넘으면 한 명은 부종으로 — 가장 부종이 높은 사람이") —
   고른 사람 중 프 주종이 팀 수 × 2(= 4)를 넘으면 넘친 수만큼 **부종 기록(승률 · 판 수)이 가장 좋은 사람**부터 부종으로 세운다(종족 글자만 · 인분은 사람 값 그대로).
   부종 기록이 없는 사람은 못 바꾼다 — 그래도 넘치면 상한을 못 지킨 채 짠다(결과에 적는다). 팀 가름(buildTeams)에는 '양 팀 다 프 ≤ 2' 제약을 건다. */
const PROTOSS_CAP = 2;
const RACE_ORDER: BaseRace[] = ["테란", "프로토스", "저그"];
const protossOk = (rows: Map<string, Row>) => (a: string[], b: string[]): boolean =>
  [a, b].every((ids) => ids.filter((id) => rows.get(id)?.race === "프로토스").length <= PROTOSS_CAP);
function applyProtossCap(chosen: Row[]): { rows: Row[]; switched: string[]; short: number } {
  const over = chosen.filter((r) => r.race === "프로토스").length - PROTOSS_CAP * 2;
  if (over <= 0) return { rows: chosen, switched: [], short: 0 };
  const cands = chosen.filter((r) => r.race === "프로토스" && r.alt)
    .sort((a, b) => (b.alt!.winRate - a.alt!.winRate) || (b.alt!.plays - a.alt!.plays));
  const pick = new Set(cands.slice(0, over).map((r) => r.member.id));
  const rows = chosen.map((r) => (pick.has(r.member.id) && r.alt ? { ...r, race: r.alt.race } : r));
  return { rows, switched: [...pick], short: Math.max(0, over - pick.size) };
}

/** 티어 등급 문턱(sg-api tier.py TIER_MIN_GAMES) — 그보다 적으면 '표본 적음'. */
const TIER_MIN_GAMES = 10;
const inbunText = (v: number | null): string => (v === null ? "-" : `${v.toFixed(2)}인분`);

function TierChip({ tier }: { tier: number | null }) {
  if (tier === null) return null;
  return <b className={cx("scr-sg-tier", "scr-tb-tier", `is-t${Math.min(tier, 4)}`)}>{tier}</b>;
}

/** 결과의 한쪽 — 경기 결과의 로스터(GameResultSides)와 같은 꼴: 아바타 · 이름 · 종족 글자 · 티어 · 인분. */
function RosterTeam({ ids, rows, right }: { ids: string[]; rows: Map<string, Row>; right?: boolean }) {
  const members = ids.map((id) => rows.get(id)).filter((r): r is Row => !!r);
  return (
    <div className={cx("scr-roster-side", right && "scr-roster-side-target", "scr-tb-roster-side", right && "is-right")}>
      {members.map((r) => (
        <div key={r.member.id} className="scr-roster-block">
          <div className="scr-roster-row">
            <span className="scr-roster-person" title={`${monthLabel(r.month)} · ${inbunText(r.inbun)} · ${r.plays}판`}>
              <Avatar member={r.member} size={20} />
              <span className="scr-roster-name">{r.member.nickname}</span>
              <RaceBadge race={r.race ?? ""} size={16} circleLetter className="scr-team-name-race" />
              <TierChip tier={r.tier} />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ★ 인분은 **최신 달(이번 달)부터 거슬러 기록이 있는 첫 달**(2026-10-31, 요청: "이번 달 표본이 적거나 없으면 전달 · 없으면 그 전달" · "기준달은 그냥 최신달" ·
   "최소 기준을 없애고 최근 기록 있는 달로") — 판 수 문턱 없이 그 달 팀전 판이 있으면 그 달 인분. 최근 LOOKBACK_MONTHS 달에 없으면 전체 기간.
   달별 인분은 통계 응답의 trend(달마다 tier.py 로 그 달 판만 셈). */
const LOOKBACK_MONTHS = 6;
const monthEnd = (ym: string): string => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return `${ym}-${String(d.getUTCDate()).padStart(2, "0")}`;
};
const monthLabel = (ym: string): string => (ym === "all" ? "전체 기간" : `${Number(ym.slice(5))}월`);

export default function TeamBuilderModal({ onClose }: { onClose: () => void }) {
  useLockBodyScroll();
  const members = useAppStore((s) => s.members);
  const [rows, setRows] = useState<Row[] | null>(null);
  /** 고른 사람(누른 차례 — 맨 위로 올라간다). */
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<{ splits: BalanceSplit[]; rows: Map<string, Row>; switched: string[]; short: number; capped: boolean; at: number; exact: boolean } | null>(null);
  const refMonth = useMemo(() => currentMonthValue(), []);

  useEffect(() => {
    const active = members.filter((m) => m.status !== "withdrawn" && m.status !== "suspended");
    if (active.length === 0) { setRows([]); return; }
    let dead = false;
    const memberIds = active.map((m) => m.id);
    /* 한 번에 — 전체 기간(기준 달 끝까지 · 주종족과 마지막 수단의 인분) + 기준 달까지 LOOKBACK_MONTHS 달의 달별 줄(trend). */
    api.getGameResultStats({ memberIds, matchType: CLAN_TYPE, race: "all", dateTo: monthEnd(refMonth), trendMonths: LOOKBACK_MONTHS })
      .then((res) => {
        if (dead) return;
        const allBy = new Map(res.members.map((e) => [e.memberId, e]));
        const months = Object.keys(res.trend ?? {}).filter((k) => k <= refMonth).sort().reverse();   // 기준 달부터 거슬러
        const byMonth = new Map(months.map((k) => [k, new Map((res.trend?.[k] ?? []).map((e) => [e.memberId, e]))]));
        const list: Row[] = active.map((m) => {
          const e = allBy.get(m.id);
          const has = (t?: TierEntry | null): t is TierEntry => typeof t?.inbun === "number" && t.inbun > 0 && t.plays > 0;
          let pick: { t: TierEntry; month: string } | null = null;
          for (const k of months) { const t = byMonth.get(k)?.get(m.id)?.tier; if (has(t)) { pick = { t, month: k }; break; } }
          if (!pick && has(e?.tier)) pick = { t: e!.tier!, month: "all" };
          const race = e?.mostPlayedRace ?? null;
          const altRace = e ? RACE_ORDER.filter((r) => r !== race && (e.byRace[r]?.plays ?? 0) > 0).sort((x, y) => e.byRace[y].plays - e.byRace[x].plays)[0] : undefined;
          const a = altRace && e ? e.byRace[altRace] : undefined;
          return {
            member: m, inbun: pick?.t.inbun ?? null, tier: pick?.t.tier ?? null, plays: pick?.t.plays ?? 0, month: pick?.month ?? "all",
            race, blocked: !pick,
            alt: altRace && a ? { race: altRace, plays: a.plays, winRate: a.winRate } : null,
          };
        });
        list.sort((a, b) => Number(a.blocked) - Number(b.blocked) || (b.inbun ?? 0) - (a.inbun ?? 0) || a.member.nickname.localeCompare(b.member.nickname));
        setRows(list);
      })
      .catch((e: Error) => { if (!dead) { setRows([]); showAlert(e.message || "팀전 기록을 불러오지 못했어요."); } });
    return () => { dead = true; };
  }, [members, refMonth]);   // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map((rows ?? []).map((r) => [r.member.id, r])), [rows]);
  const pickable = useMemo(() => (rows ?? []).filter((r) => !r.blocked), [rows]);
  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const allPicked = pickable.length > 0 && pickable.every((r) => pickedSet.has(r.member.id));
  /* ★ 고른 사람은 **제자리에서 색만**(2026-10-31, 지적: "선택 시 스크롤이 위로 올라가서 불편") — 2026-10-24 의 '누르면 맨 위로'를 되물렸다:
     누른 칩이 목록 맨 위로 옮겨 가며 보던 자리가 튀었다. 목록은 인분 차례 그대로 · 고른 칩은 강조색. */
  const ordered = rows ?? [];
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
    const cap = applyProtossCap(picked0);
    const rowsMap = new Map(cap.rows.map((r) => [r.member.id, r]));
    const players = cap.rows.map((r) => ({ id: r.member.id, inbun: r.inbun ?? 1 }));
    /* '양 팀 다 프 ≤ 2' 로 먼저 짜고, 그 제약으로 한 조합도 안 나오면 제약 없이(capped 거짓 · 결과에 적는다). */
    let out = buildTeams(players, 40, protossOk(rowsMap));
    let capped = true;
    if (out.splits.length === 0) { out = buildTeams(players, 40); capped = false; }
    if (out.splits.length === 0) { showAlert("팀을 나누지 못했어요."); return; }
    /* ★ 다른 조합은 **승리 확률이 가장 반반에 가까운 것과 같은(%p 반올림) 것만**(2026-10-24 요청 "최소 승리 확률 차 1개 또는 동률인 경우만"). */
    const gapOf = (sp: BalanceSplit) => { const a = Math.round(sp.pA * 100); return Math.abs(a - (100 - a)); };
    const best = Math.min(...out.splits.map(gapOf));
    const splits = out.splits.filter((sp) => gapOf(sp) === best);
    setResult({ splits, rows: rowsMap, switched: cap.switched, short: cap.short, capped, at: 0, exact: out.exact });
  };

  const split = result ? result.splits[result.at] : null;
  const resRows = result?.rows ?? byId;
  const sumInbun = (ids: string[]): number => ids.reduce((s, id) => s + (resRows.get(id)?.inbun ?? 0), 0);

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
              {/* ★ 결과는 로스터식(요청) — 왼쪽 1팀 · 가운데 승리 확률 "54 : 46" · 오른쪽 2팀(홀수면 1팀 n · 2팀 n+1). */}
              {((): ReactNode => {
                const a = Math.round(split.pA * 100); const b = 100 - a;
                return (
                  <div className="scr-tb-match">
                    <div className="scr-tb-match-head">
                      <span className="scr-tb-match-team scr-tb-team-a-txt">1팀 · {split.teamA.length}명<span className="scr-tb-match-comp">인분 합 {sumInbun(split.teamA).toFixed(2)}</span></span>
                      <span className="scr-tb-match-prob" aria-label={`승리 확률 1팀 ${a} 대 2팀 ${b}`}>
                        <span className="scr-tb-match-prob-label">승리 확률</span>
                        <b className={cx(a > b && "is-up")}>{a}</b><i>:</i><b className={cx(b > a && "is-up")}>{b}</b>
                      </span>
                      <span className="scr-tb-match-team scr-tb-team-b-txt">2팀 · {split.teamB.length}명<span className="scr-tb-match-comp">인분 합 {sumInbun(split.teamB).toFixed(2)}</span></span>
                    </div>
                    <div className="scr-roster-matchup scr-tb-roster">
                      <RosterTeam ids={split.teamA} rows={resRows} />
                      <span className="scr-tb-match-vs" aria-hidden>vs</span>
                      <RosterTeam ids={split.teamB} rows={resRows} right />
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
                      {/* 주종(가장 많이 한 종족) — 프로토스 상한·결과 종족의 재료(2026-10-31, 요청: "종족까지 지정해서 보여주기"). */}
                      {r.race && <RaceBadge race={r.race} size={14} circleLetter className="scr-tb-pick-race" />}
                      {r.blocked ? (
                        <span className="scr-tb-pick-meta">팀전 기록 없음</span>
                      ) : (
                        <span className="scr-tb-pick-meta">
                          <TierChip tier={r.tier} /> {inbunText(r.inbun)} · {r.plays}판
                          {r.month !== refMonth && <i className="scr-tb-fallback"> {monthLabel(r.month)}</i>}
                          {r.plays < TIER_MIN_GAMES && <b className="scr-tb-thin"> 표본 적음</b>}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>

              <div className="scr-tb-actions">
                <span className="scr-tb-hint">팀전 티어의 인분(기록이 있는 가장 최근 달)으로 승리 확률이 가장 반반에 가깝게 · 홀수면 n : n+1</span>
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
