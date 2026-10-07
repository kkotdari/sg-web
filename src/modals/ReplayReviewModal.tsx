import { useState } from "react";
import { gameTypeLabel } from "../constants/gameTypes";
import ModalHash from "../utils/modalHash";
import { createPortal } from "react-dom";
import { Upload, X } from "lucide-react";
import MemberMultiSelect from "../components/select/MemberMultiSelect";
import { Spinner } from "../components/common/Feedback";
import { showAlert } from "../components/common/AlertDialog";
import ConfirmDialog from "../components/common/ConfirmDialog";
import { cx } from "../utils/format";
import { hasComputerSlot, hasUnregisteredSlot, memberSlotCount, shortMatchHint, validateReplayDraft, resolveUnmatchedAsUnregistered, type ReplayDraft, type UnmatchedPlayer } from "../utils/replayDraft";
import { useAppStore } from "../store/appStore";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import { api } from "../api/client";
import { newComputerSlotId } from "../constants/computerSlot";
import { newUnregisteredSlotId } from "../constants/unregisteredSlot";
import { useDefaultRaceResolver } from "../hooks/useDefaultRaceResolver";
import type { GameResultSlot, GameOutcome, NewGameResult, Race, Member } from "../types";

type ReviewLevel = "ok" | "warn" | "error" | "skip";

interface ReviewVerdict {
  level: ReviewLevel;
  badge: string;
  issues: string[];
  notes: string[];
}

function reviewOf(d: ReplayDraft): ReviewVerdict {
  if (d.excludeReason === "duplicate") {
    return { level: "skip", badge: d.merged ? "업데이트됨" : "이미 등록됨", issues: [], notes: [] };
  }
  if (d.excludeReason === "gametype") {
    return {
      level: "skip",
      badge: "등록 불가",
      issues: [],
      notes: [`${d.gameTypeName || "이 갈래"} 경기는 등록할 수 없어요 — 빼고 나머지만 등록합니다.`],
    };
  }
  if (d.excludeReason === "fewmembers") {
    return {
      level: "skip",
      badge: "자동 제외",
      issues: [],
      notes: ["회원이 2명 미만인 경기라 자동으로 뺐어요 — 회원을 연결해 채우거나, 그래도 등록하려면 제외 취소를 눌러 주세요."],
    };
  }
  if (d.parseError) {
    return { level: "error", badge: "실패", issues: [`리플레이를 읽지 못했어요 — ${d.parseError}`], notes: [] };
  }
  const issues: string[] = [];
  const notes: string[] = [];
  if (d.teamSplitUncertain) {
    issues.push("팀을 자동으로 나누지 못했어요(맵 자체의 한계) — 아래에서 직접 편을 갈라 주세요.");
  }
  if (d.ffa) {
    notes.push(d.result === "unknown"
      ? "여러 명이 각자 싸운 개인전(밀리)인데 승자를 못 가렸어요 — ‘결과 모름’으로 등록돼요. 아는 결과가 있으면 아래에서 골라 주세요."
      : "여러 명이 각자 싸운 개인전(밀리)이에요 — 마지막까지 남은 사람을 승리자로 잡았어요. 다르면 위에서 골라 주세요.");
  }
  const unmatched = [...d.unmatchedTeam1, ...d.unmatchedTeam2].map((p) => p.rawName);
  if (unmatched.length > 0) {
    notes.push(`연결 안 된 참가자는 비회원으로 등록돼요: ${unmatched.join(", ")} — 나중에 회원 화면의 미매핑 목록에서 연결하면 지난 경기까지 소급돼요.`);
  }
  if (d.result === "unknown") {
    notes.push("승자를 자동으로 판별하지 못해 ‘결과 모름’으로 등록돼요 — 아는 결과가 있으면 아래에서 골라 주세요.");
  }
  if (d.guessedObservers.length > 0) {
    notes.push(`관전자로 의심되는 사람이 있어요(노란 표시): ${d.guessedObservers.join(", ")} — 실제로 안 뛰었다면 그 칩에서 빼 주세요.`);
  }
  const short = shortMatchHint(d);
  if (short) notes.push(short);
  if (issues.length > 0) return { level: "warn", badge: "검토필요", issues, notes };
  return { level: "ok", badge: "정상", issues: [], notes };
}

function clockOf(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

const LEAVE_KO: Record<string, string> = {
  Quit: "나감", Defeat: "패배", Victory: "승리", Finished: "종료", Draw: "무승부", Dropped: "끊김",
};

function LeaveLine({ d }: { d: ReplayDraft }) {
  if (d.leaves.length === 0) return null;
  const rows = [...d.leaves].sort((a, b) =>
    (a.leaveSec ?? a.lastCmdSec ?? Number.MAX_SAFE_INTEGER)
    - (b.leaveSec ?? b.lastCmdSec ?? Number.MAX_SAFE_INTEGER));
  return (
    <div className="scr-replay-review-leaves">
      <span className="scr-replay-review-leaves-cap">나간 시각</span>
      {rows.map((l) => (
        <span key={l.rawName} className="scr-replay-review-leave">
          <span className="scr-replay-review-leave-name">{l.rawName}</span>
          {l.leaveSec !== null ? (
            <span className="scr-mono">
              {clockOf(l.leaveSec)}
              {l.reason && ` ${LEAVE_KO[l.reason] ?? l.reason}`}
            </span>
          ) : l.lastCmdSec !== null ? (
            <span className="scr-mono scr-replay-review-leave-dim">~{clockOf(l.lastCmdSec)} 마지막 조작</span>
          ) : (
            <span className="scr-replay-review-leave-dim">기록 없음</span>
          )}
        </span>
      ))}
    </div>
  );
}

function gameLineOf(d: ReplayDraft): string {
  const parts: string[] = [];
  if (d.gameStartedAt) {
    const t = new Date(d.gameStartedAt);
    if (!Number.isNaN(t.getTime())) {
      parts.push(`${t.getMonth() + 1}월 ${t.getDate()}일 `
        + `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`);
    }
  } else if (d.date) parts.push(d.date);
  if (d.mapName) parts.push(d.mapName);
  if (d.durationSeconds != null) {
    parts.push(`${Math.floor(d.durationSeconds / 60)}분 ${String(d.durationSeconds % 60).padStart(2, "0")}초`);
  }
  parts.push(gameTypeLabel(d.matchType));
  const RESULT_KO: Record<string, string> = { team1: "1팀 승", team2: "2팀 승", draw: "무승부", not_held: "미실시", unknown: "결과 모름" };
  parts.push(d.result ? RESULT_KO[d.result] ?? d.result : "승패 미정");
  return parts.join(" · ");
}

interface ReplayReviewModalProps {
  drafts: ReplayDraft[];
  truncated?: boolean;
  droppedCount?: number;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onRegistered?: (fileName: string) => void;
}

export default function ReplayReviewModal({
  drafts: initialDrafts, truncated = false, droppedCount = 0, onClose, onSaved, onRegistered,
}: ReplayReviewModalProps) {
  useLockBodyScroll();
  const members = useAppStore((s) => s.members);
  const addGameResult = useAppStore((s) => s.addGameResult);
  const addMemberReplayAlias = useAppStore((s) => s.addMemberReplayAlias);

  const [drafts, setDrafts] = useState<ReplayDraft[]>(initialDrafts);
  const [submittedIndices, setSubmittedIndices] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [excludeComputer, setExcludeComputer] = useState(false);
  const [excludeNonMember, setExcludeNonMember] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const resolveDefaultRace = useDefaultRaceResolver(members);

  const updateDraft = (index: number, patch: Partial<ReplayDraft>) => {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const setTeam = (index: number, side: "team1" | "team2", rows: GameResultSlot[]) => {
    setDrafts((prev) => prev.map((d, i) => {
      if (i !== index) return d;
      if (side === "team1") {
        const matchType = d.ffa ? d.matchType
          : rows.length === 1 && d.team2.length === 1 ? "0101" : "0102";
        return { ...d, team1: rows, matchType };
      }
      const matchType = d.ffa ? d.matchType
        : d.team1.length === 1 && rows.length === 1 ? "0101" : "0102";
      return { ...d, team2: rows, matchType };
    }));
  };

  const assignUnmatched = (player: UnmatchedPlayer, member: Member) => {
    setDrafts((prev) => prev.map((d) => {
      if (d.team1.some((r) => r.memberId === member.id) || d.team2.some((r) => r.memberId === member.id)) return d;
      const t1Match = d.unmatchedTeam1.find((p) => p.rawName === player.rawName);
      const t2Match = d.unmatchedTeam2.find((p) => p.rawName === player.rawName);
      if (!t1Match && !t2Match) return d;
      const toSlot = (match: UnmatchedPlayer): GameResultSlot => ({
        memberId: member.id, race: match.race, rawName: match.rawName,
        apm: match.apm, eapm: match.eapm, cmdCount: match.cmdCount, effectiveCmdCount: match.effectiveCmdCount, buildCount: match.buildCount,
      });
      const next = {
        ...d,
        team1: t1Match ? [...d.team1, toSlot(t1Match)] : d.team1,
        unmatchedTeam1: d.unmatchedTeam1.filter((p) => p.rawName !== player.rawName),
        team2: t2Match ? [...d.team2, toSlot(t2Match)] : d.team2,
        unmatchedTeam2: d.unmatchedTeam2.filter((p) => p.rawName !== player.rawName),
      };
      if (next.excludeReason === "fewmembers" && memberSlotCount(next) >= 2) {
        return { ...next, excluded: false, excludeReason: null };
      }
      return next;
    }));
    addMemberReplayAlias(member.id, player.rawName).catch(() => {});
  };

  const markUnmatchedAs = (kind: "computer" | "unregistered", player: UnmatchedPlayer) => {
    setDrafts((prev) => prev.map((d) => {
      const t1Match = d.unmatchedTeam1.find((p) => p.rawName === player.rawName);
      const t2Match = d.unmatchedTeam2.find((p) => p.rawName === player.rawName);
      if (!t1Match && !t2Match) return d;
      const toSlot = (match: UnmatchedPlayer): GameResultSlot => ({
        memberId: kind === "computer" ? newComputerSlotId() : newUnregisteredSlotId(),
        race: match.race, rawName: match.rawName,
        apm: match.apm, eapm: match.eapm, cmdCount: match.cmdCount, effectiveCmdCount: match.effectiveCmdCount, buildCount: match.buildCount,
      });
      return {
        ...d,
        team1: t1Match ? [...d.team1, toSlot(t1Match)] : d.team1,
        unmatchedTeam1: d.unmatchedTeam1.filter((p) => p.rawName !== player.rawName),
        team2: t2Match ? [...d.team2, toSlot(t2Match)] : d.team2,
        unmatchedTeam2: d.unmatchedTeam2.filter((p) => p.rawName !== player.rawName),
      };
    }));
    api.setReplayNameClassification(player.rawName, kind).catch(() => {});
  };

  const setUnmatchedRace = (index: number, side: "team1" | "team2", rawName: string, race: Race | "") => {
    const d = drafts[index];
    if (side === "team1") updateDraft(index, { unmatchedTeam1: d.unmatchedTeam1.map((p) => (p.rawName === rawName ? { ...p, race } : p)) });
    else updateDraft(index, { unmatchedTeam2: d.unmatchedTeam2.map((p) => (p.rawName === rawName ? { ...p, race } : p)) });
  };

  const removeUnmatched = (index: number, side: "team1" | "team2", rawName: string) => {
    const d = drafts[index];
    if (side === "team1") updateDraft(index, { unmatchedTeam1: d.unmatchedTeam1.filter((p) => p.rawName !== rawName) });
    else updateDraft(index, { unmatchedTeam2: d.unmatchedTeam2.filter((p) => p.rawName !== rawName) });
  };

  const setFfaWinner = (index: number, memberId: string) => {
    updateDraft(index, ((d): Partial<ReplayDraft> => {
      const all9 = [...d.team1, ...d.team2];
      const win9 = all9.filter((r) => r.memberId === memberId);
      if (win9.length === 0) return {};
      return {
        team1: win9,
        team2: all9.filter((r) => r.memberId !== memberId),
        result: "team1",
        matchType: d.matchType,
      };
    })(drafts[index]));
  };
  const ffaRows = (d: ReplayDraft): GameResultSlot[] => [...d.team1, ...d.team2];
  const setFfaRows = (index: number, rows: GameResultSlot[]) => {
    updateDraft(index, ((d): Partial<ReplayDraft> => {
      const winId9 = d.team1[0]?.memberId;
      const win9 = rows.filter((r) => r.memberId === winId9);
      return {
        team1: win9,
        team2: rows.filter((r) => r.memberId !== winId9),
        matchType: d.matchType,
      };
    })(drafts[index]));
  };
  const moveToOtherTeam = (index: number, fromSide: "team1" | "team2", row: GameResultSlot) => {
    setDrafts((prev) => prev.map((d, i) => {
      if (i !== index) return d;
      const team1 = fromSide === "team1" ? d.team1.filter((r) => r !== row) : [...d.team1, row];
      const team2 = fromSide === "team2" ? d.team2.filter((r) => r !== row) : [...d.team2, row];
      const matchType = d.ffa ? d.matchType
        : team1.length === 1 && team2.length === 1 ? "0101" : "0102";
      return { ...d, team1, team2, matchType };
    }));
  };

  const moveUnresolvedToOtherTeam = (index: number, fromSide: "team1" | "team2", rawName: string) => {
    setDrafts((prev) => prev.map((d, i) => {
      if (i !== index) return d;
      const fromList = fromSide === "team1" ? d.unmatchedTeam1 : d.unmatchedTeam2;
      const entry = fromList.find((p) => p.rawName === rawName);
      if (!entry) return d;
      if (fromSide === "team1") {
        return { ...d, unmatchedTeam1: d.unmatchedTeam1.filter((p) => p.rawName !== rawName), unmatchedTeam2: [...d.unmatchedTeam2, entry] };
      }
      return { ...d, unmatchedTeam2: d.unmatchedTeam2.filter((p) => p.rawName !== rawName), unmatchedTeam1: [...d.unmatchedTeam1, entry] };
    }));
  };

  const toggleExcluded = (index: number) => {
    if (submittedIndices.has(index)) return;
    if (drafts[index].excludeReason === "duplicate"
      || drafts[index].excludeReason === "gametype") return;
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, excluded: !d.excluded, excludeReason: null } : d)));
  };

  const toggleExcludeComputer = (next: boolean) => {
    setExcludeComputer(next);
    setDrafts((prev) => prev.map((d, i) => {
      if (submittedIndices.has(i) || d.excludeReason === "duplicate"
        || d.excludeReason === "gametype" || d.excludeReason === "fewmembers"
        || !hasComputerSlot(d)) return d;
      if (next) return { ...d, excluded: true, excludeReason: "computer" as const };
      if (d.excludeReason !== "computer") return d;
      return { ...d, excluded: false, excludeReason: null };
    }));
  };

  const toggleExcludeNonMember = (next: boolean) => {
    setExcludeNonMember(next);
    setDrafts((prev) => prev.map((d, i) => {
      if (submittedIndices.has(i) || d.excludeReason === "duplicate"
        || d.excludeReason === "computer" || d.excludeReason === "gametype"
        || d.excludeReason === "fewmembers" || !hasUnregisteredSlot(d)) return d;
      if (next) return { ...d, excluded: true, excludeReason: "nonmember" as const };
      if (d.excludeReason !== "nonmember") return d;
      return { ...d, excluded: false, excludeReason: null };
    }));
  };

  const visibleIndices = drafts.map((_, i) => i).filter((i) => !submittedIndices.has(i));

  const blocked = visibleIndices
    .map((i) => ({ i, v: reviewOf(drafts[i]) }))
    .filter(({ i, v }) => !drafts[i].excluded && v.issues.length > 0);

  const pendingIndices = drafts.map((_, i) => i).filter((i) => !drafts[i].excluded && !submittedIndices.has(i));
  const nonExcludedCount = drafts.filter((d) => !d.excluded).length;

  const requestClose = () => {
    if (pendingIndices.length > 0) setConfirmCloseOpen(true);
    else onClose();
  };

  const submitAll = async () => {
    if (pendingIndices.length === 0) { showAlert("등록할 리플레이가 없어요 — 제외를 해제해 주세요."); return; }
    const resolved = drafts.map((d, i) => (pendingIndices.includes(i) ? resolveUnmatchedAsUnregistered(d) : d));
    for (const i of pendingIndices) {
      const problem = validateReplayDraft(resolved[i]);
      if (problem) { showAlert(`"${resolved[i].fileName}": ${problem}`); return; }
    }
    setBusy(true);
    try {
      const failed: string[] = [];
      let mergedCount = 0;
      let deletedCount = 0;
      let cursor = 0;
      const worker = async (): Promise<void> => {
        for (;;) {
          const k = cursor;
          cursor += 1;
          if (k >= pendingIndices.length) return;
          const i = pendingIndices[k];
          const d = resolved[i];
          const payload: NewGameResult = {
            date: d.date, team1: d.team1, team2: d.team2, result: d.result as GameOutcome, matchType: d.matchType,
            ...(d.gameTypeId !== null ? { gameType: d.gameTypeId } : {}),
            replay: d.replay,
            mapName: d.mapName || null, gameStartedAt: d.gameStartedAt, durationSeconds: d.durationSeconds,
            mapData: d.mapGrid,
            chats: d.chats,
          };
          try {
            const { merged, deleted } = await addGameResult(payload);
            if (merged) mergedCount += 1;
            if (deleted) deletedCount += 1;
            setSubmittedIndices((prev) => new Set(prev).add(i));
            onRegistered?.(d.fileName);
          } catch (e) {
            failed.push(`"${d.fileName}": ${e instanceof Error ? e.message : "저장 실패"}`);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, pendingIndices.length) }, worker));
      const mergedNote = [
        mergedCount > 0
          ? `${mergedCount}건은 이미 등록된 경기라 새로 만들지 않고 그 경기에 갱신했어요(리플레이·채팅·지표).`
          : "",
        deletedCount > 0
          ? `${deletedCount}건은 운영자가 삭제한 경기라 다시 등록하지 않았어요. 되살리려면 제어판의 '삭제된 경기'에서 복원하세요.`
          : "",
      ].filter(Boolean).join("\n");
      if (failed.length > 0) {
        showAlert(`${failed.length === 1
          ? failed[0]
          : `${failed.length}건을 저장하지 못했어요 — 남은 판만 다시 등록을 눌러 주세요.\n첫 실패: ${failed[0]}`}${mergedNote ? `\n${mergedNote}` : ""}`);
        await onSaved();
      } else {
        await onSaved();
        if (mergedNote) showAlert(mergedNote);
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash="replay-review" onClose={onClose} />
      <div className={cx("scr-modal scr-modal-match", visibleIndices.length === 0 && "scr-modal-match-compact")}>
        <div className="scr-modal-head">
          <span>등록 내용 확인 {drafts.length > 0 && `(${drafts.length}건)`}</span>
          <button className="scr-icon-btn" onClick={requestClose} aria-label="닫기"><X size={14} /></button>
        </div>

        <div className="scr-modal-body">
          {truncated && (
            <div className="scr-hint scr-hint-left">
              한 번에 최대 {initialDrafts.length}개까지만 불러올 수 있어
              {droppedCount > 0 ? ` 뒤쪽 ${droppedCount}개는 빠졌어요` : " 일부가 빠졌어요"} —
              이 목록을 등록한 뒤 나머지 파일로 한 번 더 돌려 주세요.
            </div>
          )}

          {visibleIndices.length > 0 && (
            <div className="scr-replay-review-filters">
              <label className="scr-checkbox-field">
                <input
                  type="checkbox"
                  checked={excludeComputer}
                  onChange={(e) => toggleExcludeComputer(e.target.checked)}
                />
                컴퓨터 낀 경기 제외
              </label>
              <label className="scr-checkbox-field">
                <input
                  type="checkbox"
                  checked={excludeNonMember}
                  onChange={(e) => toggleExcludeNonMember(e.target.checked)}
                />
                비회원 낀 경기 제외
              </label>
            </div>
          )}

          {visibleIndices.length === 0 ? (
            <div className="scr-empty">등록할 리플레이가 없어요 — 모두 이미 등록된 경기예요.</div>
          ) : (
            <div className="scr-replay-mapping-list">
              {visibleIndices.map((i) => {
                const d = drafts[i];
                const t1Ids = d.team1.map((r) => r.memberId);
                const t2Ids = d.team2.map((r) => r.memberId);
                const usedIds = new Set([...t1Ids, ...t2Ids]);
                const candidates = members.filter((m) => m.status === "active" && !usedIds.has(m.id));
                const suspectedSet = new Set(d.guessedObservers);

                const v = reviewOf(d);
                const open = openIndex === i;
                return (
                  <div key={d.fileName + i} id={`scr-rr-${i}`} className={cx("scr-replay-mapping-row", d.excluded && "scr-replay-draft-body-excluded")}>
                    <div
                      className={cx("scr-replay-mapping-row-head", "scr-replay-review-head",
                        `scr-replay-review-${v.level}`, open && "scr-replay-review-head-open")}
                    >
                      <button
                        type="button" className="scr-replay-review-open"
                        onClick={() => setOpenIndex(open ? null : i)}
                        aria-expanded={open}
                      >
                        <span className="scr-mono scr-replay-mapping-row-name">{d.fileName}</span>
                        <span className="scr-replay-review-badge">{v.badge}</span>
                      </button>
                      {d.excludeReason !== "duplicate" && (
                        <button
                          type="button" className="scr-rect-btn scr-lighting-color scr-replay-review-skip-btn"
                          onClick={(e) => { e.stopPropagation(); toggleExcluded(i); }}
                          disabled={submittedIndices.has(i)}
                        >
                          {d.excluded ? "제외 취소" : "제외"}
                        </button>
                      )}
                    </div>

                    {open && (<>
                    {v.issues.length > 0 && (
                      <ul className={cx("scr-replay-review-why", v.level === "error" && "scr-replay-review-why-error")}>
                        {v.issues.map((t) => <li key={t}>{t}</li>)}
                      </ul>
                    )}
                    {v.notes.map((t) => (
                      <div key={t} className="scr-hint scr-hint-left scr-hint-point">{t}</div>
                    ))}

                    <div className="scr-replay-review-game">{gameLineOf(d)}</div>
                    <LeaveLine d={d} />

                    {!d.winnerSide && !d.parseError && !d.ffa && (
                      <div className="scr-replay-mapping-result">
                        <div className="scr-replay-mapping-result-btns">
                          {([
                            ["team1", "1팀승"], ["draw", "무"], ["team2", "2팀승"], ["unknown", "모름"],
                          ] as const).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              className={cx("scr-result-btn", d.result === value && "scr-result-btn-active")}
                              onClick={() => updateDraft(i, { result: value })}
                              disabled={d.excluded}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {d.ffa ? (
                      <>
                        <div className="scr-replay-ffa-win">
                          <span className="scr-replay-ffa-win-label">승리자</span>
                          <div className="scr-replay-mapping-result-btns">
                            {ffaRows(d).map((r9) => {
                              const nm9 = members.find((m) => m.id === r9.memberId)?.nickname
                                ?? r9.rawName ?? r9.memberId;
                              const won9 = d.result === "team1" && d.team1.some((w) => w.memberId === r9.memberId);
                              return (
                                <button
                                  key={r9.memberId}
                                  type="button"
                                  className={cx("scr-result-btn", won9 && "scr-result-btn-active")}
                                  onClick={() => setFfaWinner(i, r9.memberId)}
                                  disabled={d.excluded}
                                >
                                  {nm9}
                                </button>
                              );
                            })}
                            {([["draw", "무승부"], ["unknown", "모름"]] as const).map(([v9, l9]) => (
                              <button
                                key={v9} type="button"
                                className={cx("scr-result-btn", d.result === v9 && "scr-result-btn-active")}
                                onClick={() => updateDraft(i, { result: v9 })}
                                disabled={d.excluded}
                              >
                                {l9}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="scr-team-grid-solo">
                          <MemberMultiSelect
                            members={members} addableMembers={candidates}
                            rows={ffaRows(d)} setRows={(rows) => setFfaRows(i, rows)}
                            resolveDefaultRace={resolveDefaultRace}
                            unresolved={[...d.unmatchedTeam1, ...d.unmatchedTeam2]
                              .map((p) => ({ key: p.rawName, rawName: p.rawName, race: p.race }))}
                            unresolvedCandidates={candidates}
                            onResolve={(rawName, m) => assignUnmatched(
                              [...d.unmatchedTeam1, ...d.unmatchedTeam2].find((p) => p.rawName === rawName)!, m)}
                            onUnresolvedRaceChange={(rawName, race) => setUnmatchedRace(
                              i, d.unmatchedTeam1.some((p) => p.rawName === rawName) ? "team1" : "team2", rawName, race)}
                            onMarkComputer={(rawName) => markUnmatchedAs("computer",
                              [...d.unmatchedTeam1, ...d.unmatchedTeam2].find((p) => p.rawName === rawName)!)}
                            onMarkUnregistered={(rawName) => markUnmatchedAs("unregistered",
                              [...d.unmatchedTeam1, ...d.unmatchedTeam2].find((p) => p.rawName === rawName)!)}
                            onRemoveUnresolved={(rawName) => removeUnmatched(
                              i, d.unmatchedTeam1.some((p) => p.rawName === rawName) ? "team1" : "team2", rawName)}
                            suspectedNames={suspectedSet}
                            disabled={d.excluded}
                            mappingMode
                          />
                        </div>
                      </>
                    ) : (
                    <div className="scr-team-grid scr-team-grid-noresult">
                      <div className="scr-team-grid-team1">
                        <MemberMultiSelect
                          members={members} addableMembers={candidates} rows={d.team1} setRows={(rows) => setTeam(i, "team1", rows)}
                          resolveDefaultRace={resolveDefaultRace}
                          unresolved={d.unmatchedTeam1.map((p) => ({ key: p.rawName, rawName: p.rawName, race: p.race }))}
                          unresolvedCandidates={candidates}
                          onResolve={(rawName, m) => assignUnmatched(d.unmatchedTeam1.find((p) => p.rawName === rawName)!, m)}
                          onUnresolvedRaceChange={(rawName, race) => setUnmatchedRace(i, "team1", rawName, race)}
                          onMarkComputer={(rawName) => markUnmatchedAs("computer", d.unmatchedTeam1.find((p) => p.rawName === rawName)!)}
                          onMarkUnregistered={(rawName) => markUnmatchedAs("unregistered", d.unmatchedTeam1.find((p) => p.rawName === rawName)!)}
                          onRemoveUnresolved={(rawName) => removeUnmatched(i, "team1", rawName)}
                          onMoveToOtherTeam={d.teamSplitUncertain || d.ffa ? (row) => moveToOtherTeam(i, "team1", row) : undefined}
                          onMoveUnresolvedToOtherTeam={d.teamSplitUncertain || d.ffa ? (rawName) => moveUnresolvedToOtherTeam(i, "team1", rawName) : undefined}
                          suspectedNames={suspectedSet}
                          disabled={d.excluded}
                          mappingMode
                        />
                      </div>
                      <span className="scr-vs-text scr-team-grid-vs">VS</span>
                      <div className="scr-team-grid-team2">
                        <MemberMultiSelect
                          members={members} addableMembers={candidates} rows={d.team2} setRows={(rows) => setTeam(i, "team2", rows)}
                          resolveDefaultRace={resolveDefaultRace}
                          unresolved={d.unmatchedTeam2.map((p) => ({ key: p.rawName, rawName: p.rawName, race: p.race }))}
                          unresolvedCandidates={candidates}
                          onResolve={(rawName, m) => assignUnmatched(d.unmatchedTeam2.find((p) => p.rawName === rawName)!, m)}
                          onUnresolvedRaceChange={(rawName, race) => setUnmatchedRace(i, "team2", rawName, race)}
                          onMarkComputer={(rawName) => markUnmatchedAs("computer", d.unmatchedTeam2.find((p) => p.rawName === rawName)!)}
                          onMarkUnregistered={(rawName) => markUnmatchedAs("unregistered", d.unmatchedTeam2.find((p) => p.rawName === rawName)!)}
                          onRemoveUnresolved={(rawName) => removeUnmatched(i, "team2", rawName)}
                          onMoveToOtherTeam={d.teamSplitUncertain || d.ffa ? (row) => moveToOtherTeam(i, "team2", row) : undefined}
                          onMoveUnresolvedToOtherTeam={d.teamSplitUncertain || d.ffa ? (rawName) => moveUnresolvedToOtherTeam(i, "team2", rawName) : undefined}
                          suspectedNames={suspectedSet}
                          disabled={d.excluded}
                          mappingMode
                        />
                      </div>
                    </div>
                    )}
                    </>)}
                  </div>
                );
              })}
            </div>
          )}

        </div>
        <div className="scr-form-actions">
          {blocked.length > 0 && (
            <button
              type="button" className="scr-rect-btn scr-lighting-color scr-replay-review-jump"
              onClick={() => {
                const i9 = blocked[0]?.i;
                if (i9 === undefined) return;
                setOpenIndex(i9);
                requestAnimationFrame(() => {
                  document.getElementById(`scr-rr-${i9}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                });
              }}
            >
              손볼 경기 {blocked.length}건 — 첫 건 보기
            </button>
          )}
          <button type="button" className="scr-rect-btn scr-lighting-color" onClick={requestClose}>취소</button>
          <button
            type="button" className="scr-rect-btn scr-lighting-color-fill" onClick={submitAll}
            disabled={busy || blocked.length > 0}
          >
            {busy ? <><Spinner /> 등록 중... ({submittedIndices.size}/{nonExcludedCount})</> : <><Upload size={14} /> 등록 ({pendingIndices.length})</>}
          </button>
        </div>
      </div>

      {confirmCloseOpen && (
        <ConfirmDialog
          title="작성을 취소하시겠어요?"
          message=""
          confirmLabel="닫기"
          cancelLabel="계속 등록"
          onConfirm={onClose}
          onCancel={() => setConfirmCloseOpen(false)}
        />
      )}
    </div>,
    document.body,
  );
}
