import type { GameResultSlot } from "../types";

/** 손님 모드의 게임 플레이어 가명 — 판마다 **Player1 · Player2 …**(2026-10-12, 요청: "손님 모드 가명 그냥 마스킹이 아니라 Player1 2 3 4 이렇게 가자").
 *  옛 가리기(첫·끝 글자 + 동그라미)는 글자가 새어 누군지 짐작됐다. 번호는 그 판의 1팀 → 2팀 슬롯 차례(관전자는 맨 뒤)라 목록 제목·상세·재생기가
 *  같은 번호를 쓴다. 표시에만 쓴다 — 리플레이 원 이름(rawName)은 재생기가 트랙과 맞추는 열쇠라 그대로 두고, 보이는 글자만 바꾼다. */
const slotKey = (s: GameResultSlot): string => `${s.memberId}|${s.rawName ?? ""}`;

export function guestAliasOf(game: { team1: GameResultSlot[]; team2: GameResultSlot[] }): (name: string, slot?: GameResultSlot) => string {
  const all = [...game.team1, ...game.team2];
  const order = [...all.filter((s) => !s.observer), ...all.filter((s) => s.observer)];
  const bySlot = new Map<string, string>();
  const byRaw = new Map<string, string>();
  order.forEach((s, i) => {
    const alias = `Player${i + 1}`;
    if (!bySlot.has(slotKey(s))) bySlot.set(slotKey(s), alias);
    if (s.rawName && !byRaw.has(s.rawName)) byRaw.set(s.rawName, alias);
  });
  return (name, slot) => (slot ? bySlot.get(slotKey(slot)) : undefined) ?? byRaw.get(name) ?? "Player";
}
