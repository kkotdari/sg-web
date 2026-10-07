import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";
import { cx } from "../../utils/format";
import { attachPopover } from "../../utils/popover";

export interface SelectOption {
  value: string;
  label: string;
  shortLabel?: string;
  avatar?: React.ReactNode;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  size?: "md" | "sm";
  minDropWidth?: number;
  disabled?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function Select({
  value, options, onChange, placeholder = "선택", className, size = "md", minDropWidth, disabled = false,
  defaultOpen = false, onOpenChange,
}: SelectProps) {
  const [open, setOpen] = useState(defaultOpen && !disabled);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  useEffect(() => { onOpenChangeRef.current?.(open); }, [open]);
  const [activeIdx, setActiveIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open || !ref.current || !dropRef.current) return;
    return minDropWidth
      ? attachPopover(ref.current, dropRef.current, { growToContent: true, maxWidth: minDropWidth })
      : attachPopover(ref.current, dropRef.current, { matchAnchor: true });
  }, [open, minDropWidth]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (dropRef.current?.contains(t)) return;
      setOpen(false);
      e.preventDefault();
      e.stopPropagation();
      const swallowClick = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
        document.removeEventListener("click", swallowClick, true);
      };
      document.addEventListener("click", swallowClick, true);
      window.setTimeout(() => document.removeEventListener("click", swallowClick, true), 400);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setActiveIdx(idx >= 0 ? idx : 0);
    }
  }, [open, value, options]);

  const commit = (v: string) => { onChange(v); setOpen(false); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")) {
      e.preventDefault(); setOpen(true); return;
    }
    if (!open) return;
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, options.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); const o = options[activeIdx]; if (o) commit(o.value); }
  };

  return (
    <div className={cx("scr-cselect", size === "sm" && "scr-cselect-sm", className)} ref={ref}>
      <button
        type="button"
        className={cx("scr-cselect-trigger", open && "scr-cselect-open")}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        disabled={disabled}
      >
        <span className={cx("scr-cselect-value", !selected && "scr-cselect-placeholder")}>
          {selected ? (
            <>
              {selected.avatar}
              <span className="scr-cselect-value-full">{selected.label}</span>
              {selected.shortLabel && (
                <span className="scr-cselect-value-short">{selected.shortLabel}</span>
              )}
            </>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown size={14} className="scr-cselect-caret" />
      </button>

      {open && createPortal(
        <div className={cx("scr-cselect-drop", "scr-scroll", className)} ref={dropRef}>
          {options.map((o, i) => (
            <button
              type="button"
              key={o.value}
              className={cx(
                "scr-cselect-opt",
                o.value === value && "scr-cselect-opt-selected",
                i === activeIdx && "scr-cselect-opt-active",
              )}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(o.value)}
            >
              {o.avatar}
              <span className="scr-cselect-opt-label">{o.label}</span>
              {o.value === value && <Check size={13} />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
