import type { ReplayMapGrid } from "./replayParser";
import { renderMinimapCanvas } from "./minimapExport";
import type { ThumbJob, ThumbResult } from "./mapThumbWorker";

/* ★ 게임 목록 배치 칸의 맵 그림(2026-10-26, 지적: "게임목록 사진 뜨기전까지 화면 멈추고 뜨면 풀려") ───────────────────────────
   맵 한 장을 굽는 데(지형 풀기 + 높이 켜마다 윤곽 + 타일 색) PC 80ms · CPU ×4 400ms 가 들고(합성 128×128 실측), 목록 한 쪽의 맵 종류만큼
   메인에서 한꺼번에 돌아 그동안 탭·스크롤이 안 먹었다. 이제 **일꾼(OffscreenCanvas)이 굽는다** — 메인은 PNG 를 받아 고리(blob URL)만 붙인다.
   일꾼을 못 쓰는 브라우저(OffscreenCanvas 없음 · 일꾼에서 그리다 실패)는 메인에서 **한 장씩 · 사이마다 한 박자 쉬며** 굽는다(누름이 사이에 든다).
   맵 해시마다 한 번만 굽고 세션 내내 쓴다. */

let worker: Worker | null | undefined;
let seq = 0;
const pending = new Map<number, (blob: Blob | null) => void>();

function workerOf(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  try {
    const w = new Worker(new URL("./mapThumbWorker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<ThumbResult>) => { pending.get(e.data.id)?.(e.data.blob); pending.delete(e.data.id); };
    w.onerror = () => {   // 일꾼이 아예 못 서면 — 기다리던 것은 메인으로 넘기고 이후로는 메인만
      worker = null;
      for (const done of pending.values()) done(null);
      pending.clear();
      w.terminate();
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

function inWorker(grid: ReplayMapGrid): Promise<Blob | null> {
  const w = workerOf();
  if (!w) return Promise.resolve(null);
  const id = (seq += 1);
  const job: ThumbJob = {
    id, grid: { width: grid.width, height: grid.height, palette: grid.palette, tiles: grid.tiles, terrain: grid.terrain, resources: grid.resources },
  };
  return new Promise((resolve) => { pending.set(id, resolve); w.postMessage(job); });
}

/** 메인 굽기 줄 — 한 번에 한 장 · 앞 장을 굽고 나면 한 박자(setTimeout 0) 쉬고 다음 장. */
let mainTail: Promise<unknown> = Promise.resolve();
function onMain(grid: ReplayMapGrid): Promise<string | null> {
  const run = mainTail.then(() => new Promise<void>((r) => { setTimeout(r, 0); }))
    .then(() => renderMinimapCanvas(grid, 1))
    .then((cv) => cv.toDataURL("image/png"))
    .catch(() => null);
  mainTail = run;
  return run;
}

const cache = new Map<string, Promise<string | null>>();
/** 끝난 것 — 다시 그릴 때(목록을 다시 열 때) 빈 판을 거치지 않게 곧장 꺼낸다. */
export const mapThumbDone = new Map<string, string | null>();

export function mapThumbUrl(hash: string, grid: ReplayMapGrid): Promise<string | null> {
  let p = cache.get(hash);
  if (!p) {
    p = inWorker(grid)
      .then((blob) => (blob ? URL.createObjectURL(blob) : onMain(grid)))
      .then((u) => { mapThumbDone.set(hash, u); return u; });
    cache.set(hash, p);
  }
  return p;
}
