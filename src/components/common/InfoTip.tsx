import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { swallowNextClick } from "../../utils/bodyScrollLock";

let closeOpenTip: (() => void) | null = null;

const EDGE = 8;

export default function InfoTip(
  { text, label, size = 12, trigger, triggerClassName, bubbleClassName }:
  /** text — 글 한 줄이거나 그림이 든 덩이(통계 표 도움말 · 2026-10-22). bubbleClassName — 그런 덩이의 말풍선 폭·여백. */
  { text: ReactNode; label?: string; size?: number; trigger?: string; triggerClassName?: string; bubbleClassName?: string },
) {
  const [pos, setPos] = useState<{ top: number; left: number; anchorTop: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const open = pos !== null;

  const toggle = (e: { stopPropagation: () => void; preventDefault: () => void }) => {
    e.stopPropagation();
    e.preventDefault();
    if (open) { setPos(null); closeOpenTip = null; return; }
    closeOpenTip?.();
    const r = ref.current?.getBoundingClientRect();
    if (r) {
      setPos({ top: r.bottom + 6, left: r.left + r.width / 2, anchorTop: r.top });
      closeOpenTip = () => setPos(null);
    }
  };

  useLayoutEffect(() => {
    if (!open || !pos) return;
    const el = bubbleRef.current;
    if (!el) return;
    const { width: w, height: h } = el.getBoundingClientRect();
    const half = w / 2;
    const left = Math.min(Math.max(pos.left, EDGE + half), window.innerWidth - EDGE - half);
    const flip = pos.top + h > window.innerHeight - EDGE;
    const top = flip ? Math.max(EDGE, pos.anchorTop - 6 - h) : pos.top;
    if (Math.abs(left - pos.left) > 0.5 || Math.abs(top - pos.top) > 0.5) {
      setPos({ ...pos, left, top });
    }
  }, [open, pos]);

  useEffect(() => {
    if (!open) return;
    const closeIfOutside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      e.preventDefault();
      e.stopPropagation();
      swallowNextClick();
      setPos(null);
    };
    const close = () => setPos(null);
    document.addEventListener("pointerdown", closeIfOutside, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <span
      ref={ref}
      className={triggerClassName ?? `scr-infotip${trigger ? " scr-infotip-text" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={label ? `${label} 설명 보기` : "설명 보기"}
      onClick={toggle}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggle(e); }}
    >
      {trigger ? trigger : <Info size={size} />}
      {open && pos && createPortal(
        <span
          ref={bubbleRef}
          className={bubbleClassName ? `scr-infotip-bubble ${bubbleClassName}` : "scr-infotip-bubble"}
          role="tooltip"
          style={{ top: pos.top, left: pos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  );
}
