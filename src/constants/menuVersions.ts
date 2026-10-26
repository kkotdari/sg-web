import type { ScreenKey } from "../types";

export interface NavMenuItem {
  key: ScreenKey;
  label: string;
}

export const NAV_MENU_ITEMS: NavMenuItem[] = [
  { key: "games", label: "게임" },
  { key: "board", label: "게시판" },
  { key: "ladder", label: "래더" },
  { key: "clan", label: "통계" },
];

/** PC 레일 · 폰 서랍에만 서는 메뉴(하단 탭엔 없다 — 2026-10-23, 요청: "배치고사 · 메뉴 위치는 레일/서랍 메뉴" ·
 *  리그도 2026-10-26 "리그 메뉴는 탭바에서 서랍으로 이동"). */
export const RAIL_MENU_ITEMS: NavMenuItem[] = [
  { key: "leagues", label: "리그" },
  { key: "placement", label: "배치" },
];

export const HOME_SCREEN: ScreenKey = NAV_MENU_ITEMS[0].key;
