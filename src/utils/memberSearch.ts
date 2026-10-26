import type { Member } from "../types";

export function normalizeSearchText(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .toLowerCase();
}

export function memberMatchesTerm(member: Member, term: string): boolean {
  return (
    normalizeSearchText(member.nickname).includes(term)
    || normalizeSearchText(member.battletag).includes(term)
    || member.replayAliases.some((a) => normalizeSearchText(a).includes(term))
  );
}

export interface MemberSearchSuggestion {
  member: Member;
  matchTexts: string[];
}

export function activeMemberSearchTerms(members: Member[]): MemberSearchSuggestion[] {
  return members
    .filter((m) => m.status !== "withdrawn" && m.status !== "suspended")
    .map((m) => ({ member: m, matchTexts: [m.nickname, ...m.replayAliases] }));
}
