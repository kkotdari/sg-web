import type { CSSProperties } from "react";
import { RACE_INFO } from "../../constants/races";
import { cx } from "../../utils/format";
import type { Race } from "../../types";

const RACE_LETTER: Record<Race, string> = { "테란": "T", "프로토스": "P", "저그": "Z", "랜덤": "R" };

interface RaceBadgeProps {
  race: Race | "";
  size?: number;
  asText?: boolean;
  plain?: boolean;
  circleLetter?: boolean;
  className?: string;
}

export default function RaceBadge({ race, size = 26, asText, plain, circleLetter, className }: RaceBadgeProps) {
  if (!race) return null;
  const color = plain ? "var(--text)" : RACE_INFO[race].color;
  if (circleLetter) {
    return (
      <span
        className={cx("scr-race-badge", "scr-race-badge-letter", className)}
        style={{ fontSize: Math.max(9, size * 0.5), color: RACE_INFO[race].color }}
        title={race}
      >
        {RACE_LETTER[race]}
      </span>
    );
  }
  if (asText) {
    return (
      <span className="scr-race-badge scr-race-badge-text" style={{ color }} title={race}>
        {race}
      </span>
    );
  }
  const style: CSSProperties = {
    ["--rc" as string]: color,
    width: size,
    height: Math.round(size * 0.86),
    fontSize: Math.max(10, size * 0.5),
  };
  return (
    <span className="scr-race-badge" style={style} title={race}>
      {RACE_LETTER[race]}
    </span>
  );
}
