import type { MemberRole } from "../types";

export const ROLE_INFO: Record<MemberRole, string> = {
  "0202": "운영자",
  "0203": "회원",
  "0204": "테스터",   // 2026-11-03 — 재생기 테스터 손잡이(최대 프레임 · diag) · 회원·운영자에 덧붙는 역할
};

export const ASSIGNABLE_ROLES: MemberRole[] = ["0202", "0203", "0204"];

export const ADMIN_ROLES: MemberRole[] = ["0202"];

export const hasAnyRole = (roles: MemberRole[], ...targets: MemberRole[]): boolean =>
  roles.some((r) => targets.includes(r));

export const isAdminRole = (roles: MemberRole[]): boolean => hasAnyRole(roles, ...ADMIN_ROLES);

export const isTesterRole = (roles: MemberRole[]): boolean => hasAnyRole(roles, "0204");
