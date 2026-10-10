// 업로드 이미지 주소는 올린 때의 sg-api 공개 주소(PUBLIC_BASE_URL)로 DB 에 통째로 박혀 있다.
// 공개 주소를 바꾸면 옛 이미지는 옛 주소를 가리킨다 — PC 는 브라우저 캐시로 보이고 폰에선 안 보인다.
// 그래서 `/uploads/…` 경로는 늘 지금 API 주소(VITE_API_BASE)로 다시 붙이고,
// https 페이지에서 남은 http 주소는 https 로 올린다(사파리·인앱 브라우저는 섞인 콘텐츠를 막는다).
const API_BASE: string = (import.meta.env.VITE_API_BASE ?? "http://localhost:8000").replace(/\/+$/, "");
const UPLOADS_RE = /^https?:\/\/[^/]+(\/uploads\/.*)$/;

export function imgSrc(url: string): string;
export function imgSrc(url: string | null | undefined): string | undefined;
export function imgSrc(url: string | null | undefined): string | undefined {
  if (!url) return url ?? undefined;
  const m = UPLOADS_RE.exec(url);
  if (m) url = `${API_BASE}${m[1]}`;
  if (typeof window === "undefined" || window.location.protocol !== "https:") return url;
  if (!url.startsWith("http://") || /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url)) return url;
  return `https://${url.slice("http://".length)}`;
}
