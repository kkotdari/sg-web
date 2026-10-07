import { useState, type ReactNode } from "react";
import { cx, avatarColor } from "../../utils/format";

export interface AvatarMember {
  id: string;
  nickname: string;
  avatar: string | null;
}

interface AvatarProps {
  member?: AvatarMember | null;
  size?: number;
  className?: string;
  icon?: ReactNode;
}

const AVATAR_RADIUS = "50%";

export default function Avatar({ member, size = 28, className, icon }: AvatarProps) {
  const radius = AVATAR_RADIUS;
  const [broken, setBroken] = useState(false);
  if (icon) {
    return (
      <span className={cx("scr-avatar", "scr-avatar-empty", className)} style={{ width: size, height: size, borderRadius: radius }}>
        {icon}
      </span>
    );
  }
  if (!member) {
    return (
      <span
        className={cx("scr-avatar", "scr-avatar-empty", className)}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }
  if (member.avatar && !broken) {
    return (
      <img
        src={member.avatar}
        alt={member.nickname}
        className={cx("scr-avatar", className)}
        style={{ width: size, height: size, borderRadius: radius }}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span
      className={cx("scr-avatar", "scr-avatar-fallback", className)}
      style={{ width: size, height: size, fontSize: size * 0.44, background: avatarColor(member.id), borderRadius: radius }}
    >
      {member.nickname?.[0] ?? "?"}
    </span>
  );
}
