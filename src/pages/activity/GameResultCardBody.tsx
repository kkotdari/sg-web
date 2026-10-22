import { useState, type ReactNode } from "react";
import { downloadReplay } from "../../utils/replayDownload";
import { createPortal } from "react-dom";
import { ChartLine, EyeOff, Save, SquarePen, Trash2 } from "lucide-react";
import GameResultStory from "./GameResultStory";
import { gameResultShareContent } from "./gameShare";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { api } from "../../api/client";
import { showAlert } from "../../components/common/AlertDialog";
import { showToast } from "../../components/common/Toast";
import { useAppStore } from "../../store/appStore";
import { isAdminRole } from "../../constants/roles";
import { canManageGame, isSecretGame } from "../../utils/gameAccess";
import { cx } from "../../utils/format";
import KakaoShareButton from "../../components/common/KakaoShareButton";
import { RecommendButton, useRecommend } from "./Recommend";
import GameCurvesModal from "../../modals/GameCurvesModal";
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

/* ★ 게임 도구 = **늘 보이는 단추 줄**(2026-10-22, 요청: "케밥 메뉴 쓰는 곳을 전부 항시 노출 버튼 툴박스로 변경" · "상세 툴박스에도 추천") —
   옛 ⋯ 메뉴(리플레이 저장 · 결과 입력 · 숨김 · 삭제 · 공유)를 펼친 꼴이다. 추천(엄지 + 수)이 맨 앞. 못 쓰는 단추는 안 선다. */
export function GameResultTools({
  gameResult, canDelete, isAdmin = false, memberOf, onDelete, onChanged, graphDock = false,
}: {
  gameResult: GameResult;
  canDelete: boolean;
  isAdmin?: boolean;
  memberOf: (id: string) => Member | undefined;
  onDelete: (m: GameResult) => void;
  onChanged: (m: GameResult) => void;
  /** 게임 상세 — 데이터 창을 넓은 PC 에선 오른쪽 칸으로(GameCurvesModal dock). */
  graphDock?: boolean;
}) {
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [hideOpen, setHideOpen] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [hideErr, setHideErr] = useState<string | null>(null);
  const [graphOpen, setGraphOpen] = useState(false);
  const rec = useRecommend(gameResult);

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

  /* extra = 폭이 모자라면 먼저 감추는 단추(리플레이 저장 · 숨김 · 삭제 — 2026-10-22, 요청: "게임 상세에 버튼이 너무 많네 모바일에선 폭이 모자라면
     다운로드 숨기기 삭제 감추기"). 게임 상세 머리 줄(.scr-game-detail-bar 컨테이너)에서만 감춘다(global.css). */
  const tool = (key: string, title: string, run: () => void, icon: ReactNode, danger = false, extra = false) => (
    <button
      key={key} type="button" className={cx("scr-icon-btn scr-tools-btn", danger && "is-danger", extra && "is-extra")} title={title} aria-label={title}
      onClick={(e) => { e.stopPropagation(); run(); }}
    >
      {icon}
    </button>
  );

  return (
    <div className="scr-tools" role="toolbar" aria-label="게임 도구" onClick={(e) => e.stopPropagation()}>
      <RecommendButton rec={rec} size={15} count className="scr-tools-btn" />
      {/* 데이터 창 보기(2026-10-22, 요청: "게임 상세 툴박스에 데이터창 보기 버튼 추가") — 목록 데이터 칸과 같은 창(GameCurvesModal). 유즈맵·숨긴 판은 없다. */}
      {!gameResult.ums && !isSecretGame(gameResult) && tool("graph", "데이터 그래프", () => { setGraphOpen(true); void api.pingGameAction("graph", gameResult); }, <ChartLine size={15} />)}
      {gameResult.replay && tool("download", "리플레이 저장", () => void downloadReplay(gameResult), <Save size={15} />, false, true)}
      {isAdmin && gameResult.result === "unknown" && tool("outcome", "결과 입력", () => setOutcomeOpen(true), <SquarePen size={15} />)}
      <KakaoShareButton
        className="scr-tools-btn" icon="share" label="공유"
        content={() => gameResultShareContent(gameResult, memberOf)}
      />
      {canDelete && !gameResult.hidden && tool("hide", "숨김", () => setHideOpen(true), <EyeOff size={15} />, false, true)}
      {canDelete && tool("delete", "삭제", () => onDelete(gameResult), <Trash2 size={15} />, true, true)}
      {graphOpen && <GameCurvesModal game={gameResult} dock={graphDock} onClose={() => setGraphOpen(false)} />}
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
                    <GameResultTools
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
                    <GameResultTools
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
