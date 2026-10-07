import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1);
  const inApp = /(KAKAOTALK|Instagram|FBAN|FBAV|Line|NAVER)/i.test(ua);
  return ios && !inApp;
}

export type InstallPlatform = "android" | "ios";

export interface PwaInstall {
  canInstall: boolean;
  installed: boolean;
  platform: InstallPlatform | null;
  promptInstall: () => Promise<"installed" | "dismissed" | "ios" | "unavailable">;
}

export function usePwaInstall(): PwaInstall {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  const standalone = isStandalone();
  const ios = !standalone && isIosSafari();
  const androidReady = !standalone && deferred !== null;
  const platform: InstallPlatform | null = androidReady ? "android" : ios ? "ios" : null;

  const promptInstall: PwaInstall["promptInstall"] = async () => {
    if (androidReady && deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      notify();
      return outcome === "accepted" ? "installed" : "dismissed";
    }
    if (ios) return "ios";
    return "unavailable";
  };

  return {
    canInstall: !standalone && (androidReady || ios),
    installed: standalone,
    platform, promptInstall,
  };
}
