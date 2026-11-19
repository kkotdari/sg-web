import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Pause, Play, ThumbsUp, Trash2, X } from "lucide-react";
import { ReplayModule, useReplayMap, type MotionBase, type ShortClip9 } from "scplay";
import { api, type GameShort } from "../../../api/client";
import Avatar from "../../../components/common/Avatar";
import { LoadingMark } from "../../../components/common/Feedback";
import { showToast } from "../../../components/common/Toast";
import { useAppStore } from "../../../store/appStore";
import { formatAgo } from "../../../utils/date";
import { gamePath, navigateTo } from "../../../utils/route";
import { cx } from "../../../utils/format";
import { isMeleeGame, resolveSlotName } from "../GameResultSides";
import { SHORTS_CHANGED } from "./shortsBus";
import type { GameResult } from "../../../types";

/* ★ 쇼츠 보기(2026-11-19, 요청: "가운데 큰 재생버튼으로 보기누르면 확대되어 보이기(인스타 스토리처럼) · 끝나면 다음 쇼츠로 · 좌우 탭 이전/다음 · 아래로 쓸면 닫기 ·
   로딩이 오래걸리면 안되서 해당 장면에서 필요한 모델만 로딩") — 화면 위 판(body 포털) · 위에 진행 막대(쇼츠마다 한 칸) · 머리(만든 사람 · 언제 · 게임 보기 · 지우기 · 닫기) ·
   가운데 정사각 무대(재생기 쇼츠 재생 모드 — scplay `short` prop: 장면 + 미니맵만 · 녹화된 카메라 · 자막 연출 · 그 구간 모델만 데움).
   누름: 왼쪽 3할 = 이전 · 나머지 = 다음 · 누르고 있으면 멈춤 · 아래로 쓸면 닫기 · 키 ← → 넘기기 · 스페이스 멈춤 · Esc 닫기.
   재생기는 쇼츠마다 새로 선다(key) — 받는 동안은 표지를 깔고 그 위에 로딩. 못 받으면 3초 뒤 다음으로. */

const TAP_MS = 260;

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
        const one = item.clip ? item : await api.getShort(item.id);
        const game = await api.getGameResult(item.gameResultId);
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
    () => (game ? api.getGameUnitTracks(game.id).catch(() => ({ motion: null })) : Promise.resolve({ motion: null })),
    [game],
  );
  return (
    <div className="scr-shortv-stage" style={{ width: w, height: h }}>
      {!ready && item.coverUrl && <img className="scr-shortv-cover" src={item.coverUrl} alt="" draggable={false} />}
      {!ready && !err && <div className="scr-shortv-wait"><LoadingMark /></div>}
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
    api.recommendShort(id, !before.recommended)
      .then((r) => {
        onPatch?.(id, { recommendCount: r.recommendCount, recommended: r.recommended, fame: r.recommendCount >= 3 });
        if (r.recommendCount >= 3 && before.recommendCount < 3) { showToast("명예의 전당에 들어갔어요"); window.dispatchEvent(new CustomEvent(SHORTS_CHANGED)); }
        else if (r.recommendCount < 3 && before.recommendCount >= 3) window.dispatchEvent(new CustomEvent(SHORTS_CHANGED));
      })
      .catch((e) => { onPatch?.(id, before); showToast(e instanceof Error ? e.message : "추천하지 못했어요", { kind: "warn" }); })
      .finally(() => setRecBusy(false));
  };
  const goGame = (): void => {
    if (!it) return;
    onClose();
    navigateTo(gamePath(it.matchNo || String(it.gameResultId)), { search: `t=${Math.floor(it.t0)}` });
  };
  /* ★ 판 비율(2026-11-19, 요청: "쇼츠 비율 모바일은 세로로 길게 2:3이나 9:16? 피시는 가로 4:3") — 폰(좁은 화면 · 손가락) 9:16 세로로 화면을 꽉(머리줄 · 단추는 판 위에 얹는다 ·
     릴스처럼) · PC 4:3 가로로 창 가운데. 재생기는 받은 가로 × 세로를 그대로 채운다(scplay shortBox9). */
  const phone = vw.w < 700 || (typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches);
  const box = ((): { w: number; h: number } => {
    if (phone) {
      const w0 = Math.min(vw.w, Math.floor((vw.h * 9) / 16));
      return { w: w0, h: Math.floor((w0 * 16) / 9) };
    }
    let h0 = Math.min(vw.h - 48, 760);
    let w0 = Math.floor((h0 * 4) / 3);
    if (w0 > vw.w - 48) { w0 = vw.w - 48; h0 = Math.floor((w0 * 3) / 4); }
    return { w: Math.max(240, w0), h: Math.max(180, h0) };
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
            <ThumbsUp size={22} fill={it.recommended ? "currentColor" : "none"} aria-hidden />
            <span>{it.recommendCount}</span>
          </button>
          <button type="button" className="scr-shortv-act" onClick={goGame} aria-label="이 장면부터 게임 보기" title="이 장면부터 게임 보기">
            <ExternalLink size={22} aria-hidden />
            <span>게임</span>
          </button>
          {it.mine && (
            <button type="button" className="scr-shortv-act" onClick={() => { void del(); }} aria-label="쇼츠 지우기" title="지우기">
              <Trash2 size={22} aria-hidden />
              <span>지우기</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
  return createPortal(node, document.body);
}
