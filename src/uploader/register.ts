import { api } from "../api/client";
import {
  buildReplayDrafts, memberSlotCount, mergeIntoExistingGame, resolveUnmatchedAsUnregistered,
  shortMatchHint, validateReplayDraft, type ReplayDraft,
} from "../utils/replayDraft";
import type { GameOutcome, Member, NewGameResult } from "../types";
import { isComputerSlot } from "../constants/computerSlot";
import { isUnregisteredSlot } from "../constants/unregisteredSlot";

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

export async function registerReplayFile(file: File, opts: { restore?: boolean } = {}): Promise<UploadOutcome> {
  const [draft] = await buildReplayDrafts([file], await membersFresh());
  return opts.restore ? settleRestore(draft) : settle(draft);
}

/** 내전 — 참가자 모두가 회원(컴퓨터 · 미등록 · 못 맞춘 이름 없음). */
function isClanGame(d: ReplayDraft): boolean {
  const slots = [...d.team1, ...d.team2];
  return slots.length > 0 && d.unmatchedTeam1.length === 0 && d.unmatchedTeam2.length === 0
    && slots.every((s) => !!s.memberId && !isComputerSlot(s.memberId) && !isUnregisteredSlot(s.memberId));
}

/* ★ 한 번 되올리기(2026-11-05, 요청: "업데이터 업뎃해서 1회만 7월부터의 내전 경기 리플레이랑 기본정보 재등록(머지)") — 업로더가 7월부터의 AutoSave 를
   restore 로 한 번씩 넘긴다. 내전 판만 서버에 restore 로 보낸다: 있는 판(마감한 달 · 마감 보존한 판도)엔 리플레이 · 기본 정보를 머지하고,
   열린 달에 없던 판은 평소처럼 등록한다(마감한 달에 없던 판은 서버가 거절 → 건너뜀). 공방 · 등록 규칙에 걸리는 판은 건너뛴다. */
async function settleRestore(d: ReplayDraft): Promise<UploadOutcome> {
  const summary = summaryOf(d);
  if (d.parseError) return { kind: "skipped", reason: `분석 실패: ${d.parseError}`, summary };
  if (d.excludeReason === "duplicate") return { kind: "merged", summary };
  if (!isClanGame(d)) return { kind: "skipped", reason: "되올리기: 내전이 아님", summary };
  if (d.excluded) return { kind: "skipped", reason: "되올리기: 등록 대상이 아님", summary };
  if (d.teamSplitUncertain) return { kind: "skipped", reason: "되올리기: 팀을 두 편으로 못 나눔", summary };
  if (UPLOADER_RULES.skipIfGuessedObservers && d.guessedObservers.length > 0) return { kind: "skipped", reason: "되올리기: 관전자 추정", summary };
  if (UPLOADER_RULES.skipShortMatch && shortMatchHint(d)) return { kind: "skipped", reason: "되올리기: 2분 미만 경기", summary };
  const problem = validateReplayDraft(d);
  if (problem) return { kind: "skipped", reason: `되올리기: ${problem}`, summary };
  try {
    const { game, merged, deleted } = await api.createGameResult({ ...payloadOf(d), restore: true });
    if (deleted) return { kind: "skipped", reason: "되올리기: 운영자가 삭제한 경기", summary };
    return merged ? { kind: "merged", summary } : { kind: "registered", matchNo: game.matchNo, summary };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/마감/.test(msg)) return { kind: "skipped", reason: `되올리기: ${msg}`, summary };
    throw e;
  }
}

function payloadOf(r: ReplayDraft): NewGameResult {
  return {
    date: r.date, team1: r.team1, team2: r.team2, result: r.result as GameOutcome, matchType: r.matchType,
    ...(r.gameTypeId !== null ? { gameType: r.gameTypeId } : {}),
    replay: r.replay,
    mapName: r.mapName || null, gameStartedAt: r.gameStartedAt, durationSeconds: r.durationSeconds,
    mapData: r.mapGrid,
    chats: r.chats,
    chatSaver: r.chatSaver,
  };
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

  const { game, merged, deleted } = await api.createGameResult(payloadOf(r));
  if (deleted) return { kind: "skipped", reason: "운영자가 삭제한 경기(다시 등록하지 않음)", summary };
  return merged ? { kind: "merged", summary } : { kind: "registered", matchNo: game.matchNo, summary };
}
