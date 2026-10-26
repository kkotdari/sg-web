import type { ScreenKey } from "../types";

export interface NavMenuItem {
  key: ScreenKey;
  label: string;
}

/* 탭바 = 게임 · 통계 · 게시판, 래더는 서랍으로(2026-10-26, 요청: "메뉴 순서 게임-통계-게시판 (이하 서랍 래더, 리그, 배치, 운영자 메뉴)"). */
export const NAV_MENU_ITEMS: NavMenuItem[] = [
  { key: "games", label: "게임" },
  { key: "clan", label: "통계" },
  { key: "board", label: "게시판" },
];

/** PC 레일 · 폰 서랍에만 서는 메뉴(하단 탭엔 없다 — 2026-10-23, 요청: "배치고사 · 메뉴 위치는 레일/서랍 메뉴" ·
 *  리그도 2026-10-26 "리그 메뉴는 탭바에서 서랍으로 이동"). */
export const RAIL_MENU_ITEMS: NavMenuItem[] = [
  { key: "ladder", label: "래더" },
  { key: "leagues", label: "리그" },
  { key: "placement", label: "배치" },
];

export const HOME_SCREEN: ScreenKey = NAV_MENU_ITEMS[0].key;
