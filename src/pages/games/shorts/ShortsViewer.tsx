import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Pause, Play, Share2, ThumbsUp, Trash2, X } from "lucide-react";
import { ReplayModule, useReplayMap, type MotionBase, type ShortClip9 } from "scplay";
import { api, type GameShort } from "../../../api/client";
import Avatar from "../../../components/common/Avatar";
import { showToast } from "../../../components/common/Toast";
import { useAppStore } from "../../../store/appStore";
import { formatAgo } from "../../../utils/date";
import { shareThumb, shareToKakao, type KakaoShareContent } from "../../../utils/kakaoShare";
import { gamePath, navigateTo } from "../../../utils/route";
import { cx } from "../../../utils/format";
import { isMeleeGame, resolveSlotName } from "../GameResultSides";
import { SHORTS_CHANGED } from "./shortsBus";
import { gameOf, prefetchShort, shortOf, tracksOf } from "./shortsPrefetch";
import type { GameResult } from "../../../types";

/* ★ 쇼츠 보기(2026-11-19, 요청: "가운데 큰 재생버튼으로 보기누르면 확대되어 보이기(인스타 스토리처럼) · 끝나면 다음 쇼츠로 · 좌우 탭 이전/다음 · 아래로 쓸면 닫기 ·
   로딩이 오래걸리면 안되서 해당 장면에서 필요한 모델만 로딩") — 화면 위 판(body 포털) · 위에 진행 막대(쇼츠마다 한 칸) · 머리(만든 사람 · 언제 · 게임 보기 · 지우기 · 닫기) ·
   가운데 정사각 무대(재생기 쇼츠 재생 모드 — scplay `short` prop: 장면 + 미니맵만 · 녹화된 카메라 · 자막 연출 · 그 구간 모델만 데움).
   누름: 왼쪽 3할 = 이전 · 나머지 = 다음 · 누르고 있으면 멈춤 · 아래로 쓸면 닫기 · 키 ← → 넘기기 · 스페이스 멈춤 · Esc 닫기.
   재생기는 쇼츠마다 새로 선다(key) — 받는 동안은 표지를 깔고 그 위에 로딩. 못 받으면 3초 뒤 다음으로. */

const TAP_MS = 260;

/** ★ 쇼츠 공유 주소(2026-11-20, 요청: "쇼츠 공유 기능 추가 · 공유한 주소 클릭 시 게임 화면에 해당 쇼츠가 목록에서 가운데로 슬라이드 앤 포커싱 및 자동 재생") —
 *  /games?short=<id> · 게임 화면 쇼츠 줄(ShortsStrip SHORT_PARAM ★)이 읽는다. */
export const SHORT_PARAM = "short";
export const shortLink = (id: number): string => `${window.location.origin}/games?${SHORT_PARAM}=${id}`;
export function shortShareContent(it: GameShort): KakaoShareContent {
  const title = it.caption ? `쇼츠 · ${it.caption}` : `${it.author.nickname}의 쇼츠`;
  const desc = `${it.author.nickname} · ${Math.round(it.dur)}초`;
  /* 표지(정사각 · 서버 파일)가 바깥에서 읽히는 주소면 그걸 · 아니면 게임 공유 그림. */
  const cover = it.coverUrl && /^https?:/.test(it.coverUrl) ? { imageUrl: it.coverUrl } : shareThumb("gameResult");
  return { title, description: desc, ...cover, link: shortLink(it.id), fallbackText: `[스타게이트 쇼츠]\n${title}\n${desc}` };
}

/* 무대는 memo — 진행 막대(부모 prog)가 0.1초마다 바뀌어도 재생기까지 다시 그리지 않는다(props 가 다 굳은 값이다). */
const ShortStage = memo(function ShortStage({ item, w, h, paused, onProgress, onEnd }: {
  item: GameShort;
  w: number;
  h: number;
  paused: boolean;
  onProgress: (p: number) => void;
  onEnd: () => void;
}) {
  const memberOf = useAppStore((s) => s.memberOf);
  const [got, setGot] = useState<{ clip: ShortClip9; game: GameResult } | null>(null);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        void tracksOf(item.gameResultId).catch(() => undefined);   // 참값(가장 크다)은 먼저 출발 — 재생기가 받을 때 같은 약속을 쓴다
        const [one, game] = await Promise.all([shortOf(item), gameOf(item.gameResultId)]);
        if (!one.clip) throw new Error("토막 없음");
        if (!dead) setGot({ clip: one.clip, game });
      } catch {
        if (!dead) setErr("이 쇼츠를 불러오지 못했어요");
      }
    })();
    return () => { dead = true; };
  }, [item]);
  const grid = useReplayMap(got?.game.mapHash ?? null);
  useEffect(() => {
    if (!err && grid !== null) return undefined;
    if (!got && !err) return undefined;
    const t9 = window.setTimeout(onEnd, 3000);   // 못 여는 쇼츠는 잠깐 알리고 넘긴다
    return () => window.clearTimeout(t9);
  }, [err, grid, got, onEnd]);
  /* 끝내 안 서는 판(참값 없음 · 재생할 수 없는 게임 — 재생기가 onReady 를 안 부른다)은 25초 뒤 알리고 넘긴다. */
  useEffect(() => {
    if (ready || err) return undefined;
    const t9 = window.setTimeout(() => setErr("이 쇼츠를 재생할 수 없어요"), 25000);
    return () => window.clearTimeout(t9);
  }, [ready, err]);
  const game = got?.game ?? null;
  const bases: MotionBase[] = useMemo(() => {
    if (!game) return [];
    const all = [...game.team1, ...game.team2];
    const out: MotionBase[] = [];
    const add = (list: typeof game.team1, team: 1 | 2): void => {
      for (const slot of list) {
        if (!slot.rawName) continue;
        out.push({
          key: slot.rawName, name: resolveSlotName(slot, all, memberOf), memberId: slot.memberId,
          avatar: memberOf(slot.memberId)?.avatar ?? null, race: slot.race, team, withName: true, highlight: false, apm: slot.apm,
        });
      }
    };
    add(game.team1, 1);
    add(game.team2, 2);
    return out;
  }, [game, memberOf]);
  const teamOfRaw = useCallback((raw: string): 1 | 2 | undefined => bases.find((b) => b.key === raw)?.team as 1 | 2 | undefined, [bases]);
  const loadUnitTracks = useCallback(
    () => (game ? tracksOf(game.id).catch(() => ({ motion: null })) : Promise.resolve({ motion: null })),
    [game],
  );
  return (
    <div className="scr-shortv-stage" style={{ width: w, height: h }}>
      {!ready && item.coverUrl && <img className="scr-shortv-cover" src={item.coverUrl} alt="" draggable={false} />}
      {/* 로딩 = 로고 별이 뛰논다(2026-11-20, 요청: "쇼츠 로딩 마크를 우리 로고의 별마크 회전으로 · 재밌게 회전 및 이동") — 옛: 글자 마크(LoadingMark). */}
      {!ready && !err && (
        <div className="scr-shortv-wait" role="status" aria-label="불러오는 중">
          <span className="scr-shortv-star" aria-hidden><img src="/images/logo/symbol.png" alt="" draggable={false} /></span>
        </div>
      )}
      {err && <div className="scr-shortv-err">{err}</div>}
      {got && grid && (
        <div className={cx("scr-shortv-player", ready && "is-ready")}>
          <ReplayModule
            grid={grid} endSec={got.game.durationSeconds ?? null}
            bases={bases} teamOfRaw={teamOfRaw} active
            clockKey={`short-${item.id}`}
            melee={isMeleeGame({ matchType: got.game.matchType, team1: got.game.team1, team2: got.game.team2 })}
            loadUnitTracks={loadUnitTracks}
            short={got.clip} shortPaused={paused} onShortProgress={onProgress} onShortEnd={onEnd}
            veil onReady={() => setReady(true)}
            frameW={w} frameH={h}
            guide={false}
          />
        </div>
      )}
    </div>
  );
});

export default function ShortsViewer({ items, start, from, onClose, onDeleted, onNeedMore, onPatch }: {
  items: GameShort[];
  start: number;
  /** 누른 카드의 자리 — 그 자리에서 펼쳐진다(인스타 스토리처럼). */
  from: DOMRect | null;
  onClose: () => void;
  onDeleted: (id: number) => void;
  onNeedMore?: () => void;
  /** 추천을 바꿨다 — 목록의 그 카드도 고친다. */
  onPatch?: (id: number, patch: Partial<GameShort>) => void;
}) {
  const memberOf = useAppStore((s) => s.memberOf);
  const [idx, setIdx] = useState(Math.min(start, Math.max(0, items.length - 1)));
  const [prog, setProg] = useState(0);
  const [hold, setHold] = useState(false);
  const [stop, setStop] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [vw, setVw] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const it = items[idx] ?? null;
  useEffect(() => {
    const on = (): void => setVw({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  /* 뒤 페이지는 안 굴러가게 · 닫으면 되돌린다. */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  useEffect(() => { setProg(0); setStop(false); if (idx >= items.length - 3) onNeedMore?.(); }, [idx, items.length, onNeedMore]);
  /* 쇼츠 접속 기록(2026-11-19, 요청: "쇼츠도 억세스 로그") — 보기(넘어갈 때마다) · 추천 · 지우기 · 만들기(GameResultStory). 기록이 안 돼도 보기는 그대로. */
  const viewId = it?.id ?? 0;
  useEffect(() => {
    if (!it) return;
    api.pingAccess("short_view", `short#${it.id} game#${it.matchNo || it.gameResultId}`).catch(() => undefined);
    api.viewShort(it.id).catch(() => undefined);   // 본 횟수 +1(DB 에만 · 2026-11-19 "쇼츠 뷰카운트 · 디비에만")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewId]);
  /* 다음 쇼츠를 미리 받는다(shortsPrefetch ★) — 토막 · 경기 · 참값 · 지도. 지도는 해시를 안 뒤에 useReplayMap 캐시로 당긴다. */
  const nextItem = items[idx + 1] ?? null;
  const [nextHash, setNextHash] = useState<string | null>(null);
  useEffect(() => {
    if (!nextItem) return undefined;
    let dead = false;
    const t9 = window.setTimeout(() => {   // 지금 쇼츠의 첫 받기와 안 다투게 조금 뒤에
      prefetchShort(nextItem);
      gameOf(nextItem.gameResultId).then((g) => { if (!dead) setNextHash(g.mapHash ?? null); }).catch(() => undefined);
    }, 1200);
    return () => { dead = true; window.clearTimeout(t9); };
  }, [nextItem]);
  useReplayMap(nextHash);
  const next = useCallback((): void => {
    setIdx((i) => {
      if (i + 1 < items.length) return i + 1;
      window.setTimeout(onClose, 0);
      return i;
    });
  }, [items.length, onClose]);
  const prev = useCallback((): void => { setIdx((i) => Math.max(0, i - 1)); }, []);
  useEffect(() => {
    const on = (e: KeyboardEvent): void => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (e.key === " ") { e.preventDefault(); setStop((v) => !v); }
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [next, prev, onClose]);
  /* 누름 — 짧게 떼면 탭(좌 3할 이전 · 나머지 다음) · 오래 누르면 멈춤(떼면 다시) · 아래로 끌면 판이 따라 내려가고 90px 넘게 놓으면 닫힘. */
  const press = useRef<{ x: number; y: number; t: number; id: number; holdTm: number } | null>(null);
  const onDown = (e: RPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const holdTm = window.setTimeout(() => setHold(true), TAP_MS);
    press.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, holdTm };
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>): void => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    const dy = e.clientY - p.y;
    if (Math.abs(dy) > 8 || Math.abs(e.clientX - p.x) > 8) window.clearTimeout(p.holdTm);
    if (dy > 0) setDragY(dy);
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>): void => {
    const p = press.current;
    press.current = null;
    if (!p || p.id !== e.pointerId) return;
    window.clearTimeout(p.holdTm);
    const dy = e.clientY - p.y;
    const dx = e.clientX - p.x;
    const held = performance.now() - p.t >= TAP_MS;
    setHold(false);
    setDragY(0);
    if (dy > 90) { onClose(); return; }
    if (held || Math.abs(dx) > 12 || Math.abs(dy) > 12) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (e.clientX - r.left < r.width * 0.3) prev(); else next();
  };
  const del = async (): Promise<void> => {
    if (!it || !window.confirm("이 쇼츠를 지울까요?")) return;
    try {
      await api.deleteShort(it.id);
      api.pingAccess("short_del", `short#${it.id}`).catch(() => undefined);
    } catch {
      showToast("지우지 못했어요", { kind: "warn" });
      return;
    }
    onDeleted(it.id);
    window.dispatchEvent(new CustomEvent(SHORTS_CHANGED));
    if (items.length <= 1) onClose();
    else if (idx >= items.length - 1) setIdx(idx - 1);
  };
  /* ★ 쇼츠 추천(2026-11-19, 요청: "쇼츠에도 추천버튼 넣고 3개 이상시 명예의 전당에 들어감") — 누르면 곧장 바꿔 그리고(되면 서버 값 · 안 되면 되돌림) 목록 카드도 고친다. */
  const [recBusy, setRecBusy] = useState(false);
  const recToggle = (): void => {
    if (!it || recBusy) return;
    const before = { recommendCount: it.recommendCount, recommended: it.recommended, fame: it.fame };
    const n = Math.max(0, it.recommendCount + (it.recommended ? -1 : 1));
    onPatch?.(it.id, { recommendCount: n, recommended: !it.recommended, fame: n >= 3 });
    setRecBusy(true);
    const id = it.id;
    api.pingAccess("short_rec", `${before.recommended ? "-" : ""}short#${id}`).catch(() => undefined);
    api.recommendShort(id, !before.recommended)
      .then((r) => {
        onPatch?.(id, { recommendCount: r.recommendCount, recommended: r.recommended, fame: r.recommendCount >= 3 });
        if (r.recommendCount >= 3 && before.recommendCount < 3) { showToast("명예의 전당에 들어갔어요"); window.dispatchEvent(new CustomEvent(SHORTS_CHANGED)); }
        else if (r.recommendCount < 3 && before.recommendCount >= 3) window.dispatchEvent(new CustomEvent(SHORTS_CHANGED));
      })
      .catch((e) => { onPatch?.(id, before); showToast(e instanceof Error ? e.message : "추천하지 못했어요", { kind: "warn" }); })
      .finally(() => setRecBusy(false));
  };
  const share = async (): Promise<void> => {
    if (!it) return;
    const out = await shareToKakao(shortShareContent(it));
    if (out === "copied") showToast("링크를 복사했어요.", { kind: "ok" });
    else if (out === "failed") showToast("공유하지 못했어요.", { kind: "warn" });
    if (out !== "failed") api.pingAccess("short_share", `short#${it.id}`).catch(() => undefined);
  };
  const goGame = (): void => {
    if (!it) return;
    onClose();
    navigateTo(gamePath(it.matchNo || String(it.gameResultId)), { search: `t=${Math.floor(it.t0)}` });
  };
  /* ★ 판은 **정사각**(2026-11-20, 요청: "쇼츠 무조건 정사각형으로 나오기로 했는데 피시랑 폰 모두 수정") — 녹화도 정사각 틀이다(scplay recSq9). PC 는 창 가운데 큰 정사각에 머리 · 단추를 얹고,
     폰은 폭을 다 쓰는 정사각에 머리를 위 · 단추 줄을 아래 바깥에(장면을 안 가리게 · global.css .is-phone). 옛(2026-11-19): 폰 9:16 화면 꽉 · PC 4:3. */
  const phone = vw.w < 700 || (typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches);
  const box = ((): { w: number; h: number } => {
    const s0 = phone ? Math.min(vw.w, vw.h - 170) : Math.min(vw.h - 48, 760, vw.w - 48);
    const s1 = Math.max(200, Math.floor(s0));
    return { w: s1, h: s1 };
  })();
  const origin = from ? `${from.left + from.width / 2}px ${from.top + from.height / 2}px` : "50% 50%";
  if (!it) return null;
  const many = items.length > 24;
  const node = (
    <div className={cx("scr-shortv", phone && "is-phone", box.h >= vw.h - 2 && "is-tall")} role="dialog" aria-modal="true" aria-label="쇼츠" style={{ transformOrigin: origin }}>
      <div className="scr-shortv-box" style={{
        width: box.w, height: box.h,
        ...(dragY ? { transform: `translateY(${dragY}px) scale(${Math.max(0.85, 1 - dragY / 1400)})`, opacity: Math.max(0.4, 1 - dragY / 500) } : {}),
      }}>
        <ShortStage key={it.id} item={it} w={box.w} h={box.h} paused={hold || stop} onProgress={setProg} onEnd={next} />
        <div className="scr-shortv-tap" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onContextMenu={(e) => e.preventDefault()} />
        {(hold || stop) && <span className="scr-shortv-paused" aria-hidden><Pause size={30} fill="currentColor" /></span>}
        {/* 판 위 머리 — 진행 막대 · 만든 사람 · 멈춤 · 닫기(릴스 · 스토리처럼 장면 위에 얹는다 · 위 그늘). */}
        <div className="scr-shortv-top">
          <div className="scr-shortv-bars">
            {many ? (
              <i><b style={{ width: `${prog * 100}%` }} /></i>
            ) : items.map((x, i) => (
              <i key={x.id}><b style={{ width: i < idx ? "100%" : i === idx ? `${prog * 100}%` : "0%" }} /></i>
            ))}
          </div>
          <div className="scr-shortv-head">
            <Avatar member={{ id: it.author.memberId, nickname: it.author.nickname, avatar: memberOf(it.author.memberId)?.avatar ?? it.author.avatar ?? null }} size={28} />
            <span className="scr-shortv-who">
              <b>{it.author.nickname}</b>
              <small>{formatAgo(it.createdAt)}{many ? ` · ${idx + 1}/${items.length}` : ""}</small>
            </span>
            {it.fame && <span className="scr-shortv-fame">명예의 전당</span>}
            <button type="button" className="scr-shortv-btn" onClick={() => setStop((v) => !v)} aria-label={stop ? "재생" : "멈춤"} title={stop ? "재생 (스페이스)" : "멈춤 (스페이스)"}>
              {stop ? <Play size={18} aria-hidden /> : <Pause size={18} aria-hidden />}
            </button>
            <button type="button" className="scr-shortv-btn" onClick={onClose} aria-label="닫기" title="닫기 (Esc)">
              <X size={20} aria-hidden />
            </button>
          </div>
        </div>
        {/* 오른쪽 아래 단추 줄(릴스처럼 세로) — 추천(수) · 이 장면부터 게임 보기 · 내 쇼츠 지우기. 미니맵은 왼아래 · 자막은 가운데 아래라 안 겹친다. */}
        <div className="scr-shortv-side">
          <button type="button" className={cx("scr-shortv-act", it.recommended && "is-on")} onClick={recToggle} disabled={recBusy}
            aria-pressed={it.recommended} aria-label={it.recommended ? "추천 취소" : "추천"} title={it.recommended ? "추천 취소" : "추천 — 3개가 모이면 명예의 전당"}>
            <i className="scr-shortv-ico" aria-hidden><ThumbsUp size={22} fill={it.recommended ? "currentColor" : "none"} /></i>
            <span>{it.recommendCount}</span>
          </button>
          <button type="button" className="scr-shortv-act" onClick={goGame} aria-label="이 장면부터 게임 보기" title="이 장면부터 게임 보기">
            <i className="scr-shortv-ico" aria-hidden><ExternalLink size={22} /></i>
            <span>게임</span>
          </button>
          <button type="button" className="scr-shortv-act" onClick={() => { void share(); }} aria-label="쇼츠 공유" title="공유 — 링크를 누르면 게임 화면에서 이 쇼츠가 바로 재생돼요">
            <i className="scr-shortv-ico" aria-hidden><Share2 size={22} /></i>
            <span>공유</span>
          </button>
          {it.mine && (
            <button type="button" className="scr-shortv-act" onClick={() => { void del(); }} aria-label="쇼츠 지우기" title="지우기">
              <i className="scr-shortv-ico" aria-hidden><Trash2 size={22} /></i>
              <span>지우기</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
  return createPortal(node, document.body);
}
