import { useEffect } from "react";
import { clientKind } from "../utils/clientKind";

/* ★ 앱으로 돌아올 때 새 배포면 자동 새로고침(2026-11-02, 요청: "PWA 에서 새로고침이 안 돼서 불편 · 좋은 방법 추천" → '3. 돌아올 때 새 버전 확인 · 자동 새로고침') —
   홈 화면 앱(PWA)·안드 앱은 주소창·새로고침 단추가 없고 당겨서 새로고침도 꺼 두었다(global.css overscroll-behavior none). 배포는 Vite 가 진입 스크립트 이름에 내용 해시를
   싣으므로(/assets/index-<해시>.js), 화면에 다시 돌아올 때(30초 넘게 가려졌다가) 첫 페이지를 캐시 없이 받아 그 이름이 지금 실린 것과 다르면 새로고침한다.
   앱(clientKind "app")에서만 돈다 — 브라우저는 제 새로고침이 있다. 관리자 버전 안내(App.tsx staleVersion)와는 따로다(그것은 운영자가 올리는 번호). */
const HIDDEN_MIN_MS = 30_000;

function entryOf(html: string): string | null {
  const m = /<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+\.js)"/.exec(html) ?? /<script[^>]+src="([^"]*\/assets\/index[^"]*\.js)"/.exec(html);
  return m ? m[1] : null;
}

function currentEntry(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]');
  if (!el) return null;
  try { return new URL(el.src, location.href).pathname; } catch { return null; }
}

export function useDeployRefresh(): void {
  useEffect(() => {
    if (clientKind() !== "app") return undefined;
    const mine = currentEntry();
    if (!mine) return undefined;   // 개발 서버(/src/main.tsx) — 볼 것이 없다
    let hiddenAt = 0; let busy = false;
    const onVis = (): void => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
      if (!hiddenAt || Date.now() - hiddenAt < HIDDEN_MIN_MS || busy) return;
      busy = true;
      fetch(`/?_dr=${Date.now()}`, { cache: "no-store", credentials: "same-origin" })
        .then((r) => (r.ok ? r.text() : ""))
        .then((html) => {
          const next = html ? entryOf(html) : null;
          if (!next) return;
          let nextPath = next;
          try { nextPath = new URL(next, location.href).pathname; } catch { /* 그대로 */ }
          if (nextPath !== mine) location.reload();
        })
        .catch(() => {})
        .finally(() => { busy = false; });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
}
