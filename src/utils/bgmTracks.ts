import type { ReplayBgmTrack } from "scplay";

const bgm = (title: string, file: string): ReplayBgmTrack => ({ title, src: `/audio/bgm/${file}` });

export const BGM_TRACKS: ReplayBgmTrack[] = [
  bgm("Main Title", "main-title.mp3"),
  bgm("Terran 1", "terran-1.mp3"),
  bgm("Terran 2", "terran-2.mp3"),
  bgm("Terran 3", "terran-3.mp3"),
  bgm("Terran Brood War", "terran-brood-war.mp3"),
  bgm("Protoss 1", "protoss-1.mp3"),
  bgm("Protoss 2", "protoss-2.mp3"),
  bgm("Protoss 3", "protoss-3.mp3"),
  bgm("Protoss Brood War", "protoss-brood-war.mp3"),
  bgm("Zerg 1", "zerg-1.mp3"),
  bgm("Zerg 2", "zerg-2.mp3"),
  bgm("Zerg 3", "zerg-3.mp3"),
  bgm("Zerg Brood War", "zerg-brood-war.mp3"),
];
