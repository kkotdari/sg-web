import { useEffect } from "react";
import BrandLogo from "../../components/common/BrandLogo";
import ScrollTopButton from "../../components/common/ScrollTopButton";
import ToastHost from "../../components/common/Toast";
import AlertHost from "../../components/common/AlertDialog";
import NavTab from "../../layout/NavTab";
import MobileTabBar from "../../layout/MobileTabBar";
import ExploreScreen from "./ExploreScreen";
import { useAppStore } from "../../store/appStore";
import { navigateTo, parseRoute } from "../../utils/route";
import { useLightTheme } from "../../utils/theme";
import { cx } from "../../utils/format";
import type { NavMenuItem } from "../../constants/menuVersions";

/* 손님 메뉴는 게임 하나(도록은 걷었다 · 2026-10-21, 요청: "손님 모드 도록 버튼 제거"). */
const GUEST_ITEMS: NavMenuItem[] = [
  { key: "explore", label: "게임" },
];

export default function GuestApp() {
  const exitGuest = useAppStore((s) => s.exitGuest);
  const [lightTheme, setLightTheme] = useLightTheme();

  useEffect(() => {
    if (parseRoute().screen !== "explore") navigateTo("/explore", { replace: true, notify: false });
  }, []);

  useEffect(() => {
    const onPop = (): void => {
      if (parseRoute().screen !== "explore") exitGuest();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [exitGuest]);

  const toLogin = (): void => {
    navigateTo("/", { notify: false });
    exitGuest();
  };

  const go = (): void => {
    navigateTo("/explore", { notify: false });
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  return (
    <div className="scr-app scr-extshare" id="scr-app">
      <div className="scr-bg-grid" />
      <div id="scroll-root">
        {/* PC 레일 걷음(2026-11-24 · Header ★ PC 도 떠 있는 메뉴) — 손님도 폰과 같은 떠 있는 줄(게임 · 로그인). */}
        <header className="scr-header">
          <div className="scr-header-inner">
            <button type="button" className="scr-brand" onClick={go} aria-label="처음으로">
              <BrandLogo light={lightTheme} />
              <span className="scr-brand-text"></span>
            </button>
            <nav className="scr-nav scr-nav-desktop">
              {GUEST_ITEMS.map((item) => (
                <NavTab key={item.key} label={item.label} active onClick={go} />
              ))}
            </nav>
            <div className="scr-user">
              <button
                type="button"
                className={cx("scr-text-btn", lightTheme && "is-on")}
                onClick={() => setLightTheme((v) => !v)}
              >
                테마
              </button>
              <button type="button" className="scr-text-btn" onClick={toLogin}>
                로그인
              </button>
            </div>
          </div>
        </header>
        <main className="scr-main">
          <ExploreScreen />
        </main>
      </div>
      <div id="scr-tabbar-slot" />
      <MobileTabBar screen="explore" menuOpen={false} hidden={false} mini={false} onNavigate={go} items={GUEST_ITEMS}
        action={{ label: "로그인", onClick: toLogin }}
      />
      <ScrollTopButton />
      <ToastHost />
      <AlertHost />
    </div>
  );
}
