import { isComputerSlot } from "../constants/computerSlot";
import type { GameResult, GameResultSlot } from "../types";

export function truthMissing(g: { replay: GameResult["replay"]; hasTruth?: boolean | null }): boolean {
  return !!g.replay && g.hasTruth === false;
}

export function hasComputerSlot(g: { team1: GameResultSlot[]; team2: GameResultSlot[] }): boolean {
  return [...g.team1, ...g.team2].some((s) => isComputerSlot(s.memberId));
}

export function gamePlayable(g: GameResult): boolean {
  return !!g.replay && !hasComputerSlot(g) && !truthMissing(g);
}
