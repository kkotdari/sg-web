import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import LoginForm from "./LoginForm";
import SignupForm from "./SignupForm";
import BrandLogo from "../../components/common/BrandLogo";
import { useLightTheme } from "../../utils/theme";
import { useAppStore } from "../../store/appStore";
import { navigateTo } from "../../utils/route";

/** 회원가입은 주소(/signup)나 **로고 별 세 번 누르기**로만 들어간다(로그인 화면엔 단추가 없다 · 2026-10-21, 요청: "로그인 화면 회원가입 버튼 제거" → "회원가입 페이지는 주소로만 연결"
 *  · 2026-10-22, 요청: "가입 화면 진입 트리거 — 메인 로그인 화면에서 로고의 별 3번 터치"). 세 번은 앞 누름에서 STAR_GAP 안에 이어져야 한다. */
const SIGNUP_PATH = "/signup";
const onSignupPath = (): boolean => window.location.pathname.replace(/\/+$/, "") === SIGNUP_PATH;
const STAR_GAP = 1000;

export default function AuthScreen() {
  const [signup, setSignup] = useState(onSignupPath);
  useEffect(() => {
    const onPop = (): void => setSignup(onSignupPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const toLogin = (): void => {
    navigateTo("/", { replace: true, notify: false });
    setSignup(false);
  };
  const starTaps = useRef<number[]>([]);
  const onStar = (): void => {
    const now = Date.now();
    const prev = starTaps.current;
    starTaps.current = prev.length > 0 && now - prev[prev.length - 1] <= STAR_GAP ? [...prev, now] : [now];
    if (starTaps.current.length < 3) return;
    starTaps.current = [];
    navigateTo(SIGNUP_PATH, { notify: false });
    setSignup(true);
  };
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
          <BrandLogo light={lightTheme} onStar={signup ? undefined : onStar} />
        </div>
        {signup ? (
          <div className="scr-auth-card scr-auth-card-plain scr-auth-card-signup">
            <button type="button" className="scr-link-btn scr-auth-back-btn" onClick={toLogin}>
              <ArrowLeft size={13} /> 로그인
            </button>
            <SignupForm onDone={toLogin} />
          </div>
        ) : (
          <div className="scr-auth-card scr-auth-card-plain">
            <LoginForm />
            <button type="button" className="scr-text-btn scr-auth-guest" onClick={goGuest}>
              손님으로 입장
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
