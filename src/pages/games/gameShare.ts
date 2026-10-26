import { isMeleeGame, meleeLineup, teamSummaryName } from "./GameResultSides";
import { cleanMapName } from "../../utils/mapName";
import { shareThumb } from "../../utils/kakaoShare";
import { playbackClockOf, sceneLinkQueryOf9 } from "scplay";
import type { KakaoShareContent } from "../../utils/kakaoShare";
import type { GameResult, Member } from "../../types";

const clock9 = (sec: number): string => {
  const s9 = Math.max(0, Math.floor(sec));
  return `${Math.floor(s9 / 60)}:${String(s9 % 60).padStart(2, "0")}`;
};
export function gameResultShareContent(
  gameResult: GameResult, memberOf: (id: string) => Member | undefined,
  opts?: {
    scene?: boolean;
  },
): KakaoShareContent {
  const t1 = teamSummaryName(gameResult.team1, memberOf) || "팀1";
  const t2 = teamSummaryName(gameResult.team2, memberOf) || "팀2";
  const title9 = isMeleeGame(gameResult)
    ? meleeLineup(gameResult.team1, gameResult.team2, memberOf)
    : `${t1} vs ${t2}`;
  const cleanedMap = cleanMapName(gameResult.mapName);
  const key = String(gameResult.matchNo || gameResult.id);
  const sceneQuery = sceneLinkQueryOf9(key).toString();
  const clockSec = playbackClockOf.get(key);
  const durPart = gameResult.durationSeconds != null && gameResult.durationSeconds > 0
    ? `${Math.max(1, Math.round(gameResult.durationSeconds / 60))}분` : null;
  const atPart = opts?.scene && clockSec !== undefined && clockSec >= 5
    ? `${clock9(clockSec)} 장면` : null;
  const desc = [cleanedMap, durPart, atPart].filter(Boolean).join(" · ");
  return {
    title: title9,
    description: desc || gameResult.date,
    ...shareThumb("gameResult"),
    link: `${window.location.origin}/games/${gameResult.matchNo || gameResult.id}${sceneQuery ? `?${sceneQuery}` : ""}`,
    fallbackText: `[스타게이트 게임결과]\n${title9}\n${desc || gameResult.date}`,
  };
}
