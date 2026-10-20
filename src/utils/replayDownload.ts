import { api } from "../api/client";
import type { GameResult } from "../types";

/** 리플레이 파일 내려받기 — 게임 상세 메뉴(리플레이 저장)와 PC 게임 표 링크 칸(디스켓 · 2026-10-20)이 같이 쓴다. */
export async function downloadReplay(gameResult: GameResult): Promise<void> {
  if (!gameResult.replay) return;
  try {
    const blob = await api.downloadReplay(gameResult.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = gameResult.replay.displayName;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
  }
}
