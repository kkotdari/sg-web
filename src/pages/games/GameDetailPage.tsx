import { memo, useEffect, useLayoutEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { useAppStore } from "../../store/appStore";
import { isAdminRole } from "../../constants/roles";
import { api } from "../../api/client";
import { canManageGame, isSecretGame } from "../../utils/gameAccess";
import type { GameResult } from "../../types";
import Comments from "../feed/Comments";
import { GameResultTools } from "./GameResultCardBody";
import GameResultStory from "./GameResultStory";
import { DetailLoading } from "./DetailLoading";
import { isMeleeGame, meleeLineup, teamSummaryName } from "./GameResultSides";

/* ★ 게임 상세는 **목록과 무관한 별도 페이지**다(2026-10-19, 요청: "너나와 리그 게임도 목록과 전혀무관하게 변경 · 별도 페이지임 그냥") —
   들어올 때마다 서버에서 받고, 고친 것을 목록에 알리지 않는다. 제 게임을 제 상태로 든다. */

export default memo(function GameDetailPage({ idText, onBack, onClose, onGone, onMiss }: {
  /** 주소의 게임 칸(경기 번호 또는 id). */
  idText: string;
  /** 머리 줄의 뒤로(게임 목록으로). */
  onBack: () => void;
  /** 지운 뒤 닫기. */
  onClose: () => void;
  /** 숨겨져 볼 수 없게 됐을 때 — 게임 목록으로. */
  onGone: () => void;
  onMiss: () => void;
}) {
  const user = useAppStore((s) => s.user);
  const isAdmin = !!user && isAdminRole(user.roles);
  const memberOf = useAppStore((s) => s.memberOf);
  const deleteGameResultAction = useAppStore((s) => s.deleteGameResult);
  const [game, setGame] = useState<GameResult | null>(null);
  const [shown, setShown] = useState(false);
  /** 판 높이 확정(GameResultStory onSized ★) — 그 전엔 판 자리 최소 높이·댓글을 안 둔다(재생기가 높이를 잡으며 댓글이 출렁이지 않게). */
  const [sized, setSized] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<GameResult | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  /* 게임 페이지 제목 줄의 머리 칸 — GameResultStory 가 시각·맵·승패·등록자를 여기에 포털로 그린다(2026-10-09). */
  const [headSlot, setHeadSlot] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, []);
  useEffect(() => {
    document.body.classList.add("scr-gamepage-open");
    return () => document.body.classList.remove("scr-gamepage-open");
  }, []);
  useEffect(() => {
    if (game) return undefined;
    let cancelled = false;
    api.getGameResult(Number(idText))
      .then((gr) => { if (!cancelled) setGame(gr); })
      .catch(() => { if (!cancelled) onMiss(); });
    return () => { cancelled = true; };
  }, []);
  const gameId = game?.id ?? null;
  useEffect(() => {
    if (gameId === null || !game) return;
    void api.pingAccess("games", `game#${game.matchNo || String(gameId)}`);
    void api.markGameViewed(gameId).catch(() => {});
  }, [gameId]);
  useEffect(() => {
    if (!game) return undefined;
    const melee9 = isMeleeGame({ matchType: game.matchType, team1: game.team1, team2: game.team2 });
    const line9 = melee9
      ? meleeLineup(game.team1, game.team2, memberOf)
      : `${teamSummaryName(game.team1, memberOf) || "팀1"} vs ${teamSummaryName(game.team2, memberOf) || "팀2"}`;
    const [, mo, da] = game.date.split("-").map(Number);
    const prev = document.title;
    document.title = `${line9} ${mo}월 ${da}일`;
    return () => { document.title = prev; };
  }, [game, memberOf]);

  const onChanged = (updated: GameResult): void => {
    if (isSecretGame(updated)) { onGone(); return; }
    setGame(updated);
  };

  /* 게임을 받는 동안은 머리 줄과 워드마크 로딩만(2026-10-30, 요청: "상세에 진입하면 타이틀 외의 다른 부분은 그리지 말고 워드마크 로딩바만" · 옛: 자료를 기다리는 재생기 PlayerLoadShell). */
  if (!game) {
    return (
      <div className="scr-feed-group-page">
        <div className="scr-v2-toolbar scr-v2-toolbar-crumb scr-game-detail-bar">
          <div className="scr-v2-toolbar-title-row scr-crumb scr-crumb-notitle">
            <button type="button" className="scr-crumb-back" onClick={onBack}>
              <ArrowLeft size={14} />
              <span>게임</span>
            </button>
          </div>
        </div>
        <DetailLoading pct={3} />   {/* 게임 받는 중 — 이어서 GameResultStory 가 10% 부터 */}
      </div>
    );
  }
  const menu = (
    <GameResultTools
      gameResult={game}
      canDelete={canManageGame(game, user)}
      isAdmin={isAdmin}
      memberOf={memberOf}
      onDelete={setPendingDelete}
      onChanged={onChanged}
      graphDock
    />
  );
  return (
    <div className="scr-feed-group-page">
      <div className="scr-v2-toolbar scr-v2-toolbar-crumb scr-game-detail-bar">
        <div className="scr-v2-toolbar-title-row scr-crumb scr-crumb-notitle">
          <button type="button" className="scr-crumb-back" onClick={onBack}>
            <ArrowLeft size={14} />
            <span>게임</span>
          </button>
          <div className="scr-crumb-meta" ref={setHeadSlot} />
        </div>
        <div className="scr-v2-toolbar-actions">{menu}</div>
      </div>
      <div className={`scr-game-page-card${sized ? "" : " is-loading"}`}>   {/* 로딩 동안 판 자리를 잡아 둔다(워드마크가 그 안 · 아래 댓글과 안 겹치게) */}
        <GameResultStory
          headSlot={headSlot}
          gameResult={game}
          team1={game.team1}
          team2={game.team2}
          result={game.result}
          memberOf={memberOf}
          menu={menu}
          onShown={() => setShown(true)}
          onSized={() => setSized(true)}
        />
      </div>
      {/* 댓글은 게임을 받자마자(2026-11-02, 요청: "게임 상세 로딩 중에도 댓글은 보고 쓸 수 있게 변경") — 판(재생기 · 로스터)이 그려지길 안 기다린다.
          옛: GameResultStory onShown 뒤에만(2026-10-30 "타이틀 외의 다른 부분은 그리지 말고").
          ★ 단, 판 **높이가 확정된 뒤**(sized · 2026-11-02, 요청: "재생기 높이가 확정된 후 로딩바와 댓글 띄우기") — 그 전엔 재생기가 높이를 잡으며 댓글이 출렁였다. */}
      {sized && (
        <div className={`scr-feed-card-comment scr-game-page-comment${shown ? "" : " is-loading"}`}>
          <Comments targetType="gameResult" targetId={game.id} />
        </div>
      )}
      {pendingDelete && (
        <ConfirmDialog
          title="게임결과를 삭제할까요?"
          message="목록·통계에서 사라지고, 등록기가 같은 리플레이를 다시 올려도 등록되지 않아요. 운영자가 제어판의 '삭제된 경기'에서 복원하거나 완전히 지울 수 있어요."
          confirmLabel={deleting ? "삭제 중..." : "삭제"}
          cancelLabel="취소"
          error={deleteErr}
          onConfirm={async () => {
            setDeleting(true);
            setDeleteErr(null);
            try {
              await deleteGameResultAction(pendingDelete.id);
              setPendingDelete(null);
              onClose();
            } catch (e) {
              setDeleteErr(e instanceof Error ? e.message : "삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
            } finally {
              setDeleting(false);
            }
          }}
          onCancel={() => { setPendingDelete(null); setDeleteErr(null); }}
        />
      )}
    </div>
  );
});

