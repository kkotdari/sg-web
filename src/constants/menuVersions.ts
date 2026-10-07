import type { ScreenKey } from "../types";

export interface NavMenuItem {
  key: ScreenKey;
  label: string;
}

export const NAV_MENU_ITEMS: NavMenuItem[] = [
  { key: "activity", label: "활동" },
  { key: "ladder", label: "래더" },
  { key: "clan", label: "통계" },
  { key: "leagues", label: "리그" },
];

export const HOME_SCREEN: ScreenKey = NAV_MENU_ITEMS[0].key;
