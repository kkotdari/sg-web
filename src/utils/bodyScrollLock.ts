import { useEffect, useRef } from "react";

let lockCount = 0;
const outsideStack: Array<{ onOutside?: () => void }> = [];

const INLINE_ALLOW = ".scr-modal, .scr-photo-overlay, .scr-drawer, .scr-inapp-notice, .scr-model-zoom-pop";

function isShieldedTarget(t: EventTarget | null): boolean {
  const el = t instanceof Element ? t : null;
  if (!el) return false;
  return !!el.closest(".scr-app") && !el.closest(INLINE_ALLOW);
}

function canScrollWithin(start: Element): boolean {
  for (let n: Element | null = start; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    if (n.scrollHeight > n.clientHeight + 1) {
      const oy = getComputedStyle(n).overflowY;
      if (oy === "auto" || oy === "scroll") return true;
    }
  }
  return false;
}

function isEditableTarget(el: Element): boolean {
  return !!el.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])");
}

function onScrollIntent(e: Event) {
  const el = e.target instanceof Element ? e.target : null;
  if (!el) return;
  if (e.type === "touchmove" && isEditableTarget(el)) return;
  if (isShieldedTarget(el)) { e.preventDefault(); return; }
  if (!canScrollWithin(el)) e.preventDefault();
}
export function swallowNextClick(): void {
  const swallow = (e: Event) => { e.preventDefault(); e.stopPropagation(); cleanup(); };
  const cleanup = () => { document.removeEventListener("click", swallow, true); window.clearTimeout(timer); };
  document.addEventListener("click", swallow, true);
  const timer = window.setTimeout(cleanup, 600);
}
function onTouchStart(e: Event) {
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

export function isBodyScrollLocked(): boolean {
  return lockCount > 0;
}

export function useLockBodyScroll(active = true, onOutside?: () => void): void {
  const cbRef = useRef(onOutside);
  cbRef.current = onOutside;
  useEffect(() => {
    if (!active) return;
    return lockBodyScroll(() => cbRef.current?.());
  }, [active]);
}
