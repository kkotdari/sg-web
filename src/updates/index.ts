import type { ComponentType } from "react";
import { versionNumber } from "../utils/appVersion";
import type { AppVersion } from "../types";
import UpdateV5 from "./UpdateV5";

/** 버전마다 글 대신 보여 줄 안내 페이지(2026-10-31 · 버전 5 부터). 없는 버전은 종전대로 관리자가 적은 글(notes)을 띄운다. */
const UPDATE_PAGES: Record<number, ComponentType> = {
  5: UpdateV5,
};

export function updatePageOf(version: AppVersion | null | undefined): ComponentType | null {
  if (!version) return null;
  return UPDATE_PAGES[versionNumber(version)] ?? null;
}
