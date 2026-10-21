import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import NavTab from "./NavTab";
import AdminMenu from "./AdminMenu";
import MobileTabBar from "./MobileTabBar";
import Avatar from "../components/common/Avatar";
import BrandLogo from "../components/common/BrandLogo";
import UploaderInstallModal from "../components/common/UploaderInstallModal";
import { cx } from "../utils/format";
import { attachPopover } from "../utils/popover";
import { useIsNarrow } from "../utils/useIsNarrow";
import { useHideOnScrollDown } from "../hooks/useHideOnScrollDown";
import { swallowNextClick } from "../utils/bodyScrollLock";
import { useEditableFocused } from "../hooks/useEditableFocused";
import { isAdminRole } from "../constants/roles";
import { useLightTheme } from "../utils/theme";
import { NAV_MENU_ITEMS } from "../constants/menuVersions";
import { useRail } from "./useRail";
import type { Member, ScreenKey } from "../types";

interface HeaderProps {
  user: Member;
  screen: ScreenKey;
  onNavigate: (screen: ScreenKey) => void;
  onOpenProfile: () => void;
  onLogout: () => void;
}

export default function Header({
  user, screen, onNavigate, onOpenProfile, onLogout,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isAdmin = isAdminRole(user.roles);
  const scrollHidden = useHideOnScrollDown(screen);
  const editing = useEditableFocused();
  const tabBarHidden = editing;
  const tabBarMini = scrollHidden && !editing;

  const [lightTheme, setLightTheme] = useLightTheme();

  /* 메뉴의 "앱 설치"(PWA)는 걷고 그 자리에 업로더 설치(2026-10-21, 요청) — 내려받기 창을 연다. */
  const [uploaderOpen, setUploaderOpen] = useState(false);


  const [drawerRendered, setDrawerRendered] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerOpenedAtRef = useRef(0);
  const [drawerInteractive, setDrawerInteractive] = useState(false);
  useEffect(() => {
    if (menuOpen) {
      setDrawerRendered(true);
      drawerOpenedAtRef.current = Date.now();
      setDrawerInteractive(false);
      const t = setTimeout(() => setDrawerInteractive(true), 450);
      const raf = requestAnimationFrame(() => setDrawerOpen(true));
      return () => { cancelAnimationFrame(raf); clearTimeout(t); };
    }
    setDrawerOpen(false);
    const t = setTimeout(() => setDrawerRendered(false), 380);
    return () => clearTimeout(t);
  }, [menuOpen]);

  const drawerPanelRef = useRef<HTMLDivElement>(null);
  const drawerDragRef = useRef<{ startX: number; startY: number; dragging: boolean } | null>(null);
  const DRAWER_CLOSE_RATIO = 0.35;
  const onDrawerPointerDown = (e: React.PointerEvent) => {
    drawerDragRef.current = { startX: e.clientX, startY: e.clientY, dragging: false };
  };
  const onDrawerPointerMove = (e: React.PointerEvent) => {
    const st = drawerDragRef.current;
    if (!st) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    if (!st.dragging) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      st.dragging = true;
      drawerPanelRef.current?.setPointerCapture?.(e.pointerId);
    }
    if (dx <= 0) return;
    const panel = drawerPanelRef.current;
    if (!panel) return;
    panel.style.transition = "none";
    panel.style.transform = `translateX(${dx}px)`;
  };
  const onDrawerPointerEnd = (e: React.PointerEvent) => {
    const st = drawerDragRef.current;
    drawerDragRef.current = null;
    const panel = drawerPanelRef.current;
    if (!st?.dragging || !panel) return;
    const dx = e.clientX - st.startX;
    const width = panel.getBoundingClientRect().width;
    panel.style.transition = "";
    panel.style.transform = "";
    if (dx > width * DRAWER_CLOSE_RATIO) setMenuOpen(false);
  };

  useEffect(() => {
    if (!drawerRendered) return;
    const closeIfOutside = (e: PointerEvent) => {
      if (drawerPanelRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
      e.stopPropagation();
      swallowNextClick();
      if (Date.now() - drawerOpenedAtRef.current < 450) return;
      setMenuOpen(false);
    };
    const blockTouch = (e: TouchEvent) => {
      if (drawerPanelRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
    };
    document.addEventListener("pointerdown", closeIfOutside, true);
    document.addEventListener("touchstart", blockTouch, { passive: false, capture: true });
    document.addEventListener("touchmove", blockTouch, { passive: false });
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside, true);
      document.removeEventListener("touchstart", blockTouch, { capture: true } as EventListenerOptions);
      document.removeEventListener("touchmove", blockTouch);
    };
  }, [drawerRendered]);

  const go = (s: ScreenKey) => { onNavigate(s); setMenuOpen(false); };

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const { railOpen, railEnter, railEnterSoon, railLeave } = useRail();
  const profileAnchorRef = useRef<HTMLButtonElement>(null);
  const profileDropRef = useRef<HTMLDivElement>(null);
  const isNarrowHeader = useIsNarrow(960);
  useLayoutEffect(() => {
    if (!profileMenuOpen || !profileAnchorRef.current || !profileDropRef.current) return;
    return attachPopover(profileAnchorRef.current, profileDropRef.current, { growToContent: true, maxWidth: 200 });
  }, [profileMenuOpen]);
  useEffect(() => {
    if (!profileMenuOpen) return;
    const closeIfOutside = (e: Event) => {
      const t = e.target as Node;
      if (profileAnchorRef.current?.contains(t)) return;
      if (profileDropRef.current?.contains(t)) return;
      setProfileMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeIfOutside);
    document.addEventListener("focusin", closeIfOutside);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside);
      document.removeEventListener("focusin", closeIfOutside);
    };
  }, [profileMenuOpen]);

  const visibleItems = NAV_MENU_ITEMS;
  const commonNavItems = (
    <>
      {visibleItems.map((item) => (
        <NavTab key={item.key} label={item.label} active={screen === item.key} onClick={() => go(item.key)} />
      ))}
    </>
  );

  return (
    <>
    <div
      className={cx("scr-rail-hotzone", railOpen && "scr-rail-hotzone-open")}
      onPointerEnter={railEnterSoon} onPointerLeave={railLeave} onClick={railEnter} aria-hidden
    />
    <header
      className={cx("scr-header", railOpen && "scr-header-rail-open")}
      onPointerEnter={railEnter} onPointerLeave={railLeave}
      onFocus={railEnter}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) railLeave(); }}
    >
      <div className="scr-header-inner">
        <button
          type="button" className="scr-brand"
          onClick={() => go("activity")}
          aria-label="홈으로"
        >
          <BrandLogo light={lightTheme} />
          <span className="scr-brand-text"></span>
        </button>

        <nav className="scr-nav scr-nav-desktop">
          {commonNavItems}
          {isAdmin && <AdminMenu screen={screen} onNavigate={go} variant="nav" />}
        </nav>

        <div className="scr-user">
          <button
            type="button"
            className={cx("scr-text-btn", lightTheme && "is-on")}
            onClick={() => setLightTheme((v) => !v)}
          >
            테마
          </button>
          <button type="button" className="scr-text-btn" onClick={() => setUploaderOpen(true)}>
            업로더 설치
          </button>
          <button
            className="scr-user-chip" ref={profileAnchorRef}
            onClick={() => setProfileMenuOpen((v) => !v)}
          >
            <Avatar member={user} size={30} />
            <span className="scr-user-name">{user.nickname}</span>
          </button>
          {profileMenuOpen && createPortal(
            <div
              className={cx("scr-menu-pop-drop scr-scroll", isNarrowHeader && "scr-menu-pop-drop-mobile")}
              ref={profileDropRef}
            >
              <button
                type="button" className="scr-menu-pop-opt"
                onClick={() => { onOpenProfile(); setProfileMenuOpen(false); }}
              >
                <span className="scr-menu-pop-opt-label">내 정보</span>
              </button>
              <button
                type="button" className="scr-menu-pop-opt"
                onClick={() => { onLogout(); setProfileMenuOpen(false); }}
              >
                <span className="scr-menu-pop-opt-label">로그아웃</span>
              </button>
            </div>,
            document.body,
          )}
        </div>
      </div>

      {drawerRendered && createPortal(
          <div
            className={cx("scr-drawer", drawerOpen && "scr-drawer-open")} ref={drawerPanelRef}
            style={{ pointerEvents: drawerInteractive ? undefined : "none" }}
            onClickCapture={(e) => {
              if (Date.now() - drawerOpenedAtRef.current < 400) { e.preventDefault(); e.stopPropagation(); }
            }}
            onPointerDown={onDrawerPointerDown}
            onPointerMove={onDrawerPointerMove}
            onPointerUp={onDrawerPointerEnd}
            onPointerCancel={onDrawerPointerEnd}
          >
            {/* 로고 — 모바일 머리띠의 로고 자리를 걷고(2026-10-09, 요청) 서랍 머리로 옮겼다. 누르면 홈. */}
            <button
              type="button" className="scr-drawer-brand"
              onClick={() => go("activity")}
              aria-label="홈으로"
            >
              <BrandLogo light={lightTheme} />
            </button>
            <div className="scr-drawer-user">
              <Avatar member={user} size={48} />
              <div className="scr-drawer-user-name">{user.nickname}</div>
            </div>
            <nav className="scr-drawer-nav">
              {isAdmin && <AdminMenu screen={screen} onNavigate={go} variant="drawer" />}
            </nav>

            <div className="scr-drawer-actions">
              <button className="scr-rect-btn is-secondary" onClick={() => setLightTheme((v) => !v)}>
                테마
              </button>
              <button className="scr-rect-btn is-secondary" onClick={() => setUploaderOpen(true)}>
                업로더 설치
              </button>
              <button className="scr-rect-btn is-secondary" onClick={() => { onOpenProfile(); setMenuOpen(false); }}>
                내 정보
              </button>
              <button className="scr-rect-btn is-secondary" onClick={() => { onLogout(); setMenuOpen(false); }}>
                로그아웃
              </button>
              <button className="scr-rect-btn is-secondary" onClick={() => setMenuOpen(false)}>
                메뉴 닫기
              </button>
            </div>
          </div>,
        document.body,
      )}

      {uploaderOpen && (
        <UploaderInstallModal onClose={() => { setUploaderOpen(false); setMenuOpen(false); }} />
      )}

      <MobileTabBar
        screen={screen}
        menuOpen={menuOpen}
        hidden={tabBarHidden}
        mini={tabBarMini}
        onNavigate={go}
        onOpenMenu={() => setMenuOpen(true)}
      />
    </header>
    </>
  );
}
