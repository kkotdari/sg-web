import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { LeagueMatchEntry } from "../../types";
import ComingMatches, { pickComingMatches } from "./ComingMatches";

/* ★ 다가오는 리그 경기 띠 — 옛 활동 홈 맨 위에서 리그 화면 위로 옮겼다(2026-10-26, 요청: "활동 화면 제거" → "리그화면 상단으로 옮김").
   피드에서 리그 경기(kind leagueMatch)만 받아 일주일 안의 것을 띠로 보이고, 누르면 그 리그의 대진표로 간다(같은 날 요청:
   "다가오는 매치 눌르면 해당 대진표로 이동하는걸로 변경 · 상세페이지 요소 모두 삭제" — 옛 리그 경기 상세·댓글 창은 걷었다). */

export default function LeagueComing({ onOpenLeague }: { onOpenLeague: (leagueId: number) => void }) {
  const [matches, setMatches] = useState<LeagueMatchEntry[]>([]);
  useEffect(() => {
    let dead = false;
    api.listFeed({ kinds: ["leagueMatch"], limit: 100 })
      .then((page) => { if (!dead) setMatches(page.items.flatMap((it) => (it.leagueMatch ? [it.leagueMatch] : []))); })
      .catch(() => {});
    return () => { dead = true; };
  }, []);
  const coming = pickComingMatches(matches);
  return coming.length > 0 ? <ComingMatches matches={coming} onOpen={(m) => onOpenLeague(m.leagueId)} /> : null;
}
