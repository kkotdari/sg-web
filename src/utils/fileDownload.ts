import { imgSrc } from "./imgSrc";

/* ★ 첨부를 원래 이름으로 받는 주소(2026-11-16, 지적: "게시판 파일 첨부 받으면 원래 이름으로 안 받아지고 숫자로 받아지는 문제") —
   파일은 sg-api 저장소에 무작위 이름(uuid)으로 있고 웹과 출처가 달라 a[download] 이름을 브라우저가 무시한다. 그래서 `/uploads/…` 파일은
   sg-api /api/files/download(Content-Disposition attachment · 원래 이름)로 받는다. 그 밖의 주소는 예전대로(imgSrc). */
const API_BASE: string = (import.meta.env.VITE_API_BASE ?? "http://localhost:8000").replace(/\/+$/, "");

export function downloadHref(url: string, name: string): string {
  const i = url.indexOf("/uploads/");
  if (i < 0) return imgSrc(url);
  const rel = url.slice(i + "/uploads/".length);
  return imgSrc(`${API_BASE}/api/files/download?p=${encodeURIComponent(rel)}&n=${encodeURIComponent(name || rel.split("/").pop() || "file")}`);
}
