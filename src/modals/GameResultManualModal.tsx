import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import { Spinner } from "../components/common/Feedback";
import Select from "../components/common/Select";
import { api } from "../api/client";
import { useAppStore } from "../store/appStore";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import { todayStr } from "../utils/date";
import { cx } from "../utils/format";
import type { GameResult, GameType, Race } from "../types";

/* ★ 게임결과 수기 입력(2026-10-23, 요청: "경기결과 수기 입력 폼 필요(간단)") — 리플레이 없이 날짜 · 유형 · 두 팀의 회원과 종족 · 결과(· 맵)만 적는다.
   서버는 리플레이 등록과 같은 길(POST /api/game-results)로 받는다 — 마감한 달은 서버가 막는다. 일대일은 한 사람씩 · 팀전은 팀마다 네 사람까지. */

type Slot = { memberId: string; race: Race };
type Team = "team1" | "team2";
const RACES: { value: Race; label: string }[] = [
  { value: "테란", label: "테" }, { value: "프로토스", label: "프" }, { value: "저그", label: "저" }, { value: "랜덤", label: "랜" },
];
const TEAM_MAX = 4;
const empty = (): Slot => ({ memberId: "", race: "테란" });

export default function GameResultManualModal({ onSaved, onClose }: {
  onSaved: (game: GameResult) => void; onClose: () => void;
}) {
  useLockBodyScroll();
  const members = useAppStore((s) => s.members);
  const [date, setDate] = useState(todayStr);
  const [type, setType] = useState<GameType>("0101");
  const [mapName, setMapName] = useState("");
  const [teams, setTeams] = useState<Record<Team, Slot[]>>({ team1: [empty()], team2: [empty()] });
  const [result, setResult] = useState<"team1" | "team2" | "draw" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const active = useMemo(
    () => members.filter((m) => m.status === "active").sort((a, b) => a.nickname.localeCompare(b.nickname, "ko")),
    [members],
  );
  const picked = new Set([...teams.team1, ...teams.team2].map((s) => s.memberId).filter(Boolean));
  const optionsFor = (own: string) => active
    .filter((m) => m.id === own || !picked.has(m.id))
    .map((m) => ({ value: m.id, label: m.nickname }));
  const patch = (team: Team, i: number, p: Partial<Slot>): void =>
    setTeams((t) => ({ ...t, [team]: t[team].map((s, k) => (k === i ? { ...s, ...p } : s)) }));
  const changeType = (next: GameType): void => {
    setType(next);
    // 일대일로 바꾸면 팀마다 첫 사람만 남긴다.
    if (next === "0101") setTeams((t) => ({ team1: t.team1.slice(0, 1), team2: t.team2.slice(0, 1) }));
  };
  const teamed = type === "0102";

  const save = async (): Promise<void> => {
    setErr("");
    const all = [...teams.team1, ...teams.team2];
    if (!date) { setErr("날짜를 고르세요."); return; }
    if (all.some((s) => !s.memberId)) { setErr("모든 자리에 회원을 고르세요."); return; }
    if (result === null) { setErr("결과를 고르세요."); return; }
    const nickOf = (id: string): string => active.find((m) => m.id === id)?.nickname ?? id;
    setBusy(true);
    try {
      const game = await api.createManualGameResult({
        date, matchType: type, result, mapName: mapName.trim() || undefined,
        team1: teams.team1.map((s) => ({ ...s, playerName: nickOf(s.memberId) })),
        team2: teams.team2.map((s) => ({ ...s, playerName: nickOf(s.memberId) })),
      });
      onSaved(game);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "등록하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const teamBlock = (team: Team, label: string) => (
    <div className="scr-field scr-gm-manual-team">
      <div className="scr-gm-manual-team-head">
        <span className="scr-label">{label}</span>
        {teamed && teams[team].length < TEAM_MAX && (
          <button
            type="button" className="scr-compact-rect-btn is-secondary" disabled={busy}
            onClick={() => setTeams((t) => ({ ...t, [team]: [...t[team], empty()] }))}
          >
            <Plus size={13} aria-hidden /> 사람 추가
          </button>
        )}
      </div>
      {teams[team].map((s, i) => (
        <div key={i} className="scr-gm-manual-slot">
          <Select
            value={s.memberId} options={optionsFor(s.memberId)} placeholder="회원 고르기" size="sm"
            className="scr-gm-manual-member" disabled={busy} onChange={(v) => patch(team, i, { memberId: v })}
          />
          <span className="scr-gm-manual-races" role="group" aria-label="종족">
            {RACES.map((r) => (
              <button
                key={r.value} type="button" disabled={busy} aria-pressed={s.race === r.value} title={r.value}
                className={cx("scr-gm-manual-race", s.race === r.value && "is-on")}
                onClick={() => patch(team, i, { race: r.value })}
              >
                {r.label}
              </button>
            ))}
          </span>
          {teams[team].length > 1 && (
            <button
              type="button" className="scr-icon-btn" aria-label="이 자리 빼기" disabled={busy}
              onClick={() => setTeams((t) => ({ ...t, [team]: t[team].filter((_, k) => k !== i) }))}
            >
              <X size={13} />
            </button>
          )}
        </div>
      ))}
    </div>
  );

  return createPortal(
    <div className="scr-modal-overlay">
      <div className="scr-modal scr-modal-sm scr-gm-manual">
        <div className="scr-modal-head">
          <span>게임결과 수기 입력</span>
          <button type="button" className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>
        <div className="scr-modal-body">
          <div className="scr-gm-manual-row">
            <label className="scr-field">
              <span className="scr-label">날짜</span>
              <input type="date" className="scr-input" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
            </label>
            <div className="scr-field">
              <span className="scr-label">유형</span>
              <div className="scr-activity-game-tabs" role="tablist" aria-label="유형">
                {(["0101", "0102"] as const).map((t) => (
                  <button
                    key={t} type="button" role="tab" aria-selected={type === t}
                    className={cx("scr-activity-game-tab", type === t && "is-on")} onClick={() => changeType(t)}
                  >
                    {t === "0101" ? "일대일" : "팀전"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {teamBlock("team1", "1팀")}
          {teamBlock("team2", "2팀")}
          <div className="scr-field">
            <span className="scr-label">결과</span>
            <div className="scr-gm-manual-result" role="group" aria-label="결과">
              {([["team1", "1팀 승"], ["draw", "무"], ["team2", "2팀 승"]] as const).map(([v, l]) => (
                <button
                  key={v} type="button" disabled={busy} aria-pressed={result === v}
                  className={cx("scr-compact-rect-btn", result !== v && "is-secondary")} onClick={() => setResult(v)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <label className="scr-field">
            <span className="scr-label">맵 <span className="scr-label-optional">(선택)</span></span>
            <input type="text" className="scr-input" value={mapName} maxLength={150} placeholder="예: 투혼" onChange={(e) => setMapName(e.target.value)} />
          </label>
          {err && <div className="scr-err" role="alert">{err}</div>}
        </div>
        <div className="scr-form-actions">
          <button type="button" className="scr-rect-btn is-secondary" onClick={onClose} disabled={busy}>취소</button>
          <button type="button" className="scr-rect-btn" onClick={() => { void save(); }} disabled={busy}>
            {busy && <Spinner size={14} />} 등록
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
