import { useState, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import GameResultStory from "./GameResultStory";
import { gameResultShareContent } from "./gameShare";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { api } from "../../api/client";
import { showAlert } from "../../components/common/AlertDialog";
import { showToast } from "../../components/common/Toast";
import { hasComputerSlot } from "../../utils/gamePlayable";
import { useAppStore } from "../../store/appStore";
import { isAdminRole } from "../../constants/roles";
import { canManageGame } from "../../utils/gameAccess";
import { cx } from "../../utils/format";
import { attachPopover } from "../../utils/popover";
import KakaoShareButton from "../../components/common/KakaoShareButton";
import type { GameResult, Member, GameResultSlot, GameOutcome } from "../../types";

export interface SearchListRow {
  id: number;
  date: string;
  team1: GameResultSlot[];
  team2: GameResultSlot[];
  result: GameOutcome;
  raw: GameResult;
}

interface GameResultCardBodyProps {
  rows: SearchListRow[];
  memberOf: (id: string) => Member | undefined;
  onDeleted: (id: number) => void;
  onChanged: (m: GameResult) => void;
  highlightMemberIds?: Set<string>;
  highlightTerms?: string[];
  active?: boolean;
}

async function downloadReplay(gameResult: GameResult) {
  if (!gameResult.replay) return;
  try {
    const blob = await api.downloadReplay(gameResult.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = gameResult.replay.displayName;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
  }
}

function GameResultOutcomeDialog({ gameResult, memberOf, onChanged, onClose }: {
  gameResult: GameResult; memberOf: (id: string) => Member | undefined;
  onChanged: (m: GameResult) => void; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const nameOf = (sl: GameResultSlot): string =>
    memberOf(sl.memberId)?.nickname ?? sl.rawName ?? sl.memberId;
  const namesOf = (slots: GameResultSlot[]): string => slots.map(nameOf).join(" · ");
  const ffa = gameResult.matchType === "0103";
  const pick = (result: GameOutcome, winnerPlayerName?: string): void => {
    setBusy(true);
    api.setGameOutcome(gameResult.id, result, winnerPlayerName)
      .then((updated) => { showToast("결과를 입력했어요.", { kind: "ok" }); onChanged(updated); onClose(); })
      .catch((e) => showAlert(e instanceof Error ? e.message : "결과를 입력하지 못했어요."))
      .finally(() => setBusy(false));
  };
  return createPortal(
    <div className="scr-modal-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div
        className="scr-modal scr-modal-sm scr-modal-confirm" role="dialog" aria-label="결과 입력"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scr-confirm-head"><span>결과 입력</span></div>
        <div className="scr-outcome-input-opts">
          {ffa ? (
            <>
              {[...gameResult.team1, ...gameResult.team2].map((sl) => (
                <button
                  key={sl.rawName ?? sl.memberId} type="button" className="scr-rect-btn"
                  disabled={busy || !sl.rawName} onClick={() => pick("team1", sl.rawName ?? undefined)}
                >
                  승리자 — {nameOf(sl)}
                </button>
              ))}
              <button type="button" className="scr-rect-btn" disabled={busy} onClick={() => pick("draw")}>무승부</button>
            </>
          ) : (
            <>
              <button type="button" className="scr-rect-btn" disabled={busy} onClick={() => pick("team1")}>
                1팀 승 — {namesOf(gameResult.team1)}
              </button>
              <button type="button" className="scr-rect-btn" disabled={busy} onClick={() => pick("draw")}>무승부</button>
              <button type="button" className="scr-rect-btn" disabled={busy} onClick={() => pick("team2")}>
                2팀 승 — {namesOf(gameResult.team2)}
              </button>
            </>
          )}
        </div>
        <div className="scr-form-actions">
          <button type="button" className="scr-rect-btn" onClick={onClose} disabled={busy}>취소</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function GameResultActionsMenu({
  gameResult, canDelete, isAdmin = false, memberOf, onDelete, onChanged,
}: {
  gameResult: GameResult;
  canDelete: boolean;
  isAdmin?: boolean;
  memberOf: (id: string) => Member | undefined;
  onDelete: (m: GameResult) => void;
  onChanged: (m: GameResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [hideOpen, setHideOpen] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [hideErr, setHideErr] = useState<string | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !dropRef.current) return;
    return attachPopover(anchorRef.current, dropRef.current, { growToContent: true, maxWidth: 200 });
  }, [open]);
  const bakeTracks = (): void => {
    if (hasComputerSlot(gameResult)) {
      showAlert("컴퓨터가 낀 경기는 애초에 참값을 구울 수 없습니다.");
      return;
    }
    void api.bakeGameTracks(gameResult.id)
      .then((r) => showToast(r.message, { kind: "ok" }))
      .catch((e) => showAlert(e instanceof Error ? e.message : "굽기를 시작하지 못했어요."));
  };

  const confirmHide = async (): Promise<void> => {
    setHiding(true);
    setHideErr(null);
    try {
      const updated = await api.hideGameResult(gameResult.id);
      setHideOpen(false);
      onChanged(updated);
      showToast("숨겼어요.", { kind: "ok" });
    } catch (e) {
      setHideErr(e instanceof Error ? e.message : "숨기지 못했어요.");
    } finally {
      setHiding(false);
    }
  };

  const items: { key: string; label: string; danger?: boolean; onSelect: () => void }[] = [
    ...(gameResult.replay ? [{ key: "download", label: "리플레이 저장", onSelect: () => void downloadReplay(gameResult) }] : []),
    ...(isAdmin && gameResult.replay ? [{ key: "bake", label: "참값 굽기", onSelect: bakeTracks }] : []),
    ...(isAdmin && gameResult.result === "unknown"
      ? [{ key: "outcome", label: "결과 입력", onSelect: () => setOutcomeOpen(true) }] : []),
    ...(canDelete && !gameResult.hidden ? [{ key: "hide", label: "숨김", onSelect: () => setHideOpen(true) }] : []),
    ...(canDelete ? [{ key: "delete", label: "삭제", danger: true, onSelect: () => onDelete(gameResult) }] : []),
  ];

  return (
    <div className="scr-activity-post-menu">
      <button
        type="button" ref={anchorRef}
        className="scr-activity-post-menu-btn scr-activity-kebab-btn"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-label="더보기" aria-haspopup="menu" aria-expanded={open}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && createPortal(
        <>
          <div
            className="scr-activity-add-backdrop scr-menu-pop-backdrop"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            aria-hidden
          />
        <div
          className="scr-menu-pop-drop scr-activity-post-menu-drop scr-scroll" ref={dropRef} role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((it) => (
            <button
              key={it.key} type="button" role="menuitem"
              className={cx("scr-menu-pop-opt", it.danger && "scr-activity-post-menu-opt-danger")}
              onClick={(e) => { e.stopPropagation(); it.onSelect(); setOpen(false); }}
            >
              {it.label}
            </button>
          ))}
          <KakaoShareButton
            variant="menu"
            content={() => gameResultShareContent(gameResult, memberOf)}
            onDone={() => setOpen(false)}
          />
        </div>
        </>,
        document.body,
      )}
      {outcomeOpen && (
        <GameResultOutcomeDialog
          gameResult={gameResult} memberOf={memberOf} onChanged={onChanged}
          onClose={() => setOutcomeOpen(false)}
        />
      )}
      {hideOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog
            title="이 게임을 숨길까요?"
            message=""
            confirmLabel={hiding ? "숨기는 중..." : "숨김"}
            cancelLabel="취소"
            error={hideErr}
            onConfirm={() => { if (!hiding) void confirmHide(); }}
            onCancel={() => { if (!hiding) { setHideOpen(false); setHideErr(null); } }}
          />
        </div>
      )}
    </div>
  );
}

export default function GameResultCardBody({
  rows, memberOf, onDeleted, onChanged, highlightMemberIds, highlightTerms, active = true,
}: GameResultCardBodyProps) {
  const user = useAppStore((s) => s.user);
  const deleteGameResultAction = useAppStore((s) => s.deleteGameResult);
  const isAdmin = !!user && isAdminRole(user.roles);
  const [deleteTarget, setDeleteTarget] = useState<GameResult | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteErr(null);
    try {
      await deleteGameResultAction(deleteTarget.id);
      const deletedId = deleteTarget.id;
      setDeleteTarget(null);
      onDeleted(deletedId);
    } catch (e) {
      setDeleteErr(e instanceof Error ? e.message : "삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="scr-game-result-list-panel-v2">
      <div className="scr-game-result-cards">
        {rows.map((r) => (
              <div key={r.id} className="scr-game-result-trow">
                <div className="scr-game-result-trow-topline">
                  <div className="scr-game-result-trow-topmeta">
                    <GameResultActionsMenu
                      gameResult={r.raw} canDelete={canManageGame(r.raw, user)} isAdmin={isAdmin} memberOf={memberOf}
                      onDelete={setDeleteTarget} onChanged={onChanged}
                    />
                  </div>
                </div>
                <GameResultStory
                  gameResult={r.raw} team1={r.team1} team2={r.team2} result={r.result}
                  memberOf={memberOf} active={active}
                  highlightMemberIds={highlightMemberIds} highlightTerms={highlightTerms}
                  menu={(
                    <GameResultActionsMenu
                      gameResult={r.raw} canDelete={canManageGame(r.raw, user)} isAdmin={isAdmin} memberOf={memberOf}
                      onDelete={setDeleteTarget} onChanged={onChanged}
                    />
                  )}
                />
              </div>
        ))}
      </div>

      {deleteTarget && (
        <div onClick={(e) => e.stopPropagation()}>
        <ConfirmDialog
          title="게임결과를 삭제할까요?"
          message="목록·통계에서 사라지고, 등록기가 같은 리플레이를 다시 올려도 등록되지 않아요. 운영자가 제어판의 '삭제된 경기'에서 복원하거나 완전히 지울 수 있어요."
          confirmLabel={deleting ? "삭제 중..." : "삭제"}
          cancelLabel="취소"
          error={deleteErr}
          onConfirm={confirmDelete}
          onCancel={() => { setDeleteTarget(null); setDeleteErr(null); }}
        />
        </div>
      )}
    </div>
  );
}
