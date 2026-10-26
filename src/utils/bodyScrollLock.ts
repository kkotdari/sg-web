import { useEffect, useRef } from "react";

let lockCount = 0;
const outsideStack: Array<{ onOutside?: () => void }> = [];

const INLINE_ALLOW = ".scr-modal, .scr-pv, .scr-drawer, .scr-inapp-notice, .scr-model-zoom-pop";

function isShieldedTarget(t: EventTarget | null): boolean {
  const el = t instanceof Element ? t : null;
  if (!el) return false;
  return !!el.closest(".scr-app") && !el.closest(INLINE_ALLOW);
}

/* 그 방향으로 밀 수 있는 조상이 있나 — 가로도 본다(2026-10-21, 지적: "횡스크롤만 안돼" · 원인: 세로만 보던 탓에 창 몸이 세로로 넘치지 않으면
   가로 스크롤(폰 게임 데이터 창)까지 touchmove 를 막았다). 방향은 손가락이 처음 움직인 쪽(터치) · 휠 값(휠). */
function canScrollWithin(start: Element, axis: "x" | "y"): boolean {
  for (let n: Element | null = start; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    const ov = axis === "y" ? cs.overflowY : cs.overflowX;
    const room = axis === "y" ? n.scrollHeight > n.clientHeight + 1 : n.scrollWidth > n.clientWidth + 1;
    if (room && (ov === "auto" || ov === "scroll")) return true;
  }
  return false;
}

let touchStartXY: { x: number; y: number } | null = null;
function axisOf(e: Event): "x" | "y" {
  if (e instanceof WheelEvent) return Math.abs(e.deltaX) > Math.abs(e.deltaY) ? "x" : "y";
  const t = e instanceof TouchEvent ? e.touches[0] : undefined;
  if (!t || !touchStartXY) return "y";
  return Math.abs(t.clientX - touchStartXY.x) > Math.abs(t.clientY - touchStartXY.y) ? "x" : "y";
}

function isEditableTarget(el: Element): boolean {
  return !!el.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])");
}

function onScrollIntent(e: Event) {
  const el = e.target instanceof Element ? e.target : null;
  if (!el) return;
  if (e.type === "touchmove" && isEditableTarget(el)) return;
  if (isShieldedTarget(el)) { e.preventDefault(); return; }
  if (!canScrollWithin(el, axisOf(e))) e.preventDefault();
}
export function swallowNextClick(): void {
  const swallow = (e: Event) => { e.preventDefault(); e.stopPropagation(); cleanup(); };
  const cleanup = () => { document.removeEventListener("click", swallow, true); window.clearTimeout(timer); };
  document.addEventListener("click", swallow, true);
  const timer = window.setTimeout(cleanup, 600);
}
function onTouchStart(e: Event) {
  const t = e instanceof TouchEvent ? e.touches[0] : undefined;
  touchStartXY = t ? { x: t.clientX, y: t.clientY } : null;
  if (isShieldedTarget(e.target)) e.preventDefault();
}
function onPointerDown(e: Event) {
  if (!isShieldedTarget(e.target)) return;
  e.preventDefault();
  e.stopPropagation();
  swallowNextClick();
  outsideStack[outsideStack.length - 1]?.onOutside?.();
}
function onClick(e: Event) {
  if (!isShieldedTarget(e.target)) return;
  e.preventDefault();
  e.stopPropagation();
}

function lockBodyScroll(onOutside?: () => void): () => void {
  if (lockCount === 0) {
    document.body.classList.add("scr-modal-open");
    document.addEventListener("touchmove", onScrollIntent, { passive: false, capture: true });
    document.addEventListener("wheel", onScrollIntent, { passive: false, capture: true });
    document.addEventListener("touchstart", onTouchStart, { passive: false, capture: true });
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick, true);
  }
  lockCount++;
  const entry = { onOutside };
  outsideStack.push(entry);
  return () => {
    const i = outsideStack.indexOf(entry);
    if (i >= 0) outsideStack.splice(i, 1);
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.body.classList.remove("scr-modal-open");
      document.removeEventListener("touchmove", onScrollIntent, { capture: true } as EventListenerOptions);
      document.removeEventListener("wheel", onScrollIntent, { capture: true } as EventListenerOptions);
      document.removeEventListener("touchstart", onTouchStart, { capture: true } as EventListenerOptions);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick, true);
    }
  };
}

export function useLockBodyScroll(active = true, onOutside?: () => void): void {
  const cbRef = useRef(onOutside);
  cbRef.current = onOutside;
  useEffect(() => {
    if (!active) return;
    return lockBodyScroll(() => cbRef.current?.());
  }, [active]);
}
