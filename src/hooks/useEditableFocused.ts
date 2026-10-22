import { useEffect, useState } from "react";

function isEditable(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

const COVER_THRESHOLD = 120;
function keyboardCovering(): boolean {
  const vv = window.visualViewport;
  if (!vv) return false;
  return window.innerHeight - vv.height - vv.offsetTop > COVER_THRESHOLD;
}
const SETTLE_TIMEOUT_MS = 700;

export function useEditableFocused(): boolean {
  const [focused, setFocused] = useState(() => isEditable(document.activeElement));
  useEffect(() => {
    let raf = 0;
    let timer = 0;
    let watching = false;
    const vv = window.visualViewport;

    const stopWatch = () => {
      if (!watching) return;
      watching = false;
      vv?.removeEventListener("resize", onSettle);
      window.clearTimeout(timer);
    };
    const finish = () => {
      stopWatch();
      setFocused(isEditable(document.activeElement));
    };
    function onSettle() {
      if (!keyboardCovering()) finish();
    }

    const on = (e: FocusEvent) => {
      cancelAnimationFrame(raf);
      stopWatch();
      setFocused(isEditable(e.target as Element | null));
    };
    const off = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (isEditable(document.activeElement)) return;
        if (!keyboardCovering()) { setFocused(false); return; }
        if (watching) return;
        watching = true;
        vv?.addEventListener("resize", onSettle);
        timer = window.setTimeout(finish, SETTLE_TIMEOUT_MS);
      });
    };
    document.addEventListener("focusin", on);
    document.addEventListener("focusout", off);
    return () => {
      cancelAnimationFrame(raf);
      stopWatch();
      document.removeEventListener("focusin", on);
      document.removeEventListener("focusout", off);
    };
  }, []);
  useEffect(() => {
    if (!focused) return undefined;
    const el = document.activeElement;
    const check = (): void => {
      /* 잡아 둔 el 이 편집 칸일 때만 '아직 붙어 있음'으로 친다(2026-10-22, 지적: "모바일 로그인 시 처음엔 탭바가 안 나옴 · 새로고침하면 나옴") —
         비밀번호 칸에서 Enter 로 로그인하면 Header 가 그 칸에 포커스가 있는 채로 서고(첫 상태 true), 이 효과가 돌 땐 칸이 이미 빠져
         activeElement 가 body 다. 빠진 칸은 focusout 을 안 쏘고 body 는 늘 붙어 있어 true 가 풀리지 않았다. */
      if (el instanceof Node && el.isConnected && isEditable(el as Element)) return;
      if (isEditable(document.activeElement)) return;
      setFocused(false);
    };
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true });
    check();
    return () => mo.disconnect();
  }, [focused]);
  return focused;
}
