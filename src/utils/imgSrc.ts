export function imgSrc(url: string): string;
export function imgSrc(url: string | null | undefined): string | undefined;
export function imgSrc(url: string | null | undefined): string | undefined {
  if (!url) return url ?? undefined;
  if (typeof window === "undefined" || window.location.protocol !== "https:") return url;
  if (!url.startsWith("http://") || /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url)) return url;
  return `https://${url.slice("http://".length)}`;
}
