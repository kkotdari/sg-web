import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Member, Race } from "../types";

export function useDefaultRaceResolver(members: Member[]): (memberId: string) => Race | "" {
  const [byMember, setByMember] = useState<Record<string, Race>>({});

  useEffect(() => {
    const ids = members.map((m) => m.id);
    if (ids.length === 0) return;
    let cancelled = false;
    api.getGameResultStats({ memberIds: ids }).then((res) => {
      if (cancelled) return;
      const map: Record<string, Race> = {};
      res.members.forEach((entry) => {
        if (entry.mostPlayedRace) map[entry.memberId] = entry.mostPlayedRace;
      });
      setByMember(map);
    });
    return () => { cancelled = true; };
  }, []);

  return (memberId: string) => byMember[memberId] ?? "";
}
