import { useEffect, useState } from "react";

function isEditable(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

const COVER_THRESHOLD = 120;
function keyboardCovering(): boolean {
  const vv = window.visualViewport;
  if (!vv) return false;
  return window.innerHeight - vv.height - vv.offsetTop > COVER_THRESHOLD;
}
const SETTLE_TIMEOUT_MS = 700;

export function useEditableFocused(): boolean {
  const [focused, setFocused] = useState(() => isEditable(document.activeElement));
  useEffect(() => {
    let raf = 0;
    let timer = 0;
    let watching = false;
    const vv = window.visualViewport;

    const stopWatch = () => {
      if (!watching) return;
      watching = false;
      vv?.removeEventListener("resize", onSettle);
      window.clearTimeout(timer);
    };
    const finish = () => {
      stopWatch();
      setFocused(isEditable(document.activeElement));
    };
    function onSettle() {
      if (!keyboardCovering()) finish();
    }

    const on = (e: FocusEvent) => {
      cancelAnimationFrame(raf);
      stopWatch();
      setFocused(isEditable(e.target as Element | null));
    };
    const off = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (isEditable(document.activeElement)) return;
        if (!keyboardCovering()) { setFocused(false); return; }
        if (watching) return;
        watching = true;
        vv?.addEventListener("resize", onSettle);
        timer = window.setTimeout(finish, SETTLE_TIMEOUT_MS);
      });
    };
    document.addEventListener("focusin", on);
    document.addEventListener("focusout", off);
    return () => {
      cancelAnimationFrame(raf);
      stopWatch();
      document.removeEventListener("focusin", on);
      document.removeEventListener("focusout", off);
    };
  }, []);
  useEffect(() => {
    if (!focused) return undefined;
    const el = document.activeElement;
    const check = (): void => {
      if (el instanceof Node && el.isConnected) return;
      if (isEditable(document.activeElement)) return;
      setFocused(false);
    };
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true });
    check();
    return () => mo.disconnect();
  }, [focused]);
  return focused;
}
