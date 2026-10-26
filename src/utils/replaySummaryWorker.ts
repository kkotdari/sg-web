import { parseReplayFile } from "./replayParser";
import type { ReplayMapGrid } from "./replayParser";

export interface SummaryJob {
  id: number;
  name: string;
  buf: ArrayBuffer;
}

export interface ReanalyzedSlot {
  rawName: string;
  race: string;
  apm: number | null;
  eapm: number | null;
  cmdCount: number | null;
  effectiveCmdCount: number | null;
  buildCount: number | null;
  /** 시작 위치(타일 · 2026-10-26 · 게임 목록 배치 칸) — 리플레이 MapData.StartLocations(그 슬롯) ÷ 32 · 서버가 반올림. */
  startX?: number | null;
  startY?: number | null;
}

export type SummaryJobResult =
  | {
    id: number; ok: true;
    mapData: ReplayMapGrid | null;
    mapName: string | null;
    gameStartedAt: string | null;
    durationSeconds: number | null;
    chats: { frame: number; text: string }[];
    chatSaver: string | null;
    slots: ReanalyzedSlot[];
  }
  | { id: number; ok: false; error: string };

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<SummaryJob>) => void) | null;
  postMessage: (m: SummaryJobResult) => void;
};

ctx.onmessage = (e: MessageEvent<SummaryJob>) => {
  const { id, name, buf } = e.data;
  void (async () => {
    try {
      const parsed = await parseReplayFile(new File([buf], name));
      ctx.postMessage({
        id, ok: true,
        mapData: parsed.mapGrid ?? null,
        mapName: parsed.mapName || null,
        gameStartedAt: parsed.gameStartedAt ?? null,
        durationSeconds: parsed.durationSeconds ?? null,
        chats: parsed.chats,
        chatSaver: parsed.chatSaver,
        slots: parsed.players.map((p) => ({
          rawName: p.rawName,
          race: p.race,
          apm: p.apm, eapm: p.eapm,
          cmdCount: p.cmdCount, effectiveCmdCount: p.effectiveCmdCount,
          buildCount: p.buildCount, startX: p.startX, startY: p.startY,
        })),
      });
    } catch (err) {
      ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : "리플레이를 읽지 못했어요." });
    }
  })();
};
