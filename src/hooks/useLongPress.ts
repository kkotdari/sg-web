import { useRef, type PointerEvent, type MouseEvent } from "react";

const HOLD_MS = 450;
const SLOP_PX = 8;

/** ★ 길게 누른 뒤 손을 떼며 나는 click 은 **어느 요소에서 나든** 한 번 삼킨다(2026-10-13, 지적: "비밀 게임 길게 누르면 위의 게임이 선택되는 문제") —
 *  길게 누르면 선택 모드로 들어가며 위 선택 막대 높이가 바뀌어 목록이 밀린다. 손을 뗄 때 손가락 밑은 이미 **다른 줄**이라 그 줄의 click 이 '고르기'가 됐다
 *  (아래 onClickCapture 는 길게 누른 그 단추에만 걸려 못 막았다). 창(capture)에 한 번 걸고, 손을 뗀 뒤 click 이 안 오면(움직여 취소 등) 곧 걷는다. */
function swallowNextClick(): void {
  const eat = (e: Event): void => { e.preventDefault(); e.stopPropagation(); done(); };
  const lift = (): void => { window.setTimeout(done, 350); };
  const done = (): void => {
    window.removeEventListener("click", eat, true);
    window.removeEventListener("pointerup", lift, true);
    window.removeEventListener("pointercancel", lift, true);
  };
  window.addEventListener("click", eat, true);
  window.addEventListener("pointerup", lift, true);
  window.addEventListener("pointercancel", lift, true);
}

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
        swallowNextClick();
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
