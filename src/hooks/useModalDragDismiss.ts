import { useEffect } from "react";

const SHEET_SELECTOR = ".scr-modal, .scr-rivalry-overlay-body, .scr-photo-frame";
const OVERLAY_SELECTOR = ".scr-modal-overlay, .scr-rivalry-overlay, .scr-photo-overlay";
const DAMP = 0.85;
const CLOSE_THRESHOLD = 60;
const DECIDE_AT = 4;
const FLICK_VELOCITY = 0.5;
const FLICK_MIN_SHIFT = 22;

function isEditable(el: Element | null): boolean {
  return !!el?.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])");
}

function isMotionMap(el: Element | null): boolean {
  return !!el?.closest(".scr-motion-map");
}

function isZoomedPhoto(el: Element | null): boolean {
  return el?.closest<HTMLElement>(".scr-photo-frame")?.dataset.zoomed === "1";
}

function findScroller(from: Element | null, stopAt: Element): HTMLElement | null {
  let el: Element | null = from;
  while (el && el !== document.body) {
    if (el instanceof HTMLElement) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === "auto" || oy === "scroll") return el;
    }
    if (el === stopAt) break;
    el = el.parentElement;
  }
  return null;
}

function invokeClose(sheet: HTMLElement) {
  const btn = sheet.querySelector<HTMLElement>('[aria-label="닫기"]');
  if (btn) { btn.click(); return; }
  const overlay = sheet.closest<HTMLElement>(OVERLAY_SELECTOR);
  if (overlay) overlay.click();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

function snapBack(s: HTMLElement) {
  s.style.transition = "translate .16s cubic-bezier(0.32, 0.72, 0, 1)";
  s.style.translate = "0 0";
  const clear = () => { clearSheetStyles(s); s.removeEventListener("transitionend", clear); };
  s.addEventListener("transitionend", clear);
}

function clearSheetStyles(sheet: HTMLElement) {
  sheet.style.transition = "";
  sheet.style.translate = "";
  sheet.style.willChange = "";
}

export function useModalDragDismiss(): void {
  useEffect(() => {
    let sheet: HTMLElement | null = null;
    let scroller: HTMLElement | null = null;
    let startY = 0;
    let startX = 0;
    let lastY = 0;
    let lastT = 0;
    let velY = 0;
    let startedAtTop = false;
    let sheetShift = 0;
    let mode: "idle" | "undecided" | "drag" | "scroll" = "idle";

    const reset = () => { sheet = null; scroller = null; mode = "idle"; sheetShift = 0; velY = 0; };

    const atTopNow = () => !scroller || scroller.scrollTop <= 0;
    const atBottomNow = () =>
      !scroller || scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        if (mode === "drag" && sheet) snapBack(sheet);
        reset();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (isEditable(target) || isMotionMap(target) || isZoomedPhoto(target)) { mode = "idle"; return; }
      const s = target?.closest<HTMLElement>(SHEET_SELECTOR) ?? null;
      if (!s) { mode = "idle"; return; }
      sheet = s;
      scroller = findScroller(target, s);
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      lastY = startY;
      lastT = e.timeStamp;
      velY = 0;
      startedAtTop = atTopNow();
      sheetShift = 0;
      mode = "undecided";
    };

    const onMove = (e: TouchEvent) => {
      if (mode === "idle" || !sheet) return;
      const y = e.touches[0].clientY;
      const dy = y - startY;
      const dx = e.touches[0].clientX - startX;
      const frameDy = y - lastY;
      lastY = y;
      const dt = e.timeStamp - lastT;
      if (dt > 0 && frameDy !== 0) velY = 0.6 * velY + 0.4 * (frameDy / dt);
      lastT = e.timeStamp;

      if (mode !== "scroll" && sheet.dataset.zoomed === "1") {
        if (mode === "drag") snapBack(sheet);
        mode = "scroll";
        return;
      }

      if (mode === "drag") {
        e.preventDefault();
        sheetShift = Math.max(0, dy) * DAMP;
        sheet.style.translate = `0 ${sheetShift}px`;
        return;
      }

      if (mode === "undecided") {
        if (Math.abs(dy) < DECIDE_AT && Math.abs(dx) < DECIDE_AT) return;
        if (startedAtTop && dy > 0 && Math.abs(dy) >= Math.abs(dx)) {
          mode = "drag";
          sheet.style.transition = "none";
          sheet.style.willChange = "translate";
          e.preventDefault();
          sheetShift = dy * DAMP;
          sheet.style.translate = `0 ${sheetShift}px`;
          return;
        }
        mode = "scroll";
      }

      if ((atTopNow() && frameDy > 0) || (atBottomNow() && frameDy < 0)) {
        e.preventDefault();
      }
    };

    const onEnd = () => {
      if (mode === "drag" && sheet) {
        const s = sheet;
        const flicked = velY >= FLICK_VELOCITY && sheetShift >= FLICK_MIN_SHIFT;
        if (sheetShift >= CLOSE_THRESHOLD || flicked) {
          s.style.transition = "translate .24s cubic-bezier(0.45, 0, 1, 1)";
          s.style.translate = "0 calc(50vh + 60%)";
          let done = false;
          const finish = (ev?: TransitionEvent) => {
            if (ev && (ev.target !== s || ev.propertyName !== "translate")) return;
            if (done) return;
            done = true;
            s.removeEventListener("transitionend", finish as EventListener);
            invokeClose(s);
          };
          s.addEventListener("transitionend", finish as EventListener);
          window.setTimeout(() => finish(), 320);
        } else {
          snapBack(s);
        }
      }
      reset();
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, []);
}
