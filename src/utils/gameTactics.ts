import { tacticWordsOf9 } from "scplay";
import { api } from "../api/client";
import { isMeleeGame } from "../pages/activity/GameResultSides";

/* ★ 판의 전술 낱말 굽기(2026-10-20, 요청: "유닛건물스킬에 전술도 … 재생기 키워드 검색에 뜨듯" → "누가 그 판을 열어도 채우지 않기 ·
   운영자 재분석에 포함시키고 참값 제거 시 제거 안 되게") — **운영자 재분석만** 부른다. 서버의 참값 자취와 맵을 받아 재생기와 같은 편성표
   (scplay tacticWordsOf9)로 낱말을 뽑고 서버의 따로 된 표(game_result_tactics)에 적는다 — 참값을 지워도 남는다.
   자취가 없으면(아직 안 구웠거나 지운 판) 아무것도 안 적는다 — 있던 낱말을 지우지 않는다. */
export async function indexGameTactics(id: number): Promise<"ok" | "none"> {
  const [game, tracks] = await Promise.all([api.getGameResult(id), api.getGameUnitTracks(id)]);
  if (!tracks.motion) return "none";
  const grid = game.mapHash ? (await api.getReplayMaps([game.mapHash]))[0] ?? null : null;
  const slots = [
    ...game.team1.map((s) => ({ s, team: 1 })),
    ...game.team2.map((s) => ({ s, team: 2 })),
  ].filter((x) => !!x.s.rawName);
  const melee = isMeleeGame(game);
  const words = await tacticWordsOf9(tracks.motion, {
    grid, endSec: game.durationSeconds ?? 0, chats: tracks.chats,
    only: slots.filter((x) => !x.s.observer).map((x) => x.s.rawName!),
    skip: slots.filter((x) => x.s.observer).map((x) => x.s.rawName!),
    ...(melee ? {} : { teamOf: Object.fromEntries(slots.map((x) => [x.s.rawName!, x.team])) }),
  });
  if (words === null) return "none";
  await api.putGameTactics(id, words);
  return "ok";
}
