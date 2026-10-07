import { useState } from "react";
import ModalHash from "../utils/modalHash";
import { X } from "lucide-react";
import { Spinner } from "../components/common/Feedback";
import { useAppStore } from "../store/appStore";
import { isValidPasswordLength, PASSWORD_MAX_LENGTH } from "../utils/textLimits";

interface ChangePasswordModalProps {
  onClose: () => void;
}

export default function ChangePasswordModal({ onClose }: ChangePasswordModalProps) {
  const updatePassword = useAppStore((s) => s.updatePassword);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (!currentPassword || !newPassword) {
      setErr("현재 비밀번호와 새 비밀번호를 모두 입력해 주세요.");
      return;
    }
    if (newPassword.length < 4) {
      setErr("새 비밀번호는 4자 이상이어야 해요.");
      return;
    }
    if (!isValidPasswordLength(newPassword)) {
      setErr(`새 비밀번호는 최대 ${PASSWORD_MAX_LENGTH}자까지예요.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setErr("새 비밀번호가 서로 일치하지 않아요.");
      return;
    }
    setErr("");
    setBusy(true);
    try {
      await updatePassword(currentPassword, newPassword);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "비밀번호 변경에 실패했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scr-modal-overlay">
      <ModalHash hash="password" onClose={onClose} />
      <div className="scr-modal scr-modal-sm">
        <div className="scr-modal-head">
          <span>비밀번호 변경</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>

        <div className="scr-modal-body">
          <label className="scr-field">
            <span className="scr-label">현재 비밀번호</span>
            <input
              type="password"
              className="scr-input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </label>
          <label className="scr-field">
            <span className="scr-label">새 비밀번호</span>
            <input
              type="password"
              className="scr-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={`4~${PASSWORD_MAX_LENGTH}자`}
              autoComplete="new-password"
            />
          </label>
          <label className="scr-field">
            <span className="scr-label">새 비밀번호 확인</span>
            <input
              type="password"
              className="scr-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>

          {err && <div className="scr-err">{err}</div>}

        </div>
        <div className="scr-form-actions">
          <button className="scr-rect-btn" onClick={onClose}>취소</button>
          <button className="scr-rect-btn is-fill" onClick={save} disabled={busy}>
            {busy ? <><Spinner /> 변경 중...</> : "변경"}
          </button>
        </div>
      </div>
    </div>
  );
}
