import type { ScreenKey } from "../types";

export type ActivityGroupKey = "notice" | "schedule" | "league" | "call" | "gameResult";

export const GROUP_SEG: Record<ActivityGroupKey, string> = {
  notice: "notices", schedule: "schedules", league: "league", call: "calls", gameResult: "games",
};
const SEG_GROUP: Record<string, ActivityGroupKey> = Object.fromEntries(
  (Object.entries(GROUP_SEG) as [ActivityGroupKey, string][]).map(([k, v]) => [v, k]),
);

const SCREEN_SEG: Partial<Record<ScreenKey, string>> = {
  ladder: "ladder", clan: "clan", members: "members", leagues: "leagues",
  minimaps: "minimaps", control: "control", catalog: "catalog", explore: "explore",
};
const SEG_SCREEN: Record<string, ScreenKey> = Object.fromEntries(
  (Object.entries(SCREEN_SEG) as [ScreenKey, string][]).map(([k, v]) => [v, k]),
);

export interface Route {
  screen: ScreenKey;
  group: ActivityGroupKey | null;
  item: string | null;
}

export function parseRoute(pathname: string = window.location.pathname): Route {
  const segs = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const home: Route = { screen: "activity", group: null, item: null };
  if (segs.length === 0) return home;
  const group = SEG_GROUP[segs[0]];
  if (group) {
    if (group === "gameResult" && segs[1] === "guide") return { screen: "guide", group, item: null };
    if (group === "gameResult" && segs[1] === "scrap") return { screen: "scraps", group, item: null };
    return { screen: "activity", group, item: segs[1] ?? null };
  }
  const screen = SEG_SCREEN[segs[0]];
  if (screen) return { screen, group: null, item: segs[1] ?? null };
  return home;
}

export function pathOf(r: { screen: ScreenKey; group?: ActivityGroupKey | null; item?: string | null }): string {
  if (r.screen === "guide") return "/games/guide";
  if (r.screen === "scraps") return "/games/scrap";
  if (r.screen === "activity") {
    if (!r.group) return "/";
    const base = `/${GROUP_SEG[r.group]}`;
    return r.item ? `${base}/${encodeURIComponent(r.item)}` : base;
  }
  const seg = SCREEN_SEG[r.screen] ?? "";
  return r.item ? `/${seg}/${encodeURIComponent(r.item)}` : `/${seg}`;
}

export const PUSHED_STATE = { scrPushed: true } as const;
export function wasPushed(): boolean {
  const st = window.history.state as { scrPushed?: boolean } | null;
  return !!st?.scrPushed;
}

/* ★ 목록 자리 되살리기(2026-10-20, 요청: "게임 목록 보다가 상세 갔다가 뒤로 가면 스크롤 위치 기억 · 브라우저 뒤로가기에도") — 목록에서 상세로
   가기 직전에 **지금 기록 칸**(history.state)에 스크롤 위치를 적어 둔다. 앱 ← · 브라우저 뒤로 · 폰 밀기 모두 같은 칸으로 돌아오므로 목록이 그 값을 읽어
   되돌린다. 주소는 그대로(주소로 화면을 고르는 길도 그대로) — 칸에 덧붙는 값일 뿐이다. */
export function rememberListScroll(): void {
  const st = (window.history.state ?? {}) as Record<string, unknown>;
  window.history.replaceState({ ...st, scrListY: window.scrollY }, "");
}
export function listScrollOfEntry(): number | null {
  const st = window.history.state as { scrListY?: unknown } | null;
  return typeof st?.scrListY === "number" ? st.scrListY : null;
}

const DEAD_PARAMS = ["screen", "group", "item", "game"] as const;
export function stripDeadParams(search: string): string {
  const q = new URLSearchParams(search);
  for (const k of DEAD_PARAMS) q.delete(k);
  return q.toString();
}

export function navigateTo(
  path: string, opts: { replace?: boolean; search?: string; notify?: boolean } = {},
): void {
  const search = stripDeadParams(opts.search ?? "");
  const url = `${path}${search && search !== "?" ? (search.startsWith("?") ? search : `?${search}`) : ""}`;
  if (opts.replace) window.history.replaceState(window.history.state, "", url);
  else window.history.pushState(PUSHED_STATE, "", url);
  if (opts.notify !== false) window.dispatchEvent(new PopStateEvent("popstate"));
}
