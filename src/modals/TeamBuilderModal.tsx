import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, Shuffle, Users } from "lucide-react";
import ModalHash from "../utils/modalHash";
import Avatar from "../components/common/Avatar";
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
import type { GameType, Member } from "../types";

const CLAN_TYPE: GameType = "0102";

interface Row {
  member: Member;
  plays: number;
  winRate: number;
  /** 평균 APM(없으면 null) · 준 데미지(경기 평균 대비 % · 100 = 평균 · 없으면 null). */
  apm: number | null;
  dmg: number | null;
  blocked: boolean;
}

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

function TeamCard({
  title, ids, rows, ratings, joker, tone,
}: {
  title: string; ids: string[]; rows: Map<string, Row>; ratings: Map<string, number>; joker: Row | null;
  tone: "a" | "b";
}) {
  const members = ids.map((id) => rows.get(id)).filter((r): r is Row => !!r);
  const avgOf = (f: (r: Row) => number): number => (members.length > 0 ? members.reduce((a, r) => a + f(r), 0) / members.length : 0);
  const player = (r: Row, extra?: ReactNode): ReactNode => (
    <li key={r.member.id} className={cx("scr-tb-player", extra ? "scr-tb-player-joker" : undefined)}>
      <Avatar member={r.member} size={24} />
      <span className="scr-tb-player-name">{r.member.nickname}</span>
      {extra}
      <span className="scr-tb-player-rate" title={`승률 ${r.winRate.toFixed(1)}% · APM ${r.apm === null ? "-" : Math.round(r.apm)} · 데미지 ${dmgText(r.dmg)}`}>
        {(ratings.get(r.member.id) ?? 50).toFixed(0)}점
      </span>
    </li>
  );
  return (
    <div className={cx("scr-tb-team", `scr-tb-team-${tone}`)}>
      <div className="scr-tb-team-head">
        <span className="scr-tb-team-title">{title}</span>
        <span className="scr-tb-team-avg">평균 {avgOf((r) => ratings.get(r.member.id) ?? 50).toFixed(1)}점 · 승률 {avgOf((r) => r.winRate).toFixed(1)}%</span>
      </div>
      <ul className="scr-tb-team-list">
        {members.map((r) => player(r))}
        {joker && player(joker, <span className="scr-tb-joker-tag">깍두기</span>)}
      </ul>
    </div>
  );
}

export default function TeamBuilderModal({ onClose }: { onClose: () => void }) {
  useLockBodyScroll();
  const members = useAppStore((s) => s.members);
  const [rows, setRows] = useState<Row[] | null>(null);
  /** 고른 사람(누른 차례 — 맨 위로 올라간다). */
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<{ splits: BalanceSplit[]; ratings: Map<string, number>; at: number; exact: boolean } | null>(null);

  useEffect(() => {
    const active = members.filter((m) => m.status !== "withdrawn" && m.status !== "suspended");
    if (active.length === 0) { setRows([]); return; }
    let dead = false;
    api.getGameResultStats({ memberIds: active.map((m) => m.id), matchType: CLAN_TYPE, race: "all" })
      .then((res) => {
        if (dead) return;
        const stats = new Map(res.members.map((e) => [e.memberId, e.overall]));
        const list: Row[] = active.map((m) => {
          const s = stats.get(m.id);
          const plays = s?.plays ?? 0;
          return { member: m, plays, winRate: s?.winRate ?? 0, apm: s?.avgApm ?? null, dmg: s?.dmgDealtRel ?? null, blocked: plays === 0 };
        });
        list.sort((a, b) => b.plays - a.plays || a.member.nickname.localeCompare(b.member.nickname));
        setRows(list);
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
    const chosen = pickable.filter((r) => pickedSet.has(r.member.id));
    if (chosen.length < 2) { showAlert("두 명 이상 골라 주세요."); return; }
    const ratings = ratingsOf(chosen);
    const out = buildTeams(chosen.map((r) => ({ id: r.member.id, rating: ratings.get(r.member.id) ?? 50 })));
    if (out.splits.length === 0) { showAlert("팀을 나누지 못했어요."); return; }
    setResult({ splits: out.splits, ratings, at: 0, exact: out.exact });
  };

  const split = result ? result.splits[result.at] : null;
  const joker = split?.joker ? byId.get(split.joker) ?? null : null;

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
              <div className="scr-tb-teams">
                <TeamCard title="1팀" ids={split.teamA} rows={byId} ratings={result.ratings} joker={joker} tone="a" />
                <TeamCard title="2팀" ids={split.teamB} rows={byId} ratings={result.ratings} joker={joker} tone="b" />
              </div>

              <div className="scr-tb-gap">
                <span className="scr-tb-gap-main">평균 점수 차이 {(split.gap / (split.teamA.length || 1)).toFixed(1)}점</span>
                {!result.exact && <span className="scr-tb-gap-note">인원이 많아 어림으로 찾았어요</span>}
                {result.splits.length > 1 && (
                  <span className="scr-tb-gap-note">{result.at + 1}번째 / {result.splits.length}개 조합</span>
                )}
              </div>

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
                <button
                  type="button" className="scr-rect-btn"
                  disabled={result.splits.length <= 1}
                  onClick={() => setResult((r) => (r ? { ...r, at: (r.at + 1) % r.splits.length } : r))}
                >
                  <Shuffle size={13} /> 다른 조합
                </button>
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
                <span className="scr-tb-hint">내전 승률 · APM · 데미지(평균 대비)를 함께 봅니다.</span>
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
