import { gameIndexOf9 } from "scplay";
import { api } from "../api/client";
import { isMeleeGame } from "../pages/activity/GameResultSides";

/* ★ 게임 색인 굽기(2026-10-20, 요청: "모든 색인은 주인, 타겟, 대상, 행위, 추가속성 · 유저별로" → "전부 재생기 함수(api 제공) · 같은 사람의 같은 사건도 시간별로 저장" ·
   먼저 "누가 그 판을 열어도 채우지 않기 · 운영자 재분석에 포함시키고 참값 제거 시 제거 안 되게") — **운영자 재분석만** 부른다. 서버의 참값 자취와 맵을 받아 재생기와 같은
   검색 빌더(scplay gameIndexOf9)로 사건마다 한 줄을 뽑고, 서버의 따로 된 표(game_result_index)에 통째로 갈아 끼운다 — 참값을 지워도 남는다.
   자취가 없으면(아직 안 구웠거나 지운 판) 아무것도 안 적는다 — 있던 색인을 지우지 않는다. */
export async function indexGame(id: number): Promise<"ok" | "none"> {
  const [game, tracks] = await Promise.all([api.getGameResult(id), api.getGameUnitTracks(id)]);
  if (!tracks.motion) return "none";
  const grid = game.mapHash ? (await api.getReplayMaps([game.mapHash]))[0] ?? null : null;
  const slots = [
    ...game.team1.map((s) => ({ s, team: 1 })),
    ...game.team2.map((s) => ({ s, team: 2 })),
  ].filter((x) => !!x.s.rawName);
  const melee = isMeleeGame(game);
  const rows = await gameIndexOf9(tracks.motion, {
    grid, endSec: game.durationSeconds ?? 0, chats: tracks.chats,
    only: slots.filter((x) => !x.s.observer).map((x) => x.s.rawName!),
    skip: slots.filter((x) => x.s.observer).map((x) => x.s.rawName!),
    ...(melee ? {} : { teamOf: Object.fromEntries(slots.map((x) => [x.s.rawName!, x.team])) }),
  });
  if (rows === null) return "none";
  await api.putGameIndex(id, rows);
  return "ok";
}
