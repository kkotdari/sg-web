import { useEffect, useRef, useState } from "react";

const RAIL_INTRO_MS = 2600;
const RAIL_LINGER_MS = 320;
/* 가장자리 띠에 **머문 뒤**에만 연다(2026-10-09, 지적: "다른 버튼 누르려다가 자꾸 나옴") — 띠 폭도 16 → 6 으로 줄였다(global.css
   .scr-rail-hotzone). 스쳐 지나가는 포인터는 이 시간 안에 띠를 떠나므로 안 열린다. 누르면(onClick) 바로 연다. */
const RAIL_OPEN_DELAY_MS = 140;

export function useRail(): { railOpen: boolean; railEnter: () => void; railEnterSoon: () => void; railLeave: () => void } {
  const [railOpen, setRailOpen] = useState(true);
  const railPinned = useRef(false);
  const railTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearOpenTimer = (): void => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
  };
  const railShow = (): void => {
    if (railTimer.current) { clearTimeout(railTimer.current); railTimer.current = null; }
    setRailOpen(true);
  };
  const railHideSoon = (ms = RAIL_LINGER_MS): void => {
    if (railTimer.current) clearTimeout(railTimer.current);
    railTimer.current = setTimeout(() => {
      railTimer.current = null;
      if (!railPinned.current && !document.querySelector(".scr-menu-pop-drop")) setRailOpen(false);
    }, ms);
  };
  const railEnter = (): void => { clearOpenTimer(); railPinned.current = true; railShow(); };
  const railEnterSoon = (): void => {
    clearOpenTimer();
    openTimer.current = setTimeout(() => { openTimer.current = null; railEnter(); }, RAIL_OPEN_DELAY_MS);
  };
  const railLeave = (): void => { clearOpenTimer(); railPinned.current = false; railHideSoon(); };
  useEffect(() => {
    railHideSoon(RAIL_INTRO_MS);
    return () => {
      if (railTimer.current) clearTimeout(railTimer.current);
      if (openTimer.current) clearTimeout(openTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!railOpen) return undefined;
    const onDown = (e: PointerEvent): void => {
      const t = e.target as Element | null;
      if (t?.closest(".scr-header, .scr-rail-hotzone, .scr-menu-pop-drop")) return;
      railPinned.current = false;
      railHideSoon(0);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [railOpen]);
  return { railOpen, railEnter, railEnterSoon, railLeave };
}
