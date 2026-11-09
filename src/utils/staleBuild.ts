/* ★ 새 배포 감지(2026-11-09, 실기: 아이폰 PWA 에서 재생기 탭이 터진 뒤 다시 뜰 때 **옛 판**(진단 첫 줄 '판' 09:02 — 그 사이 09:46 판이 나가 있었다)이 실렸다 ·
   같은 앱에서 연달아 찍은 두 캡처가 판이 달랐다). 웹킷이 되살릴 때 캐시에 남은 옛 index.html · 스크립트를 쓴 것으로 본다(vercel.json 에서 HTML 은 no-cache 로 함께 막는다).
   앱으로 **돌아올 때**(화면이 30초 넘게 숨었다 다시 보임) · 15분마다 서버의 index.html 을 캐시 없이 받아 그 안의 시작 스크립트(/assets/main-*.js)가 지금 실린 것과 다르면
   새로고침한다 — 다시 보일 때는 새로고침이 자연스럽고, 15분 틱은 화면이 보이는 동안이라 알림(토스트)만 띄운다. 개발 서버(import.meta.env.DEV)는 안 한다. */
import { showToast } from "../components/common/Toast";

const MAIN_RE = /\/assets\/main-[A-Za-z0-9_-]+\.js/;

function loadedMain(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/main-"]');
  const m = el?.src ? MAIN_RE.exec(el.src) : null;
  return m ? m[0] : null;
}

async function latestMain(): Promise<string | null> {
  try {
    const res = await fetch(`/?__v=${Date.now()}`, { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
    if (!res.ok) return null;
    const m = MAIN_RE.exec(await res.text());
    return m ? m[0] : null;
  } catch {
    return null;
  }
}

let toasted = false;
async function check(reloadIfNew: boolean): Promise<void> {
  const cur = loadedMain();
  if (!cur) return;
  const next = await latestMain();
  if (!next || next === cur) return;
  if (reloadIfNew) {
    // 되풀이 막기 — 2분 안에 한 번만(서버가 잠깐 엇갈린 판을 줘도 새로고침 고리에 안 빠진다).
    try {
      const last = Number(sessionStorage.getItem("scr-stale-reload") ?? 0);
      if (Date.now() - last < 120_000) return;
      sessionStorage.setItem("scr-stale-reload", String(Date.now()));
    } catch { /* 저장소가 막혔으면 그냥 한 번 */ }
    window.location.reload();
    return;
  }
  if (toasted) return;
  toasted = true;
  showToast("새 버전이 나왔어요 — 앱을 다시 열면 적용돼요", { kind: "info" });
}

export function installStaleBuildCheck(): void {
  if (import.meta.env.DEV || typeof document === "undefined") return;
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > 30_000) void check(true);
  });
  window.setInterval(() => { if (document.visibilityState === "visible") void check(false); }, 15 * 60_000);
  // 처음 뜰 때도 한 번 — 웹킷이 되살린 옛 판이면 곧장 새 판으로(새로고침 한 번 · 같은 판이면 아무 일 없음).
  window.setTimeout(() => { void check(true); }, 3000);
}
