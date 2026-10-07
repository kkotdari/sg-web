import { Swords } from "lucide-react";
import Avatar from "../../components/common/Avatar";
import { cx } from "../../utils/format";
import { useAppStore } from "../../store/appStore";
import type { LeagueMatchActivity, LeagueMatchTeam } from "../../types";
import { ActivityCard } from "./ActivityCard";

function LeagueSide({ team, won }: { team: LeagueMatchTeam | null; won: boolean }) {
  const memberOf = useAppStore((s) => s.memberOf);
  if (team === null) {
    return <div className="scr-league-match-side"><span className="scr-league-match-tbd">미정</span></div>;
  }
  if (team.members.length === 0) {
    return (
      <div className={cx("scr-league-match-side", won && "scr-league-match-side-won")}>
        <span className="scr-league-match-label">{team.label}</span>
      </div>
    );
  }
  return (
    <div className={cx("scr-league-match-side", won && "scr-league-match-side-won")}>
      {team.members.map((p) => (
        <div className="scr-league-match-person" key={p.memberId}>
          <Avatar member={memberOf(p.memberId)} size={34} />
          <span className="scr-league-match-name">{p.nickname}</span>
        </div>
      ))}
    </div>
  );
}

export default function LeagueMatchCard({
  match, timeText, dateLabel, footer,
}: {
  match: LeagueMatchActivity;
  timeText?: string;
  dateLabel?: string;
  footer?: React.ReactNode;
}) {
  const played = match.setsWonA !== null && match.setsWonB !== null;
  return (
    <ActivityCard
      dateLabel={dateLabel}
      icon={<Swords size={16} aria-hidden />}
      label={`${match.leagueName} ${match.roundName}`}
      timeText={timeText}
      comment={footer}
    >
      <div className={cx("scr-league-match-card", played && "scr-league-match-card-played")}>
        <LeagueSide team={match.teamA} won={played && match.winnerSide === "a"} />
        <div className="scr-league-match-score">
          {played ? `${match.setsWonA}:${match.setsWonB}` : "vs"}
        </div>
        <LeagueSide team={match.teamB} won={played && match.winnerSide === "b"} />
      </div>
    </ActivityCard>
  );
}
