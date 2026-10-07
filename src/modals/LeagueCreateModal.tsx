import { useState } from "react";
import ModalHash from "../utils/modalHash";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Spinner } from "../components/common/Feedback";
import { api } from "../api/client";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import { cx } from "../utils/format";
import type { League, LeagueMode } from "../types";

interface LeagueCreateModalProps {
  onClose: () => void;
  onCreated: (league: League) => void;
}

export default function LeagueCreateModal({ onClose, onCreated }: LeagueCreateModalProps) {
  useLockBodyScroll();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<LeagueMode>("team");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) { setErr("리그 이름을 입력해 주세요."); return; }
    setErr("");
    setBusy(true);
    try {
      const league = await api.createLeague({ name: name.trim(), mode });
      onCreated(league);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "리그를 만들지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash="league-new" onClose={onClose} />
      <div className="scr-modal scr-modal-profile">
        <div className="scr-modal-head">
          <span>새 리그 만들기</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>

        <div className="scr-modal-body">
          <label className="scr-field">
            <span className="scr-label">리그 이름</span>
            <input className="scr-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 2026 가을 리그" />
          </label>

          <div className="scr-field">
            <span className="scr-label">구분</span>
            <div className="scr-league-mode-toggle">
              <button
                type="button"
                className={cx("scr-btn scr-btn-sm", mode === "team" ? "scr-btn-primary" : "scr-btn-ghost")}
                onClick={() => setMode("team")}
              >
                팀리그
              </button>
              <button
                type="button"
                className={cx("scr-btn scr-btn-sm", mode === "individual" ? "scr-btn-primary" : "scr-btn-ghost")}
                onClick={() => setMode("individual")}
              >
                개인리그
              </button>
            </div>
            <p className="scr-hint scr-hint-left scr-league-mode-hint">
              개인리그는 팀 로스터가 1명으로 고정되고 대타를 쓸 수 없어요. 생성 후에는 바꿀 수 없어요.
              몇 판제인지는 여기서 정하지 않고 대진표의 경기를 눌러 경기마다 고릅니다.
            </p>
          </div>

          {err && <div className="scr-err">{err}</div>}

        </div>
        <div className="scr-form-actions">
          <button type="button" className="scr-btn scr-btn-ghost" onClick={onClose}>취소</button>
          <button type="button" className="scr-btn scr-btn-primary scr-btn-primary-solid" onClick={submit} disabled={busy}>
            {busy ? <><Spinner /> 생성 중...</> : "생성"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
