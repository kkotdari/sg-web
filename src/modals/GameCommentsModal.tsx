import { createPortal } from "react-dom";
import { X } from "lucide-react";
import ModalHash from "../utils/modalHash";
import Comments from "../pages/feed/Comments";
import { useIsMobile } from "../hooks/useIsMobile";
import type { GameResult } from "../types";

/* ★ 게임 댓글만 띄우기(2026-10-29, 요청: "댓글 누르면 댓글만 팝업으로 보이기") — 게임 목록의 댓글 수(PC 댓글 칸 · 폰 줄 아래 가운데)를 누르면 연다.
   폰은 댓글 시트(Comments 의 바닥 시트 · 끌어 내려 닫기)만 곧장 · PC 는 작은 모달 안에 댓글 목록과 쓰기 칸.
   onCount 는 달기·지우기로 바뀐 수를 목록 줄에 돌려준다(목록은 다시 불러오기 전까지 옛 수라). */
export default function GameCommentsModal({ game, onClose, onCount }: { game: GameResult; onClose: () => void; onCount?: (n: number) => void }) {
  const mobile = useIsMobile();
  if (mobile) return <Comments targetType="gameResult" targetId={game.id} sheetOnly onSheetClose={onClose} onCount={onCount} />;
  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash="comments" onClose={onClose} />
      <div className="scr-modal scr-modal-sm scr-game-comments-modal">
        <div className="scr-modal-head">
          <span>댓글</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>
        <div className="scr-modal-body scr-scroll">
          <Comments targetType="gameResult" targetId={game.id} overModal onCount={onCount} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
