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

/* ★ 게임결과 수기 입력(2026-10-23, 요청: "경기결과 수기 입력 폼 필요(간단)") — 리플레이 없이 날짜(· 시간) · 유형 · 회원과 종족 · 결과(· 맵)만 적는다.
   서버는 리플레이 등록과 같은 길(POST /api/game-results)로 받는다 — 마감한 달은 서버가 막는다. 종족은 실제로 한 종족만(서버가 랜덤을 안 받는다).
   유형은 드롭다운(같은 날 "유형을 드롭다운으로 다양하게 · 유즈맵도") — 일대일 · 2:2 · 3:3 · 4:4 · 팀전(인원 자유) · 난투 · 유즈맵.
   난투는 참가자 한 줄에 승자를 고른다(승자 = 1팀 · 나머지 = 2팀 — 리플레이 난투와 같은 꼴) · 유즈맵은 리플레이의 게임 종류 값(10)을 실어 보내 기록만 남는다(통계 · 참값 굽기 밖). */

type Slot = { memberId: string; race: Race };
type Team = "team1" | "team2";
type Mode = "1v1" | "2v2" | "3v3" | "4v4" | "team" | "ffa" | "ums";
const MODES: { value: Mode; label: string }[] = [
  { value: "1v1", label: "일대일" }, { value: "2v2", label: "2:2 팀전" }, { value: "3v3", label: "3:3 팀전" }, { value: "4v4", label: "4:4 팀전" },
  { value: "team", label: "팀전(인원 자유)" }, { value: "ffa", label: "난투" }, { value: "ums", label: "유즈맵" },
];
/** 팀마다 정해진 인원(없으면 자유 — 1 ~ TEAM_MAX). */
const FIXED: Partial<Record<Mode, number>> = { "1v1": 1, "2v2": 2, "3v3": 3, "4v4": 4 };
const RACES: { value: Race; label: string }[] = [
  { value: "테란", label: "테" }, { value: "프로토스", label: "프" }, { value: "저그", label: "저" },
];
const TEAM_MAX = 4;
const FFA_MAX = 8;
const UMS_GAME_TYPE = 10;
const empty = (): Slot => ({ memberId: "", race: "테란" });
const sized = (list: Slot[], n: number): Slot[] => Array.from({ length: n }, (_, i) => list[i] ?? empty());

export default function GameResultManualModal({ onSaved, onClose }: {
  onSaved: (game: GameResult) => void; onClose: () => void;
}) {
  useLockBodyScroll();
  const members = useAppStore((s) => s.members);
  const [date, setDate] = useState(todayStr);
  /** 시각(HH:MM · 선택 · 2026-10-23, 요청: "수기 등록에서 시간도 지정") — 비우면 날짜만. 적으면 그 날 그 시각(이 기기 시간대)을 경기 시작 시각으로 보낸다. */
  const [time, setTime] = useState("");
  const [mode, setMode] = useState<Mode>("1v1");
  const [mapName, setMapName] = useState("");
  const [teams, setTeams] = useState<Record<Team, Slot[]>>({ team1: [empty()], team2: [empty()] });
  const [result, setResult] = useState<"team1" | "team2" | "draw" | null>(null);
  /** 난투의 승자(회원 id) — "draw" 면 무. */
  const [winner, setWinner] = useState("");
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
  const ffa = mode === "ffa";
  const fixed = FIXED[mode];
  const changeMode = (next: Mode): void => {
    setMode(next);
    setWinner("");
    const n = FIXED[next];
    // 정해진 인원이면 팀마다 그 수로 맞추고, 난투는 한 줄(1팀 자리)에 모은다.
    if (n) setTeams((t) => ({ team1: sized(t.team1, n), team2: sized(t.team2, n) }));
    else if (next === "ffa") {
      setTeams((t) => {
        const filled = [...t.team1, ...t.team2].filter((x) => x.memberId).slice(0, FFA_MAX);
        return { team1: sized(filled, Math.max(2, filled.length)), team2: [] };
      });
    }
    else setTeams((t) => ({ team1: t.team1.length ? t.team1.slice(0, TEAM_MAX) : [empty()], team2: t.team2.length ? t.team2.slice(0, TEAM_MAX) : [empty()] }));
  };
  const typeOf = (): GameType => {
    if (ffa) return "0103";
    if (mode === "1v1") return "0101";
    if (mode === "ums") return teams.team1.length === 1 && teams.team2.length === 1 ? "0101" : "0102";
    return "0102";
  };

  const save = async (): Promise<void> => {
    setErr("");
    const all = [...teams.team1, ...teams.team2];
    if (!date) { setErr("날짜를 고르세요."); return; }
    const startedAt = time ? new Date(`${date}T${time}:00`) : null;
    if (startedAt && Number.isNaN(startedAt.getTime())) { setErr("시간을 다시 적으세요."); return; }
    if (startedAt && startedAt.getTime() > Date.now()) { setErr("앞으로의 시간은 적을 수 없어요."); return; }
    if (all.some((s) => !s.memberId)) { setErr("모든 자리에 회원을 고르세요."); return; }
    if (ffa && all.length < 2) { setErr("난투는 두 사람 이상이에요."); return; }
    if (ffa ? !winner : result === null) { setErr(ffa ? "승자를 고르세요." : "결과를 고르세요."); return; }
    if (ffa && winner !== "draw" && !all.some((s) => s.memberId === winner)) { setErr("승자를 다시 고르세요."); return; }
    const nickOf = (id: string): string => active.find((m) => m.id === id)?.nickname ?? id;
    const wire = (list: Slot[]) => list.map((s) => ({ ...s, playerName: nickOf(s.memberId) }));
    // 난투 — 승자는 1팀 · 나머지는 2팀(무면 모두 2팀).
    const [t1, t2] = ffa
      ? [all.filter((s) => s.memberId === winner), all.filter((s) => s.memberId !== winner)]
      : [teams.team1, teams.team2];
    setBusy(true);
    try {
      const game = await api.createManualGameResult({
        date, matchType: typeOf(), result: ffa ? (winner === "draw" ? "draw" : "team1") : result!,
        mapName: mapName.trim() || undefined, team1: wire(t1), team2: wire(t2),
        ...(startedAt ? { gameStartedAt: startedAt.toISOString() } : {}),
        ...(mode === "ums" ? { gameType: UMS_GAME_TYPE } : {}),
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
        {!fixed && teams[team].length < (ffa ? FFA_MAX : TEAM_MAX) && (
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
          {!fixed && teams[team].length > (ffa ? 2 : 1) && (
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
            <label className="scr-field">
              <span className="scr-label">시간 <span className="scr-label-optional">(선택)</span></span>
              <input type="time" className="scr-input" value={time} disabled={busy} onChange={(e) => setTime(e.target.value)} />
            </label>
            <div className="scr-field">
              <span className="scr-label">유형</span>
              <Select value={mode} options={MODES} onChange={(v) => changeMode(v as Mode)} disabled={busy} />
            </div>
          </div>
          {ffa ? teamBlock("team1", "참가자") : (
            <>
              {teamBlock("team1", "1팀")}
              {teamBlock("team2", "2팀")}
            </>
          )}
          {ffa ? (
            <div className="scr-field">
              <span className="scr-label">승자</span>
              <Select
                value={winner} placeholder="승자 고르기" disabled={busy}
                options={[
                  ...teams.team1.filter((x) => x.memberId).map((x) => ({ value: x.memberId, label: active.find((m) => m.id === x.memberId)?.nickname ?? x.memberId })),
                  { value: "draw", label: "무승부" },
                ]}
                onChange={setWinner}
              />
            </div>
          ) : (
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
          )}
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
