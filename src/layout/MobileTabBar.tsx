import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { parseRoute } from "../utils/route";
import { createPortal } from "react-dom";
import { Menu as MenuIcon } from "lucide-react";
import { cx } from "../utils/format";
import { NAV_MENU_ITEMS, type NavMenuItem } from "../constants/menuVersions";
import { smoothScrollRootToTop } from "../utils/scrollRoot";
import type { ScreenKey } from "../types";

interface MobileTabBarProps {
  screen: ScreenKey;
  menuOpen: boolean;
  hidden: boolean;
  mini: boolean;
  onNavigate: (screen: ScreenKey) => void;
  onOpenMenu?: () => void;
  items?: NavMenuItem[];
  action?: { label: string; onClick: () => void };
}

const INDICATOR_VERTICAL_INSET = -1;
const INDICATOR_HORIZONTAL_PAD = 8;

function useActiveTabIndicator(navRef: { current: HTMLElement | null }, deps: unknown[]) {
  const [indicator, setIndicator] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  const measure = () => {
    const matches = navRef.current?.querySelectorAll<HTMLElement>(".scr-mobile-tab-active");
    const active = matches && matches.length > 0 ? matches[matches.length - 1] : null;
    if (!active) { setIndicator(null); return; }
    const label = active.querySelector<HTMLElement>("span");
    const labelWidth = label?.offsetWidth ?? active.offsetWidth;
    const labelLeft = active.offsetLeft + (active.offsetWidth - labelWidth) / 2;
    setIndicator({
      left: labelLeft - INDICATOR_HORIZONTAL_PAD,
      width: labelWidth + INDICATOR_HORIZONTAL_PAD * 2,
      top: active.offsetTop + INDICATOR_VERTICAL_INSET,
      height: active.offsetHeight - INDICATOR_VERTICAL_INSET * 2,
    });
  };

  useLayoutEffect(() => {
    measure();
  }, deps);

  useEffect(() => {
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure);
    return () => window.removeEventListener("resize", measure);
  }, [navRef]);

  useEffect(() => {
    const root = navRef.current;
    if (!root) return;
    const observer = new MutationObserver(measure);
    observer.observe(root, { attributes: true, attributeFilter: ["class"], subtree: true });
    return () => observer.disconnect();
  }, [navRef]);

  return indicator;
}

export default function MobileTabBar({ screen, menuOpen, hidden, mini, onNavigate, onOpenMenu, items, action }: MobileTabBarProps) {
  const navRef = useRef<HTMLElement>(null);
  const visibleItems = items ?? NAV_MENU_ITEMS;

  const activate = (key: ScreenKey) => {
    const hasSub = parseRoute().group !== null;
    if (screen === key && !hasSub) smoothScrollRootToTop();
    else onNavigate(key);
  };
  const pointerHandledRef = useRef(false);
  const onTabPointerDown = (e: React.PointerEvent, run: () => void) => {
    if (e.button !== 0) return;
    pointerHandledRef.current = true;
    run();
  };
  const onTabClick = (run: () => void) => {
    if (pointerHandledRef.current) { pointerHandledRef.current = false; return; }
    run();
  };
  const indicator = useActiveTabIndicator(navRef, [screen, menuOpen]);

  const shrunk = !hidden && mini;
  useEffect(() => {
    document.documentElement.classList.toggle("scr-tabbar-mini", shrunk);
    return () => document.documentElement.classList.remove("scr-tabbar-mini");
  }, [shrunk]);

  return createPortal(
    <nav
      ref={navRef}
      className={cx("scr-mobile-tabbar", hidden && "scr-mobile-tabbar-hidden", shrunk && "scr-mobile-tabbar-mini")}
      aria-label="하단 메뉴"
    >
      {indicator && (
        <span
          className="scr-mobile-tab-glow"
          style={{
            transform: `translateX(${indicator.left}px)`,
            width: indicator.width, top: indicator.top, height: indicator.height,
          }}
        />
      )}
      {visibleItems.map((item) => (
        <button
          key={item.key}
          type="button"
          className={cx("scr-mobile-tab", screen === item.key && "scr-mobile-tab-active")}
          onPointerDown={(e) => onTabPointerDown(e, () => activate(item.key))}
          onClick={() => onTabClick(() => activate(item.key))}
        >
          <span>{item.label}</span>
        </button>
      ))}
      {action && (
        <button
          type="button"
          className="scr-mobile-tab"
          onPointerDown={(e) => onTabPointerDown(e, action.onClick)}
          onClick={() => onTabClick(action.onClick)}
        >
          <span>{action.label}</span>
        </button>
      )}
      {onOpenMenu && (
        <button
          type="button"
          className="scr-mobile-tab scr-mobile-tab-menu"
          onPointerDown={(e) => onTabPointerDown(e, onOpenMenu)}
          onClick={() => onTabClick(onOpenMenu)}
          aria-label="메뉴 열기"
          aria-expanded={menuOpen}
        >
          <MenuIcon size={19} aria-hidden />
        </button>
      )}
    </nav>,
    document.getElementById("scr-tabbar-slot") ?? document.body,
  );
}
