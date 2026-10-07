import { useEffect, useRef, useState } from "react";

const RAIL_INTRO_MS = 2600;
const RAIL_LINGER_MS = 320;

export function useRail(): { railOpen: boolean; railEnter: () => void; railLeave: () => void } {
  const [railOpen, setRailOpen] = useState(true);
  const railPinned = useRef(false);
  const railTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const railEnter = (): void => { railPinned.current = true; railShow(); };
  const railLeave = (): void => { railPinned.current = false; railHideSoon(); };
  useEffect(() => {
    railHideSoon(RAIL_INTRO_MS);
    return () => { if (railTimer.current) clearTimeout(railTimer.current); };
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
  return { railOpen, railEnter, railLeave };
}
