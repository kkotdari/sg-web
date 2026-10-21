import LoginForm from "./LoginForm";
import BrandLogo from "../../components/common/BrandLogo";
import { useLightTheme } from "../../utils/theme";
import { useAppStore } from "../../store/appStore";
import { navigateTo } from "../../utils/route";

/* 회원가입 단추·화면은 걷었다(2026-10-21, 요청: "로그인 화면 회원가입 버튼 제거"). */
export default function AuthScreen() {
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
        className="scr-text-btn scr-auth-theme-btn"
        onClick={() => setLightTheme((v) => !v)}
        aria-label="라이트 테마 토글"
      >
        테마
      </button>
      <div className="scr-auth-hero">
        <div className="scr-auth-logo">
          <BrandLogo light={lightTheme} />
        </div>
        <div className="scr-auth-card scr-auth-card-plain">
          <LoginForm />
          <button type="button" className="scr-text-btn scr-auth-guest" onClick={goGuest}>
            손님으로 입장
          </button>
        </div>
      </div>
    </div>
  );
}
