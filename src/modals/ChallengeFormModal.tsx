import { useMemo, useRef, useState } from "react";
import ModalHash from "../utils/modalHash";
import { createPortal } from "react-dom";
import { X, Phone, ImagePlus } from "lucide-react";
import { cx } from "../utils/format";
import Avatar from "../components/common/Avatar";
import OptionalDateTimeFields from "../components/common/OptionalDateTimeFields";
import { Spinner } from "../components/common/Feedback";
import KakaoShareButton from "../components/common/KakaoShareButton";
import MemberPickBlock from "../components/common/MemberPickBlock";
import { useAppStore } from "../store/appStore";
import { api } from "../api/client";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import { challengePhoto, shareThumb, type KakaoShareContent } from "../utils/kakaoShare";
import { buildChallengeBackdrop, type ChallengeBackdrop } from "../utils/image";
import type { Challenge } from "../types";

const MAX_TARGETS = 4;
const MAX_OWN_TEAM = 3;

interface ChallengeFormModalProps {
  onClose: () => void;
  onCreated: (challenge: Challenge) => void;
  presetTargetIds?: string[];
  lockTarget?: boolean;
}

export default function ChallengeFormModal({ onClose, onCreated, presetTargetIds, lockTarget }: ChallengeFormModalProps) {
  useLockBodyScroll();
  const members = useAppStore((s) => s.members);
  const user = useAppStore((s) => s.user);

  const preset = presetTargetIds ?? [];
  const [targetIds, setTargetIds] = useState<string[]>(preset);
  const [ownTeamIds, setOwnTeamIds] = useState<string[]>([]);

  const [dateStr, setDateStr] = useState("");
  const [noteStr, setNoteStr] = useState("");
  const [message, setMessage] = useState("");
  const [photo, setPhoto] = useState<ChallengeBackdrop | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sentChallenge, setSentChallenge] = useState<Challenge | null>(null);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const activeMembers = useMemo(
    () => members.filter((m) => m.status === "active" && m.id !== user?.id),
    [members, user?.id],
  );
  const chosen = useMemo(() => new Set([...targetIds, ...ownTeamIds]), [targetIds, ownTeamIds]);
  const memberOptions = useMemo(
    () => activeMembers
      .filter((m) => !chosen.has(m.id))
      .map((m) => ({ value: m.id, label: `${m.nickname} (${m.battletag})`, avatar: <Avatar member={m} size={20} /> }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [activeMembers, chosen],
  );

  const canSubmit = targetIds.length >= 1;

  const targetNames = targetIds.map((id) => memberById.get(id)?.nickname).filter(Boolean) as string[];
  const titleName = targetNames.length === 0
    ? ""
    : targetNames.length === 1
      ? targetNames[0]
      : `${targetNames[0]} 외 ${targetNames.length - 1}명`;
  const modalTitle = titleName ? `${titleName} 호출하기` : "호출하기";

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setErr("");
    setPhotoBusy(true);
    try {
      setPhoto(await buildChallengeBackdrop(file));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "사진을 불러오지 못했어요.");
    } finally {
      setPhotoBusy(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    setErr("");
    setBusy(true);
    try {
      const challenge = await api.createChallenge({
        targetMemberIds: targetIds,
        ownTeamMemberIds: ownTeamIds,
        scheduledDate: dateStr || null,
        scheduledTimeNote: dateStr ? noteStr.trim() : "",
        message: message.trim(),
        backdrop: photo?.backdrop ?? null,
        backdropShare: photo?.share ?? null,
      });
      setSentChallenge(challenge);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "도전장을 보내지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    if (sentChallenge) onCreated(sentChallenge);
    onClose();
  };

  const shareCall = (challenge: Challenge): KakaoShareContent => {
    const caller = user?.nickname ?? "";
    return {
      title: `${caller ? `${caller}님` : "누군가"}의 호출`,
      description: "누가 호출됐을까요? 👀 탭해서 확인하기",
      ...shareThumb("challengeCall", challengePhoto(challenge)),
      link: `${window.location.origin}/?sv=challenge&sid=${challenge.id}`,
      fallbackText: `[스타게이트] ${caller ? `${caller}님` : "누군가"}의 호출이 도착했어요! 열어서 확인해보세요.`,
    };
  };

  if (sentChallenge) {
    return createPortal(
      <div className="scr-modal-overlay">
        <div className="scr-modal scr-modal-sm scr-challenge-form-modal">
          <div className="scr-modal-head">
            <span>호출 완료</span>
            <button className="scr-icon-btn" onClick={finish} aria-label="닫기"><X size={14} /></button>
          </div>
          <div className="scr-modal-body scr-challenge-sent">
            <div className="scr-challenge-sent-title">
              {sentChallenge.targets.map((t) => t.nickname).join(", ")} 너 나와!
            </div>
            <div className="scr-challenge-sent-desc">호출을 보냈어요.</div>
            <div className="scr-form-actions scr-challenge-sent-actions">
              <KakaoShareButton variant="full" iconOnly content={() => shareCall(sentChallenge)} />
              <button className="scr-btn scr-btn-primary scr-btn-primary-solid" onClick={finish}>확인</button>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash="callout-new" onClose={onClose} />
      <div className="scr-modal scr-modal-sm scr-challenge-form-modal">
        <div className="scr-modal-head">
          <span>{modalTitle}</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>

        <div className="scr-modal-body">
          {!lockTarget && (
            <MemberPickBlock
              label="동료"
              hint="(팀전일 때만 추가)"
              ids={ownTeamIds}
              setIds={setOwnTeamIds}
              max={MAX_OWN_TEAM}
              options={memberOptions}
              memberById={memberById}
              addLabel=""
              addAriaLabel="선수 추가"
              addTone="ghost"
            />
          )}

          <MemberPickBlock
            label="상대"
            required
            ids={targetIds}
            setIds={setTargetIds}
            max={MAX_TARGETS}
            options={memberOptions}
            memberById={memberById}
            addLabel=""
            addAriaLabel="상대 추가"
            addTone="lit"
            locked={lockTarget}
          />

          <OptionalDateTimeFields
            dateStr={dateStr} onDateChange={setDateStr}
            noteStr={noteStr} onNoteChange={setNoteStr}
          />

          <label className="scr-field">
            <span className="scr-label">
              신청 메시지 <span className="scr-label-optional">(선택)</span>
            </span>
            <input
              className="scr-input"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 50))}
              placeholder="최대 50자"
              maxLength={50}
            />
          </label>

          <div className="scr-challenge-photo">
            <input
              ref={photoInputRef} type="file" accept="image/*" hidden
              onChange={(e) => void pickPhoto(e.target.files?.[0])}
            />
            <button
              type="button"
              className={cx("scr-challenge-msg-toggle", photo && "scr-challenge-msg-toggle-on")}
              onClick={() => photoInputRef.current?.click()}
              disabled={photoBusy}
            >
              {photoBusy ? <Spinner /> : <ImagePlus size={14} />} 편지지 배경{photo ? " 바꾸기" : ""}
            </button>
            {photo && (
              <div className="scr-challenge-photo-preview">
                <img src={photo.backdrop} alt="고른 편지지 배경 사진" />
                <button
                  type="button" className="scr-icon-btn scr-challenge-photo-clear"
                  onClick={() => setPhoto(null)} aria-label="배경 사진 빼기"
                >
                  <X size={13} />
                </button>
              </div>
            )}
          </div>

          {err && <div className="scr-err">{err}</div>}

        </div>
        <div className="scr-form-actions">
          <button className="scr-btn scr-btn-ghost" onClick={onClose}>취소</button>
          <button className="scr-btn scr-challenge-call-btn scr-challenge-submit-btn" onClick={submit} disabled={!canSubmit || busy}>
            {busy ? <><Spinner /> 호출하는 중...</> : <><Phone size={14} /> 호출</>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
