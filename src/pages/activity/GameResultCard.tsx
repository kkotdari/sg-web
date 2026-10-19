import { memo, useMemo } from "react";
import { ClipboardList } from "lucide-react";
import { formatWhen } from "../../utils/date";
import type { GameResult, Member } from "../../types";
import ActivityComments from "./ActivityComments";
import { ActivityCard } from "./ActivityCard";
import GameResultCardBody, { type SearchListRow } from "./GameResultCardBody";
import type { GameResultItem } from "./activityItems";

/* 게임결과 카드(공유 화면 등) — 2026-10-19 ActivityScreen 에서 옮겼다. */
export const GameResultCard = memo(function GameResultCard({ item, memberOf, onDeleted, onChanged, dateLabel, highlightMemberIds, highlightTerms, active = true, className }: {
  item: GameResultItem;
  memberOf: (id: string) => Member | undefined;
  onDeleted: (id: number) => void;
  onChanged: (m: GameResult) => void;
  dateLabel: string;
  highlightMemberIds?: Set<string>;
  highlightTerms?: string[];
  active?: boolean;
  className?: string;
}) {
  const rows: SearchListRow[] = useMemo(() => {
    const m = item.gameResult;
    return [{ id: m.id, date: m.date, team1: m.team1, team2: m.team2, result: m.result, raw: m }];
  }, [item.gameResult]);

  return (
    <ActivityCard
      className={className}
      dateLabel={dateLabel}
      icon={<ClipboardList size={16} aria-hidden />}
      label="게임결과"
      timeText={formatWhen(item.time, { clock: item.withClock })}
      bodyClassName="scr-activity-game-result-body"
      comment={<ActivityComments targetType="gameResult" targetId={item.gameResult.id} />}
    >
      <GameResultCardBody rows={rows} memberOf={memberOf} onDeleted={onDeleted} onChanged={onChanged} highlightMemberIds={highlightMemberIds} highlightTerms={highlightTerms} active={active} />
    </ActivityCard>
  );
});
