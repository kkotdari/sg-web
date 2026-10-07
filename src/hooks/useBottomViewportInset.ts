import { useEffect } from "react";

export function useBottomViewportInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const keyboardOpen = (): boolean => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };
    const standalone = (): boolean => {
      if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
      if (window.matchMedia?.("(display-mode: fullscreen)").matches) return true;
      return (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    };
    const update = () => {
      if (standalone()) { root.style.setProperty("--vv-bottom-inset", "0px"); return; }
      if (!vv) { root.style.setProperty("--vv-bottom-inset", "0px"); return; }
      if (keyboardOpen()) { root.style.setProperty("--vv-bottom-inset", "0px"); return; }
      const raw = Math.round(window.innerHeight - vv.height - vv.offsetTop);
      if (raw > 120) return;
      root.style.setProperty("--vv-bottom-inset", `${Math.max(0, raw)}px`);
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);
}
