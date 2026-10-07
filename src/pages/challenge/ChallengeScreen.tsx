import { useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, MessageSquarePlus } from "lucide-react";
import Avatar from "../../components/common/Avatar";
import { Spinner } from "../../components/common/Feedback";
import OptionalDateTimeFields from "../../components/common/OptionalDateTimeFields";
import ChallengeTimeEditModal from "../../modals/ChallengeTimeEditModal";
import InlineCollapse from "../../components/common/InlineCollapse";
import KakaoShareButton from "../../components/common/KakaoShareButton";
import { shareThumb, type KakaoShareContent } from "../../utils/kakaoShare";
import { useAppStore } from "../../store/appStore";
import { isAdminRole } from "../../constants/roles";
import { api } from "../../api/client";
import { cx } from "../../utils/format";
import { ChallengeLetter, ChallengeWhen } from "../../components/challenge/ChallengeLetter";
import {
  formatWhen, pad,
  DATE_INPUT_MIN, DATE_INPUT_MAX, gameNow,
} from "../../utils/date";
import type { Challenge, ChallengeResult, ChallengeTarget } from "../../types";

type PillTone = "pending" | "accepted" | "rejected" | "discarded" | "canceled" | "expired";
const PILL_LABEL: Record<PillTone, string> = {
  accepted: "수락", rejected: "거절", discarded: "버림", pending: "대기",
  canceled: "취소", expired: "만료",
};

function targetPillInfo(t: ChallengeTarget): { tone: PillTone } {
  if (t.response === "accepted") return { tone: "accepted" };
  if (t.response === "rejected") return { tone: "rejected" };
  if (t.response === "discarded") return { tone: "discarded" };
  return { tone: "pending" };
}

function aggregateTargetTone(targets: ChallengeTarget[]): PillTone {
  if (targets.length === 0) return "pending";
  const tones = targets.map((t) => targetPillInfo(t).tone);
  if (tones.some((tone) => tone === "rejected")) return "rejected";
  if (tones.every((tone) => tone === "discarded")) return "discarded";
  if (tones.every((tone) => tone === "accepted")) return "accepted";
  return "pending";
}





export function challengeStatusInfo(c: Challenge): { text: string; tone: PillTone } {
  if (c.status === "pending") return { text: "대기중", tone: "pending" };
  if (c.status === "confirmed") return { text: PILL_LABEL.accepted, tone: "accepted" };
  if (c.status === "done") return { text: "완료", tone: "accepted" };
  if (c.resultWinnerSide === "not_held") return { text: "미실시", tone: "expired" };
  const ending = challengeEnding(c);
  if (ending === "canceled") return { text: "취소", tone: "canceled" };
  if (ending === "expired") return { text: "만료", tone: "expired" };
  const tone = aggregateTargetTone(c.targets);
  return tone === "pending"
    ? { text: "종료", tone: "discarded" }
    : { text: PILL_LABEL[tone], tone };
}

export function challengeSideBadges(c: Challenge): { left: string | null; right: string | null } {
  const ending = challengeEnding(c);
  const canceledById = c.canceledBy?.id ?? null;
  const byCreatorSide = ending === "canceled" && canceledById !== null
    && (canceledById === c.createdBy.id || c.ownMembers.some((m) => m.memberId === canceledById));
  if (c.resultWinnerSide) {
    const draw = c.resultWinnerSide === "draw";
    return {
      left: draw ? "무" : c.resultWinnerSide === "creator" ? "승" : null,
      right: draw ? "무" : c.resultWinnerSide === "target" ? "승" : null,
    };
  }
  const rightTone: PillTone = ending === "canceled" && !byCreatorSide ? "canceled"
    : ending === "expired" ? "expired" : aggregateTargetTone(c.targets);
  return {
    left: byCreatorSide ? PILL_LABEL.canceled : null,
    right: byCreatorSide && rightTone === "pending" ? null : PILL_LABEL[rightTone],
  };
}

export function challengeEnding(c: Challenge): "canceled" | "expired" | null {
  if (c.status !== "discarded" || c.resultWinnerSide !== null) return null;
  if (c.canceledBy) return "canceled";
  return c.targets.every((t) => t.response === "pending") ? "expired" : null;
}

type SideMember = { id: string; nickname: string; avatar: string | null };

type CardMode = "none" | "result";

interface ChallengeCardProps {
  challenge: Challenge;
  myId: string | undefined;
  highlightMemberIds?: Set<string>;
  readOnly?: boolean;
  onResponded: (updated: Challenge) => void;
}

export function ChallengeCard({ challenge, myId, highlightMemberIds, readOnly, onResponded }: ChallengeCardProps) {
  const memberOf = useAppStore((s) => s.memberOf);
  const user = useAppStore((s) => s.user);
  const [busy, setBusy] = useState(false);
  const [sharePrompt, setSharePrompt] = useState<
    { kind: "accepted" | "rejected"; updated: Challenge } | null
  >(null);
  const [err, setErr] = useState("");
  const myTarget = challenge.targets.find((t) => t.memberId === myId);
  const isCreator = challenge.createdBy.id === myId;
  const inOwnTeam = challenge.ownMembers.some((m) => m.memberId === myId);
  const isParticipant = isCreator || inOwnTeam || !!myTarget;
  const isAdmin = !!user && isAdminRole(user.roles);
  const creatorMember = memberOf(challenge.createdBy.id);

  const canRespond = !!myTarget && myTarget.response === "pending" && challenge.status === "pending";
  const schedulePassed = !!challenge.scheduledAt && new Date(challenge.scheduledAt).getTime() < Date.now();
  const resultInputOpen = schedulePassed || !challenge.scheduledAt;
  const canEnterResult = isParticipant && challenge.status === "confirmed" && resultInputOpen && challenge.resultWinnerSide === null;
  const canForceResult = (isParticipant || isAdmin)
    && challenge.status === "discarded"
    && (challenge.resultWinnerSide === null || challenge.resultWinnerSide === "not_held");
  const ending = challengeEnding(challenge);

  const [mode, setMode] = useState<CardMode>("none");
  const [dateStr, setDateStr] = useState("");
  const [noteStr, setNoteStr] = useState("");
  const dateLocked = challenge.scheduledDate !== null;
  const noteLocked = challenge.scheduledTimeNote.trim() !== "";
  const [respondMessage, setRespondMessage] = useState("");
  const [respondMsgOpen, setRespondMsgOpen] = useState(false);

  const respond = async (response: "accepted" | "rejected") => {
    setErr("");
    setBusy(true);
    try {
      const updated = await api.respondToChallenge(challenge.id, response, undefined, respondMessage.trim());
      setSharePrompt({ kind: response, updated });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "응답하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const startResult = () => {
    const now = gameNow();
    setDateStr(challenge.scheduledDate ?? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
    setMode("result");
    setErr("");
  };
  const closeMode = () => setMode("none");

  const acceptWithSchedule = async () => {
    setErr("");
    setBusy(true);
    try {
      const finalDate = challenge.scheduledDate ?? (dateStr || null);
      const note = challenge.scheduledTimeNote.trim() || (finalDate ? noteStr.trim() : "");
      const schedule = { scheduledDate: finalDate, scheduledTimeNote: note };
      const updated = await api.respondToChallenge(challenge.id, "accepted", schedule, respondMessage.trim());
      closeMode();
      setSharePrompt({ kind: "accepted", updated });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "응답하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const submitResult = async (winnerSide: ChallengeResult) => {
    if (!dateStr) { setErr("실제 대결 날짜를 입력하세요."); return; }
    setErr("");
    setBusy(true);
    try {
      const updated = await api.enterChallengeResult(challenge.id, winnerSide, dateStr);
      onResponded(updated);
      closeMode();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "결과를 입력하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const creatorSideMembers: SideMember[] = [
    { id: challenge.createdBy.id, nickname: challenge.createdBy.nickname, avatar: creatorMember?.avatar ?? null },
    ...challenge.ownMembers.map((m) => ({ id: m.memberId, nickname: m.nickname, avatar: m.avatar })),
  ];
  const targetSideMembers: SideMember[] = challenge.targets.map((t) => ({ id: t.memberId, nickname: t.nickname, avatar: t.avatar }));

  const dismissShare = () => {
    const p = sharePrompt;
    setSharePrompt(null);
    if (p) onResponded(p.updated);
  };
  const sharePromptTitle = sharePrompt?.kind === "rejected" ? "대결 거절" : "대결 수락!";
  const sharePromptWhen = formatWhen(sharePrompt?.updated?.scheduledDate);
  const sharePromptDesc =
    sharePrompt?.kind === "rejected" ? "호출을 거절했어요." : `${sharePromptWhen}에 만나요.`;
  const buildShareContent = (): KakaoShareContent => {
    const caller = challenge.createdBy.nickname || "누군가";
    const me = user?.nickname || "누군가";
    const link = `${window.location.origin}/?sv=challenge&sid=${sharePrompt?.updated.id ?? challenge.id}`;
    return {
      title: `${me}님이 ${caller}님의 호출에 응답했어요`,
      description: "수락일까요, 거절일까요? 👀 탭해서 확인하기",
      ...shareThumb("challengeReply"), link,
      fallbackText: `[스타게이트] ${me}님이 ${caller}님의 호출에 응답했어요! 열어서 확인해보세요.`,
    };
  };

  const isEnded = challenge.status === "done" || challenge.status === "discarded";

  return (
    <div className={cx("scr-challenge-card", isEnded ? "scr-challenge-card-ended" : "scr-challenge-card-active", challenge.matchType === "0102" && "scr-challenge-card-team", ending && "scr-challenge-card-canceled")}>
      <div className="scr-challenge-card-body scr-challenge-letter scr-challenge-letter-inline">
        <ChallengeLetter
          challenge={challenge}
          highlight={highlightMemberIds}
          when={<ChallengeWhen challenge={challenge} />}
        />
      </div>

      {err && <div className="scr-err">{err}</div>}

      {!readOnly && canRespond && (
        <InlineCollapse open={mode === "none"}>
        <div className="scr-challenge-respond">
          <OptionalDateTimeFields
            dateStr={dateLocked ? challenge.scheduledDate! : dateStr}
            onDateChange={setDateStr}
            noteStr={noteLocked ? challenge.scheduledTimeNote : noteStr}
            onNoteChange={setNoteStr}
            dateLocked={dateLocked}
            noteLocked={noteLocked}
          />
          <button
            type="button"
            className={cx("scr-challenge-msg-toggle", respondMsgOpen && "scr-challenge-msg-toggle-on")}
            onClick={() => setRespondMsgOpen((v) => !v)}
            aria-expanded={respondMsgOpen}
          >
            <MessageSquarePlus size={13} /> 응답 메시지{respondMessage.trim() && !respondMsgOpen ? ` · ${respondMessage.trim()}` : ""}
          </button>
          <div className={cx("scr-challenge-msg-wrap", respondMsgOpen && "scr-challenge-msg-wrap-open")}>
            <div className="scr-challenge-msg-inner">
              <input
                className="scr-input"
                value={respondMessage}
                onChange={(e) => setRespondMessage(e.target.value.slice(0, 50))}
                placeholder="응답 메시지 (선택, 최대 50자)"
                maxLength={50}
              />
            </div>
          </div>
          <div className="scr-challenge-card-actions">
          <button
            className="scr-rect-btn scr-challenge-reject-btn" disabled={busy}
            onClick={() => respond("rejected")}
          >
            거절
          </button>
          <button
            className="scr-rect-btn scr-challenge-accept-btn" disabled={busy}
            onClick={acceptWithSchedule}
          >
            {busy ? <Spinner /> : "승락"}
          </button>
          </div>
        </div>
        </InlineCollapse>
      )}

      <InlineCollapse open={mode === "result"}>
        <div className="scr-challenge-result-form">
          <p className="scr-challenge-inbox-message">
            실제 대결 날짜·시간을 정하고, 승리한 팀을 눌러주세요 — 먼저 입력하는 쪽이 그대로 인정돼요.
          </p>
          <div className="scr-challenge-time-edit-row scr-challenge-result-when">
            <input
              type="date" className="scr-input scr-challenge-time-edit-input"
              value={dateStr} min={DATE_INPUT_MIN} max={DATE_INPUT_MAX}
              onChange={(e) => setDateStr(e.target.value)}
            />
          </div>
          <div className="scr-challenge-result-teams">
            <button
              type="button" className="scr-challenge-result-team" onClick={() => submitResult("creator")}
              disabled={busy}
            >
              <span className="scr-challenge-result-team-label">도전자편</span>
              <span className="scr-challenge-result-team-members">
                {creatorSideMembers.map((p) => (
                  <span key={p.id} className="scr-challenge-result-member">
                    <Avatar member={p} size={20} />
                    <span className="scr-challenge-result-member-name">{p.nickname}</span>
                  </span>
                ))}
              </span>
              <span className="scr-challenge-result-team-win">승리</span>
            </button>
            <button
              type="button" className="scr-challenge-result-team" onClick={() => submitResult("target")}
              disabled={busy}
            >
              <span className="scr-challenge-result-team-label">상대편</span>
              <span className="scr-challenge-result-team-members">
                {targetSideMembers.map((p) => (
                  <span key={p.id} className="scr-challenge-result-member">
                    <Avatar member={p} size={20} />
                    <span className="scr-challenge-result-member-name">{p.nickname}</span>
                  </span>
                ))}
              </span>
              <span className="scr-challenge-result-team-win">승리</span>
            </button>
          </div>
          <div className="scr-challenge-card-actions">
            <button className="scr-rect-btn is-secondary" onClick={() => submitResult("draw")} disabled={busy}>
              무승부
            </button>
            <button className="scr-rect-btn is-secondary" onClick={() => submitResult("not_held")} disabled={busy}>
              미실시
            </button>
          </div>
          <div className="scr-challenge-card-actions">
            <button className="scr-rect-btn is-secondary" onClick={closeMode} disabled={busy}>취소</button>
          </div>
          {busy && <div className="scr-challenge-result-busy"><Spinner /></div>}
        </div>
      </InlineCollapse>

      {!readOnly && (canEnterResult || canForceResult) && (
        <InlineCollapse open={mode === "none"}>
          <div className="scr-challenge-card-actions">
            <button className="scr-rect-btn scr-challenge-accept-btn" onClick={startResult} disabled={busy}>
              {canEnterResult ? "결과 입력" : "결과 입력(되살리기)"}
            </button>
          </div>
        </InlineCollapse>
      )}

      {sharePrompt && createPortal(
        <div className="scr-modal-overlay">
          <div className="scr-modal scr-modal-sm scr-challenge-inbox-modal">
            <div className="scr-modal-body scr-challenge-sent">
              <div className="scr-challenge-sent-title">{sharePromptTitle}</div>
              <div className="scr-challenge-sent-desc">{sharePromptDesc}</div>
              <div className="scr-form-actions scr-challenge-sent-actions">
                <KakaoShareButton variant="full" iconOnly content={buildShareContent} />
                <button type="button" className="scr-rect-btn" onClick={dismissShare}>확인</button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export function ChallengeTimeHeadEdit({
  challenge, timeLabel, myId, onUpdated,
}: {
  challenge: Challenge; timeLabel: string | null; myId: string | undefined;
  onUpdated: (updated: Challenge) => void;
}) {
  const isParticipant =
    challenge.createdBy.id === myId
    || challenge.ownMembers.some((m) => m.memberId === myId)
    || challenge.targets.some((t) => t.memberId === myId);
  const canEdit = challenge.status === "confirmed" && isParticipant;

  const [editing, setEditing] = useState(false);

  if (timeLabel === null && !canEdit) return null;

  return (
    <>
      <span className="scr-challenge-time-head">
        {timeLabel !== null && <span className="scr-challenge-time-head-label">{timeLabel}</span>}
        {canEdit && (
          <button
            type="button" className="scr-challenge-time-edit-btn"
            onClick={() => setEditing(true)} aria-label="일시 수정"
          >
            <Pencil size={13} />
          </button>
        )}
      </span>
      {editing && (
        <ChallengeTimeEditModal
          challenge={challenge}
          onClose={() => setEditing(false)}
          onUpdated={onUpdated}
        />
      )}
    </>
  );
}
