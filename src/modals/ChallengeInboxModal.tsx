import { useEffect, useState, type CSSProperties } from "react";
import ModalHash from "../utils/modalHash";
import { createPortal } from "react-dom";
import { Spinner } from "../components/common/Feedback";
import KakaoShareButton from "../components/common/KakaoShareButton";
import ActivityComments from "../pages/activity/ActivityComments";
import { ChallengeLetter, ChallengeWhen } from "../components/challenge/ChallengeLetter";
import ChallengeWhenInput from "../components/challenge/ChallengeWhenInput";
import { api } from "../api/client";
import { useAppStore } from "../store/appStore";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import { formatWhen } from "../utils/date";
import { playMailChime } from "../utils/sfx";
import { shareThumb, type KakaoShareContent } from "../utils/kakaoShare";
import type { Challenge } from "../types";

interface ChallengeInboxModalProps {
  challenges: Challenge[];
  onClose: () => void;
  closeLabel?: string;
  shareBackdrop?: boolean;
  skipEnvelope?: boolean;
  reply?: boolean;
}

export default function ChallengeInboxModal({
  challenges, onClose, closeLabel = "닫기", shareBackdrop = false, reply = false,
  skipEnvelope = false,
}: ChallengeInboxModalProps) {
  useLockBodyScroll();
  const user = useAppStore((s) => s.user);
  useEffect(() => { playMailChime(); }, []);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [errField, setErrField] = useState<"schedule" | "">("");
  const first = skipEnvelope ? "letter" : "envelope";
  const [stage, setStage] = useState<"envelope" | "letter" | "responded">(first);
  const [respondedAs, setRespondedAs] = useState<"accepted" | "rejected" | null>(null);
  const [envReady, setEnvReady] = useState(false);
  const [dateStr, setDateStr] = useState("");
  const [noteStr, setNoteStr] = useState("");

  const current = challenges[idx];

  useEffect(() => {
    if (!current || stage !== "envelope") return;
    setEnvReady(false);
    const t = window.setTimeout(() => setEnvReady(true), 2200);
    return () => window.clearTimeout(t);
  }, [stage, idx]);

  if (!current) { onClose(); return null; }

  const dateLocked = current.scheduledDate !== null;
  const noteLocked = current.scheduledTimeNote.trim() !== "";

  const responder = !reply ? null
    : (current.targets.find((t) => t.response !== "pending" && t.responseMessage.trim())
      ?? current.targets.find((t) => t.response !== "pending")
      ?? null);
  const replyKind = responder?.response ?? null;
  const replyDiscarded = reply && replyKind === "discarded";

  const canRespond = !reply && !!user && current.targets.some((t) => t.memberId === user.id);

  const advance = () => {
    setStage(first);
    setRespondedAs(null);
    setDateStr("");
    setNoteStr("");
    setErr("");
    setErrField("");
    if (idx + 1 >= challenges.length) onClose();
    else setIdx((i) => i + 1);
  };

  const canAccept = true;

  const respond = async (response: "accepted" | "rejected") => {
    setErr("");
    setErrField("");
    setBusy(true);
    try {
      let schedule: { scheduledDate: string | null; scheduledTimeNote: string } | undefined;
      if (response === "accepted") {
        const finalDate = current.scheduledDate ?? (dateStr || null);
        const note = current.scheduledTimeNote.trim() || (finalDate ? noteStr.trim() : "");
        schedule = { scheduledDate: finalDate, scheduledTimeNote: note };
      }
      await api.respondToChallenge(current.id, response, schedule);
      setRespondedAs(response);
      setStage("responded");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "응답하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const envelopeTitle = reply && responder
    ? `${responder.nickname}님의 응답`
    : `${current.createdBy.nickname}님의 호출`;
  const backdrop = current.backdropUrl;
  const letterStyle = backdrop
    ? ({ "--letter-photo": `url("${backdrop}")` } as CSSProperties)
    : undefined;

  const acceptedEffDate = current.scheduledDate ?? (dateStr || null);
  const acceptedEffNote = current.scheduledTimeNote.trim() || (acceptedEffDate ? noteStr.trim() : "");
  const acceptedWhen = formatWhen(acceptedEffDate)
    + (acceptedEffNote ? ` ${acceptedEffNote}` : "");
  const respondedTitle = respondedAs === "rejected" ? "대결 거절" : "대결 수락!";
  const respondedDesc = respondedAs === "rejected"
    ? "호출을 거절했어요."
    : `${acceptedWhen}에 만나요.`;
  const shareResponded = (): KakaoShareContent => {
    const caller = current.createdBy.nickname || "누군가";
    const me = user?.nickname || "누군가";
    return {
      title: `${me}님이 ${caller}님의 호출에 응답했어요`,
      description: "수락일까요, 거절일까요? 👀 탭해서 확인하기",
      ...shareThumb("challengeReply"),
      link: `${window.location.origin}/?sv=challengeReply&sid=${current.id}`,
      fallbackText: `[스타게이트] ${me}님이 ${caller}님의 호출에 응답했어요! 열어서 확인해보세요.`,
    };
  };

  const comments = (
    <div className="scr-challenge-scene-comments">
      <ActivityComments targetType="challenge" targetId={current.id} overModal />
    </div>
  );

  return createPortal(
    <div className={`scr-modal-overlay${shareBackdrop ? " scr-challenge-share" : ""}`}>
      <ModalHash hash="callout-inbox" onClose={onClose} />
      {shareBackdrop && <div className="scr-challenge-share-bg" aria-hidden="true" />}

      {replyDiscarded && responder && (
        <div className="scr-modal scr-modal-sm scr-challenge-inbox-modal scr-challenge-letter scr-challenge-discarded">
          <div className="scr-modal-body scr-challenge-inbox-body">
            <div className="scr-challenge-discarded-art" aria-hidden="true">🗑️</div>
            <div className="scr-challenge-discarded-title">
              {responder.nickname}님이 편지를 버림
            </div>
          </div>
          <div className="scr-form-actions scr-challenge-letter-actions">
            <button type="button" className="scr-rect-btn" onClick={advance}>
              {closeLabel}
            </button>
          </div>
          {comments}
        </div>
      )}
      {!replyDiscarded && stage === "letter" && (
        <div
          className={`scr-modal scr-modal-sm scr-challenge-inbox-modal scr-challenge-letter${
            backdrop ? " scr-challenge-letter-photo" : ""}`}
          style={letterStyle}
        >
          {backdrop && <div className="scr-challenge-letter-bg" aria-hidden="true" />}
          <ChallengeLetter
            challenge={current}
            when={canRespond ? (
              <ChallengeWhenInput
                challenge={current}
                dateStr={dateStr}
                onDateChange={(v) => {
                  setDateStr(v);
                  if (errField === "schedule") { setErr(""); setErrField(""); }
                }}
                noteStr={noteStr}
                onNoteChange={(v) => {
                  setNoteStr(v);
                  if (errField === "schedule") { setErr(""); setErrField(""); }
                }}
                dateLocked={dateLocked}
                noteLocked={noteLocked}
                invalid={errField === "schedule"}
              />
            ) : <ChallengeWhen challenge={current} />}
            foot={(
              <div className="scr-challenge-inbox-err-slot" aria-live="polite">
                {err && <span className="scr-challenge-inbox-err-text">{err}</span>}
              </div>
            )}
          />

          {canRespond ? (
            <div className="scr-form-actions scr-challenge-letter-actions">
              <button
                className="scr-rect-btn scr-challenge-reject-btn" onClick={() => respond("rejected")}
                disabled={busy}
              >
                {busy ? <Spinner /> : "거절"}
              </button>
              <button
                type="button" className="scr-rect-btn is-secondary" onClick={advance}
                disabled={busy}
              >
                고민중
              </button>
              <button
                className="scr-rect-btn scr-challenge-accept-btn" onClick={() => respond("accepted")}
                disabled={busy || !canAccept}
              >
                {busy ? <><Spinner /> 처리 중...</> : "승락"}
              </button>
            </div>
          ) : (
            <div className="scr-form-actions scr-challenge-letter-actions">
              <button type="button" className="scr-rect-btn" onClick={advance}>
                {closeLabel}
              </button>
            </div>
          )}
          {comments}
        </div>
      )}

      {stage === "responded" && (
        <div className="scr-modal scr-modal-sm scr-challenge-inbox-modal">
          <div className="scr-modal-body scr-challenge-sent">
            <div className="scr-challenge-sent-title">{respondedTitle}</div>
            <div className="scr-challenge-sent-desc">{respondedDesc}</div>
            <div className="scr-form-actions scr-challenge-sent-actions">
              <KakaoShareButton variant="full" iconOnly content={shareResponded} />
              <button type="button" className="scr-rect-btn" onClick={advance}>확인</button>
            </div>
          </div>
          {comments}
        </div>
      )}

      {!replyDiscarded && stage === "envelope" && (
        <div key={current.id} className="scr-challenge-envelope-layer">
          <div className="scr-challenge-envelope-inner">
            <div className="scr-challenge-inbox-title">{envelopeTitle}</div>
            <div className="scr-challenge-envelope scr-challenge-envelope-full scr-challenge-envelope-shake">
              <img src="/images/challenge/challenge_envelope.png" alt="" className="scr-challenge-envelope-img" />
            </div>
            <div
              className={`scr-challenge-envelope-actions${envReady ? " scr-challenge-envelope-actions-ready" : ""}`}
              aria-hidden={!envReady}
            >
              <button
                type="button" className="scr-rect-btn scr-challenge-envelope-open"
                onClick={() => setStage("letter")} disabled={busy || !envReady}
              >
                열기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
