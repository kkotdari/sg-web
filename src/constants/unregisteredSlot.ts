export const UNREGISTERED_ID_PREFIX = "__unregistered__";

export function isUnregisteredSlot(memberId: string): boolean {
  return memberId.startsWith(UNREGISTERED_ID_PREFIX);
}

export function newUnregisteredSlotId(): string {
  return `${UNREGISTERED_ID_PREFIX}${crypto.randomUUID()}`;
}

export function unregisteredSlotLabel(rows: { memberId: string }[], memberId: string): string {
  const ids = rows.map((r) => r.memberId).filter(isUnregisteredSlot);
  const index = ids.indexOf(memberId);
  return `비회원${ids.length > 1 ? ` ${index + 1}` : ""}`;
}
