import type { CSSProperties, ReactNode } from "react";

interface ValueBarProps {
  value: number | null;
  delta?: ReactNode;
  maxValue: number;
  medal?: string;
}

export default function ValueBar({ value, maxValue, medal, delta }: ValueBarProps) {
  const fillPercent = value !== null && maxValue > 0 ? (value / maxValue) * 100 : 0;
  const trackStyle: CSSProperties = value !== null ? { ["--scr-value-fill" as string]: `${fillPercent}%` } : {};
  return (
    <div className="scr-value-bar">
      <div
        className={value === null ? "scr-value-bar-track-wrap scr-value-bar-track-wrap-empty" : "scr-value-bar-track-wrap"}
        style={trackStyle}
      >
        <span className="scr-value-bar-num">
          {value ?? "-"}
          {medal && <span className="scr-stat-medal">{medal}</span>}
        </span>
        {delta && <span className="scr-bar-delta">{delta}</span>}
      </div>
    </div>
  );
}
