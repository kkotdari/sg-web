import { Monitor, User } from "lucide-react";
import Avatar from "./Avatar";
import RaceBadge from "./RaceBadge";
import { cx } from "../../utils/format";
import { normalizeSearchText } from "../../utils/memberSearch";
import { useAppStore } from "../../store/appStore";
import { isComputerSlot, computerSlotLabel } from "../../constants/computerSlot";
import { isUnregisteredSlot, unregisteredSlotLabel } from "../../constants/unregisteredSlot";
import type { Member, GameResultSlot, GameOutcome } from "../../types";

interface GameResultTeamsProps {
  team1: GameResultSlot[];
  team2: GameResultSlot[];
  memberOf: (id: string) => Member | undefined;
  result: GameOutcome;
  highlightMemberIds?: Set<string>;
  highlightTerms?: string[];
  disableProfileLink?: boolean;
  stackedOutcome?: boolean;
  compact?: boolean;
  opponentOnly?: boolean;
  outcomeNote?: string;
  pointsByMember?: Map<string, string>;
  textRoster?: boolean;
  bothTeamsTail?: boolean;
}

type Outcome = "win" | "loss" | "draw" | "notHeld" | "unknown";

function outcomeFor(side: "team1" | "team2", result: GameOutcome): Outcome {
  if (result === "draw") return "draw";
  if (result === "not_held") return "notHeld";
  if (result === "unknown") return "unknown";
  return side === result ? "win" : "loss";
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  win: "승", loss: "패", draw: "무", notHeld: "미실시",
  unknown: "모름",
};
const OUTCOME_CLASS: Record<Outcome, string> = {
  win: "scr-win", loss: "scr-loss", draw: "scr-draw", notHeld: "scr-draw", unknown: "scr-draw",
};

export function pointToneClass(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (s.startsWith("-") || s.startsWith("−")) return "scr-loss";
  if (s.startsWith("+")) return "scr-win";
  const n = parseFloat(s);
  if (Number.isNaN(n) || n === 0) return "";
  return n > 0 ? "scr-win" : "scr-loss";
}

interface TeamRosterProps {
  side: "team1" | "team2";
  players: GameResultSlot[];
  memberOf: (id: string) => Member | undefined;
  outcome: Outcome;
  highlightMemberIds?: Set<string>;
  highlightTerms?: string[];
  disableProfileLink?: boolean;
  stackedOutcome?: boolean;
  compact?: boolean;
  pointsByMember?: Map<string, string>;
  textRoster?: boolean;
}

function TeamRoster({ side, players, memberOf, outcome, highlightMemberIds, highlightTerms, disableProfileLink, stackedOutcome, compact, pointsByMember, textRoster }: TeamRosterProps) {
  const openMemberProfile = useAppStore((s) => s.openMemberProfile);
  const avatarSize = 22;
  const raceSize = compact ? 12 : 15;

  return (
    <div className={cx("scr-team-block", `scr-team-block-${side}`)}>
      <div className={cx("scr-team-roster", `scr-team-roster-${side}`, textRoster && "scr-team-roster-text")}>
        {players.map((p) => {
          const isComputer = isComputerSlot(p.memberId);
          const isUnregistered = isUnregisteredSlot(p.memberId);
          const m = isComputer || isUnregistered ? undefined : memberOf(p.memberId);
          const name = isComputer
            ? (p.rawName || computerSlotLabel(players, p.memberId))
            : isUnregistered
              ? (p.rawName || unregisteredSlotLabel(players, p.memberId))
              : (m?.nickname ?? p.memberId);
          const nameLc = normalizeSearchText(name);
          const highlighted =
            highlightMemberIds?.has(p.memberId)
            || (!!highlightTerms && highlightTerms.some((t) => nameLc.includes(t)));
          const profileContent = textRoster ? (
            <span className="scr-team-name-wrap">
              <span className="scr-team-name">{name}</span>
              <RaceBadge race={p.race} size={raceSize} circleLetter className="scr-team-name-race" />
            </span>
          ) : (
            <>
              <span className="scr-team-avatar-wrap">
                {isComputer
                  ? <Avatar icon={<Monitor size={16} className="scr-chip-computer-icon" />} size={avatarSize} />
                  : isUnregistered
                    ? <Avatar icon={<User size={16} className="scr-chip-computer-icon" />} size={avatarSize} />
                    : <Avatar member={m} size={avatarSize} />}
                <RaceBadge
                  race={p.race} size={raceSize} circleLetter
                  className={cx("scr-team-avatar-race", `scr-team-avatar-race-${side}`)}
                />
              </span>
              <span className="scr-team-name">{name}</span>
            </>
          );
          const pointsLabel = pointsByMember?.get(p.memberId);
          return (
            <div key={p.memberId} className={cx("scr-team-player", highlighted && "scr-team-player-highlight")}>
              {disableProfileLink || isComputer || isUnregistered ? (
                <span className="scr-team-profile">{profileContent}</span>
              ) : (
                <button
                  type="button"
                  className="scr-team-profile scr-team-profile-btn"
                  onClick={(e) => { e.stopPropagation(); openMemberProfile(p.memberId); }}
                >
                  {profileContent}
                </button>
              )}
              {pointsLabel && <span className="scr-team-player-points">{pointsLabel}</span>}
            </div>
          );
        })}
      </div>
      {!stackedOutcome && (
        <div className={cx("scr-team-outcome", `scr-team-outcome-${side}`, OUTCOME_CLASS[outcome])}>{OUTCOME_LABEL[outcome]}</div>
      )}
    </div>
  );
}

export default function GameResultTeams({
  team1, team2, memberOf, result, highlightMemberIds, highlightTerms, disableProfileLink, stackedOutcome, compact, opponentOnly,
  outcomeNote, pointsByMember, textRoster, bothTeamsTail,
}: GameResultTeamsProps) {
  const outcome1 = outcomeFor("team1", result);
  const outcome2 = outcomeFor("team2", result);
  if (bothTeamsTail) {
    return (
      <div className="scr-game-result-row scr-game-result-row-result-only scr-game-result-row-team-tail">
        <div className="scr-game-result-team-side scr-game-result-team-side-ours">
          <TeamRoster
            side="team1" players={team1} memberOf={memberOf} outcome={outcome1}
            highlightMemberIds={highlightMemberIds} disableProfileLink={disableProfileLink}
            stackedOutcome compact={compact} textRoster={textRoster}
          />
          <span className="scr-game-result-conn">팀으로</span>
        </div>
        <div className="scr-game-result-team-side scr-game-result-team-side-theirs">
          <TeamRoster
            side="team2" players={team2} memberOf={memberOf} outcome={outcome2}
            highlightMemberIds={highlightMemberIds} disableProfileLink={disableProfileLink}
            stackedOutcome compact={compact} textRoster={textRoster}
          />
          <span className="scr-game-result-result-tail">
            <span className="scr-game-result-conn">팀에게</span>
            <span className={cx("scr-team-outcome", "scr-team-outcome-result", OUTCOME_CLASS[outcome1])}>{OUTCOME_LABEL[outcome1]}</span>
          </span>
        </div>
        {pointsByMember && (
          <div className="scr-team-points-col">
            {team2.map((p) => (
              <span key={p.memberId} className={cx("scr-team-points-row", pointToneClass(pointsByMember.get(p.memberId)))}>{pointsByMember.get(p.memberId) ?? ""}</span>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (opponentOnly) {
    return (
      <div className="scr-game-result-row scr-game-result-row-result-only">
        <TeamRoster
          side="team2" players={team2} memberOf={memberOf} outcome={outcome2}
          highlightMemberIds={highlightMemberIds} disableProfileLink={disableProfileLink}
          stackedOutcome compact={compact} textRoster={textRoster}
        />
        <span className="scr-game-result-result-tail">
          <span className="scr-game-result-conn">에게</span>
          <span className={cx("scr-team-outcome", "scr-team-outcome-result", OUTCOME_CLASS[outcome1])}>{OUTCOME_LABEL[outcome1]}</span>
        </span>
        {outcomeNote && <span className={cx("scr-game-result-result-points", pointToneClass(outcomeNote))}>{outcomeNote}</span>}
      </div>
    );
  }
  return (
    <div className="scr-game-result-row">
      <TeamRoster side="team1" players={team1} memberOf={memberOf} outcome={outcome1} highlightMemberIds={highlightMemberIds} highlightTerms={highlightTerms} disableProfileLink={disableProfileLink} stackedOutcome={stackedOutcome} compact={compact} pointsByMember={pointsByMember} textRoster={textRoster} />
      {stackedOutcome ? (
        <div className="scr-game-result-vs-col">
          <span className={cx("scr-team-outcome", "scr-team-outcome-stacked", OUTCOME_CLASS[outcome1])}>{OUTCOME_LABEL[outcome1]}</span>
          <span className="scr-list-vs">VS</span>
          <span className={cx("scr-team-outcome", "scr-team-outcome-stacked", OUTCOME_CLASS[outcome2])}>{OUTCOME_LABEL[outcome2]}</span>
        </div>
      ) : (
        <span className="scr-list-vs">VS</span>
      )}
      <TeamRoster side="team2" players={team2} memberOf={memberOf} outcome={outcome2} highlightMemberIds={highlightMemberIds} highlightTerms={highlightTerms} disableProfileLink={disableProfileLink} stackedOutcome={stackedOutcome} compact={compact} pointsByMember={pointsByMember} textRoster={textRoster} />
    </div>
  );
}
