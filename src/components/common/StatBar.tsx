import type { CSSProperties, ReactNode } from "react";

interface StatBarProps {
  label?: string;
  plays: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  compact?: boolean;
  medal?: string;
  delta?: ReactNode;
}

export default function StatBar({ label, plays, wins, draws, losses, winRate, compact = false, medal, delta }: StatBarProps) {
  const rateText = plays > 0 ? `${winRate}%` : "-";
  const trackStyle: CSSProperties = plays > 0 ? { ["--scr-value-fill" as string]: `${winRate}%` } : {};
  return (
    <div className="scr-stat-bar-row">
      {!compact && (
        <div className="scr-stat-bar-top">
          <span className="scr-stat-bar-label-group">
            {label && <span className="scr-stat-bar-label">{label}</span>}
            <span className="scr-stat-bar-count">{plays > 0 ? `${plays}전` : "-"}</span>
          </span>
          {plays > 0 && (
            <span className="scr-stat-bar-nums">
              {wins}승{draws > 0 && ` ${draws}무`} {losses}패
            </span>
          )}
          <span className="scr-stat-bar-rate">{rateText}</span>
        </div>
      )}
      <div
        className={plays > 0 ? "scr-stat-bar-track-wrap" : "scr-stat-bar-track-wrap scr-value-bar-track-wrap-empty"}
        style={trackStyle}
      >
        {compact && (
          <span className="scr-stat-bar-rate scr-stat-bar-rate-overlay">
            <span className="scr-stat-bar-rate-val">
              {rateText}
              {medal && <span className="scr-stat-medal">{medal}</span>}
            </span>
            {delta && <span className="scr-bar-delta">{delta}</span>}
          </span>
        )}
      </div>
    </div>
  );
}
