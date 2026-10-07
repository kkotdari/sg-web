import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import LoginForm from "./LoginForm";
import SignupForm from "./SignupForm";
import BrandLogo from "../../components/common/BrandLogo";
import { useLightTheme } from "../../utils/theme";
import { useAppStore } from "../../store/appStore";
import { navigateTo } from "../../utils/route";

export default function AuthScreen() {
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [lightTheme, setLightTheme] = useLightTheme();
  const enterGuest = useAppStore((s) => s.enterGuest);
  const goGuest = (): void => {
    navigateTo("/explore", { notify: false });
    enterGuest();
  };

  return (
    <div className="scr-auth-wrap">
      <div className="scr-bg-grid" />
      <button
        type="button"
        className="scr-header-text-btn scr-auth-theme-btn"
        onClick={() => setLightTheme((v) => !v)}
        aria-label="라이트 테마 토글"
      >
        테마
      </button>
      <div className="scr-auth-hero">
        <div className="scr-auth-logo">
          <BrandLogo light={lightTheme} />
        </div>
        {tab === "login" ? (
          <div className="scr-auth-card scr-auth-card-plain">
            <LoginForm />
            <button type="button" className="scr-lighting-text-btn scr-auth-guest" onClick={goGuest}>
              손님으로 입장
            </button>
          </div>
        ) : (
          <div className="scr-auth-card scr-auth-card-plain">
            <button type="button" className="scr-link-btn scr-auth-back-btn" onClick={() => setTab("login")}>
              <ArrowLeft size={13} /> 뒤로가기
            </button>
            <SignupForm onDone={() => setTab("login")} />
          </div>
        )}
      </div>
      {tab === "login" && (
        <button type="button" className="scr-header-text-btn scr-auth-signup-link" onClick={() => setTab("signup")}>
          회원가입
        </button>
      )}
    </div>
  );
}
