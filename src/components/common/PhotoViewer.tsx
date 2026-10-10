import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useLockBodyScroll } from "../../utils/bodyScrollLock";
import { imgSrc } from "../../utils/imgSrc";

interface PhotoViewerProps {
  src: string;
  alt: string;
  onClose: () => void;
}

type Pt = { x: number; y: number };
type Zoom = { s: number; tx: number; ty: number };

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const TAP_ZOOM = 2.5;
const TAP_MS = 300;
const TAP_SLOP = 24;
const DRAG_SLOP = 8;
const SETTLE_MS = 200;
const HOME: Zoom = { s: 1, tx: 0, ty: 0 };

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const dist = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

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

export default function PhotoViewer({ src, alt, onClose }: PhotoViewerProps) {
  useLockBodyScroll();
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const z = useRef<Zoom>(HOME);
  const base = useRef({ w: 0, h: 0 });
  const baked = useRef(1);
  const bakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointers = useRef(new Map<number, Pt>());
  const pinch = useRef<{ d: number; m: Pt } | null>(null);
  const lastTap = useRef<{ t: number; p: Pt } | null>(null);
  const origin = useRef<Pt>({ x: 0, y: 0 });
  const moved = useRef(false);

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
    const frame = frameRef.current;
    if (frame) {
      if (s > 1) frame.dataset.zoomed = "1";
      else delete frame.dataset.zoomed;
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
      img.style.width = ""; img.style.height = ""; img.style.maxWidth = ""; img.style.maxHeight = "";
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
    window.addEventListener("resize", reset);
    return () => { window.removeEventListener("resize", reset); unbake(); };
  }, [src]);

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
  }, []);

  const pair = (): [Pt, Pt] | null => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? [a, b] : null;
  };
  const beginPinch = (): void => {
    const ab = pair();
    pinch.current = ab ? { d: dist(ab[0], ab[1]), m: mid(ab[0], ab[1]) } : null;
    moved.current = true;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if ((e.target as Element).closest(".scr-photo-close")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    unbake();
    if (base.current.w === 0) measure();
    const p = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) { origin.current = p; moved.current = false; } else beginPinch();
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

  return createPortal(
    <div className="scr-photo-overlay">
      <div
        className="scr-photo-frame" ref={frameRef}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onPointerCancel={(e) => { moved.current = true; onPointerUp(e); }}
      >
        <button
          type="button" className="scr-icon-btn scr-photo-close"
          onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="닫기"
        >
          <X size={16} />
        </button>
        <img src={imgSrc(src)} alt={alt} className="scr-photo-large" ref={imgRef} draggable={false} onLoad={measure} />
      </div>
    </div>,
    document.body,
  );
}
