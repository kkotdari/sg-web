import LoginForm from "../auth/LoginForm";

export default function ShareLoginGate() {
  return (
    <div className="scr-share-login-gate">
      <div className="scr-challenge-share-bg" aria-hidden="true" />
      <div className="scr-share-login-panel" role="dialog" aria-label="로그인">
        <div className="scr-share-login-title">호출이 도착했어요</div>
        <div className="scr-share-login-sub">로그인하고 편지를 열어보세요 👀</div>
        <LoginForm />
      </div>
    </div>
  );
}
