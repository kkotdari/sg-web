import type { ScreenKey } from "../types";

export interface NavMenuItem {
  key: ScreenKey;
  label: string;
  /** PC 에서만 선다 — 폭 960 이하(폰 · 서랍)에서는 뺀다. */
  pcOnly?: boolean;
}

/* 탭바 = 게임 · 통계 · 게시판, 래더는 서랍으로(2026-10-26, 요청: "메뉴 순서 게임-통계-게시판 (이하 서랍 래더, 리그, 배치, 운영자 메뉴)"). */
export const NAV_MENU_ITEMS: NavMenuItem[] = [
  { key: "games", label: "게임" },
  { key: "clan", label: "통계" },
  { key: "board", label: "게시판" },
];

/** PC 레일 · 폰 서랍에만 서는 메뉴(하단 탭엔 없다 — 2026-10-23, 요청: "배치고사 · 메뉴 위치는 레일/서랍 메뉴" ·
 *  리그도 2026-10-26 "리그 메뉴는 탭바에서 서랍으로 이동"). */
/** ★ 연습실 임시 폐쇄 스위치(2026-11-24) — true 면 메뉴에 안 서고 /practice 는 닫음 안내(App.tsx). */
export const PRACTICE_CLOSED = true;

export const RAIL_MENU_ITEMS: NavMenuItem[] = [
  /* (숨김 2026-11-18, 요청: "래더를 통계의 1:1 필터 적용으로 통합 · 래더 화면은 숨김처리") 래더 — 통계 1:1 이 랭크포인트 · 실력순위 · 역대 퀸을 맡는다. 화면 · 주소(/ladder)는 그대로 둔다. */
  { key: "leagues", label: "리그" },
  /* (숨김 2026-11-17, 요청: "배치메뉴는 숨겨줘 이참에") 배치 — 화면 · 주소(/placement)는 그대로 둔다. */
  /* 연습실(2026-11-17, 요청: "연습실 메뉴는 서랍에 넣어주고") — 레일 · 서랍에만.
     모바일에선 숨김(2026-11-17, 요청: "모바일에선 연습실 메뉴 숨김" — 키보드 · 마우스 조작이라). 주소(/practice)는 그대로 둔다. */
  /* (임시 폐쇄 2026-11-24, 요청: "연습실 임시 폐쇄") 메뉴에서 빼고 주소(/practice)는 닫음 안내만 — 다시 열려면 PRACTICE_CLOSED 를 false 로. */
  ...(PRACTICE_CLOSED ? [] : [{ key: "practice" as const, label: "연습실", pcOnly: true }]),
];

export const HOME_SCREEN: ScreenKey = NAV_MENU_ITEMS[0].key;
