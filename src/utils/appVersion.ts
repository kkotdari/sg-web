import type { AppVersion } from "../types";

export function versionNumber(version: AppVersion): number {
  const n = Number(version);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}
