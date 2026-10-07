import type { Member } from "../types";

function battletagName(battletag: string): string {
  const hashIdx = battletag.indexOf("#");
  return (hashIdx === -1 ? battletag : battletag.slice(0, hashIdx)).trim().toLowerCase();
}

export function matchReplayPlayerToMember(rawName: string, members: Member[]): Member | undefined {
  const q = rawName.trim().toLowerCase();
  if (!q) return undefined;
  return (
    members.find((m) => m.replayAliases.some((a) => a.trim().toLowerCase() === q)) ??
    members.find((m) => battletagName(m.battletag) === q) ??
    members.find((m) => m.battletag.trim().toLowerCase() === q) ??
    members.find((m) => m.nickname.trim().toLowerCase() === q)
  );
}
