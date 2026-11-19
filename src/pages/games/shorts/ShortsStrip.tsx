import { useCallback, useEffect, useRef, useState } from "react";
import { Clapperboard, Play, ThumbsUp } from "lucide-react";
import { api, type GameShort } from "../../../api/client";
import Avatar from "../../../components/common/Avatar";
import { useAppStore } from "../../../store/appStore";
import ShortsViewer from "./ShortsViewer";
import { SHORTS_CHANGED } from "./shortsBus";
import { prefetchShort } from "./shortsPrefetch";

/* ★ 쇼츠 줄(2026-11-19, 요청: "쇼츠는 게임목록 최상단에 정사각형 형태로 노출(게임장면 + 미니맵만 뜸)되고 가운데 큰 재생버튼으로 보기누르면 확대되어 보이기(인스타 스토리처럼) ·
   최근 쇼츠 최신순 · 지울 때까지 남는다") — 모든 판의 쇼츠를 새것부터 가로 한 줄 · 카드는 정사각 표지(재생기가 찍은 장면 + 미니맵 · scplay shortCoverOf9) ·
   가운데 큰 재생 단추 · 아래 자막 첫 줄과 만든 사람. 누르면 그 카드에서 스토리 보기(ShortsViewer)가 펼쳐진다. 끝에 닿으면 다음 쪽(before)을 받는다. 쇼츠가 없으면 줄째 안 선다. */
export default function ShortsStrip({ fame = false }: {
  /** 명예의 전당 탭 — 추천 3개 이상인 쇼츠만 · 카드에 '쇼츠' 배지(2026-11-19, 요청: "3개 이상시 명예의 전당에 들어감 · 쇼츠라는 배지 · 누르면 상세로 안 가고 그 자리 팝업"). */
  fame?: boolean;
} = {}) {
  const [items, setItems] = useState<GameShort[] | null>(null);
  const [more, setMore] = useState(true);
  const [open, setOpen] = useState<{ i: number; from: DOMRect | null } | null>(null);
  const memberOf = useAppStore((s) => s.memberOf);
  const busy = useRef(false);
  const load = useCallback(async (): Promise<void> => {
    try {
      const got = (await api.listShorts(undefined, fame)).items;
      setItems(got);
      setMore(got.length >= 30);
    } catch {
      setItems((cur) => cur ?? []);
    }
  }, [fame]);
  useEffect(() => {
    void load();
    const on = (): void => { void load(); };
    window.addEventListener(SHORTS_CHANGED, on);
    return () => window.removeEventListener(SHORTS_CHANGED, on);
  }, [load]);
  const loadMore = useCallback(async (): Promise<void> => {
    if (busy.current || !more || !items || items.length === 0) return;
    busy.current = true;
    try {
      const got = (await api.listShorts(items[items.length - 1].id, fame)).items;
      setItems((cur) => [...(cur ?? []), ...got.filter((g) => !(cur ?? []).some((c) => c.id === g.id))]);
      setMore(got.length >= 30);
    } catch { /* 다음에 다시 */ }
    busy.current = false;
  }, [items, more, fame]);
  const endRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const el = endRef.current;
    if (!el || !more || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) void loadMore(); }, { rootMargin: "0px 240px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, more, items?.length]);

  if (!items || items.length === 0) return null;
  return (
    <section className={fame ? "scr-shorts is-fame" : "scr-shorts"} aria-label={fame ? "명예의 전당 쇼츠" : "쇼츠"}>
      <div className="scr-shorts-head">
        <Clapperboard size={16} aria-hidden />
        <span>{fame ? "명예의 전당 쇼츠" : "쇼츠"}</span>
      </div>
      <div className="scr-shorts-row">
        {items.map((it, i) => (
          <button
            key={it.id} type="button" className="scr-short-card"
            onPointerDown={() => prefetchShort(it)}   /* 누르는 순간 받기 출발(떼기 · 열기 애니메이션 동안 번다) */
            onClick={(e) => { prefetchShort(it); setOpen({ i, from: e.currentTarget.getBoundingClientRect() }); }}
            aria-label={`쇼츠 보기 — ${it.author.nickname}${it.caption ? ` · ${it.caption}` : ""}`}
          >
            {it.coverUrl ? <img src={it.coverUrl} alt="" loading="lazy" decoding="async" draggable={false} /> : <span className="scr-short-card-blank" aria-hidden />}
            <span className="scr-short-card-shade" aria-hidden />
            <span className="scr-circle-btn scr-short-card-play" aria-hidden><Play size={22} fill="currentColor" /></span>
            <span className="scr-short-card-dur">{Math.round(it.dur)}초</span>
            {fame && <span className="scr-short-card-badge">쇼츠</span>}
            {it.recommendCount > 0 && (
              <span className={it.recommended ? "scr-short-card-rec is-on" : "scr-short-card-rec"}>
                <ThumbsUp size={10} fill={it.recommended ? "currentColor" : "none"} aria-hidden />{it.recommendCount}
              </span>
            )}
            <span className="scr-short-card-foot">
              {it.caption && <span className="scr-short-card-cap">{it.caption}</span>}
              <span className="scr-short-card-by">
                <Avatar member={{ id: it.author.memberId, nickname: it.author.nickname, avatar: memberOf(it.author.memberId)?.avatar ?? it.author.avatar ?? null }} size={14} />
                <span>{it.author.nickname}</span>
              </span>
            </span>
          </button>
        ))}
        <span ref={endRef} className="scr-shorts-end" aria-hidden />
      </div>
      {open && (
        <ShortsViewer
          items={items} start={open.i} from={open.from}
          onClose={() => setOpen(null)}
          onDeleted={(id) => setItems((cur) => (cur ?? []).filter((x) => x.id !== id))}
          onPatch={(id, patch) => setItems((cur) => (cur ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x)))}
          onNeedMore={() => { void loadMore(); }}
        />
      )}
    </section>
  );
}
