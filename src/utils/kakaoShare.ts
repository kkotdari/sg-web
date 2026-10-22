const KAKAO_SDK_URL = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js";

interface KakaoLike {
  isInitialized: () => boolean;
  init: (key: string) => void;
  Share?: {
    sendDefault: (settings: unknown) => void;
  };
}
function kakaoGlobal(): KakaoLike | undefined {
  return (window as unknown as { Kakao?: KakaoLike }).Kakao;
}

function kakaoKey(): string | undefined {
  const k = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;
  return k && k.length > 0 ? k : undefined;
}

let sdkPromise: Promise<KakaoLike | null> | null = null;
function loadKakao(): Promise<KakaoLike | null> {
  if (sdkPromise) return sdkPromise;
  const key = kakaoKey();
  if (!key) {
    sdkPromise = Promise.resolve(null);
    return sdkPromise;
  }
  sdkPromise = new Promise<KakaoLike | null>((resolve) => {
    const ready = () => {
      const K = kakaoGlobal();
      if (!K) return resolve(null);
      try {
        if (!K.isInitialized()) K.init(key);
        resolve(K);
      } catch {
        resolve(null);
      }
    };
    if (kakaoGlobal()) return ready();
    const s = document.createElement("script");
    s.src = KAKAO_SDK_URL;
    s.async = true;
    s.onload = ready;
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return sdkPromise;
}

export function preloadKakao(): void {
  void loadKakao();
}

const SHARE_THUMB_W = 1200;
const SHARE_THUMB_H = 600;
const SHARE_THUMBS = {
  gameResultList: "share_thumb_game_result_list.png",
  gameResult: "share_thumb_game_result.png",
  rankShift: "share_thumb_rank_shift.png",
  notice: "share_thumb_notice.png",
  schedule: "share_thumb_schedule.png",
} as const;

export type ShareThumbKind = keyof typeof SHARE_THUMBS;

export function shareThumbUrl(kind: ShareThumbKind): string {
  return `${window.location.origin}/images/share/${SHARE_THUMBS[kind]}`;
}

export interface SharePhoto {
  url: string | null;
  width: number | null;
  height: number | null;
}

export function shareThumb(kind: ShareThumbKind, photo?: SharePhoto | null): {
  imageUrl: string; imageWidth: number; imageHeight: number;
} {
  if (photo?.url && photo.width && photo.height) {
    return { imageUrl: photo.url, imageWidth: photo.width, imageHeight: photo.height };
  }
  return {
    imageUrl: shareThumbUrl(kind),
    imageWidth: SHARE_THUMB_W,
    imageHeight: SHARE_THUMB_H,
  };
}

export interface KakaoShareContent {
  title: string;
  description?: string;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  link?: string;
  fallbackText: string;
}

export type ShareOutcome = "shared" | "copied" | "failed";

export async function shareToKakao(content: KakaoShareContent): Promise<ShareOutcome> {
  const link = content.link ?? window.location.origin;
  const Kakao = await loadKakao();
  if (Kakao?.Share) {
    try {
      Kakao.Share.sendDefault({
        objectType: "feed",
        content: {
          title: content.title,
          description: content.description ?? "",
          imageUrl: content.imageUrl ?? `${window.location.origin}/apple-touch-icon.png`,
          ...(content.imageWidth ? { imageWidth: content.imageWidth } : {}),
          ...(content.imageHeight ? { imageHeight: content.imageHeight } : {}),
          link: { mobileWebUrl: link, webUrl: link },
        },
        buttons: [{ title: "앱에서 보기", link: { mobileWebUrl: link, webUrl: link } }],
      });
      return "shared";
    } catch {
    }
  }
  const shareData = { title: content.title, text: content.fallbackText, url: link };
  if (typeof navigator.share === "function") {
    try {
      await navigator.share(shareData);
      return "shared";
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "shared";
    }
  }
  try {
    await navigator.clipboard.writeText(`${content.fallbackText}\n${link}`);
    return "copied";
  } catch {
    return "failed";
  }
}
