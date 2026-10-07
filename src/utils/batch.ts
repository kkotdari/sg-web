export async function runBatch<T>(
  items: readonly T[],
  run: (item: T) => Promise<void>,
  { concurrency = 4, onProgress }: { concurrency?: number; onProgress?: (done: number) => void } = {},
): Promise<{ done: T[]; failed: { item: T; error: unknown }[] }> {
  const done: T[] = [];
  const failed: { item: T; error: unknown }[] = [];
  let cursor = 0;
  const lane = async (): Promise<void> => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      const item = items[i];
      try {
        await run(item);
        done.push(item);
      } catch (error) {
        failed.push({ item, error });
      }
      onProgress?.(done.length + failed.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  return { done, failed };
}

function objectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return "를";
  return (code - 0xac00) % 28 === 0 ? "를" : "을";
}

export function batchSummary(
  verb: string, done: number, failed: number, unit = "개",
  forms?: { did: string; couldNot: string },
): string {
  const o = objectParticle(unit);
  const did = forms?.did ?? `${verb}했어요`;
  const couldNot = forms?.couldNot ?? `${verb}하지 못했어요`;
  if (failed === 0) return `${done}${unit}${o} ${did}.`;
  if (done === 0) return `${failed}${unit}${o} ${couldNot}. 잠시 뒤 다시 시도해 주세요.`;
  return `${done}${unit}${o} ${did}. ${failed}${unit}는 ${couldNot}.`;
}
