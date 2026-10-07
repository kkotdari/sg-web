import { useEffect, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { cx } from "../../utils/format";
import { preloadKakao, shareToKakao, type KakaoShareContent } from "../../utils/kakaoShare";

function KakaoIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 3.6c-4.97 0-9 3.13-9 6.99 0 2.48 1.66 4.66 4.16 5.9-.18.63-.66 2.35-.76 2.72-.12.46.17.45.36.33.15-.1 2.4-1.63 3.37-2.29.6.09 1.22.13 1.87.13 4.97 0 9-3.13 9-6.99S16.97 3.6 12 3.6Z"
      />
    </svg>
  );
}

type Variant = "icon" | "menu" | "full";
type Glyph = "kakao" | "share";

interface KakaoShareButtonProps {
  content: KakaoShareContent | (() => KakaoShareContent) | (() => Promise<KakaoShareContent>);
  variant?: Variant;
  className?: string;
  label?: string;
  iconOnly?: boolean;
  onDone?: () => void;
  icon?: Glyph;
}

export default function KakaoShareButton({
  content, variant = "icon", className,
  label = variant === "menu" ? "공유" : "카카오톡 공유",
  iconOnly = false, onDone,
  icon = variant === "menu" ? "share" : "kakao",
}: KakaoShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { preloadKakao(); }, []);

  const glyph = (size: number) => (
    copied ? <Check size={size} /> : icon === "share" ? <Share2 size={size} /> : <KakaoIcon size={size} />
  );

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const c = typeof content === "function" ? await content() : content;
      const outcome = await shareToKakao(c);
      if (outcome === "copied") {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }
    } finally {
      setBusy(false);
      onDone?.();
    }
  };

  if (variant === "icon") {
    return (
      <button
        type="button"
        className={cx("scr-icon-btn scr-kakao-icon-btn", className)}
        onClick={(e) => { e.stopPropagation(); void share(); }}
        aria-label={label}
        title={copied ? "링크 복사됨" : busy ? "만드는 중..." : label}
        disabled={busy}
      >
        {glyph(16)}
      </button>
    );
  }

  if (variant === "menu") {
    return (
      <button
        type="button" role="menuitem"
        className={cx("scr-menu-pop-opt scr-kakao-menu-opt", className)}
        onClick={(e) => { e.stopPropagation(); void share(); }}
        disabled={busy}
      >
        {glyph(15)}
        {copied ? "링크 복사됨" : busy ? "만드는 중..." : label}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={cx("scr-rect-btn scr-lighting-color scr-kakao-share-btn", iconOnly && "scr-kakao-share-btn-icon", className)}
      onClick={(e) => { e.stopPropagation(); void share(); }}
      disabled={busy}
      aria-label={label}
      title={copied ? "링크 복사됨" : busy ? "만드는 중..." : label}
    >
      {glyph(16)}
      {!iconOnly && (copied ? "링크 복사됨" : busy ? "만드는 중..." : label)}
    </button>
  );
}
