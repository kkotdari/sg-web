import { useEffect, useState } from "react";
import ModalHash from "../utils/modalHash";
import { createPortal } from "react-dom";
import { Spinner } from "../components/common/Feedback";
import Avatar, { type AvatarMember } from "../components/common/Avatar";
import { api } from "../api/client";
import { useAppStore } from "../store/appStore";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import { DATE_INPUT_MIN, DATE_INPUT_MAX, gameNow, pad } from "../utils/date";
import { gameTypeLabel } from "../constants/gameTypes";
import type { Challenge, ChallengeResult } from "../types";

interface ChallengeResultInboxModalProps {
  challenges: Challenge[];
  onClose: () => void;
}

export default function ChallengeResultInboxModal({ challenges, onClose }: ChallengeResultInboxModalProps) {
  useLockBodyScroll();
  const memberOf = useAppStore((s) => s.memberOf);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [dateStr, setDateStr] = useState("");
  const current = challenges[idx];
  useEffect(() => {
    if (!current) return;
    const now = gameNow();
    setDateStr(current.scheduledDate ?? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
  }, [idx]);
  if (!current) { onClose(); return null; }

  const advance = () => {
    setErr("");
    if (idx + 1 >= challenges.length) onClose();
    else setIdx((i) => i + 1);
  };

  const submit = async (winnerSide: ChallengeResult) => {
    if (!dateStr) { setErr("실제 대결 날짜를 입력하세요."); return; }
    setErr("");
    setBusy(true);
    try {
      await api.enterChallengeResult(current.id, winnerSide, dateStr);
      advance();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "결과를 입력하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const creatorMembers: AvatarMember[] = [
    { id: current.createdBy.id, nickname: current.createdBy.nickname, avatar: memberOf(current.createdBy.id)?.avatar ?? null },
    ...current.ownMembers.map((m) => ({ id: m.memberId, nickname: m.nickname, avatar: m.avatar })),
  ];
  const targetMembers: AvatarMember[] = current.targets.map((t) => ({ id: t.memberId, nickname: t.nickname, avatar: t.avatar }));

  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash="callout-results" onClose={onClose} />
      <div className="scr-modal scr-modal-sm scr-challenge-inbox-modal">
        <div className="scr-challenge-inbox-title">지난 너 나와! 결과를 입력해 주세요</div>
        <div className="scr-modal-body scr-challenge-inbox-body">
          <div className="scr-challenge-inbox-row">
            <span className="scr-label">종류</span>
            <span>{gameTypeLabel(current.matchType)}</span>
          </div>
          <div className="scr-challenge-inbox-row">
            <span className="scr-label">날짜</span>
            <div className="scr-challenge-time-edit-row scr-challenge-result-when">
              <input
                type="date" className="scr-input scr-challenge-time-edit-input"
                value={dateStr} min={DATE_INPUT_MIN} max={DATE_INPUT_MAX}
                onChange={(e) => setDateStr(e.target.value)}
              />
            </div>
          </div>

          {err && <div className="scr-err">{err}</div>}

          <p className="scr-challenge-inbox-message">승리한 팀을 눌러주세요 — 먼저 입력하는 쪽이 그대로 인정돼요.</p>

          <div className="scr-challenge-result-teams">
            <button
              type="button" className="scr-challenge-result-team" onClick={() => submit("creator")}
              disabled={busy}
            >
              <span className="scr-challenge-result-team-label">도전자편</span>
              <span className="scr-challenge-result-team-members">
                {creatorMembers.map((p) => (
                  <span key={p.id} className="scr-challenge-result-member">
                    <Avatar member={p} size={20} />
                    <span className="scr-challenge-result-member-name">{p.nickname}</span>
                  </span>
                ))}
              </span>
              <span className="scr-challenge-result-team-win">승리</span>
            </button>
            <button
              type="button" className="scr-challenge-result-team" onClick={() => submit("target")}
              disabled={busy}
            >
              <span className="scr-challenge-result-team-label">상대편</span>
              <span className="scr-challenge-result-team-members">
                {targetMembers.map((p) => (
                  <span key={p.id} className="scr-challenge-result-member">
                    <Avatar member={p} size={20} />
                    <span className="scr-challenge-result-member-name">{p.nickname}</span>
                  </span>
                ))}
              </span>
              <span className="scr-challenge-result-team-win">승리</span>
            </button>
          </div>

          <div className="scr-form-actions">
            <button className="scr-rect-btn scr-lighting-color" onClick={() => submit("draw")} disabled={busy}>무승부</button>
            <button className="scr-rect-btn scr-lighting-color" onClick={() => submit("not_held")} disabled={busy}>미실시</button>
          </div>
          <div className="scr-form-actions">
            <button className="scr-rect-btn scr-lighting-color" onClick={advance} disabled={busy}>나중에</button>
          </div>
          {busy && <div className="scr-challenge-result-busy"><Spinner /></div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
