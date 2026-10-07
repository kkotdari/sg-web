import { isAdminRole } from "../constants/roles";
import type { GameResult, Member } from "../types";

export function isGameParticipant(g: GameResult, userId: string | null | undefined): boolean {
  if (!userId) return false;
  return [...g.team1, ...g.team2].some((s) => s.memberId === userId);
}

export function canManageGame(g: GameResult, user: Member | null | undefined): boolean {
  if (!user) return false;
  if (isAdminRole(user.roles)) return true;
  return isGameParticipant(g, user.id);
}

export function isSecretGame(g: GameResult): boolean {
  return !!g.hidden && g.team1.length === 0 && g.team2.length === 0;
}
