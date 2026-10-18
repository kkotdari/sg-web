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

/** 사진·동영상을 다 받아 File 로 — 고친 뒤 아직 안 올린 것은 손에 든 File 을 그대로 쓴다. */
export async function fetchMedia(
  items: { name: string; url: string; file?: File }[],
  onProgress?: (done: number, total: number) => void,
): Promise<File[]> {
  const names = uniqueNames(items.map((p) => p.name || "photo"));
  const out: File[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const p = items[i];
    let blob: Blob;
    if (p.file) blob = p.file;
    else {
      const res = await fetch(imgSrc(p.url), { mode: "cors" });
      if (!res.ok) throw new Error(`${p.name} 을(를) 받지 못했어요.`);
      blob = await res.blob();
    }
    out.push(new File([blob], names[i], { type: blob.type || "application/octet-stream" }));
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
