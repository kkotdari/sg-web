const MAP_SPECIAL = /[^\p{L}\p{N}_\s()[\].~'&-]/gu;

export function cleanMapName(mapName: string | null | undefined): string {
  if (!mapName) return "";
  return mapName.replace(MAP_SPECIAL, "").replace(/\s+/g, " ").trim();
}
