import { todayStr } from "./date";
import { parseReplayFile, ReplayParseError } from "./replayParser";
import type { ReplayMapGrid } from "./replayParser";
import { matchReplayPlayerToMember } from "./replayMemberMatch";
import { api } from "../api/client";
import { isComputerSlot, newComputerSlotId } from "../constants/computerSlot";
import { isUnregisteredSlot, newUnregisteredSlotId } from "../constants/unregisteredSlot";
import type { ReplayUpload, GameOutcome, GameResultSlot, GameType, Race, Member } from "../types";

/* 서버가 받지 않는 리플레이 게임 종류 — 비었다. 유즈맵(10)도 이제 받는다(2026-10-19, 요청: "유즈맵 경기도 등록 가능하게 · 재생기는 안되도 되고 기록만") —
   서버가 유즈맵 표식(ums)을 달아 통계·재생기에서 뺀다. 갈래 거절 길(excludeReason "gametype")은 다시 쓸 일에 대비해 남긴다. */
const SERVER_REJECTS_GAME_TYPE = new Set<number>([]);
/** 리플레이 게임 종류 '유즈맵(Use Map Settings)'. */
export const UMS_GAME_TYPE_ID = 10;

export const isRejectedGameType = (id: number | null): boolean =>
  id !== null && SERVER_REJECTS_GAME_TYPE.has(id);

export interface UnmatchedPlayer {
  rawName: string;
  race: Race | "";
  apm: number | null;
  eapm: number | null;
  cmdCount: number | null;
  effectiveCmdCount: number | null;
  buildCount: number | null;
}

export interface ReplayDraft {
  fileName: string;
  mapName: string;
  date: string;
  gameStartedAt: string | null;
  durationSeconds: number | null;
  team1: GameResultSlot[];
  team2: GameResultSlot[];
  unmatchedTeam1: UnmatchedPlayer[];
  unmatchedTeam2: UnmatchedPlayer[];
  result: GameOutcome | "";
  matchType: GameType;
  replay: ReplayUpload | null;
  winnerSide: "team1" | "team2" | null;
  guessedObservers: string[];
  teamSplitUncertain: boolean;
  ffa: boolean;
  leaves: { rawName: string; leaveSec: number | null; reason: string | null; lastCmdSec: number | null }[];
  mapGrid: ReplayMapGrid | null;
  chats: { frame: number; text: string }[];
  /** 리플레이 저장자(팀챗/전체 가름 · replayParser chatSaver). */
  chatSaver: string | null;
  parseError: string | null;
  excluded: boolean;
  excludeReason: "duplicate" | "computer" | "nonmember" | "gametype" | "fewmembers" | null;
  gameTypeId: number | null;
  gameTypeName: string;
  merged?: boolean;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function buildDraft(file: File, members: Member[]): Promise<ReplayDraft> {
  const replay: ReplayUpload = {
    originalName: file.name,
    displayName: file.name,
    url: await readFileAsDataUrl(file),
  };

  try {
    const parsed = await parseReplayFile(file);
    const usedIds = new Set<string>();
    const assign = (players: typeof parsed.team1): { rows: GameResultSlot[]; unmatched: UnmatchedPlayer[] } => {
      const rows: GameResultSlot[] = [];
      const unmatched: UnmatchedPlayer[] = [];
      players.forEach((p) => {
        if (p.isComputer) {
          rows.push({
            memberId: newComputerSlotId(), race: p.race, rawName: p.rawName,
            apm: p.apm, eapm: p.eapm, cmdCount: p.cmdCount, effectiveCmdCount: p.effectiveCmdCount, buildCount: p.buildCount,
          });
          return;
        }
        const member = matchReplayPlayerToMember(p.rawName, members);
        if (member && !usedIds.has(member.id)) {
          usedIds.add(member.id);
          rows.push({
            memberId: member.id, race: p.race, rawName: p.rawName,
            apm: p.apm, eapm: p.eapm, cmdCount: p.cmdCount, effectiveCmdCount: p.effectiveCmdCount, buildCount: p.buildCount,
          });
        } else {
          unmatched.push({
            rawName: p.rawName, race: p.race,
            apm: p.apm, eapm: p.eapm, cmdCount: p.cmdCount, effectiveCmdCount: p.effectiveCmdCount, buildCount: p.buildCount,
          });
        }
      });
      rows.sort((a, b) => Number(isComputerSlot(a.memberId)) - Number(isComputerSlot(b.memberId)));
      return { rows, unmatched };
    };
    const t1 = assign(parsed.team1);
    const t2 = assign(parsed.team2);
    const sec = (f: number | null): number | null => (f === null ? null : Math.round(f * 0.042));
    const leaves = [...parsed.team1, ...parsed.team2]
      .filter((p) => !p.isComputer)
      .map((p) => ({
        rawName: p.rawName,
        leaveSec: sec(p.signals?.leaveFrame ?? null),
        reason: p.signals?.leaveReason ?? null,
        lastCmdSec: sec(p.signals?.lastCmdFrame ?? null),
      }));

    return {
      fileName: file.name,
      mapName: parsed.mapName,
      date: parsed.date,
      gameStartedAt: parsed.gameStartedAt,
      durationSeconds: parsed.durationSeconds,
      team1: t1.rows,
      team2: t2.rows,
      unmatchedTeam1: t1.unmatched,
      unmatchedTeam2: t2.unmatched,
      result: parsed.winnerSide ?? "unknown",
      matchType: parsed.matchType,
      gameTypeId: parsed.gameTypeId,
      gameTypeName: parsed.gameTypeName,
      replay,
      winnerSide: parsed.winnerSide,
      guessedObservers: parsed.guessedObservers,
      teamSplitUncertain: parsed.teamSplitUncertain,
      ffa: parsed.ffa,
      leaves,
      mapGrid: parsed.mapGrid,
      chats: parsed.chats,
      chatSaver: parsed.chatSaver,
      parseError: null,
      excluded: isRejectedGameType(parsed.gameTypeId),
      excludeReason: isRejectedGameType(parsed.gameTypeId) ? "gametype" : null,
    };
  } catch (e) {
    return {
      fileName: file.name,
      mapName: "",
      date: todayStr(),
      gameStartedAt: null,
      durationSeconds: null,
      team1: [],
      team2: [],
      unmatchedTeam1: [],
      unmatchedTeam2: [],
      result: "",
      matchType: "0101",
      gameTypeId: null,
      gameTypeName: "",
      replay,
      winnerSide: null,
      guessedObservers: [],
      teamSplitUncertain: false,
      ffa: false,
      leaves: [],
      mapGrid: null,
      chats: [],
      chatSaver: null,
      parseError: e instanceof ReplayParseError ? e.message : "리플레이를 분석하지 못했어요. 직접 입력해 주세요.",
      excluded: false,
      excludeReason: null,
    };
  }
}

export function resolveUnmatchedAsUnregistered(d: ReplayDraft): ReplayDraft {
  if (d.unmatchedTeam1.length === 0 && d.unmatchedTeam2.length === 0) return d;
  const toSlot = (p: UnmatchedPlayer): GameResultSlot => ({
    memberId: newUnregisteredSlotId(), rawName: p.rawName,
    race: p.race, apm: p.apm, eapm: p.eapm, cmdCount: p.cmdCount, effectiveCmdCount: p.effectiveCmdCount, buildCount: p.buildCount,
  });
  return {
    ...d,
    team1: [...d.team1, ...d.unmatchedTeam1.map(toSlot)],
    team2: [...d.team2, ...d.unmatchedTeam2.map(toSlot)],
    unmatchedTeam1: [],
    unmatchedTeam2: [],
  };
}

export function memberSlotCount(d: ReplayDraft): number {
  const ids = new Set(
    [...d.team1, ...d.team2]
      .map((s) => s.memberId)
      .filter((id) => !isComputerSlot(id) && !isUnregisteredSlot(id)),
  );
  return ids.size;
}

export function hasComputerSlot(d: ReplayDraft): boolean {
  return [...d.team1, ...d.team2].some((s) => isComputerSlot(s.memberId));
}

export function hasUnregisteredSlot(d: ReplayDraft): boolean {
  if (d.unmatchedTeam1.length > 0 || d.unmatchedTeam2.length > 0) return true;
  return [...d.team1, ...d.team2].some((s) => isUnregisteredSlot(s.memberId));
}

export const SHORT_MATCH_SEC = 2 * 60;

export function shortMatchHint(d: ReplayDraft): string | null {
  if (d.durationSeconds === null || d.durationSeconds >= SHORT_MATCH_SEC) return null;
  const mm = Math.floor(d.durationSeconds / 60);
  const ss = d.durationSeconds % 60;
  return `${mm}분 ${ss}초짜리 짧은 경기예요 — 시작하자마자 나갔거나 맵만 확인한 판일 수 있어요.`
    + " 진짜 경기가 맞는지 보고 등록하거나 제외해 주세요.";
}

export function validateReplayDraft(d: ReplayDraft): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return "날짜를 올바르게 입력해 주세요.";
  if (!d.result) return "승패를 선택해 주세요.";
  const ffaNoWinner = d.ffa && (d.result === "draw" || d.result === "unknown");
  if ((d.team1.length === 0 && !ffaNoWinner) || d.team2.length === 0) {
    return "양 팀에 최소 1명 이상의 멤버를 선택해 주세요.";
  }
  if ([...d.team1, ...d.team2].some((r) => !isComputerSlot(r.memberId) && !r.race)) {
    return "모든 멤버의 종족을 선택해 주세요.";
  }
  return null;
}

async function applyKnownClassifications(drafts: ReplayDraft[]): Promise<ReplayDraft[]> {
  const rawNames = new Set<string>();
  drafts.forEach((d) => {
    d.unmatchedTeam1.forEach((p) => rawNames.add(p.rawName));
    d.unmatchedTeam2.forEach((p) => rawNames.add(p.rawName));
  });
  if (rawNames.size === 0) return drafts;

  const entries = await api.lookupReplayNameClassifications([...rawNames]).catch(() => []);
  if (entries.length === 0) return drafts;
  const kindByName = new Map(entries.map((e) => [e.rawName, e.kind]));

  const reclassify = (side: UnmatchedPlayer[]): { rows: GameResultSlot[]; unmatched: UnmatchedPlayer[] } => {
    const rows: GameResultSlot[] = [];
    const unmatched: UnmatchedPlayer[] = [];
    side.forEach((p) => {
      const kind = kindByName.get(p.rawName);
      if (!kind) { unmatched.push(p); return; }
      rows.push({
        memberId: kind === "computer" ? newComputerSlotId() : newUnregisteredSlotId(), rawName: p.rawName,
        race: p.race, apm: p.apm, eapm: p.eapm, cmdCount: p.cmdCount, effectiveCmdCount: p.effectiveCmdCount, buildCount: p.buildCount,
      });
    });
    return { rows, unmatched };
  };

  return drafts.map((d) => {
    const t1 = reclassify(d.unmatchedTeam1);
    const t2 = reclassify(d.unmatchedTeam2);
    if (t1.rows.length === 0 && t2.rows.length === 0) return d;
    const bySlotKind = (a: GameResultSlot, b: GameResultSlot) => Number(isComputerSlot(a.memberId)) - Number(isComputerSlot(b.memberId));
    return {
      ...d,
      team1: [...d.team1, ...t1.rows].sort(bySlotKind),
      team2: [...d.team2, ...t2.rows].sort(bySlotKind),
      unmatchedTeam1: t1.unmatched,
      unmatchedTeam2: t2.unmatched,
    };
  });
}

export async function buildReplayDrafts(files: File[], members: Member[]): Promise<ReplayDraft[]> {
  const built = await Promise.all(files.map((f) => buildDraft(f, members)));
  const preClassified = await applyKnownClassifications(built);
  const classified = preClassified.map((d) => {
    if (d.excluded || d.parseError) return d;
    if (memberSlotCount(d) >= 2) return d;
    return { ...d, excluded: true, excludeReason: "fewmembers" as const };
  });

  return Promise.all(classified.map(async (d) => {
    if (!d.excluded) return d;
    const merged = await mergeIntoExistingGame(d);
    if (!merged) return d;
    return { ...d, excludeReason: "duplicate" as const, merged: true };
  }));
}

export async function mergeIntoExistingGame(d: ReplayDraft): Promise<boolean> {
  if (!d.gameStartedAt || d.parseError || d.excludeReason === "gametype") return false;
  try {
    return (await api.mergeReplay(draftToMergePayload(d, d.gameStartedAt))).merged;
  } catch {
    return false;
  }
}

function draftToMergePayload(d: ReplayDraft, gameStartedAt: string) {
  const fromSlots = [...d.team1, ...d.team2].map((s) => ({
    playerName: s.rawName ?? "",
    race: s.race || null, apm: s.apm, eapm: s.eapm, cmdCount: s.cmdCount,
    effectiveCmdCount: s.effectiveCmdCount, buildCount: s.buildCount,
  }));
  const fromUnmatched = [...d.unmatchedTeam1, ...d.unmatchedTeam2].map((p) => ({
    playerName: p.rawName,
    race: p.race || null, apm: p.apm, eapm: p.eapm, cmdCount: p.cmdCount,
    effectiveCmdCount: p.effectiveCmdCount, buildCount: p.buildCount,
  }));
  return {
    replay: d.replay,
    gameStartedAt,
    result: d.winnerSide,
    mapName: d.mapName || null,
    durationSeconds: d.durationSeconds,
    mapData: d.mapGrid,
    chats: d.chats,
    chatSaver: d.chatSaver,
    players: [...fromSlots, ...fromUnmatched].filter((p) => p.playerName),
  };
}
