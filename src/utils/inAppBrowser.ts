export type InAppKind = "kakao" | "naver" | "line" | "instagram" | "facebook" | "other";

export interface InAppInfo {
  isInApp: boolean;
  kind: InAppKind | null;
}

export function detectInAppBrowser(ua: string = navigator.userAgent): InAppInfo {
  const s = ua.toLowerCase();
  if (s.includes("kakaotalk")) return { isInApp: true, kind: "kakao" };
  if (s.includes("naver(inapp") || s.includes("naver ")) return { isInApp: true, kind: "naver" };
  if (/\bline\//.test(s) || s.includes("line/")) return { isInApp: true, kind: "line" };
  if (s.includes("instagram")) return { isInApp: true, kind: "instagram" };
  if (s.includes("fban") || s.includes("fbav")) return { isInApp: true, kind: "facebook" };
  return { isInApp: false, kind: null };
}

function androidIntentUrl(url: string): string | null {
  if (!/android/i.test(navigator.userAgent)) return null;
  try {
    const u = new URL(url);
    const sch = u.protocol.replace(":", "");
    return `intent://${u.host}${u.pathname}${u.search}${u.hash}`
      + `#Intent;scheme=${sch};action=android.intent.action.VIEW;end`;
  } catch { return null; }
}

export function openInExternalBrowser(kind: InAppKind | null, url: string = window.location.href): boolean {
  if (kind === "kakao") {
    window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
    return true;
  }
  const ai = androidIntentUrl(url);
  if (ai) {
    window.location.href = ai;
    return true;
  }
  return false;
}
