import type { GameType } from "../types";

export type GameTypeInfo = {
  label: string;
  ladder: boolean;
  teamed: boolean;
};

export const GAME_TYPE_INFO: Record<GameType, GameTypeInfo> = {
  "0101": { label: "일대일", ladder: true, teamed: false },
  "0102": { label: "팀전", ladder: false, teamed: true },
  "0103": { label: "난투", ladder: false, teamed: false },
};

export const gameTypeLabel = (t: string | null | undefined): string =>
  (t && GAME_TYPE_INFO[t as GameType]?.label) || (t ?? "");

export const LADDER_GAME_TYPES = (Object.keys(GAME_TYPE_INFO) as GameType[])
  .filter((t) => GAME_TYPE_INFO[t].ladder);
