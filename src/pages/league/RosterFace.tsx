import { Bot, User } from "lucide-react";
import Avatar from "../../components/common/Avatar";
import type { LeaguePoolMember } from "../../types";
import { imgSrc } from "../../utils/imgSrc";

export default function RosterFace({ member, avatarSize = 64, iconSize = 26 }: {
  member: Pick<LeaguePoolMember, "kind" | "memberId" | "nickname" | "avatar" | "rosterImage">;
  avatarSize?: number;
  iconSize?: number;
}) {
  if (member.rosterImage) {
    return <img className="scr-league-rcard-img" src={imgSrc(member.rosterImage)} alt={member.nickname} draggable={false} />;
  }
  const icon = member.kind === "computer" ? <Bot size={iconSize} />
    : member.kind === "guest" ? <User size={iconSize} /> : undefined;
  return (
    <span className="scr-league-rcard-fallback">
      <Avatar
        member={{ id: member.memberId, nickname: member.nickname, avatar: member.avatar }}
        size={avatarSize} icon={icon}
      />
      <span className="scr-league-rcard-name">{member.nickname}</span>
    </span>
  );
}
