import { Loader2 } from "lucide-react";

interface SpinnerProps {
  size?: number;
}

export function Spinner({ size = 14 }: SpinnerProps) {
  return <Loader2 size={size} className="scr-spin" />;
}

const BOOT_MARK = "STARGATE";
/** pct — 워드마크 아랫줄의 단색 퍼센트(0~100 · 2026-11-01, 요청: "상세 로딩 화면 워드마크 아랫줄에 단색으로 로딩 퍼센티지") · 없으면 안 그린다. */
export function LoadingMark({ full = false, pct = null }: { full?: boolean; pct?: number | null }) {
  return (
    <div className={full ? "scr-boot" : "scr-loadmark"} role="status" aria-label={pct === null ? "불러오는 중" : `불러오는 중 ${pct}%`}>
      <span className="scr-boot-stack">
        <span className="scr-boot-mark" aria-hidden>
          {[...BOOT_MARK].map((ch, i) => (
            <span key={i} className="scr-boot-mark-ch" style={{ animationDelay: `${i * 0.11}s` }}>{ch}</span>
          ))}
        </span>
        {pct !== null && <span className="scr-boot-pct" aria-hidden>{pct}%</span>}
      </span>
    </div>
  );
}
