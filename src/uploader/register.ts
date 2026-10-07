import { api } from "../api/client";
import {
  buildReplayDrafts, memberSlotCount, mergeIntoExistingGame, resolveUnmatchedAsUnregistered,
  shortMatchHint, validateReplayDraft, type ReplayDraft,
} from "../utils/replayDraft";
import type { GameOutcome, Member, NewGameResult } from "../types";

export type UploadOutcome =
  | { kind: "registered"; matchNo: string; summary: string }
  | { kind: "merged"; summary: string }
  | { kind: "duplicate"; summary: string }
  | { kind: "skipped"; reason: string; summary: string };

export const UPLOADER_RULES = {
  skipIfGuessedObservers: true,
  skipShortMatch: true,
} as const;

let members: Member[] = [];
let membersAt = 0;

async function membersFresh(): Promise<Member[]> {
  if (members.length === 0 || Date.now() - membersAt > 10 * 60_000) {
    members = await api.getMembers();
    membersAt = Date.now();
  }
  return members;
}

export function resetMembersCache(): void {
  members = [];
  membersAt = 0;
}

function summaryOf(d: ReplayDraft): string {
  return `${d.mapName || "(맵 없음)"} · ${d.matchType} · ${d.durationSeconds ?? "?"}s`;
}

export async function registerReplayFile(file: File): Promise<UploadOutcome> {
  const [draft] = await buildReplayDrafts([file], await membersFresh());
  return settle(draft);
}

async function settle(d: ReplayDraft): Promise<UploadOutcome> {
  const summary = summaryOf(d);
  const skip = async (reason: string): Promise<UploadOutcome> =>
    (await mergeIntoExistingGame(d)) ? { kind: "merged", summary } : { kind: "skipped", reason, summary };

  if (d.parseError) return { kind: "skipped", reason: `분석 실패: ${d.parseError}`, summary };
  if (d.excludeReason === "duplicate") return { kind: "merged", summary };
  if (d.excludeReason === "gametype") return skip(`${d.gameTypeName || "유즈맵"} 경기는 등록할 수 없음`);
  if (d.excludeReason === "fewmembers") return skip(`회원이 2명 미만(${memberSlotCount(d)}명)인 경기`);
  if (d.excluded) return skip("등록 대상이 아님");

  if (d.teamSplitUncertain) return skip("팀을 두 편으로 못 나눔(맵 자체의 한계)");
  if (UPLOADER_RULES.skipIfGuessedObservers && d.guessedObservers.length > 0) {
    return skip(`관전자로 추정해 뺀 사람 있음: ${d.guessedObservers.join(", ")}`);
  }
  if (UPLOADER_RULES.skipShortMatch && shortMatchHint(d)) return skip("2분 미만 경기");

  const r = resolveUnmatchedAsUnregistered(d);
  const problem = validateReplayDraft(r);
  if (problem) return skip(problem);

  const payload: NewGameResult = {
    date: r.date, team1: r.team1, team2: r.team2, result: r.result as GameOutcome, matchType: r.matchType,
    ...(r.gameTypeId !== null ? { gameType: r.gameTypeId } : {}),
    replay: r.replay,
    mapName: r.mapName || null, gameStartedAt: r.gameStartedAt, durationSeconds: r.durationSeconds,
    mapData: r.mapGrid,
    chats: r.chats,
  };
  const { game, merged, deleted } = await api.createGameResult(payload);
  if (deleted) return { kind: "skipped", reason: "운영자가 삭제한 경기(다시 등록하지 않음)", summary };
  return merged ? { kind: "merged", summary } : { kind: "registered", matchNo: game.matchNo, summary };
}
