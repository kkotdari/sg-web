import { useCallback, useEffect, useRef, useState } from "react";

let holders = 0;
let requested = false;

type WebkitDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type WebkitEl = HTMLElement & { webkitRequestFullscreen?: () => void };

function fullscreenElement(): Element | null {
  return document.fullscreenElement ?? (document as WebkitDoc).webkitFullscreenElement ?? null;
}

function exitFullscreen(): void {
  const d = document as WebkitDoc;
  try {
    if (d.exitFullscreen) void d.exitFullscreen().catch(() => {});
    else d.webkitExitFullscreen?.();
  } catch { }
}

export function useDocumentFullscreen(onExit: () => void): {
  supported: boolean;
  isFullscreen: boolean;
  enter: () => void;
} {
  const root = document.documentElement as WebkitEl;
  const supported = typeof root.requestFullscreen === "function" || typeof root.webkitRequestFullscreen === "function";
  const [isFullscreen, setIsFullscreen] = useState(() => fullscreenElement() !== null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const enter = useCallback(() => {
    if (!supported || requested || fullscreenElement()) return;
    requested = true;
    try {
      if (root.requestFullscreen) {
        void root.requestFullscreen().catch(() => { requested = false; });
      } else {
        root.webkitRequestFullscreen?.();
      }
    } catch {
      requested = false;
    }
  }, [root, supported]);

  useEffect(() => {
    holders += 1;
    enter();
    const onChange = () => {
      const fs = fullscreenElement() !== null;
      setIsFullscreen(fs);
      if (!fs && requested) {
        requested = false;
        onExitRef.current();
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
      holders -= 1;
      window.setTimeout(() => {
        if (holders > 0 || !requested) return;
        requested = false;
        if (fullscreenElement()) exitFullscreen();
      }, 0);
    };
  }, [enter]);

  return { supported, isFullscreen, enter };
}
