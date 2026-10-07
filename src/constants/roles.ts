import type { MemberRole } from "../types";

export const ROLE_INFO: Record<MemberRole, string> = {
  "0202": "운영자",
  "0203": "회원",
};

export const ASSIGNABLE_ROLES: MemberRole[] = ["0202", "0203"];

export const ADMIN_ROLES: MemberRole[] = ["0202"];

export const hasAnyRole = (roles: MemberRole[], ...targets: MemberRole[]): boolean =>
  roles.some((r) => targets.includes(r));

export const isAdminRole = (roles: MemberRole[]): boolean => hasAnyRole(roles, ...ADMIN_ROLES);
