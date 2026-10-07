import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cx } from "../utils/format";
import { attachPopover } from "../utils/popover";
import type { ScreenKey } from "../types";

export interface AdminItem {
  key: string;
  label: string;
  isActive: boolean;
  onSelect: () => void;
}

interface AdminMenuProps {
  title?: string;
  menuItems?: AdminItem[];
  screen: ScreenKey;
  onNavigate: (screen: ScreenKey) => void;
  variant: "nav" | "drawer" | "mobile";
  onOpenChange?: (open: boolean) => void;
}


export default function AdminMenu({
  screen, onNavigate, variant, onOpenChange, title = "운영", menuItems,
}: AdminMenuProps) {
  const items: AdminItem[] = menuItems ?? [
    { key: "members", label: "회원", isActive: screen === "members", onSelect: () => onNavigate("members") },
    { key: "minimaps", label: "대표맵", isActive: screen === "minimaps", onSelect: () => onNavigate("minimaps") },
    { key: "control", label: "제어판", isActive: screen === "control", onSelect: () => onNavigate("control") },
  ];
  const activeInAdmin = items.some((i) => i.isActive);
  const [open, setOpen] = useState(false);
  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (variant !== "mobile" || !open || !anchorRef.current || !dropRef.current) return;
    return attachPopover(anchorRef.current, dropRef.current, { growToContent: true, maxWidth: 200 });
  }, [open, variant]);

  useEffect(() => {
    if (variant === "drawer" || !open) return;
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (dropRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open, variant]);

  useEffect(() => {
    if (variant === "drawer" || !open) return;
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (dropRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [open, variant]);

  const optionButtons = items.map((item) => (
    <button
      type="button"
      key={item.key}
      className={cx("scr-menu-pop-opt", item.isActive && "scr-menu-pop-opt-active")}
      onClick={() => { item.onSelect(); setOpen(false); }}
    >
      <span className="scr-menu-pop-opt-label">{item.label}</span>
    </button>
  ));

  if (variant === "drawer") {
    return (
      <div className="scr-menu-pop scr-menu-pop-drawer">
        <div className="scr-nav-tab scr-menu-pop-drawer-title"><span>{title}</span></div>
        <div className="scr-menu-pop-drop-inline">{optionButtons}</div>
      </div>
    );
  }

  const triggerClass = variant === "mobile"
    ? cx("scr-mobile-tab", activeInAdmin && "scr-mobile-tab-active")
    : cx("scr-nav-tab", (open || activeInAdmin) && "scr-nav-tab-active");

  if (variant === "nav") {
    return (
      <div className="scr-menu-pop-rail">
        <button type="button" className={triggerClass} ref={anchorRef} onClick={() => setOpen((v) => !v)}>
          <span>{title}</span>
          <ChevronDown size={14} className={cx("scr-menu-pop-caret", open && "scr-menu-pop-caret-open")} />
        </button>
        {open && <div className="scr-menu-pop-drop-inline" ref={dropRef}>{optionButtons}</div>}
      </div>
    );
  }

  return (
    <div className={cx("scr-menu-pop", `scr-menu-pop-${variant}`)}>
      <button type="button" className={triggerClass} ref={anchorRef} onClick={() => setOpen((v) => !v)}>
        <span>{title}</span>
        {variant !== "mobile" && <ChevronDown size={14} className={cx("scr-menu-pop-caret", open && "scr-menu-pop-caret-open")} />}
      </button>

      {open && createPortal(
        <div
          className={cx("scr-menu-pop-drop scr-scroll", variant === "mobile" && "scr-menu-pop-drop-mobile")}
          ref={dropRef}
        >
          {optionButtons}
        </div>,
        document.body,
      )}
    </div>
  );
}
