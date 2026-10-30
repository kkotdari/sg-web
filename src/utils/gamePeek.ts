import type { GameResult } from "../types";

/* 목록에서 연 게임을 상세가 곧장 쓰게 잠깐 들고 있는다(2026-10-30, 지적: "게임 목록에서 재생 트랙 없는 경기 상세 들어가도 잠깐 재생기가 뜨는 문제") —
   상세(GameDetailPage)는 게임을 받기 전까지 판 자리에 기다리는 재생기(PlayerLoadShell)를 세운다. 목록의 판(서버 목록 = hasTruth 를 안다)을 넘겨 주면
   첫 그림부터 재생 가능 여부를 알아 재생기 없는 판은 재생기를 안 띄운다. 상세는 그 뒤 서버에서 새로 받아 갈아 끼운다. 열쇠 = 주소의 게임 표시(게임번호 또는 id). */
const held = new Map<string, GameResult>();
export function holdGame(key: string, g: GameResult): void {
  held.clear();
  held.set(key, g);
}
export function peekGame(key: string): GameResult | null {
  return held.get(key) ?? null;
}
