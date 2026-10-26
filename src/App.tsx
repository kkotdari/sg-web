import { useState, useEffect, useRef } from "react";
import { useAppStore } from "./store/appStore";
import { isAdminRole } from "./constants/roles";
import ScrollTopButton from "./components/common/ScrollTopButton";
import ToastHost from "./components/common/Toast";
import AlertHost from "./components/common/AlertDialog";
import { navigateTo, parseRoute, pathOf } from "./utils/route";
import { api } from "./api/client";
import { useBottomViewportInset } from "./hooks/useBottomViewportInset";
import { useModalDragDismiss } from "./hooks/useModalDragDismiss";
import { scrollRootTo } from "./utils/scrollRoot";
import { resampleSafariChrome } from "./utils/theme";
import { HOME_SCREEN } from "./constants/menuVersions";

import AuthScreen from "./pages/auth/AuthScreen";
import Header from "./layout/Header";
import InAppBrowserNotice from "./components/common/InAppBrowserNotice";
import MembersScreen from "./pages/members/MembersScreen";
import LeagueScreen from "./pages/league/LeagueScreen";
import PlacementScreen from "./pages/placement/PlacementScreen";
import ProfileModal from "./modals/ProfileModal";
import MemberProfileModal from "./modals/MemberProfileModal";
import AdminPanelScreen from "./pages/admin/AdminPanelScreen";
import MapCanonScreen from "./pages/minimaps/MapCanonScreen";
import AppUpdateNoticeModal from "./modals/AppUpdateNoticeModal";
import AppReloadModal from "./modals/AppReloadModal";
import GamesScreen from "./pages/games/GamesScreen";
import BoardScreen from "./pages/board/BoardScreen";
import LadderScreen from "./pages/v2/LadderScreen";
import ClanStatsScreen from "./pages/v2/ClanStatsScreen";
import CatalogScreen from "./pages/catalog/CatalogScreen";
import GuestApp from "./pages/guest/GuestApp";

import type { ScreenKey } from "./types";

function screenFromUrl(): ScreenKey {
  return parseRoute().screen;
}

/* 메뉴로 화면을 옮길 때 떨구는 화면 제 것 — tab(게임 탭)·size(통계 규모 탭)도(2026-10-20, 요청: "tab 파라미터가 다른 화면까지 남음"). */
const SCREEN_LOCAL_PARAMS = ["t", "u", "f", "st", "period", "tab", "size"] as const;


export default function App() {
  useModalDragDismiss();
  const user = useAppStore((s) => s.user);
  const guest = useAppStore((s) => s.guest);
  const enterGuest = useAppStore((s) => s.enterGuest);
  /* 가입 주소(/signup)로 들어오면 손님 모드를 풀어 가입 화면(AuthScreen)이 선다. */
  const exitGuest = useAppStore((s) => s.exitGuest);
  useEffect(() => {
    if (guest && window.location.pathname.replace(/\/+$/, "") === "/signup") exitGuest();
  }, [guest, exitGuest]);
  useEffect(() => {
    if (user || guest) return undefined;
    const onPop = (): void => {
      const s = parseRoute().screen;
      if (s === "explore") enterGuest();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [user, guest, enterGuest]);
  const booting = useAppStore((s) => s.booting);
  const restoringSession = useAppStore((s) => s.restoringSession);
  const justLoggedIn = useAppStore((s) => s.justLoggedIn);
  const clearJustLoggedIn = useAppStore((s) => s.clearJustLoggedIn);
  const bootstrap = useAppStore((s) => s.bootstrap);
  useEffect(() => {
    if (!booting) resampleSafariChrome();
  }, [booting]);
  const refreshAll = useAppStore((s) => s.refreshAll);
  const logout = useAppStore((s) => s.logout);
  const restoreSession = useAppStore((s) => s.restoreSession);
  const viewingMemberId = useAppStore((s) => s.viewingMemberId);
  const closeMemberProfile = useAppStore((s) => s.closeMemberProfile);
  const memberOf = useAppStore((s) => s.memberOf);
  const viewingMember = viewingMemberId ? memberOf(viewingMemberId) : undefined;
  const updateNotice = useAppStore((s) => s.updateNotice);
  const appVersion = useAppStore((s) => s.appVersion);
  const dismissUpdateNotice = useAppStore((s) => s.dismissUpdateNotice);

  const [screen, setScreen] = useState<ScreenKey>(screenFromUrl);
  const [shareLanding] = useState<boolean>(() => parseRoute().item !== null);
  const [profileOpen, setProfileOpen] = useState(false);
  const shownScreen = useRef<ScreenKey | null>(null);
  const navigate = (next: ScreenKey) => {
    const params = new URLSearchParams(window.location.search);
    for (const k of SCREEN_LOCAL_PARAMS) params.delete(k);
    const qs = params.toString();
    const target = `${pathOf({ screen: next })}${qs ? `?${qs}` : ""}`;
    if (target !== `${window.location.pathname}${window.location.search}`) {
      navigateTo(pathOf({ screen: next }), { search: qs });
    }
    window.dispatchEvent(new CustomEvent("scr-screen-nav", { detail: next }));
    setScreen(next);
  };
  useEffect(() => {
    const onPop = () => setScreen(parseRoute().screen);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const screenIntent = useAppStore((s) => s.screenIntent);
  const clearScreenIntent = useAppStore((s) => s.clearScreenIntent);
  useEffect(() => {
    if (!screenIntent) return;
    const p9 = new URLSearchParams(window.location.search);
    for (const k of SCREEN_LOCAL_PARAMS) p9.delete(k);
    navigateTo(pathOf({ screen: screenIntent }), { search: p9.toString(), notify: false });
    setScreen(screenIntent);
    clearScreenIntent();
  }, [screenIntent, clearScreenIntent]);
  useBottomViewportInset();

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (user) void bootstrap();
  }, [user?.id, bootstrap]);

  useEffect(() => {
    if (!justLoggedIn || booting) return;
    setScreen(HOME_SCREEN);
    clearJustLoggedIn();
  }, [justLoggedIn, booting, clearJustLoggedIn]);

  useEffect(() => {
    if (!user) { shownScreen.current = null; return; }
    const before = shownScreen.current;
    shownScreen.current = screen;
    if (before === null || before === screen) return;
    void refreshAll();
  }, [screen, user?.id, refreshAll]);

  const bootVersion = useRef<string | null>(null);
  const [staleVersion, setStaleVersion] = useState<string | null>(null);
  const seeVersion = (v: string): void => {
    if (bootVersion.current === null) { bootVersion.current = v; return; }
    if (v !== bootVersion.current) setStaleVersion(v);
  };
  useEffect(() => {
    if (!user) { bootVersion.current = null; setStaleVersion(null); return undefined; }
    let dead = false;
    const check = () => {
      void api.getAppVersion()
        .then(({ activeVersion }) => { if (!dead) seeVersion(activeVersion); })
        .catch(() => {});
    };
    check();
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(check, 10 * 60 * 1000);
    return () => {
      dead = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [user?.id]);
  useEffect(() => {
    if (!user || bootVersion.current === null) return;
    seeVersion(appVersion);
  }, [user?.id, appVersion]);

  useEffect(() => {
    scrollRootTo({ top: 0, left: 0, behavior: "instant" });
  }, [screen]);

  useEffect(() => {
    if (!user) return;
    void api.pingAccess(screen);
  }, [user, screen]);

  useEffect(() => {
    if (parseRoute().screen === screen) return;
    /* 게임 탭(tab=league|clan|pub)은 게임 화면 것 — 다른 화면으로 옮길 땐 떨군다(2026-10-20, 요청: "tab 파라미터가 다른 화면까지 남음 ·
       옛 활동 → 전체보기 때 · 이제 게임 화면 안에서만"). */
    const q9 = new URLSearchParams(window.location.search);
    if (screen !== "games") q9.delete("tab");
    navigateTo(pathOf({ screen }), { replace: true, search: q9.toString(), notify: false });
  }, [screen]);

  if (restoringSession) {
    return (
        <div className="scr-app scr-app-fallback-scroll" id="scr-app" />
    );
  }

  if (!user) {
    if (guest) return <GuestApp />;
    return (
        <div className="scr-app scr-app-fallback-scroll" id="scr-app">
          <InAppBrowserNotice compact={shareLanding} />
          <AuthScreen />
        </div>
    );
  }

  const isAdmin = isAdminRole(user.roles);
  const resolvedScreen: ScreenKey =
    screen === "members" && !isAdmin ? HOME_SCREEN :
    screen === "minimaps" && !isAdmin ? HOME_SCREEN :
    screen === "control" && !isAdmin ? HOME_SCREEN :
    screen === "explore" ? HOME_SCREEN :
    screen;

  return (
      <div className={"scr-app" + (resolvedScreen === "ladder" ? " scr-app-hasbg" : "")} id="scr-app">
        <div className="scr-bg-grid" />
        <span className="scr-rail scr-rail-left" aria-hidden="true" />
        <span className="scr-rail scr-rail-right" aria-hidden="true" />

        <div id="scroll-root">
          <Header
            user={user}
            screen={screen}
            onNavigate={navigate}
            onOpenProfile={() => setProfileOpen(true)}
            onLogout={logout}
          />
          <main className="scr-main">
            {!booting && resolvedScreen === "games" && <GamesScreen />}
            {!booting && resolvedScreen === "board" && <BoardScreen />}
            {!booting && resolvedScreen === "ladder" && <LadderScreen />}
            {!booting && resolvedScreen === "clan" && <ClanStatsScreen />}
            {isAdmin && !booting && resolvedScreen === "members" && <MembersScreen />}
            {!booting && resolvedScreen === "leagues" && <LeagueScreen />}
            {!booting && resolvedScreen === "placement" && <PlacementScreen />}
            {isAdmin && !booting && resolvedScreen === "minimaps" && <MapCanonScreen />}
            {!booting && resolvedScreen === "catalog" && <CatalogScreen />}
            {isAdmin && !booting && resolvedScreen === "control" && <AdminPanelScreen isAdmin={isAdmin} />}
          </main>
        </div>

        <div id="scr-tabbar-slot" />

        <InAppBrowserNotice compact={shareLanding} />

        {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
        {viewingMember && <MemberProfileModal member={viewingMember} onClose={closeMemberProfile} />}
        {updateNotice && <AppUpdateNoticeModal notes={updateNotice.notes} onClose={dismissUpdateNotice} />}
        {staleVersion && bootVersion.current && (
          <AppReloadModal from={bootVersion.current} to={staleVersion} />
        )}
        {!booting && <ScrollTopButton />}
        <ToastHost />
        <AlertHost />
      </div>
  );
}
