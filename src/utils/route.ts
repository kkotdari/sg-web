import type { ScreenKey } from "../types";

/* ★ 활동 화면을 걷고 **게임 · 게시판 두 화면**으로(2026-10-26, 요청: "일정과 게시판을 합치고 · 활동 화면 제거 ·
   게임 게시판 두개의 메뉴로 탄생 · 주소에서도 activity 제거"). 주소는 /games · /games/<게임번호> · /board · /board/<글> · /board/new,
   첫 화면(/)은 게임 목록. 묶음(group)은 그 화면 안의 목록 갈래 — gameResult(게임) · board(게시판).
   옛 주소(/schedules · /league · /notices)는 잇지 않는다(요청: "옛 링크 폴백 필요없음") — 모르는 주소는 첫 화면. */
export type FeedGroup = "gameResult" | "board";

const SCREEN_SEG: Partial<Record<ScreenKey, string>> = {
  games: "games", board: "board",
  ladder: "ladder", clan: "stats", members: "members", leagues: "leagues",
  minimaps: "minimaps", control: "control", catalog: "catalog", explore: "explore", placement: "placement",
};
/* 통계 주소는 /stats(2026-10-21, 요청: "/clan 주소가 안 맞다 · 통계인데") — 화면 열쇠 clan 은 메뉴 권한 등에 그대로 두고 주소만 바꿨다.
   옛 /clan 잇기는 걷었다(2026-10-26, 요청: "예전 버전 받게 한 거 다 삭제"). */
const SEG_SCREEN: Record<string, ScreenKey> = Object.fromEntries(
  (Object.entries(SCREEN_SEG) as [ScreenKey, string][]).map(([k, v]) => [v, k]),
);
const GROUP_OF: Partial<Record<ScreenKey, FeedGroup>> = { games: "gameResult", board: "board" };

export interface Route {
  screen: ScreenKey;
  group: FeedGroup | null;
  item: string | null;
}

export function parseRoute(pathname: string = window.location.pathname): Route {
  const segs = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const home: Route = { screen: "games", group: "gameResult", item: null };
  if (segs.length === 0) return home;
  const screen = SEG_SCREEN[segs[0]];
  if (screen) return { screen, group: GROUP_OF[screen] ?? null, item: segs[1] ?? null };
  return home;
}

export function pathOf(r: { screen: ScreenKey; item?: string | null }): string {
  const seg = SCREEN_SEG[r.screen] ?? "";
  return r.item ? `/${seg}/${encodeURIComponent(r.item)}` : `/${seg}`;
}

/** 게임 상세 주소. */
export const gamePath = (no: string): string => pathOf({ screen: "games", item: no });

export const PUSHED_STATE = { scrPushed: true } as const;
export function wasPushed(): boolean {
  const st = window.history.state as { scrPushed?: boolean } | null;
  return !!st?.scrPushed;
}

/* ★ 목록 자리 되살리기(2026-10-20) — 목록에서 상세로 가기 직전, 지금 기록 칸(history.state)에 스크롤 y 를 적는다. 앱 ← · 브라우저 뒤로 ·
   폰 밀기 모두 같은 칸으로 돌아오므로 목록이 이것을 **한 번** 읽고(읽는 즉시 지운다 — 새로고침·다시 그림에 또 쓰이지 않게) 그 자리로 간다.
   주소도 목록 자료도 들고 있지 않는다. */
export function rememberListScroll(): void {
  window.history.replaceState({ ...(window.history.state ?? {}), scrListY: window.scrollY }, "");
}
export function takeListScroll(): number | null {
  const { scrListY, ...rest } = (window.history.state ?? {}) as { scrListY?: unknown };
  if (typeof scrListY !== "number") return null;
  window.history.replaceState(rest, "");
  return scrListY;
}

export function navigateTo(
  path: string, opts: { replace?: boolean; search?: string; notify?: boolean } = {},
): void {
  const search = (opts.search ?? "").replace(/^\?/, "");
  const url = search ? `${path}?${search}` : path;
  if (opts.replace) window.history.replaceState(window.history.state, "", url);
  else window.history.pushState(PUSHED_STATE, "", url);
  if (opts.notify !== false) window.dispatchEvent(new PopStateEvent("popstate"));
}
