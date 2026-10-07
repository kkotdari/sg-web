import { useEffect } from "react";

export function usePageBackground(
  desktopUrl: string | null | undefined,
  mobileUrl?: string,
  lightUrl?: string,
): void {
  useEffect(() => {
    const root = document.documentElement;
    if (!desktopUrl) return;
    root.style.setProperty("--page-bg-image", `url("${desktopUrl}")`);
    root.classList.add("scr-page-bg");
    if (mobileUrl) {
      root.style.setProperty("--page-bg-image-mobile", `url("${mobileUrl}")`);
      root.classList.add("scr-page-bg-mobile");
    }
    if (lightUrl) {
      root.style.setProperty("--page-bg-image-light", `url("${lightUrl}")`);
      root.classList.add("scr-page-bg-light");
    }
    return () => {
      root.classList.remove("scr-page-bg");
      root.classList.remove("scr-page-bg-mobile");
      root.classList.remove("scr-page-bg-light");
      root.style.removeProperty("--page-bg-image");
      root.style.removeProperty("--page-bg-image-mobile");
      root.style.removeProperty("--page-bg-image-light");
    };
  }, [desktopUrl, mobileUrl, lightUrl]);
}
