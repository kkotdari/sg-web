import { memo, useEffect, useLayoutEffect, useState } from "react";
import { useIsMobile } from "../../hooks/useIsMobile";
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
import { isMeleeGame, meleeLineup, teamSummaryName } from "./GameResultSides";

/* ★ 게임 상세는 **목록과 무관한 별도 페이지**다(2026-10-19, 요청: "너나와 리그 게임도 목록과 전혀무관하게 변경 · 별도 페이지임 그냥") —
   들어올 때마다 서버에서 받고, 고친 것을 목록에 알리지 않는다. 제 게임을 제 상태로 든다. */

/** 폰 게임 상세의 첫 화면에 보일 댓글 몫(px) — 재생기 키에서 뺀다(위 frameSize ★). */
const COMMENT_PEEK = 28;   // 64 → 28(2026-11-09, 실기 지적: "재생기 세로 너무 줄인 듯 · 살짝은 다시 늘려줘")

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
  const mobile = useIsMobile();   // 폰은 머리 줄을 재생기 아래로(아래 bar ★)
  /* ★ 재생기 키 · 폭은 **이 페이지가 정한다**(2026-11-09, 요청: "재생기가 자기 크기를 정할 게 아니라 재생기를 넣는 페이지에서 크기를 파라미터로 · 높이 너비 다") — 폰만:
     폭 = 카드 안쪽 폭 · 키 = 창 높이 − 카드 위끝(문서) − 카드 아래 여백 − 머리 줄 키 − 아래 안전영역 − 숨 8. 창 높이는 폭이 그대로인 동안 처음 잰 값을 붙든다(주소창이 접고 펴질 때
     재생기가 들썩이지 않게 · 회전하면 다시). PC 는 안 넘긴다(재생기 옛 셈). */
  const [cardEl, setCardEl] = useState<HTMLDivElement | null>(null);
  const [barEl, setBarEl] = useState<HTMLDivElement | null>(null);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    if (!mobile || !cardEl) { setFrameSize(null); return undefined; }
    let held = { w: window.innerWidth, h: window.innerHeight };
    const safeProbe = document.createElement("div");
    safeProbe.style.cssText = "position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none";
    document.body.appendChild(safeProbe);
    const calc = (): void => {
      if (window.innerWidth !== held.w) held = { w: window.innerWidth, h: window.innerHeight };
      const cs = getComputedStyle(cardEl);
      const r = cardEl.getBoundingClientRect();
      /* 폭 = 화면 폭(재생기 판은 폰에서 화면 끝까지 · scplay .scr-feed-group-page .scr-motion-frame 100vw — 카드 안쪽 폭을 주면 좌우가 24px 씩 비었다 · 2026-11-09 실기) */
      const w = document.documentElement.clientWidth;
      const top = r.top + window.scrollY;
      /* 아래 = 카드 아래 여백 + 머리 줄 + **댓글 한 뼘**(COMMENT_PEEK · 같은 날 "댓글도 좀 보이게 더 올려줘") + 안전영역 + 숨 4. */
      const below = (parseFloat(cs.marginBottom) || 0) + (barEl?.offsetHeight ?? 30) + COMMENT_PEEK + safeProbe.offsetHeight + 4;
      const h = Math.round(held.h - top - below);
      setFrameSize((p) => (p && Math.abs(p.w - w) <= 1 && Math.abs(p.h - h) <= 2 ? p : { w, h }));
    };
    calc();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(calc) : null;
    ro?.observe(document.body);
    if (barEl) ro?.observe(barEl);
    window.addEventListener("resize", calc);
    window.addEventListener("orientationchange", calc);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", calc);
      window.removeEventListener("orientationchange", calc);
      safeProbe.remove();
    };
  }, [mobile, cardEl, barEl]);

  useLayoutEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, []);
  useEffect(() => {
    document.body.classList.add("scr-gamepage-open");
    return () => document.body.classList.remove("scr-gamepage-open");
  }, []);
  useEffect(() => {
    if (game) return undefined;
    let cancelled = false;
    api.getGameResultByRef(idText)   // 꼬리 붙은 경기 번호("…-2")도(옛: Number → NaN → 목록으로 되돌아갔다 · 2026-11-06)
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
        {/* 게임 받는 동안은 로딩바도 없다(2026-11-02 되물림 — 로딩바는 판 높이가 확정된 뒤 판 안 한 자리에서만 · GameResultStory sized ★). */}
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
  /* ★ 폰은 머리 줄(← 게임 · 시각 · 맵 · 등록자 · 단추)을 **재생기 아래**에(2026-11-09, 요청: "폰 프레임 모드 시 이 부분을 재생기 아래로 · 재생기 / 헤더 / 댓글") — PC 는 위 그대로. */
  const bar = (
    /* 폰(아래 자리)은 판 키가 선 뒤에 보인다(sized · 댓글과 같은 때 · 2026-11-09, 요청: "헤더도 댓글처럼 자리가 다 정해진 뒤 띄워 주고") — 자리는 그대로 잡아 둔다(재생기 키 셈이 그 키를 잰다). */
    <div className={`scr-v2-toolbar scr-v2-toolbar-crumb scr-game-detail-bar${mobile ? " is-below" : ""}${mobile && !sized ? " is-wait" : ""}`} ref={setBarEl}>
      <div className="scr-v2-toolbar-title-row scr-crumb scr-crumb-notitle">
        <button type="button" className="scr-crumb-back" onClick={onBack}>
          <ArrowLeft size={14} />
          <span>게임</span>
        </button>
        <div className="scr-crumb-meta" ref={setHeadSlot} />
      </div>
      <div className="scr-v2-toolbar-actions">{menu}</div>
    </div>
  );
  return (
    <div className="scr-feed-group-page">
      {!mobile && bar}
      <div className={`scr-game-page-card${sized ? "" : " is-loading"}`} ref={setCardEl}>   {/* 로딩 동안 판 자리를 잡아 둔다(워드마크가 그 안 · 아래 댓글과 안 겹치게) */}
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
          onBack={onBack}
          frameH={frameSize?.h} frameW={frameSize?.w}
        />
      </div>
      {/* 댓글은 게임을 받자마자(2026-11-02, 요청: "게임 상세 로딩 중에도 댓글은 보고 쓸 수 있게 변경") — 판(재생기 · 로스터)이 그려지길 안 기다린다.
          옛: GameResultStory onShown 뒤에만(2026-10-30 "타이틀 외의 다른 부분은 그리지 말고").
          ★ 단, 판 **높이가 확정된 뒤**(sized · 2026-11-02, 요청: "재생기 높이가 확정된 후 로딩바와 댓글 띄우기") — 그 전엔 재생기가 높이를 잡으며 댓글이 출렁였다. */}
      {mobile && bar}
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

