import type { Member } from "../types";

export const SEARCH_TERM_SEP = "\t";

export function normalizeSearchText(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .toLowerCase();
}

export function splitSearchTerms(query: string): string[] {
  return query.split(/[,	]/).map((t) => normalizeSearchText(t).trim()).filter(Boolean);
}

export function memberMatchesTerm(member: Member, term: string): boolean {
  return (
    normalizeSearchText(member.nickname).includes(term)
    || normalizeSearchText(member.battletag).includes(term)
    || member.replayAliases.some((a) => normalizeSearchText(a).includes(term))
  );
}

export function memberMatchesQuery(member: Member, query: string): boolean {
  const terms = splitSearchTerms(query);
  if (terms.length === 0) return true;
  return terms.some((t) => memberMatchesTerm(member, t));
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
