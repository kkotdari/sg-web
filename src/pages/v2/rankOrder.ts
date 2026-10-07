import type { MemberStatsEntry } from "../../types";

export function rankOf(
  byMember: Record<string, MemberStatsEntry>,
  memberIds: string[],
): Map<string, number> {
  const ranked = memberIds
    .map((id) => byMember[id])
    .filter((e): e is MemberStatsEntry => !!e && e.sortOrder != null && e.tieGroup != null)
    .filter((e) => e.rankScore != null)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const out = new Map<string, number>();
  let rank = 0;
  ranked.forEach((e, i) => {
    if (i === 0 || e.tieGroup !== ranked[i - 1].tieGroup) rank = i + 1;
    out.set(e.memberId, rank);
  });
  return out;
}
