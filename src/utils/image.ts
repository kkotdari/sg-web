import type { SchedulePhoto } from "../types";

export const MAX_SIDE = 480;
export const JPEG_QUALITY = 0.92;

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽지 못했어요."));
    reader.readAsDataURL(file);
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지를 불러오지 못했어요."));
    img.src = src;
  });
}

export const BACKDROP_MAX_SIDE = 1440;
export const BACKDROP_QUALITY = 0.82;

export interface ChallengeBackdrop {
  backdrop: string;
  share: string;
}

function paint(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 처리하지 못했어요.");
  draw(ctx);
  return canvas.toDataURL("image/jpeg", BACKDROP_QUALITY);
}

function fitBox(iw: number, ih: number, max: number) {
  const s = Math.min(1, max / Math.max(iw, ih));
  return { w: Math.max(1, Math.round(iw * s)), h: Math.max(1, Math.round(ih * s)) };
}

export async function buildChallengeBackdrop(file: File): Promise<ChallengeBackdrop> {
  const img = await loadImage(await readAsDataUrl(file));
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!iw || !ih) throw new Error("이미지를 불러오지 못했어요.");
  const box = fitBox(iw, ih, BACKDROP_MAX_SIDE);
  const backdrop = paint(box.w, box.h, (ctx) => { ctx.drawImage(img, 0, 0, box.w, box.h); });
  return { backdrop, share: backdrop };
}

export function pickPhoto(file: File): Pick<SchedulePhoto, "url" | "thumbUrl" | "name" | "size" | "file"> {
  return { url: URL.createObjectURL(file), thumbUrl: null, name: file.name, size: file.size, file };
}
