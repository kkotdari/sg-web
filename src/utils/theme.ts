import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { isProgrammaticScroll } from "./scrollRoot";

const LIGHT_THEME_KEY = "scr-light-theme";

const VOID_COLOR = { dark: "#060607", light: "#ffffff" };

function applyThemeColor(on: boolean): void {
  document.querySelector('meta[name="theme-color"]')?.remove();
  if (on) {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = VOID_COLOR.light;
    document.head.appendChild(meta);
  }
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", on ? "light" : "dark");
}

function nudgeToolbarResample(on: boolean): void {
  document.body.style.backgroundColor = on ? VOID_COLOR.light : VOID_COLOR.dark;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    jiggleScroll();
  }));
  window.setTimeout(jiggleScroll, 700);
}

export function resampleSafariChrome(): void {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const dark = !document.documentElement.classList.contains("scr-light-theme");
    if (dark) {
      const cs = document.querySelector('meta[name="color-scheme"]');
      cs?.setAttribute("content", "light");
      const tc = document.createElement("meta");
      tc.name = "theme-color";
      tc.content = VOID_COLOR.light;
      document.head.appendChild(tc);
      requestAnimationFrame(() => {
        cs?.setAttribute("content", "dark");
        tc.remove();
        jiggleScroll();
      });
      return;
    }
    jiggleScroll();
  }));
}

const JIGGLE_RETRY_MS = 260;

function jiggleScroll(): void {
  if (isProgrammaticScroll()) { window.setTimeout(jiggleScroll, JIGGLE_RETRY_MS); return; }
  const root = document.documentElement;
  const prevHeight = root.style.height;
  root.style.height = "calc(100% + 2px)";
  const y = window.scrollY;
  window.scrollTo({ top: y > 0 ? y - 1 : 1, behavior: "instant" });
  requestAnimationFrame(() => {
    window.scrollTo({ top: y, behavior: "instant" });
    root.style.height = prevHeight;
  });
}

function applyLightTheme(on: boolean): void {
  document.documentElement.classList.toggle("scr-light-theme", on);
  applyThemeColor(on);
  localStorage.setItem(LIGHT_THEME_KEY, on ? "1" : "0");
  nudgeToolbarResample(on);
}

export function useLightTheme(): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [on, setOn] = useState(() => localStorage.getItem(LIGHT_THEME_KEY) !== "0");
  useEffect(() => { applyLightTheme(on); }, [on]);
  return [on, setOn];
}
