import { useEffect, useState } from "react";
import { ThumbsUp } from "lucide-react";
import { api } from "../../api/client";
import { useAppStore } from "../../store/appStore";
import { cx } from "../../utils/format";
import { isSecretGame } from "../../utils/gameAccess";
import { showToast } from "../../components/common/Toast";
import type { GameResult } from "../../types";

/* ★ 게임 추천(2026-10-22, 요청: "게임에 추천 기능 추가 · PC 목록 링크 칸을 도구로 바꾸고 추천 단추 · 모바일은 데이터 옆 · 상세 툴박스에도") —
   한 사람이 한 판에 하나(서버 game_result_recommends). 누르면 곧바로 바꿔 그리고(되면 서버 값으로 맞춤 · 안 되면 되돌림) 같은 판을 그린 다른 자리(목록 줄 ·
   추천 수 칸 · 상세)에도 알린다. 로그인 안 한 화면(손님)·숨긴 판·명예의 전당 판(2026-10-22, 요청: "명예의 전당은 추천 아이콘 없음")에는 안 선다. */
type Rec = { n: number; on: boolean };
const listeners = new Set<(id: number, r: Rec) => void>();

export function useRecommend(game: GameResult): Rec & { toggle: () => void; busy: boolean; shown: boolean } {
  const user = useAppStore((s) => s.user);
  const [rec, setRec] = useState<Rec>({ n: game.recommendCount ?? 0, on: !!game.recommended });
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRec({ n: game.recommendCount ?? 0, on: !!game.recommended }); }, [game.id, game.recommendCount, game.recommended]);
  useEffect(() => {
    const fn = (id: number, r: Rec) => { if (id === game.id) setRec(r); };
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, [game.id]);
  const publish = (r: Rec) => { for (const fn of listeners) fn(game.id, r); };
  const toggle = () => {
    if (busy) return;
    const before = rec;
    const next = { n: Math.max(0, rec.n + (rec.on ? -1 : 1)), on: !rec.on };
    publish(next);
    setBusy(true);
    api.recommendGame(game.id, next.on)
      .then((r) => publish({ n: r.recommendCount, on: r.recommended }))
      .catch((e) => { publish(before); showToast(e instanceof Error ? e.message : "추천하지 못했어요.", { kind: "warn" }); })
      .finally(() => setBusy(false));
  };
  return { ...rec, toggle, busy, shown: !!user && !isSecretGame(game) && !game.fame };
}

/** 추천 단추 — 엄지 · 켜면 채운 엄지와 강조색. count 면 옆에 수. 줄 열기로 번지지 않는다. */
export function RecommendButton({ rec, size = 13, count = false, className }: {
  rec: ReturnType<typeof useRecommend>; size?: number; count?: boolean; className?: string;
}) {
  if (!rec.shown) return null;
  const stop = (e: { stopPropagation: () => void }): void => e.stopPropagation();
  return (
    <button
      type="button" className={cx("scr-icon-btn scr-recommend-btn", rec.on && "is-on", className)}
      title={rec.on ? "추천 취소" : "추천"} aria-label={rec.on ? "추천 취소" : "추천"} aria-pressed={rec.on}
      onPointerDown={stop} onPointerUp={stop} onKeyDown={stop} onContextMenu={stop}
      onClick={(e) => { e.stopPropagation(); rec.toggle(); }}
    >
      <ThumbsUp size={size} fill={rec.on ? "currentColor" : "none"} />
      {count && <span className="scr-recommend-n">{rec.n}</span>}
    </button>
  );
}
