import { imgSrc } from "./imgSrc";
import { zipStore } from "./zip";

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|3gp|ogv)$/i;

/** 사진 목록 안의 한 칸이 동영상인가 — 이름이나 저장 주소의 확장자로 가른다(서버는 이름의 확장자로 저장한다). */
export const isVideoItem = (p: { name: string; url: string; file?: File }): boolean =>
  p.file ? p.file.type.startsWith("video/") : VIDEO_EXT.test(p.name) || VIDEO_EXT.test(p.url.split(/[?#]/)[0]);

/** 동영상 한 개의 상한 — 서버의 data URL 상한(70M 자 ≈ 50MB)과 짝이다. */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/** 폰(손가락)에서는 사진첩에 저장하는 길(공유 시트)이 있다. PC 는 zip 하나로 받는다. */
export const canSaveToAlbum = (): boolean =>
  typeof navigator !== "undefined" && typeof navigator.share === "function"
  && typeof navigator.canShare === "function"
  && typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

const uniqueNames = (names: string[]): string[] => {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const k = seen.get(n) ?? 0;
    seen.set(n, k + 1);
    if (k === 0) return n;
    const dot = n.lastIndexOf(".");
    return dot > 0 ? `${n.slice(0, dot)} (${k})${n.slice(dot)}` : `${n} (${k})`;
  });
};

/* 받은 것은 주소별로 한 벌만 들고 있는다 — 사진첩 저장을 미리 받을 때 '전체 저장'과 낱장 저장이 같은 동영상을 두 번 받지 않게.
   합이 CACHE_MAX 를 넘으면 오래된 것부터 놓는다. */
const CACHE_MAX = 120 * 1024 * 1024;
const cache = new Map<string, { blob: Promise<Blob>; size: number }>();
const cacheTrim = (): void => {
  let total = 0;
  for (const v of cache.values()) total += v.size;
  for (const [k, v] of cache) {
    if (total <= CACHE_MAX) break;
    cache.delete(k);
    total -= v.size;
  }
};
const fetchBlob = (url: string, name: string): Promise<Blob> => {
  const hit = cache.get(url);
  if (hit) { cache.delete(url); cache.set(url, hit); return hit.blob; }
  const entry = { size: 0, blob: Promise.resolve(new Blob()) };
  entry.blob = fetch(imgSrc(url), { mode: "cors" }).then(async (res) => {
    if (!res.ok) throw new Error(`${name} 을(를) 받지 못했어요.`);
    const b = await res.blob();
    entry.size = b.size;
    cacheTrim();
    return b;
  });
  entry.blob.catch(() => { if (cache.get(url) === entry) cache.delete(url); });
  cache.set(url, entry);
  return entry.blob;
};

/** 사진·동영상을 다 받아 File 로 — 고친 뒤 아직 안 올린 것은 손에 든 File 을 그대로 쓴다. */
export async function fetchMedia(
  items: { name: string; url: string; file?: File }[],
  onProgress?: (done: number, total: number) => void,
): Promise<File[]> {
  // 목록 차례대로 담긴다(요청: "저장 시 목록 순으로 저장") — 여럿이면 이름 앞에 차례 번호(01_…)를 붙여 zip·파일 앱이 이름순으로
  // 늘어놓고, 수정 시각도 차례대로 1초씩 늘려 시각순으로 늘어놓는 사진첩에서도 같은 차례가 되게 한다.
  // (사진 안에 찍은 날짜(EXIF)가 박힌 것은 사진첩이 그 날짜를 쓴다 — 거기까지는 못 바꾼다.)
  const pad = String(items.length).length;
  const base = items.map((p) => p.name || "photo");
  const names = items.length > 1 ? base.map((n, i) => `${String(i + 1).padStart(Math.max(2, pad), "0")}_${n}`) : uniqueNames(base);
  const t0 = Date.now() - items.length * 1000;
  const out: File[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const p = items[i];
    let blob: Blob;
    if (p.file) blob = p.file;
    else blob = await fetchBlob(p.url, p.name);
    out.push(new File([blob], names[i], { type: blob.type || "application/octet-stream", lastModified: t0 + i * 1000 }));
    onProgress?.(i + 1, items.length);
  }
  return out;
}

/** 폰: 공유 시트(→ "사진 N장 저장")를 띄운다. 사용자 누름 안에서 불러야 한다 — 밖이면 NotAllowedError. */
export async function shareToAlbum(files: File[]): Promise<void> {
  await navigator.share({ files });
}

const saveBlob = (blob: Blob, name: string): void => {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
};

/** PC: 한 개면 그 파일 그대로, 여럿이면 zip 하나로 내려받는다. */
export async function downloadFiles(files: File[], zipName: string): Promise<void> {
  if (files.length === 1) { saveBlob(files[0], files[0].name); return; }
  const zip = await zipStore(files.map((f) => ({ name: f.name, blob: f })));
  saveBlob(zip, zipName.endsWith(".zip") ? zipName : `${zipName}.zip`);
}
