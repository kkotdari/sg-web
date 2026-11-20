import { useCallback, useEffect, useRef, useState } from "react";
import { Clapperboard, ThumbsUp } from "lucide-react";
import { api, type GameShort } from "../../../api/client";
import Avatar from "../../../components/common/Avatar";
import { useAppStore } from "../../../store/appStore";
import ShortsViewer, { SHORT_PARAM } from "./ShortsViewer";
import { SHORTS_CHANGED } from "./shortsBus";
import { prefetchShort } from "./shortsPrefetch";
import { showToast } from "../../../components/common/Toast";

/* ★ 쇼츠 줄(2026-11-19, 요청: "쇼츠는 게임목록 최상단에 정사각형 형태로 노출(게임장면 + 미니맵만 뜸)되고 가운데 큰 재생버튼으로 보기누르면 확대되어 보이기(인스타 스토리처럼) ·
   최근 쇼츠 최신순 · 지울 때까지 남는다") — 모든 판의 쇼츠를 새것부터 가로 한 줄 · 카드는 정사각 표지(재생기가 찍은 장면 + 미니맵 · scplay shortCoverOf9) ·
   (가운데 재생 단추는 걷었다 — 같은 날 "썸네일에 버튼은 불필요") · 아래 자막 첫 줄과 만든 사람. 누르면 그 카드에서 스토리 보기(ShortsViewer)가 펼쳐진다. 끝에 닿으면 다음 쪽(before)을 받는다. 쇼츠가 없으면 줄째 안 선다. */
export default function ShortsStrip({ fame = false }: {
  /** 명예의 전당 탭 — 추천 3개 이상인 쇼츠만 · 카드에 '쇼츠' 배지(2026-11-19, 요청: "3개 이상시 명예의 전당에 들어감 · 쇼츠라는 배지 · 누르면 상세로 안 가고 그 자리 팝업"). */
  fame?: boolean;
} = {}) {
  const [items, setItems] = useState<GameShort[] | null>(null);
  const [more, setMore] = useState(true);
  const [open, setOpen] = useState<{ i: number; from: DOMRect | null } | null>(null);
  const memberOf = useAppStore((s) => s.memberOf);
  const busy = useRef(false);
  /* ★ 공유 주소로 들어옴(/games?short=<id> · ShortsViewer shortLink ★ · 2026-11-20) — 그 쇼츠를 줄에 세우고(첫 쪽에 없으면 한 개를 받아 끼운다) 가운데로 미끄러뜨려
     강조한 뒤 그 카드에서 보기를 펼쳐 곧장 재생한다. 한 번 쓰면 주소에서 뗀다(새로 고침 · 목록 다시 받기에 또 안 열리게). 명예의 전당 줄은 안 본다. */
  const [deep, setDeep] = useState<number | null>(() => {
    if (fame || typeof window === "undefined") return null;
    const v = Number(new URLSearchParams(window.location.search).get(SHORT_PARAM));
    return Number.isInteger(v) && v > 0 ? v : null;
  });
  const [focusId, setFocusId] = useState<number | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
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

  /* 공유 주소 — ① 줄에 없으면 한 개를 받아 id 차례(새것 먼저) 자리에 끼운다 · ② 그 카드를 가운데로 · 강조 · 잠시 뒤 펼쳐 재생. */
  const deepStep = useRef<"idle" | "fetch" | "go">("idle");
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    if (deep === null || !items) return;
    const dropParam = (): void => {
      const p = new URLSearchParams(window.location.search);
      p.delete(SHORT_PARAM);
      const qs = p.toString();
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
    };
    const i = items.findIndex((x) => x.id === deep);
    if (i < 0) {
      if (deepStep.current !== "idle") return;
      deepStep.current = "fetch";
      api.getShort(deep)
        .then((one) => {
          const { clip: _clip, ...card } = one;
          setItems((cur) => {
            const list = [...(cur ?? []).filter((x) => x.id !== card.id), card as GameShort];
            return list.sort((a, b) => b.id - a.id);
          });
        })
        .catch(() => { showToast("이 쇼츠를 찾을 수 없어요(지워졌을 수 있어요)", { kind: "warn" }); dropParam(); setDeep(null); });
      return;
    }
    if (deepStep.current === "go") return;
    deepStep.current = "go";
    dropParam();
    /* 타이머는 목록이 바뀌어도(다음 쪽 받기 · 다시 받기) 안 끊는다 — 끊으면 한 번뿐인 걸음(go)이 사라진다. 그 때의 목록은 ref 로 읽는다. */
    window.setTimeout(() => {
      const el = rowRef.current?.querySelector<HTMLButtonElement>(`[data-short-id="${deep}"]`);
      if (!el) { setDeep(null); return; }
      setFocusId(deep);   // 강조 + 그 카드만 가운데 맞춤(scroll-snap-align: center · global.css .is-focus) — 다음 장에서 민다
      window.requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        el.focus({ preventScroll: true });
      });
      window.setTimeout(() => {
        const list = itemsRef.current ?? [];
        const at = list.findIndex((x) => x.id === deep);
        if (at >= 0 && el.isConnected) { prefetchShort(list[at]); setOpen({ i: at, from: el.getBoundingClientRect() }); }
        setDeep(null);
      }, 750);
    }, 60);
  }, [deep, items]);

  if (!items || items.length === 0) return null;
  return (
    <section className={fame ? "scr-shorts is-fame" : "scr-shorts"} aria-label={fame ? "명예의 전당 쇼츠" : "쇼츠"}>
      <div className="scr-shorts-head">
        <Clapperboard size={16} aria-hidden />
        <span>{fame ? "명예의 전당 쇼츠" : "쇼츠"}</span>
      </div>
      <div className="scr-shorts-row" ref={rowRef}>
        {items.map((it, i) => (
          <button
            key={it.id} type="button" className={it.id === focusId ? "scr-short-card is-focus" : "scr-short-card"} data-short-id={it.id}
            onPointerDown={() => prefetchShort(it)}   /* 누르는 순간 받기 출발(떼기 · 열기 애니메이션 동안 번다) */
            onClick={(e) => { prefetchShort(it); setOpen({ i, from: e.currentTarget.getBoundingClientRect() }); }}
            aria-label={`쇼츠 보기 — ${it.author.nickname}${it.caption ? ` · ${it.caption}` : ""}`}
          >
            {it.coverUrl ? <img src={it.coverUrl} alt="" loading="lazy" decoding="async" draggable={false} /> : <span className="scr-short-card-blank" aria-hidden />}
            <span className="scr-short-card-shade" aria-hidden />
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
          onClose={() => { setOpen(null); setFocusId(null); }}
          onDeleted={(id) => setItems((cur) => (cur ?? []).filter((x) => x.id !== id))}
          onPatch={(id, patch) => setItems((cur) => (cur ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x)))}
          onNeedMore={() => { void loadMore(); }}
        />
      )}
    </section>
  );
}
