import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Eye } from "lucide-react";
import ModalHash from "../utils/modalHash";
import { Spinner } from "../components/common/Feedback";
import ConfirmDialog from "../components/common/ConfirmDialog";
import { api } from "../api/client";
import { showAlert } from "../components/common/AlertDialog";
import { showToast } from "../components/common/Toast";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import { cx } from "../utils/format";
import { formatAgo, serverMs } from "../utils/date";
import type { GameUnhideRequest } from "../types";

/* ★ 숨김 해제 요청(운영자 · 2026-10-19, 요청: "숨김 컬럼에는 숨긴게임의 경우 해제요청 버튼 추가하고 누르면 관리자페이지의 해제요청 생기게").
   숨김은 누구도 되돌리지 못한다(서버 /unhide 403) — 게임 목록의 '해제요청'이 여기 한 줄로 서고, 운영자가 해제하면 경기가 다시 보인다.
   꼴은 삭제된 경기(DeletedGamesModal)의 줄을 그대로 빌린다. */

type Action = "approve" | "reject";

export default function UnhideRequestsModal({ onClose }: { onClose: () => void }) {
  useLockBodyScroll();
  const [rows, setRows] = useState<GameUnhideRequest[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ kind: Action; req: GameUnhideRequest } | null>(null);
  const [confirmErr, setConfirmErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setRows(await api.listUnhideRequests());
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "해제 요청 목록을 받지 못했어요.");
      setRows([]);
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const run = async (kind: Action, req: GameUnhideRequest) => {
    setBusyId(req.id);
    setConfirmErr(null);
    try {
      await api.resolveUnhideRequest(req.id, kind === "approve");
      showToast(kind === "approve" ? `${req.matchNo} 경기의 숨김을 풀었어요.` : `${req.matchNo} 해제 요청을 거절했어요.`, { kind: "ok" });
      setRows((prev) => (prev ? prev.filter((r) => r.id !== req.id) : prev));
      setConfirm(null);
    } catch (e) {
      setConfirmErr(e instanceof Error ? e.message : "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setBusyId(null);
    }
  };

  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash="unhide-requests" onClose={onClose} />
      <div className="scr-modal scr-modal-md scr-trash" onClick={(e) => e.stopPropagation()}>
        <div className="scr-modal-head">
          <span>숨김 해제 요청{rows && rows.length > 0 ? ` (${rows.length})` : ""}</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>
        <div className="scr-modal-body scr-trash-body">
          <p className="scr-trash-note">
            숨긴 경기는 누구도 되돌릴 수 없어서, 회원이 게임 목록에서 해제를 요청하면 여기에 모여요.
            해제하면 경기가 목록·통계·재생에 다시 보이고, 거절하면 숨긴 채로 남아요.
          </p>
          {rows === null ? (
            <div className="scr-trash-empty"><Spinner /> 요청을 받는 중…</div>
          ) : rows.length === 0 ? (
            <div className="scr-trash-empty">요청이 없어요</div>
          ) : (
            <div className="scr-trash-list">
              {rows.map((r) => {
                const busy = busyId === r.id;
                return (
                  <div key={r.id} className={cx("scr-trash-row", busy && "is-busy")}>
                    <div className="scr-trash-main">
                      <div className="scr-trash-top">
                        <span className="scr-trash-no">{r.matchNo}</span>
                        <span className="scr-trash-date">{r.gameDate}</span>
                      </div>
                      <div className="scr-trash-meta">
                        {r.requestedBy ?? "알 수 없음"} 요청 · {formatAgo(serverMs(r.createdAt))}
                        {r.hiddenAt ? ` · ${formatAgo(serverMs(r.hiddenAt))} 숨김` : ""}
                      </div>
                    </div>
                    <div className="scr-trash-actions">
                      <button
                        type="button" className="scr-rect-btn scr-trash-restore"
                        onClick={() => { setConfirmErr(null); setConfirm({ kind: "approve", req: r }); }}
                        disabled={busyId !== null}
                        title="해제 — 경기를 다시 보이게 합니다"
                      >
                        {busy ? <Spinner size={14} /> : <><Eye size={13} /> 해제</>}
                      </button>
                      <button
                        type="button" className="scr-rect-btn"
                        onClick={() => { setConfirmErr(null); setConfirm({ kind: "reject", req: r }); }}
                        disabled={busyId !== null}
                        title="거절 — 숨긴 채로 둡니다"
                      >
                        거절
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === "approve" ? `${confirm.req.matchNo} 경기의 숨김을 풀까요?` : `${confirm.req.matchNo} 해제 요청을 거절할까요?`}
          message={confirm.kind === "approve"
            ? "경기가 목록·통계·재생에 다시 보여요. 다시 숨기려면 뛴 사람이 한 번 더 숨겨야 해요."
            : "경기는 숨긴 채로 남아요. 요청한 회원은 다시 요청할 수 있어요."}
          confirmLabel={busyId === confirm.req.id ? "처리 중..." : confirm.kind === "approve" ? "해제" : "거절"}
          error={confirmErr}
          onConfirm={() => { void run(confirm.kind, confirm.req); }}
          onCancel={() => { setConfirm(null); setConfirmErr(null); }}
        />
      )}
    </div>,
    document.body,
  );
}
