export type ScrollRoot = Window | HTMLElement;

export function getScrollRoot(): ScrollRoot {
  return window;
}

export function getScrollTop(root: ScrollRoot = getScrollRoot()): number {
  return root instanceof Window ? root.scrollY : root.scrollTop;
}

export function scrollRootTo(opts: ScrollToOptions, root: ScrollRoot = getScrollRoot()): void {
  root.scrollTo(opts);
}

export function smoothScrollRootToTop(duration = 420, root: ScrollRoot = getScrollRoot()): void {
  smoothScrollRootTo(0, duration, { root });
}

type ScrollEase = "out" | "inOut";
const EASES: Record<ScrollEase, (t: number) => number> = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

export function smoothScrollRootTo(
  target: number, duration = 420,
  opts: { ease?: ScrollEase; root?: ScrollRoot } = {},
): void {
  const root = opts.root ?? getScrollRoot();
  const start = getScrollTop(root);
  const delta = target - start;
  if (delta === 0) return;
  const t0 = performance.now();
  let raf = 0;
  programmaticUntil = t0 + duration;
  const done = () => {
    programmaticUntil = 0;
    requestAnimationFrame(() => root.dispatchEvent(new Event("scroll")));
  };
  const removeListeners = () => {
    window.removeEventListener("wheel", cancel);
    window.removeEventListener("touchmove", cancel);
  };
  const cancel = () => { cancelAnimationFrame(raf); removeListeners(); done(); };
  window.addEventListener("wheel", cancel, { passive: true });
  window.addEventListener("touchmove", cancel, { passive: true });
  const ease = EASES[opts.ease ?? "out"];
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / duration);
    root.scrollTo({ top: start + delta * ease(p), behavior: "instant" });
    if (p < 1) raf = requestAnimationFrame(step);
    else { removeListeners(); done(); }
  };
  raf = requestAnimationFrame(step);
}

let programmaticUntil = 0;
export function isProgrammaticScroll(): boolean {
  return programmaticUntil > 0 && performance.now() < programmaticUntil;
}

let suppressHideUntil = 0;
export function isScrollHideSuppressed(): boolean {
  return performance.now() < suppressHideUntil;
}

export function addRafScrollListener(listener: () => void, root: ScrollRoot = getScrollRoot()): () => void {
  let scheduled = false;
  let removed = false;
  const onScroll = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (!removed) listener();
    });
  };
  root.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    removed = true;
    root.removeEventListener("scroll", onScroll);
  };
}
