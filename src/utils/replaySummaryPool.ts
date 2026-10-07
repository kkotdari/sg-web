import type { SummaryJob, SummaryJobResult } from "./replaySummaryWorker";

export function poolSize(): number {
  const cores = typeof navigator === "undefined" ? 0 : navigator.hardwareConcurrency ?? 0;
  return Math.max(1, Math.min(4, cores > 0 ? cores - 1 : 2));
}

export interface SummaryPool {
  run(id: number, name: string, buf: ArrayBuffer): Promise<SummaryJobResult>;
  close(): void;
  size: number;
}

interface Slot {
  worker: Worker;
  busy: boolean;
}

interface Waiting {
  job: SummaryJob;
  resolve: (r: SummaryJobResult) => void;
}

function moduleWorkerOk(): boolean {
  if (typeof Worker === "undefined" || typeof URL.createObjectURL !== "function") return false;
  let asked = false;
  const url = URL.createObjectURL(new Blob([""], { type: "text/javascript" }));
  try {
    new Worker(url, { get type() { asked = true; return "module"; } } as WorkerOptions).terminate();
  } catch {
    asked = false;
  } finally {
    URL.revokeObjectURL(url);
  }
  return asked;
}

export function createSummaryPool(size = poolSize()): SummaryPool | null {
  if (!moduleWorkerOk()) return null;
  const slots: Slot[] = [];
  const queue: Waiting[] = [];
  const inFlight = new Map<Worker, { id: number; resolve: (r: SummaryJobResult) => void }>();

  const handOut = (slot: Slot) => {
    const next = queue.shift();
    if (!next) { slot.busy = false; return; }
    slot.busy = true;
    inFlight.set(slot.worker, { id: next.job.id, resolve: next.resolve });
    slot.worker.postMessage(next.job, [next.job.buf]);
  };

  try {
    for (let i = 0; i < size; i += 1) {
      const worker = new Worker(new URL("./replaySummaryWorker.ts", import.meta.url), { type: "module" });
      const slot: Slot = { worker, busy: false };
      worker.onmessage = (e: MessageEvent<SummaryJobResult>) => {
        const cur = inFlight.get(worker);
        inFlight.delete(worker);
        cur?.resolve(e.data);
        handOut(slot);
      };
      worker.onerror = () => {
        const cur = inFlight.get(worker);
        inFlight.delete(worker);
        cur?.resolve({ id: cur.id, ok: false, error: "리플레이를 읽는 일꾼이 멈췄어요." });
        handOut(slot);
      };
      slots.push(slot);
    }
  } catch {
    slots.forEach((s) => s.worker.terminate());
    return null;
  }
  if (slots.length === 0) return null;

  return {
    size: slots.length,
    run(id, name, buf) {
      return new Promise<SummaryJobResult>((resolve) => {
        queue.push({ job: { id, name, buf }, resolve });
        const free = slots.find((s) => !s.busy);
        if (free) handOut(free);
      });
    },
    close() {
      queue.length = 0;
      inFlight.clear();
      slots.forEach((s) => s.worker.terminate());
    },
  };
}

export async function runLanes<T>(
  items: T[], lanes: number, work: (item: T) => Promise<void>, stop?: () => boolean,
): Promise<void> {
  let next = 0;
  const lane = async () => {
    for (;;) {
      if (stop?.()) return;
      const i = next;
      next += 1;
      if (i >= items.length) return;
      await work(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(lanes, items.length)) }, lane));
}
