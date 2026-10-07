export const COMPUTER_ID_PREFIX = "__computer__";

export function isComputerSlot(memberId: string): boolean {
  return memberId.startsWith(COMPUTER_ID_PREFIX);
}

export function newComputerSlotId(): string {
  return `${COMPUTER_ID_PREFIX}${crypto.randomUUID()}`;
}

export function computerSlotLabel(rows: { memberId: string }[], memberId: string): string {
  const computerIds = rows.map((r) => r.memberId).filter(isComputerSlot);
  const index = computerIds.indexOf(memberId);
  return `컴퓨터${computerIds.length > 1 ? ` ${index + 1}` : ""}`;
}
