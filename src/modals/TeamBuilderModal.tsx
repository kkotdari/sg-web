import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Shuffle, Users } from "lucide-react";
import ModalHash from "../utils/modalHash";
import Avatar from "../components/common/Avatar";
import { Spinner } from "../components/common/Feedback";
import { api } from "../api/client";
import { showAlert } from "../components/common/AlertDialog";
import { useAppStore } from "../store/appStore";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import { buildTeams } from "../utils/teamBalance";
import { cx } from "../utils/format";
import type { BalanceSplit } from "../utils/teamBalance";
import type { GameType, Member } from "../types";

const CLAN_TYPE: GameType = "0102";

interface Row {
  member: Member;
  plays: number;
  winRate: number;
  blocked: boolean;
}

const THIN_PLAYS = 5;

function TeamCard({
  title, ids, rows, joker, tone,
}: {
  title: string; ids: string[]; rows: Map<string, Row>; joker: Row | null;
  tone: "a" | "b";
}) {
  const members = ids.map((id) => rows.get(id)).filter((r): r is Row => !!r);
  const sum = members.reduce((a, r) => a + r.winRate, 0);
  const avg = members.length > 0 ? sum / members.length : 0;
  return (
    <div className={cx("scr-tb-team", `scr-tb-team-${tone}`)}>
      <div className="scr-tb-team-head">
        <span className="scr-tb-team-title">{title}</span>
        <span className="scr-tb-team-avg">평균 {avg.toFixed(1)}%</span>
      </div>
      <ul className="scr-tb-team-list">
        {members.map((r) => (
          <li key={r.member.id} className="scr-tb-player">
            <Avatar member={r.member} size={24} />
            <span className="scr-tb-player-name">{r.member.nickname}</span>
            <span className="scr-tb-player-rate">{r.winRate.toFixed(1)}%</span>
          </li>
        ))}
        {joker && (
          <li className="scr-tb-player scr-tb-player-joker">
            <Avatar member={joker.member} size={24} />
            <span className="scr-tb-player-name">{joker.member.nickname}</span>
            <span className="scr-tb-joker-tag">깍두기</span>
            <span className="scr-tb-player-rate">{joker.winRate.toFixed(1)}%</span>
          </li>
        )}
      </ul>
    </div>
  );
}

export default function TeamBuilderModal({ onClose }: { onClose: () => void }) {
  useLockBodyScroll();
  const members = useAppStore((s) => s.members);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ splits: BalanceSplit[]; at: number; exact: boolean } | null>(null);

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
          return { member: m, plays, winRate: s?.winRate ?? 0, blocked: plays === 0 };
        });
        list.sort((a, b) => b.plays - a.plays || a.member.nickname.localeCompare(b.member.nickname));
        setRows(list);
      })
      .catch((e: Error) => { if (!dead) { setRows([]); showAlert(e.message || "내전 기록을 불러오지 못했어요."); } });
    return () => { dead = true; };
  }, [members]);

  const byId = useMemo(() => new Map((rows ?? []).map((r) => [r.member.id, r])), [rows]);
  const pickable = useMemo(() => (rows ?? []).filter((r) => !r.blocked), [rows]);
  const allPicked = pickable.length > 0 && pickable.every((r) => picked.has(r.member.id));

  const toggle = (id: string): void => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const build = (): void => {
    const chosen = pickable.filter((r) => picked.has(r.member.id));
    if (chosen.length < 2) { showAlert("두 명 이상 골라 주세요."); return; }
    const out = buildTeams(chosen.map((r) => ({ id: r.member.id, rating: r.winRate })));
    if (out.splits.length === 0) { showAlert("팀을 나누지 못했어요."); return; }
    setResult({ splits: out.splits, at: 0, exact: out.exact });
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
          {rows === null ? <Spinner /> : split ? (
            <>
              <div className="scr-tb-teams">
                <TeamCard title="1팀" ids={split.teamA} rows={byId} joker={joker} tone="a" />
                <TeamCard title="2팀" ids={split.teamB} rows={byId} joker={joker} tone="b" />
              </div>

              <div className="scr-tb-gap">
                <span className="scr-tb-gap-main">평균 승률 차이 {(split.gap / (split.teamA.length || 1)).toFixed(1)}%p</span>
                {!result?.exact && <span className="scr-tb-gap-note">인원이 많아 어림으로 찾았어요</span>}
                {result && result.splits.length > 1 && (
                  <span className="scr-tb-gap-note">{result.at + 1}번째 / {result.splits.length}개 조합</span>
                )}
              </div>

              {joker && (
                <p className="scr-tb-note">
                  <b>{joker.member.nickname}</b> 님이 깍두기(양팀 소속)입니다 — 못해서가 아니라,
                  이 분을 빼야 나머지가 가장 고르게 갈려서예요. 양쪽에 다 서므로 승률은 어느 팀에도 안 더했습니다.
                </p>
              )}

              <div className="scr-tb-actions">
                <button type="button" className="scr-rect-btn scr-lighting-color" onClick={() => setResult(null)}>
                  다시 고르기
                </button>
                <button
                  type="button" className="scr-rect-btn scr-lighting-color-fill"
                  disabled={!result || result.splits.length <= 1}
                  onClick={() => setResult((r) => (r ? { ...r, at: (r.at + 1) % r.splits.length } : r))}
                >
                  <Shuffle size={13} /> 다른 조합
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="scr-tb-pickhead">
                <span className="scr-tb-picked">{picked.size}명 선택</span>
                {pickable.length > 0 && (
                  <label className="scr-tb-all">
                    <input
                      type="checkbox" checked={allPicked}
                      onChange={() => setPicked(allPicked ? new Set() : new Set(pickable.map((r) => r.member.id)))}
                    />
                    전체 선택
                  </label>
                )}
              </div>

              <ul className="scr-tb-pick-list">
                {rows.length === 0 && <li className="scr-tb-empty">회원이 없어요</li>}
                {rows.map((r) => (
                  <li key={r.member.id}>
                    <label className={cx("scr-tb-pick", r.blocked && "is-off", picked.has(r.member.id) && "is-on")}>
                      <input
                        type="checkbox" disabled={r.blocked}
                        checked={picked.has(r.member.id)}
                        onChange={() => toggle(r.member.id)}
                      />
                      <Avatar member={r.member} size={26} />
                      <span className="scr-tb-pick-name">{r.member.nickname}</span>
                      {r.blocked ? (
                        <span className="scr-tb-pick-meta">내전 기록 없음</span>
                      ) : (
                        <span className="scr-tb-pick-meta">
                          {r.winRate.toFixed(1)}% · {r.plays}판
                          {r.plays < THIN_PLAYS && <b className="scr-tb-thin"> 표본 적음</b>}
                        </span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>

              <div className="scr-tb-actions">
                <span className="scr-tb-hint">내전 승률(전체 기간)로 맞춥니다.</span>
                <button
                  type="button" className="scr-rect-btn scr-lighting-color-fill"
                  disabled={picked.size < 2} onClick={build}
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
