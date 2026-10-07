import { useEffect, useMemo, useState } from "react";
import ModalHash from "../utils/modalHash";
import { createPortal } from "react-dom";
import { X, Trash2 } from "lucide-react";
import { Spinner } from "../components/common/Feedback";
import Select from "../components/common/Select";
import ConfirmDialog from "../components/common/ConfirmDialog";
import AppUpdateNoticeModal from "./AppUpdateNoticeModal";
import { showAlert } from "../components/common/AlertDialog";
import { useAppStore, hasNoticeContent } from "../store/appStore";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import { versionNumber } from "../utils/appVersion";

interface VersionManageModalProps {
  onClose: () => void;
}

const VERSION_PATTERN = /^[1-9][0-9]*(\.[0-9]+)?$/;

export default function VersionManageModal({ onClose }: VersionManageModalProps) {
  useLockBodyScroll();
  const appVersion = useAppStore((s) => s.appVersion);
  const appVersions = useAppStore((s) => s.appVersions);
  const addVersion = useAppStore((s) => s.addVersion);
  const deleteVersion = useAppStore((s) => s.deleteVersion);
  const saveVersionNotes = useAppStore((s) => s.saveVersionNotes);

  const activeNumber = versionNumber(appVersion);

  const [selected, setSelected] = useState(() => {
    const active = appVersions.find((v) => versionNumber(v.number) === activeNumber);
    return active?.number ?? appVersions[0]?.number ?? "";
  });
  const selectedEntry = useMemo(
    () => appVersions.find((v) => v.number === selected),
    [appVersions, selected],
  );
  const storedNotes = selectedEntry?.notes ?? "";

  const [draft, setDraft] = useState(storedNotes);
  const [savingNotes, setSavingNotes] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const [newNumber, setNewNumber] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { setDraft(storedNotes); }, [storedNotes]);
  useEffect(() => {
    if (selected && !appVersions.some((v) => v.number === selected)) {
      const active = appVersions.find((v) => versionNumber(v.number) === activeNumber);
      setSelected(active?.number ?? appVersions[0]?.number ?? "");
    }
  }, [appVersions, selected, activeNumber]);

  const dirty = draft !== storedNotes;
  const selectedIsActive = versionNumber(selected) === activeNumber;
  const canDelete = !!selected && !selectedIsActive && appVersions.length > 1;

  const trimmedNew = newNumber.trim();
  const newIsValid = VERSION_PATTERN.test(trimmedNew);
  const newIsDuplicate = newIsValid
    && appVersions.some((v) => versionNumber(v.number) === Number(trimmedNew));
  const canAdd = newIsValid && !newIsDuplicate;

  const add = async () => {
    if (!canAdd) return;
    setAdding(true);
    try {
      await addVersion(trimmedNew);
      setSelected(trimmedNew);
      setNewNumber("");
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "버전을 추가하지 못했어요.");
    } finally {
      setAdding(false);
    }
  };

  const doDelete = async (number: string) => {
    setDeleting(true);
    try {
      await deleteVersion(number);
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "버전을 삭제하지 못했어요.");
    } finally {
      setDeleting(false);
    }
  };

  const saveNotes = async () => {
    if (!selected) return;
    setSavingNotes(true);
    try {
      await saveVersionNotes(selected, draft);
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      setSavingNotes(false);
    }
  };

  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash="versions" onClose={onClose} />
      <div className="scr-modal scr-modal-sm scr-notice-settings-modal">
        <div className="scr-modal-head">
          <span>버전 등록</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>

        <div className="scr-modal-body">
          <div className="scr-notice-edit-label">새 버전 등록</div>
          <div className="scr-version-add-row">
            <input
              className="scr-input scr-version-add-input"
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
              placeholder="예: 4 또는 3.1"
              inputMode="decimal"
            />
            <button
              type="button"
              className="scr-rect-btn scr-lighting-color-fill scr-version-add-btn"
              onClick={() => void add()}
              disabled={!canAdd || adding}
            >
              {adding ? <Spinner /> : "추가"}
            </button>
          </div>
          {trimmedNew !== "" && !newIsValid && (
            <div className="scr-version-add-hint">숫자(정수 또는 소수 한 자리)로 입력해주세요.</div>
          )}
          {newIsDuplicate && (
            <div className="scr-version-add-hint">이미 등록된 버전이에요.</div>
          )}

          <div className="scr-notice-settings-divider" />

          <div className="scr-notice-edit-label">버전별 안내 내용</div>
          <div className="scr-version-pick-row">
            <Select
              value={selected}
              options={[...appVersions].reverse().map((v) => ({ value: v.number, label: `${v.number} 버전` }))}
              onChange={setSelected}
              className="scr-notice-version-select"
            />
            <button
              type="button"
              className="scr-version-delete-btn"
              onClick={() => setConfirmDelete(selected)}
              disabled={!canDelete || deleting}
              aria-label="이 버전 삭제"
              title={selectedIsActive ? "현재 활성 버전은 삭제할 수 없어요." : "이 버전 삭제"}
            >
              {deleting ? <Spinner size={14} /> : <Trash2 size={16} />}
            </button>
          </div>

          <textarea
            className="scr-input scr-notice-edit-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="한 줄에 한 항목씩 적어주세요. 비워두면 이 버전은 안내를 띄우지 않아요."
            rows={5}
          />


          <div className="scr-notice-edit-actions">
            <button
              type="button"
              className="scr-rect-btn scr-lighting-color"
              onClick={() => setPreviewing(true)}
              disabled={!hasNoticeContent(draft)}
            >
              미리보기
            </button>
            <button
              type="button"
              className="scr-rect-btn scr-lighting-color-fill"
              onClick={() => void saveNotes()}
              disabled={savingNotes || !dirty}
            >
              {savingNotes ? <Spinner /> : "저장"}
            </button>
          </div>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={`${confirmDelete} 버전을 삭제할까요?`}
          message="등록 목록에서 사라지고, 이 버전의 안내 내용도 함께 지워집니다."
          confirmLabel="삭제"
          onConfirm={() => {
            const next = confirmDelete;
            setConfirmDelete(null);
            void doDelete(next);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {previewing && (
        <AppUpdateNoticeModal notes={draft} onClose={() => setPreviewing(false)} />
      )}
    </div>,
    document.body,
  );
}
