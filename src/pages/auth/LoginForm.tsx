import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useAppStore } from "../../store/appStore";
import { Spinner } from "../../components/common/Feedback";

const REMEMBER_ID_KEY = "stargate:rememberedId";

/** onDone — 로그인한 뒤(손님 모드 팝업은 첫 화면 주소로 옮긴다). */
export default function LoginForm({ onDone }: { onDone?: () => void } = {}) {
  const login = useAppStore((s) => s.login);
  const [id, setId] = useState(() => localStorage.getItem(REMEMBER_ID_KEY) ?? "");
  const [pw, setPw] = useState("");
  const [rememberId, setRememberId] = useState(() => !!localStorage.getItem(REMEMBER_ID_KEY));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const pwRef = useRef<HTMLInputElement>(null);

  const handleIdKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    pwRef.current?.focus();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || !pw) { setErr("아이디와 비밀번호를 입력해 주세요."); return; }
    setErr(""); setBusy(true);
    try {
      await login(id, pw);
      if (rememberId) localStorage.setItem(REMEMBER_ID_KEY, id);
      else localStorage.removeItem(REMEMBER_ID_KEY);
      onDone?.();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "로그인에 실패했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="scr-form" onSubmit={submit}>
      <input
        className="scr-input"
        value={id}
        onChange={(e) => setId(e.target.value)}
        onKeyDown={handleIdKeyDown}
        placeholder="아이디"
      />
      <input
        ref={pwRef}
        className="scr-input"
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        placeholder="비밀번호"
      />
      <label className="scr-checkbox-field scr-auth-remember">
        <input type="checkbox" checked={rememberId} onChange={(e) => setRememberId(e.target.checked)} />
        아이디 저장
      </label>
      {err && <div className="scr-err">{err}</div>}
      <button type="submit" className="scr-rect-btn scr-auth-submit" disabled={busy}>
        {busy ? <><Spinner /> 로그인 중</> : "로그인"}
      </button>
    </form>
  );
}
