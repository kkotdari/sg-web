import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useLockBodyScroll } from "../../utils/bodyScrollLock";
import { cx } from "../../utils/format";
import { imgSrc } from "../../utils/imgSrc";

interface PhotoViewerProps {
  src: string;
  alt: string;
  onClose: () => void;
  video?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  counter?: string;
  extra?: ReactNode;
  /** 썸네일 — 비율을 먼저 알아 창이 처음부터 제 크기로 선다(원본이 오는 동안 깔린다). */
  thumb?: string;
  /** 커지며 열리고 줄며 닫히는 자리(누른 칸) — 없으면 방금 누른 요소. */
  from?: () => DOMRect | null;
}

/* ★ 크게 보기는 이 한 꼴이다(2026-10-23, 요청: 일정 사진 "누르면 해당 위치에서 확대창이 뜨는데 닫기 버튼 등 모든 버튼과 인덱스랑 좌우 이동은
   사진 밖 아래에 사진 가리지 않음 · 동영상도 원래 비율대로 처음부터 창이 뜨고 버튼은 마찬가지 · 자동 반복 재생" · 같은 날 "불필요한 영역까지 패널 처리
   안 하기" · "다른 사진 확대창도 같은 거 쓰자 기존 거 없애고") — 판(흐린 바탕)이 그림과 그 밑 단추 줄(가운데 앞뒤 · n/n · 오른쪽 extra · 닫기)만
   감싸고, 나머지 화면은 덮지 않는다(판 밖을 누르면 닫힌다). 창은 비율(썸네일 → 원본)을 안 뒤에 제 크기로 서고, 누른 자리에서 커지며 열리고 그 자리로
   줄며 닫힌다. 동영상은 반복 재생. 옛 꼴(그림 위 닫기 · 화면 양옆 넘김 · 아래 n/n)은 걷었다. */

/** 방금 누른 요소 — from 이 없을 때 커지는 자리(회원 사진 등 · 여는 쪽이 자리를 넘기지 않아도 된다). */
let lastPress: { el: Element; t: number } | null = null;
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (t && !t.closest(".scr-pv")) lastPress = { el: t.closest("button, a, img, [role=button]") ?? t, t: performance.now() };
  }, true);
}
const PRESS_FRESH_MS = 1500;

type Pt = { x: number; y: number };
type Zoom = { s: number; tx: number; ty: number };

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const TAP_ZOOM = 2.5;
const TAP_MS = 300;
const TAP_SLOP = 24;
const DRAG_SLOP = 8;
const SETTLE_MS = 200;
const SWIPE_PX = 60;
const HOME: Zoom = { s: 1, tx: 0, ty: 0 };

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const dist = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const GROW_MS = 240;
const SHRINK_MS = 200;
type Box = { x: number; y: number; w: number; h: number };
/** 칸(r) 안에 비율 a 로 맞춘(contain) 그림 자리 — 칸이 화면 밖이면 null(커지기 없이 연다). */
function fitIn(r: DOMRect, a: number): Box | null {
  if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return null;
  const w = Math.min(r.width, r.height * a);
  const h = w / a;
  return { x: r.left + (r.width - w) / 2, y: r.top + (r.height - h) / 2, w, h };
}
/** 지금 그림 자리(to)에서 칸 자리(b)로 옮기는 변환. */
function toward(to: DOMRect, b: Box): string {
  const k = b.w / Math.max(1, to.width);
  const dx = b.x + b.w / 2 - (to.left + to.width / 2);
  const dy = b.y + b.h / 2 - (to.top + to.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${k})`;
}

function centreOf(img: HTMLImageElement, z: Zoom): Pt {
  const r = img.getBoundingClientRect();
  return { x: r.left + r.width / 2 - z.tx, y: r.top + r.height / 2 - z.ty };
}
function axis(size: number, limit: number, c: number, t: number, settle: boolean): number {
  if (settle && size <= limit) return 0;
  const a = size / 2 - c;
  const b = limit - c - size / 2;
  return clamp(t, Math.min(a, b), Math.max(a, b));
}
function confine(base: { w: number; h: number }, c: Pt, z: Zoom, settle: boolean): Zoom {
  return {
    s: z.s,
    tx: axis(base.w * z.s, window.innerWidth, c.x, z.tx, settle),
    ty: axis(base.h * z.s, window.innerHeight, c.y, z.ty, settle),
  };
}
function zoomAt(c: Pt, z: Zoom, p: Pt, next: number): Zoom {
  if (next <= MIN_SCALE) return HOME;
  const k = next / z.s;
  return { s: next, tx: p.x - c.x - k * (p.x - c.x - z.tx), ty: p.y - c.y - k * (p.y - c.y - z.ty) };
}

export default function PhotoViewer({ src, alt, onClose, video, onPrev, onNext, counter, extra, thumb, from }: PhotoViewerProps) {
  useLockBodyScroll();
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  /* 창 크기 — 비율(aspect)을 알면 화면에 맞춘 크기(fit). 원본 크기(natural)를 알면 그보다 키우지 않는다. */
  const aspect = useRef<number | null>(null);
  const natural = useRef<{ w: number; h: number } | null>(null);
  const [fit, setFit] = useState<{ w: number; h: number } | null>(null);
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const grown = useRef(false);
  const [closing, setClosing] = useState(false);
  const pressed = useRef<Element | null>(null);
  if (pressed.current === null) {
    const lp = lastPress;
    pressed.current = lp && performance.now() - lp.t < PRESS_FRESH_MS ? lp.el : document.body;
  }
  const fromRef = useRef(from);
  fromRef.current = from ?? (() => {
    const el = pressed.current;
    return el && el !== document.body && el.isConnected ? el.getBoundingClientRect() : null;
  });
  const z = useRef<Zoom>(HOME);
  const base = useRef({ w: 0, h: 0 });
  const baked = useRef(1);
  const bakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointers = useRef(new Map<number, Pt>());
  const pinch = useRef<{ d: number; m: Pt } | null>(null);
  const lastTap = useRef<{ t: number; p: Pt } | null>(null);
  const origin = useRef<Pt>({ x: 0, y: 0 });
  const moved = useRef(false);
  const multi = useRef(false);
  const nav = useRef({ onPrev, onNext });
  nav.current = { onPrev, onNext };

  const refit = (): void => {
    const a = aspect.current;
    const st = stageRef.current;
    const card = cardRef.current;
    if (!a || !st || !card) return;
    // 판(card)은 그림 + 단추 줄만 감싼다 — 그림 자리 = 화면(여백 뺀) − 판 안쪽 여백 − 단추 줄 − 그 사이.
    const px = (v: string): number => parseFloat(v) || 0;
    const cs = getComputedStyle(st);
    const cc = getComputedStyle(card);
    const W = st.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight) - px(cc.paddingLeft) - px(cc.paddingRight);
    const H = st.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom) - px(cc.paddingTop) - px(cc.paddingBottom)
      - (barRef.current?.offsetHeight ?? 0) - px(cc.rowGap);
    let w = Math.min(W, H * a);
    if (natural.current) w = Math.min(w, natural.current.w);
    w = Math.max(1, Math.floor(w));
    setFit({ w, h: Math.round(w / a) });
  };
  const learn = (w: number, h: number, real: boolean): void => {
    if (!(w > 0 && h > 0)) return;
    if (!real && aspect.current) return;
    if (real) natural.current = { w, h };
    aspect.current = w / h;
    refit();
  };
  const media = (): HTMLElement | null => imgRef.current ?? videoRef.current;
  const close = (): void => {
    const el = media();
    const a = aspect.current;
    const b = a ? fromRef.current?.() : null;
    const dst = b && a ? fitIn(b, a) : null;
    if (closing || !el || !dst || z.current.s !== 1) { onClose(); return; }
    setClosing(true);
    const anim = el.animate([{ transform: "none" }, { transform: toward(el.getBoundingClientRect(), dst) }], {
      duration: SHRINK_MS, easing: "cubic-bezier(.4,0,.8,.4)", fill: "forwards",
    });
    anim.onfinish = () => onClose();
    anim.oncancel = () => onClose();
  };

  const measure = (): void => {
    const img = imgRef.current;
    if (img && baked.current === 1) base.current = { w: img.clientWidth, h: img.clientHeight };
  };
  const paint = (animate: boolean): void => {
    const img = imgRef.current;
    if (!img) return;
    const { s, tx, ty } = z.current;
    const k = s / baked.current;
    img.style.transition = animate ? `transform ${SETTLE_MS}ms ease-out` : "none";
    img.style.transform = k === 1 && tx === 0 && ty === 0 ? "" : `translate(${tx}px, ${ty}px) scale(${k})`;
    img.style.cursor = s > 1 ? "grab" : "zoom-in";
    // 키운 동안은 끌어 닫기(useModalDragDismiss)가 손을 뗀다 — 그 훅은 판(card)과 그림 틀(frame)을 본다.
    for (const el of [frameRef.current, cardRef.current]) {
      if (!el) continue;
      if (s > 1) el.dataset.zoomed = "1";
      else delete el.dataset.zoomed;
    }
  };
  const unbake = (): void => {
    if (bakeTimer.current) { clearTimeout(bakeTimer.current); bakeTimer.current = null; }
  };
  const bake = (): void => {
    unbake();
    const img = imgRef.current;
    const frame = frameRef.current;
    if (!img || !frame) return;
    const { s } = z.current;
    if (s === 1) {
      const f = fitRef.current;
      img.style.width = f ? `${f.w}px` : ""; img.style.height = f ? `${f.h}px` : "";
      img.style.maxWidth = ""; img.style.maxHeight = "";
      frame.style.width = ""; frame.style.height = "";
      baked.current = 1;
      measure();
    } else {
      if (!frame.style.height) { frame.style.width = `${frame.offsetWidth}px`; frame.style.height = `${frame.offsetHeight}px`; }
      img.style.maxWidth = "none"; img.style.maxHeight = "none";
      img.style.width = `${base.current.w * s}px`; img.style.height = `${base.current.h * s}px`;
      baked.current = s;
    }
    paint(false);
  };
  const bakeLater = (ms: number): void => {
    unbake();
    bakeTimer.current = setTimeout(bake, ms);
  };
  const reset = (): void => { z.current = HOME; bake(); };

  useEffect(() => {
    reset();
    // 장이 바뀌면 비율을 새로 안다(썸네일이 먼저 · 대개 캐시에 있다). 처음 열 때는 알 때까지 판을 숨기고,
    // 넘길 때는 앞 장의 크기를 잠깐 쓴다(판이 깜빡이지 않게).
    aspect.current = null;
    natural.current = null;
    let live = true;
    if (thumb) {
      const probe = new Image();
      probe.onload = () => { if (live) learn(probe.naturalWidth, probe.naturalHeight, false); };
      probe.src = imgSrc(thumb);
    }
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth) learn(img.naturalWidth, img.naturalHeight, true);
    const onResize = (): void => { z.current = HOME; refit(); };
    window.addEventListener("resize", onResize);
    return () => { live = false; window.removeEventListener("resize", onResize); unbake(); };
  }, [src]);

  /* 창 크기가 서면 그 크기로 굽고, 처음 열 때 한 번 누른 칸에서 커진다(앞뒤로 넘길 때는 그냥 바꾼다). */
  useLayoutEffect(() => {
    if (!fit) return;
    reset();
    if (grown.current) return;
    grown.current = true;
    const el = media();
    const a = aspect.current;
    const b = a ? fromRef.current?.() : null;
    const src0 = b && a ? fitIn(b, a) : null;
    if (!el || !src0) return;
    el.animate([{ transform: toward(el.getBoundingClientRect(), src0) }, { transform: "none" }], {
      duration: GROW_MS, easing: "cubic-bezier(.2,.8,.2,1)",
    });
  }, [fit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "ArrowLeft" && nav.current.onPrev) { e.preventDefault(); nav.current.onPrev(); }
      else if (e.key === "ArrowRight" && nav.current.onNext) { e.preventDefault(); nav.current.onNext(); }
      else if (e.key === "Escape") { e.preventDefault(); closeRef.current(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const el = frameRef.current;
    const img = imgRef.current;
    if (!el || !img) return undefined;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      if (base.current.w === 0) measure();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const next = clamp(z.current.s * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0025)), MIN_SCALE, MAX_SCALE);
      const c = centreOf(img, z.current);
      z.current = confine(base.current, c, zoomAt(c, z.current, { x: e.clientX, y: e.clientY }, next), false);
      paint(false);
      bakeLater(160);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [video]);

  const closeRef = useRef(close);
  closeRef.current = close;

  const pair = (): [Pt, Pt] | null => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? [a, b] : null;
  };
  const beginPinch = (): void => {
    const ab = pair();
    pinch.current = ab ? { d: dist(ab[0], ab[1]), m: mid(ab[0], ab[1]) } : null;
    moved.current = true;
    multi.current = true;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if ((e.target as Element).closest("video")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    unbake();
    if (base.current.w === 0) measure();
    const p = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) { origin.current = p; moved.current = false; multi.current = false; } else beginPinch();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const img = imgRef.current;
    const prev = pointers.current.get(e.pointerId);
    if (!img || !prev) return;
    const p = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, p);
    if (dist(p, origin.current) > DRAG_SLOP) moved.current = true;
    const ab = pair();
    if (ab && pinch.current) {
      const d = dist(ab[0], ab[1]);
      const m = mid(ab[0], ab[1]);
      const was = pinch.current;
      const c = centreOf(img, z.current);
      const zz = zoomAt(c, z.current, was.m, clamp(z.current.s * (was.d > 0 ? d / was.d : 1), MIN_SCALE, MAX_SCALE));
      z.current = { s: zz.s, tx: zz.tx + (m.x - was.m.x), ty: zz.ty + (m.y - was.m.y) };
      pinch.current = { d, m };
      paint(false);
    } else if (pointers.current.size === 1 && z.current.s > 1) {
      const c = centreOf(img, z.current);
      z.current = confine(base.current, c, { s: z.current.s, tx: z.current.tx + (p.x - prev.x), ty: z.current.ty + (p.y - prev.y) }, false);
      paint(false);
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    const img = imgRef.current;
    if (!pointers.current.delete(e.pointerId) || !img) return;
    if (pointers.current.size >= 2) { beginPinch(); return; }
    pinch.current = null;
    if (pointers.current.size > 0) return;
    const p = { x: e.clientX, y: e.clientY };
    const dx = p.x - origin.current.x;
    const dy = p.y - origin.current.y;
    if (!multi.current && z.current.s <= 1 && Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const go = dx < 0 ? nav.current.onNext : nav.current.onPrev;
      if (go) { lastTap.current = null; z.current = HOME; paint(false); go(); return; }
    }
    const now = Date.now();
    const tap = lastTap.current;
    const c = centreOf(img, z.current);
    if (!moved.current && tap && now - tap.t < TAP_MS && dist(p, tap.p) < TAP_SLOP) {
      lastTap.current = null;
      z.current = z.current.s > 1 ? HOME : confine(base.current, c, zoomAt(c, HOME, p, TAP_ZOOM), false);
    } else {
      lastTap.current = moved.current ? null : { t: now, p };
      z.current = z.current.s < 1.05 ? HOME : confine(base.current, c, z.current, true);
    }
    paint(true);
    bakeLater(SETTLE_MS + 20);
  };

  const hide = fit ? undefined : "hidden" as const;
  return createPortal(
    <div className={cx("scr-pv", closing && "is-closing")} ref={stageRef} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="scr-pv-card" ref={cardRef} style={{ visibility: hide }}>
        <div
          className="scr-pv-frame" ref={frameRef}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          onPointerCancel={(e) => { moved.current = true; onPointerUp(e); }}
        >
          {video ? (
            <video
              key={src} ref={videoRef} src={imgSrc(src)} poster={thumb ? imgSrc(thumb) : undefined}
              className="scr-pv-media scr-pv-video" style={{ width: fit?.w, height: fit?.h }}
              controls autoPlay loop playsInline
              onLoadedMetadata={(e) => learn(e.currentTarget.videoWidth, e.currentTarget.videoHeight, true)}
            />
          ) : (
            <img
              src={imgSrc(src)} alt={alt} className="scr-pv-media" ref={imgRef} draggable={false}
              /* 원본이 오는 동안 썸네일을 깐다 — 창은 이미 제 크기다. */
              style={{ backgroundImage: thumb ? `url("${imgSrc(thumb)}")` : undefined }}
              onLoad={(e) => learn(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight, true)}
            />
          )}
        </div>
        <div className="scr-pv-bar" ref={barRef}>
          <span className="scr-pv-navs">
            {(onPrev || onNext) && (
              <>
                <button type="button" className="scr-sb-slide-nav" aria-label="이전" disabled={!onPrev} onClick={() => onPrev?.()}>
                  <ChevronLeft size={16} />
                </button>
                {counter && <span className="scr-sb-slide-count" aria-live="polite">{counter}</span>}
                <button type="button" className="scr-sb-slide-nav" aria-label="다음" disabled={!onNext} onClick={() => onNext?.()}>
                  <ChevronRight size={16} />
                </button>
              </>
            )}
          </span>
          <span className="scr-pv-tools">
            {extra}
            <button type="button" className="scr-icon-btn scr-photo-close" onClick={close} aria-label="닫기">
              <X size={16} />
            </button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
