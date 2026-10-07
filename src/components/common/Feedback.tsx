import { Loader2 } from "lucide-react";

interface SpinnerProps {
  size?: number;
}

export function Spinner({ size = 14 }: SpinnerProps) {
  return <Loader2 size={size} className="scr-spin" />;
}

const BOOT_MARK = "STARGATE";
export function LoadingMark({ full = false }: { full?: boolean }) {
  return (
    <div className={full ? "scr-boot" : "scr-loadmark"} role="status" aria-label="불러오는 중">
      <span className="scr-boot-mark" aria-hidden>
        {[...BOOT_MARK].map((ch, i) => (
          <span key={i} className="scr-boot-mark-ch" style={{ animationDelay: `${i * 0.11}s` }}>{ch}</span>
        ))}
      </span>
    </div>
  );
}
