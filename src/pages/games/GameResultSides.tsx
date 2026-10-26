import { Monitor, User } from "lucide-react";
import Avatar from "../../components/common/Avatar";
import RaceBadge from "../../components/common/RaceBadge";
import { isComputerSlot, computerSlotLabel } from "../../constants/computerSlot";
import { isUnregisteredSlot, unregisteredSlotLabel } from "../../constants/unregisteredSlot";
import { cx } from "../../utils/format";
import { normalizeSearchText } from "../../utils/memberSearch";
import type { Member, GameResultSlot, GameOutcome } from "../../types";

export type Outcome = "win" | "loss" | "draw" | "notHeld";

export function outcomeFor(side: "team1" | "team2", result: GameOutcome): Outcome {
  if (result === "draw") return "draw";
  if (result === "not_held") return "notHeld";
  if (result === "unknown") return "notHeld";
  return side === result ? "win" : "loss";
}

export function isMeleeGame(g: {
  matchType?: string | null; team1: GameResultSlot[]; team2: GameResultSlot[];
}): boolean {
  if (g.matchType === "0103") return true;
  return g.matchType === "0101" && g.team1.length + g.team2.length > 2;
}
export function meleeLineup(
  team1: GameResultSlot[], team2: GameResultSlot[],
  memberOf: (id: string) => Member | undefined,
): string {
  const all = [...team1, ...team2];
  return all.map((s) => resolveSlotName(s, all, memberOf)).join(" vs ");
}
export function teamSummaryName(team: GameResultSlot[], memberOf: (id: string) => Member | undefined): string {
  if (team.length === 0) return "";
  const first = resolveSlotName(team[0], team, memberOf);
  return team.length > 1 ? `${first} 외 ${team.length - 1}명` : first;
}

export function resolveSlotName(slot: GameResultSlot, players: GameResultSlot[], memberOf: (id: string) => Member | undefined): string {
  const isComputer = isComputerSlot(slot.memberId);
  const isUnreg = isUnregisteredSlot(slot.memberId);
  const m = isComputer || isUnreg ? undefined : memberOf(slot.memberId);
  return isComputer
    ? (slot.rawName || computerSlotLabel(players, slot.memberId))
    : isUnreg
      ? (slot.rawName || unregisteredSlotLabel(players, slot.memberId))
      : (m?.nickname ?? slot.memberId);
}

export default function RosterSide({
  team, memberOf, highlightMemberIds, highlightTerms, nameMask,
}: {
  team: GameResultSlot[]; memberOf: (id: string) => Member | undefined;
  highlightMemberIds?: Set<string>; highlightTerms?: string[];
  /** 보이는 이름만 바꾸는 손 — 손님 모드의 가명(guestAliasOf · Player1…). 자료(rawName·memberId)는 그대로다. */
  nameMask?: (name: string, slot: GameResultSlot) => string;
}) {
  return (
    <div className="scr-roster-side">
      {team.map((s, i) => {
        const name = nameMask ? nameMask(resolveSlotName(s, team, memberOf), s) : resolveSlotName(s, team, memberOf);
        const m = memberOf(s.memberId);
        const nameLc = normalizeSearchText(name);
        const hl = highlightMemberIds?.has(s.memberId) || !!highlightTerms?.some((t) => nameLc.includes(t));
        const isComputer = isComputerSlot(s.memberId);
        const isUnreg = isUnregisteredSlot(s.memberId);
        return (
          <div key={`${s.memberId}-${i}`} className="scr-roster-block">
            <div className="scr-roster-row">
              <span className={cx("scr-roster-person", hl && "scr-roster-hit")}>
                {isComputer || isUnreg ? (
                  <span className="scr-matchup-slot-icon" aria-hidden>
                    {isComputer ? <Monitor size={14} /> : <User size={14} />}
                  </span>
                ) : (
                  <Avatar member={{ id: s.memberId, nickname: name, avatar: m?.avatar ?? null }} size={20} />
                )}
                <span className="scr-roster-name">{name}</span>
                <RaceBadge race={s.race} size={13} circleLetter className="scr-team-name-race" />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
