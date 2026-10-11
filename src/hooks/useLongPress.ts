import { useRef, type PointerEvent, type MouseEvent } from "react";

const HOLD_MS = 450;
const SLOP_PX = 8;

/** 길게 누르기(폰 선택 모드) — 손가락을 HOLD_MS 동안 SLOP_PX 안에 두면 onLong 을 부르고, 그 뒤 따라오는 click 은 삼킨다.
 *  onLong 이 없으면 아무 손잡이도 안 붙인다(PC). */
export function useLongPress(onLong: (() => void) | undefined) {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  if (!onLong) return {};
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return;
      fired.current = false;
      stop();
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        timer.current = null;
        fired.current = true;
        navigator.vibrate?.(10);
        onLong();
      }, HOLD_MS);
    },
    onPointerMove: (e: PointerEvent) => {
      const s0 = start.current;
      if (s0 && Math.hypot(e.clientX - s0.x, e.clientY - s0.y) > SLOP_PX) stop();
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onPointerLeave: stop,
    onContextMenu: (e: MouseEvent) => { if (fired.current || timer.current !== null) e.preventDefault(); },
    onClickCapture: (e: MouseEvent) => {
      if (!fired.current) return;
      fired.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}
