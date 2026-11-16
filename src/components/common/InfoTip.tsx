import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { swallowNextClick } from "../../utils/bodyScrollLock";

let closeOpenTip: (() => void) | null = null;
/** 열린 말풍선을 닫는다 — 말풍선 안 단추가 창을 띄우기 전에(2026-11-16 · interactive). */
export function closeInfoTips(): void { closeOpenTip?.(); closeOpenTip = null; }

const EDGE = 8;

export default function InfoTip(
  { text, label, size = 12, trigger, triggerClassName, bubbleClassName, hover = false, interactive = false }:
  /** text — 글 한 줄이거나 그림이 든 덩이(통계 표 도움말 · 2026-10-22). bubbleClassName — 그런 덩이의 말풍선 폭·여백.
   *  hover — 마우스를 얹으면 열고 떠나면 닫는다(PC · 2026-10-28, 요청: "티어 팝업도 피시에서 마우스오버시 열리게") · 터치는 종전대로 눌러서. */
  /** interactive — 말풍선 안을 누르고 · 굴리고 · (PC) 마우스로 들어가도 안 닫힌다(긴 풀이 · 단추가 든 말풍선 · 2026-11-16 WPA란? 계산 조건). */
  { text: ReactNode; label?: string; size?: number; trigger?: ReactNode; triggerClassName?: string; bubbleClassName?: string; hover?: boolean; interactive?: boolean },
) {
  const [pos, setPos] = useState<{ top: number; left: number; anchorTop: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const open = pos !== null;

  /** 마우스로 연 말풍선인가 — 그때의 누름은 닫지 않는다(얹은 채 누르면 바로 닫혀 버린다). */
  const byHover = useRef(false);
  /** interactive 말풍선 — 단추에서 말풍선으로 옮겨 가는 틈(6px)에 안 닫히게 조금 기다렸다 닫는다. */
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelLeave = () => { if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; } };
  const leaveSoon = () => {
    cancelLeave();
    leaveTimer.current = setTimeout(() => { leaveTimer.current = null; if (byHover.current) { byHover.current = false; setPos(null); } }, 180);
  };
  useEffect(() => cancelLeave, []);
  const openNow = () => {
    closeOpenTip?.();
    const r = ref.current?.getBoundingClientRect();
    if (r) {
      setPos({ top: r.bottom + 6, left: r.left + r.width / 2, anchorTop: r.top });
      closeOpenTip = () => setPos(null);
    }
  };
  const toggle = (e: { stopPropagation: () => void; preventDefault: () => void }) => {
    e.stopPropagation();
    e.preventDefault();
    if (open && byHover.current) return;
    if (open) { setPos(null); closeOpenTip = null; return; }
    byHover.current = false;
    openNow();
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
      if (ref.current?.contains(t) || (interactive && bubbleRef.current?.contains(t))) return;
      e.preventDefault();
      e.stopPropagation();
      swallowNextClick();
      setPos(null);
    };
    const close = (e?: Event) => {
      if (interactive && e && e.target instanceof Node && bubbleRef.current?.contains(e.target)) return;   // 말풍선 안 굴림은 닫지 않는다
      setPos(null);
    };
    document.addEventListener("pointerdown", closeIfOutside, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, interactive]);

  return (
    <span
      ref={ref}
      className={triggerClassName ?? `scr-infotip${trigger ? " scr-infotip-text" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={label ? `${label} 설명 보기` : "설명 보기"}
      onClick={toggle}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggle(e); }}
      onPointerEnter={hover ? (e) => { if (e.pointerType === "mouse" && !open) { byHover.current = true; openNow(); } } : undefined}
      onPointerLeave={hover ? (e) => {
        if (e.pointerType !== "mouse" || !byHover.current) return;
        if (interactive) leaveSoon(); else { byHover.current = false; setPos(null); }
      } : undefined}
    >
      {trigger ? trigger : <Info size={size} />}
      {open && pos && createPortal(
        <span
          ref={bubbleRef}
          className={bubbleClassName ? `scr-infotip-bubble ${bubbleClassName}` : "scr-infotip-bubble"}
          role="tooltip"
          style={{ top: pos.top, left: pos.left }}
          onClick={(e) => e.stopPropagation()}
          onPointerEnter={interactive ? (e) => { if (e.pointerType === "mouse") cancelLeave(); } : undefined}
          onPointerLeave={interactive ? (e) => { if (e.pointerType === "mouse" && byHover.current) leaveSoon(); } : undefined}
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  );
}
