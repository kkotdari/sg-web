import { useEffect, useRef, useState } from "react";
import { addRafScrollListener, getScrollTop, isScrollHideSuppressed } from "../utils/scrollRoot";

const EDGE_PX = 24;
const HIDE_DELTA_PX = 10;
const SHOW_DELTA_RATIO = 0.5;
const SHOW_DELTA_MIN_PX = 260;

export function useHideOnScrollDown(screen: string): boolean {
  const [hidden, setHidden] = useState(false);
  const lastScrollTopRef = useRef(0);
  const accumRef = useRef(0);

  useEffect(() => {
    lastScrollTopRef.current = getScrollTop();
    const showDeltaPx = Math.max(SHOW_DELTA_MIN_PX, window.innerHeight * SHOW_DELTA_RATIO);
    const onScroll = () => {
      const scrollTop = getScrollTop();
      if (isScrollHideSuppressed()) {
        lastScrollTopRef.current = scrollTop;
        accumRef.current = 0;
        return;
      }
      const atEdge = scrollTop <= EDGE_PX;
      const delta = scrollTop - lastScrollTopRef.current;
      lastScrollTopRef.current = scrollTop;

      if (atEdge) {
        accumRef.current = 0;
        setHidden(false);
        return;
      }
      if (delta > 0) {
        accumRef.current = accumRef.current > 0 ? accumRef.current + delta : delta;
        if (accumRef.current > HIDE_DELTA_PX) setHidden(true);
      } else if (delta < 0) {
        accumRef.current = accumRef.current < 0 ? accumRef.current + delta : delta;
        if (accumRef.current < -showDeltaPx) setHidden(false);
      }
    };
    return addRafScrollListener(onScroll);
  }, []);

  useEffect(() => {
    accumRef.current = 0;
    lastScrollTopRef.current = getScrollTop();
    document.documentElement.classList.add("scr-screen-switch-jump");
    setHidden(false);
    const raf = requestAnimationFrame(() => {
      document.documentElement.classList.remove("scr-screen-switch-jump");
    });
    return () => cancelAnimationFrame(raf);
  }, [screen]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--mobile-tabbar-visible-h", hidden ? "0px" : "var(--mobile-footer-h)",
    );
  }, [hidden]);

  useEffect(() => {
    document.documentElement.classList.toggle("scr-scroll-hide", hidden);
    return () => document.documentElement.classList.remove("scr-scroll-hide");
  }, [hidden]);

  return hidden;
}
