import GameResultTeams, { pointToneClass } from "../../components/common/GameResultTeams";
import { Spinner } from "../../components/common/Feedback";
import { cx } from "../../utils/format";
import { formatWhen } from "../../utils/date";
import { isComputerSlot } from "../../constants/computerSlot";
import { isUnregisteredSlot } from "../../constants/unregisteredSlot";
import type { GameResult, GameOutcome, GameResultSlot, Member } from "../../types";

interface PointDetailHistoryProps {
  gameResults: GameResult[];
  members: Member[];
  memberOf: (id: string) => Member | undefined;
  loading: boolean;
  deltaByMatchNo: Map<string, number>;
  bothTeams?: boolean;
  noRating?: boolean;
}

function deltaLabel(d: number | undefined): string | undefined {
  if (d === undefined) return undefined;
  const n = Math.round(d);
  return `${n > 0 ? "+" : ""}${n}점`;
}

function isExcludedFromRating(row: { team1: GameResultSlot[]; team2: GameResultSlot[] }): boolean {
  return [...row.team1, ...row.team2].some((s) => isComputerSlot(s.memberId) || isUnregisteredSlot(s.memberId));
}

interface HistoryRow {
  id: number;
  matchNo: string;
  date: string;
  team1: GameResultSlot[];
  team2: GameResultSlot[];
  result: GameOutcome;
}

interface DateGroup {
  date: string;
  items: HistoryRow[];
}

function toHistoryRows(gameResults: GameResult[], protagonistIds: Set<string>): HistoryRow[] {
  return gameResults.map((m) => {
    const onTeam1 = m.team1.some((s) => protagonistIds.has(s.memberId));
    const swap = !onTeam1 && m.team2.some((s) => protagonistIds.has(s.memberId));
    const result: GameOutcome = swap
      ? (m.result === "team1" ? "team2" : m.result === "team2" ? "team1" : m.result)
      : m.result;
    return {
      id: m.id, matchNo: m.matchNo, date: m.date,
      team1: swap ? m.team2 : m.team1,
      team2: swap ? m.team1 : m.team2,
      result,
    };
  });
}

function groupByDate(rows: HistoryRow[]): DateGroup[] {
  const groups: DateGroup[] = [];
  rows.forEach((row) => {
    const last = groups[groups.length - 1];
    if (last && last.date === row.date) last.items.push(row);
    else groups.push({ date: row.date, items: [row] });
  });
  return groups;
}

export default function PointDetailHistory({
  gameResults, members, memberOf, loading, deltaByMatchNo, bothTeams = false, noRating = false,
}: PointDetailHistoryProps) {
  const protagonistIds = new Set(members.map((m) => m.id));
  const groups = groupByDate(toHistoryRows(gameResults, protagonistIds));

  return (
    <div className="scr-game-result-list-panel-v2">
      {gameResults.length === 0 && (
        <div className="scr-empty">{loading ? <Spinner size={18} /> : "게임이 없어요"}</div>
      )}

      <div className="scr-game-result-cards">
        {groups.map((g) => (
          <div key={g.date} className="scr-game-result-date-group">
            <div className="scr-game-result-date-head scr-game-result-date-head-compact">{formatWhen(g.date)}</div>
            {g.items.map((r) => {
              const dLabel = noRating ? undefined : deltaLabel(deltaByMatchNo.get(r.matchNo));
              const excluded = !noRating && !dLabel && isExcludedFromRating(r);
              return bothTeams ? (
                <div key={r.id} className="scr-game-result-card scr-rank-history-team-card">
                  <GameResultTeams
                    team1={r.team1} team2={r.team2} memberOf={memberOf} result={r.result}
                    disableProfileLink compact bothTeamsTail textRoster
                  />
                  {(dLabel || excluded) && (
                    <div className="scr-rank-history-points-line">
                      <span className="scr-rank-history-calc">
                        레이팅 {dLabel
                          ? <strong className={cx(pointToneClass(dLabel))}>{dLabel}</strong>
                          : <strong className="scr-rank-history-excluded">제외</strong>}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div key={r.id} className="scr-game-result-card">
                  <GameResultTeams
                    team1={r.team1} team2={r.team2} memberOf={memberOf} result={r.result}
                    disableProfileLink stackedOutcome compact opponentOnly textRoster
                    outcomeNote={dLabel ?? (excluded ? "레이팅 제외" : undefined)}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
