import { fmt } from "./date";
import {
  normalizeUpgradeName, CAST_ORDER_TO_TECH, USE_CMD_TO_TECH, PLACE_MINE_ORDER,
  CAST_ORDER_TO_UNIT, USE_CMD_TO_UNIT,
} from "./replayTechNames";
import type { Race, GameType } from "../types";

const RACE_NAME_MAP: Record<string, Race> = {
  Terran: "테란",
  Protoss: "프로토스",
  Zerg: "저그",
};

const SECONDS_PER_FRAME = 0.042;

export interface ParsedReplayPlayer {
  rawName: string;
  race: Race | "";
  team: number;
  color: string | null;
  apm: number | null;
  eapm: number | null;
  cmdCount: number | null;
  effectiveCmdCount: number | null;
  buildCount: number | null;
  isComputer: boolean;
  startX: number | null;
  startY: number | null;
  signals: ReplayPlayerSignals | null;
}

export interface BuildPos {
  unit: string;
  frame: number | null;
  x: number;
  y: number;
}

export interface ReplayPlayerSignals {
  unitCounts: Record<string, number>;
  lands: { frame: number; x: number; y: number }[];
  lifts?: number[];
  flyPositions?: { frame: number; x: number; y: number }[];
  unloadPositions?: { frame: number; x: number; y: number }[];
  loadPositions?: { frame: number; x: number; y: number }[];
  cancelBuilds: number[];
  buildingMorphs: { frame: number; to: string }[];
  rallies: { frame: number; x: number; y: number; tag: number }[];
  firstUnitFrame: Record<string, number>;
  buildingCounts: Record<string, number>;
  firstBuildingFrame: Record<string, number>;
  unitFrames: Record<string, number[]>;
  trainTags: Record<string, number[]>;
  buildingFrames: Record<string, number[]>;
  buildPositions: BuildPos[];
  orderPositions: {
    frame: number; x: number; y: number; kind?: "attack" | "move";
    g?: number;
    by?: string;
    n?: number;
  }[];
  hits: { frame: number; x: number; y: number; whom: string }[];
  techNames: string[];
  upgradeNames: string[];
  firstTechFrame: Record<string, number>;
  firstUpgradeFrame: Record<string, number>;
  techUses: Record<string, number>;
  techFrames: Record<string, number[]>;
  castPositions: { tech: string; frame: number; x: number; y: number }[];
  firstTechUseFrame: Record<string, number>;
  chats: { frame: number | null; text: string }[];
  unloadCount: number;
  firstUnloadFrame: number | null;
  liftOffCount: number;
  firstLiftOffFrame: number | null;
  leaveFrame: number | null;
  leaveReason: string | null;
  firstCmdFrame: number | null;
  lastCmdFrame: number | null;
  cmdCountByThird: [number, number, number];
}

import type { ReplayMapGrid } from "scplay";

export type { ReplayMapGrid };

export interface ParsedReplay {
  fileName: string;
  date: string;
  mapName: string;
  gameTypeId: number | null;
  gameTypeName: string;
  gameStartedAt: string | null;
  durationSeconds: number | null;
  players: ParsedReplayPlayer[];
  team1: ParsedReplayPlayer[];
  team2: ParsedReplayPlayer[];
  matchType: GameType;
  winnerSide: "team1" | "team2" | null;
  guessedObservers: string[];
  teamSplitUncertain: boolean;
  ffa: boolean;
  mapGrid: ReplayMapGrid | null;
  chats: { frame: number; text: string }[];
  startSpots: [number, number][];
}

export class ReplayParseError extends Error {}

const OBSERVER_ECMD_RATIO = 0.05;

function isObserverByActivity(p: ParsedReplayPlayer, all: ParsedReplayPlayer[]): boolean {
  if (p.isComputer) return false;
  const maxEcmd = Math.max(...all.map((x) => x.effectiveCmdCount ?? 0));
  if (maxEcmd <= 0) return false;
  return (p.effectiveCmdCount ?? 0) <= maxEcmd * OBSERVER_ECMD_RATIO;
}

interface ScrepPlayer {
  ID: number;
  Name: string;
  SlotID?: number;
  Race?: { Name?: string };
  Team: number;
  Observer?: boolean;
  Type?: { Name?: string };
  Color?: { Name?: string; RGB?: number };
}

interface ScrepPlayerDesc {
  PlayerID: number;
  APM: number;
  EAPM: number;
  CmdCount: number;
  EffectiveCmdCount: number;
}

interface ScrepCmd {
  PlayerID: number;
  Type?: { Name?: string };
  Frame?: number;
  Unit?: { Name?: string } | string;
  Tech?: { Name?: string } | string;
  Upgrade?: { Name?: string } | string;
  Pos?: { X?: number; Y?: number; x?: number; y?: number } | null;
  Order?: { Name?: string } | string;
  UnitTags?: number[];
  UnitTag?: number;
  Group?: number | { Name?: string };
  HotkeyType?: { Name?: string } | string;
  Message?: string;
  SenderSlotID?: number;
  Reason?: { Name?: string } | string;
  IneffKind?: number | string;
}

interface ScrepResult {
  Header: {
    StartTime: string;
    Map: string;
    Frames: number;
    Players: ScrepPlayer[];
    Type?: { Name?: string; ID?: number };
    MapWidth?: number;
    MapHeight?: number;
  };
  MapData?: {
    StartLocations?: { X: number; Y: number; SlotID: number }[] | null;
    Tiles?: number[] | null;
    MineralFields?: { X: number; Y: number }[] | null;
    Geysers?: { Point?: { X: number; Y: number } }[] | null;
  } | null;
  Computed: {
    WinnerTeam: number;
    PlayerDescs: ScrepPlayerDesc[] | null;
    LeaveGameCmds?: { Frame: number; PlayerID: number }[] | null;
  };
  Commands?: { Cmds?: ScrepCmd[] | null } | null;
}

const PRODUCTION_CMD_NAMES = new Set<string>([
  "Build",
  "Train",
  "Train Fighter",
  "Unit Morph",
  "Building Morph",
  "Hatch",
]);

const UNIT_TRAIN_CMD_NAMES = new Set<string>(["Train", "Train Fighter", "Unit Morph"]);
const WORKER_CMD_NAMES = new Set<string>(["Build", "Hatch"]);
const RESOURCE_TARGETS = new Set<string>([
  "Vespene Geyser", "Assimilator", "Refinery", "Extractor",
  "Mineral Field (Type 1)", "Mineral Field (Type 2)", "Mineral Field (Type 3)",
]);
const BUILDING_ONLY_CMD_NAMES = new Set<string>([
  "Train", "Cancel Train", "Building Morph", "Lift Off", "Land",
]);
const BUILD_CMD_NAMES = new Set<string>(["Build", "Build Addon", "Building Morph", "Hatch"]);

const CHAT_CAP = 40;
const ORDER_POS_CAP = 20000;
const PIXELS_PER_TILE = 32;
const EARLY_ALL_SELECT_FRAMES = 720;

function emptySignals(): ReplayPlayerSignals {
  return {
    unitCounts: {}, firstUnitFrame: {}, lands: [], cancelBuilds: [], buildingMorphs: [], rallies: [],
    buildingCounts: {}, firstBuildingFrame: {},
    unitFrames: {}, trainTags: {}, buildingFrames: {}, buildPositions: [], orderPositions: [], hits: [],
    techNames: [], upgradeNames: [], firstTechFrame: {}, firstUpgradeFrame: {},
    techUses: {}, techFrames: {}, firstTechUseFrame: {}, castPositions: [], chats: [],
    unloadCount: 0, firstUnloadFrame: null, liftOffCount: 0, firstLiftOffFrame: null,
    leaveFrame: null, leaveReason: null,
    firstCmdFrame: null, lastCmdFrame: null, cmdCountByThird: [0, 0, 0],
  };
}

function nameOf(v: { Name?: string } | string | undefined): string | null {
  if (!v) return null;
  return (typeof v === "string" ? v : v.Name) ?? null;
}

function posOf(v: ScrepCmd["Pos"]): { x: number; y: number } | null {
  if (!v) return null;
  const x = typeof v.X === "number" ? v.X : v.x;
  const y = typeof v.Y === "number" ? v.Y : v.y;
  return typeof x === "number" && typeof y === "number" ? { x, y } : null;
}

function pushFrame(bag: Record<string, number[]>, key: string, frame: number): void {
  (bag[key] ?? (bag[key] = [])).push(frame);
}

const RESEARCH_DEDUPE_FRAMES = 48;

function pushResearch(
  into: string[], last: Map<string, number>, key: string, name: string, frame: number | null,
): boolean {
  if (frame !== null) {
    const prev = last.get(key);
    if (prev !== undefined && frame - prev < RESEARCH_DEDUPE_FRAMES) {
      last.set(key, frame);
      return false;
    }
    last.set(key, frame);
  }
  into.push(name);
  return true;
}

const TAG_OWNER_SHARE = 0.7;

function ownerOfTags(cmds: ScrepCmd[], observers: Set<number>): Map<number, number> {
  const tally = new Map<number, Map<number, number>>();
  for (const c of cmds) {
    const n = nameOf(c.Type);
    if ((n !== "Select" && n !== "Select Add") || observers.has(c.PlayerID)) continue;
    for (const t of c.UnitTags ?? []) {
      if (typeof t !== "number") continue;
      let m = tally.get(t);
      if (!m) { m = new Map(); tally.set(t, m); }
      m.set(c.PlayerID, (m.get(c.PlayerID) ?? 0) + 1);
    }
  }
  const out = new Map<number, number>();
  for (const [tag, m] of tally) {
    let total = 0;
    let best: [number, number] | null = null;
    for (const e of m) { total += e[1]; if (!best || e[1] > best[1]) best = e; }
    if (best && best[1] / total >= TAG_OWNER_SHARE) out.set(tag, best[0]);
  }
  return out;
}

function collectSignals(
  cmds: ScrepCmd[],
  totalFrames: number | null,
  roster?: { id: number; slot: number | undefined; team: number; obs: boolean; raw: string }[],
): Map<number, ReplayPlayerSignals> {
  const observers = new Set((roster ?? []).filter((p) => p.obs).map((p) => p.id));
  const teamOf = new Map((roster ?? []).map((p) => [p.id, p.team]));
  const rawOf = new Map((roster ?? []).map((p) => [p.id, p.raw]));
  const idOfSlot = new Map(
    (roster ?? []).filter((p) => p.slot !== undefined).map((p) => [p.slot as number, p.id]),
  );
  const tagOwner = roster ? ownerOfTags(cmds, observers) : new Map<number, number>();
  const out = new Map<number, ReplayPlayerSignals>();
  const at = (id: number) => {
    let s = out.get(id);
    if (!s) { s = emptySignals(); out.set(id, s); }
    return s;
  };
  const lastResearchFrame = new Map<string, number>();
  const sel = new Map<number, number[]>();
  const lastDroneBuild = new Map<number, { unit: string; frame: number; x: number | null; y: number | null; drone: boolean }>();
  const DRONE_REBUILD_WINDOW_FRAMES = Math.round(20 / SECONDS_PER_FRAME);
  const WORKER_FOOTPRINT: Record<string, [number, number]> = {
    "Command Center": [4, 3], Barracks: [4, 3], Factory: [4, 3], Starport: [4, 3],
    "Science Facility": [4, 3], "Engineering Bay": [4, 3], Refinery: [4, 2],
    "Supply Depot": [3, 2], Academy: [3, 2], Armory: [3, 2], Bunker: [3, 2],
    "Missile Turret": [2, 2],
    Nexus: [4, 3], Gateway: [4, 3], Stargate: [4, 3], Assimilator: [4, 2],
    Forge: [3, 2], "Cybernetics Core": [3, 2], "Shield Battery": [3, 2],
    "Robotics Facility": [3, 2], Observatory: [3, 2], "Robotics Support Bay": [3, 2],
    "Citadel of Adun": [3, 2], "Templar Archives": [3, 2], "Fleet Beacon": [3, 2],
    "Arbiter Tribunal": [3, 2], Pylon: [2, 2], "Photon Cannon": [2, 2],
  };
  const groups = new Map<string, number[]>();
  const unitOfTag = new Map<string, { from: number; name: string; last: number }[]>();
  const nameTag = (key: string, frame: number, named: string) => {
    const list = unitOfTag.get(key);
    if (!list) { unitOfTag.set(key, [{ from: frame, name: named, last: frame }]); return; }
    const tail = list[list.length - 1];
    if (tail.name === named) tail.last = Math.max(tail.last, frame);
    else list.push({ from: frame, name: named, last: frame });
  };
  const ID_TTL_SEC: Record<string, number> = { Worker: 180 };
  const ID_TTL_DEFAULT_SEC = 300;
  const nameAt = (key: string, frame: number): string | undefined => {
    const list = unitOfTag.get(key);
    if (!list) return undefined;
    let span = list[0];
    for (const sp of list) {
      if (sp.from > frame) break;
      span = sp;
    }
    if (frame < span.from) return span.name;
    const ttl = (ID_TTL_SEC[span.name] ?? ID_TTL_DEFAULT_SEC) / SECONDS_PER_FRAME;
    if (frame - span.last > ttl) return undefined;
    return span.name;
  };
  const pending: { pid: number; idx: number; tags: number[] }[] = [];
  const pendingLoads: { pid: number; frame: number; x: number; y: number; tag: number }[] = [];
  const flying = new Map<number, Set<number>>();
  const selIds = new Map<string, number>();
  let selIdSeq = 1;
  const SEL_LINK_FRAMES = Math.round(180 / SECONDS_PER_FRAME);
  const selSets = new Map<number, { tags: Set<number>; gid: number; frame: number }[]>();
  const tagsOf = (c: ScrepCmd): number[] => (
    Array.isArray(c.UnitTags) ? c.UnitTags.filter((t) => typeof t === "number") : []
  );
  for (const c of cmds) {
    const s = at(c.PlayerID);
    const frame = typeof c.Frame === "number" ? c.Frame : null;
    if (frame !== null) {
      if (s.firstCmdFrame === null || frame < s.firstCmdFrame) s.firstCmdFrame = frame;
      if (s.lastCmdFrame === null || frame > s.lastCmdFrame) s.lastCmdFrame = frame;
      if (totalFrames) {
        const third = Math.min(2, Math.floor((frame / totalFrames) * 3));
        s.cmdCountByThird[third] += 1;
      }
    }
    const cmdName = c.Type?.Name;
    const wasted = Boolean(c.IneffKind);
    if (!wasted && cmdName && UNIT_TRAIN_CMD_NAMES.has(cmdName)) {
      const unit = nameOf(c.Unit);
      if (unit) {
        s.unitCounts[unit] = (s.unitCounts[unit] ?? 0) + 1;
        if (frame !== null) {
          if (s.firstUnitFrame[unit] === undefined) s.firstUnitFrame[unit] = frame;
          pushFrame(s.unitFrames, unit, frame);
          pushFrame(s.trainTags, unit, (sel.get(c.PlayerID) ?? [])[0] ?? 0);
        }
      }
    } else if (!wasted && cmdName && BUILD_CMD_NAMES.has(cmdName)) {
      const b = nameOf(c.Unit);
      if (b) {
        const ordName = nameOf(c.Order);
        const workerBuild = ordName === "DroneStartBuild"
          || ordName === "PlaceBuilding" || ordName === "PlaceProtossBuilding";
        if (workerBuild && frame !== null) {
          const drone = ordName === "DroneStartBuild";
          const posNow = posOf(c.Pos);
          const prev = lastDroneBuild.get(c.PlayerID);
          const overlaps = !drone && prev && prev.unit === b
            && prev.x !== null && prev.y !== null && posNow
            ? Math.abs(posNow.x - prev.x) < (WORKER_FOOTPRINT[b] ?? [3, 2])[0]
              && Math.abs(posNow.y - prev.y) < (WORKER_FOOTPRINT[b] ?? [3, 2])[1]
            : false;
          if (prev && frame - prev.frame <= DRONE_REBUILD_WINDOW_FRAMES
            && (prev.drone ? drone : overlaps)) {
            s.buildingCounts[prev.unit] = Math.max(0, (s.buildingCounts[prev.unit] ?? 1) - 1);
            const bf = s.buildingFrames[prev.unit];
            if (bf) {
              const bi = bf.lastIndexOf(prev.frame);
              if (bi >= 0) bf.splice(bi, 1);
            }
            if (s.firstBuildingFrame[prev.unit] === prev.frame) delete s.firstBuildingFrame[prev.unit];
            for (let pi = s.buildPositions.length - 1; pi >= 0; pi -= 1) {
              const bp = s.buildPositions[pi];
              if (bp.unit === prev.unit && bp.frame === prev.frame) { s.buildPositions.splice(pi, 1); break; }
            }
          }
          lastDroneBuild.set(c.PlayerID, {
            unit: b, frame, x: posNow?.x ?? null, y: posNow?.y ?? null, drone,
          });
        }
        s.buildingCounts[b] = (s.buildingCounts[b] ?? 0) + 1;
        if (frame !== null) {
          if (s.firstBuildingFrame[b] === undefined) s.firstBuildingFrame[b] = frame;
          pushFrame(s.buildingFrames, b, frame);
        }
        const pos = posOf(c.Pos);
        if (pos) {
          s.buildPositions.push({ unit: b, frame, x: pos.x, y: pos.y });
        }
        if (cmdName === "Building Morph" && frame !== null) {
          s.buildingMorphs.push({ frame, to: b });
        }
      }
    } else if (cmdName === "Land") {
      const pos = posOf(c.Pos);
      if (pos && frame !== null) s.lands.push({ frame, x: pos.x, y: pos.y });
    } else if (cmdName === "Cancel Build" && frame !== null) {
      s.cancelBuilds.push(frame);
    } else if (!wasted && (cmdName === "Cancel Train" || cmdName === "Cancel Morph")
      && frame !== null) {
      const selTags = sel.get(c.PlayerID) ?? [];
      let bestUnit: string | null = null;
      let bestIdx = -1;
      let bestFrame = -1;
      let bestByTag = false;
      const CANCEL_LOOKBACK_FRAMES = 2400;
      for (const [unit, frames] of Object.entries(s.unitFrames)) {
        const tags = s.trainTags[unit] ?? [];
        for (let i = frames.length - 1; i >= 0; i -= 1) {
          if (frames[i] > frame || frames[i] < frame - CANCEL_LOOKBACK_FRAMES) continue;
          const byTag = tags[i] > 0 && selTags.includes(tags[i]);
          if ((byTag && (!bestByTag || frames[i] > bestFrame))
            || (!byTag && !bestByTag && frames[i] > bestFrame)) {
            bestUnit = unit;
            bestIdx = i;
            bestFrame = frames[i];
            bestByTag = byTag;
          }
        }
      }
      if (bestUnit !== null && bestIdx >= 0) {
        s.unitFrames[bestUnit].splice(bestIdx, 1);
        (s.trainTags[bestUnit] ?? []).splice(bestIdx, 1);
        s.unitCounts[bestUnit] = Math.max(0, (s.unitCounts[bestUnit] ?? 1) - 1);
      }
    }
    if (cmdName === "Select" || cmdName === "Select Add" || cmdName === "Select Remove"
      || cmdName === "Hotkey") lastDroneBuild.delete(c.PlayerID);
    if (cmdName === "Select") sel.set(c.PlayerID, tagsOf(c));
    else if (cmdName === "Select Add") sel.set(c.PlayerID, [...(sel.get(c.PlayerID) ?? []), ...tagsOf(c)]);
    else if (cmdName === "Select Remove") {
      const drop = new Set(tagsOf(c));
      sel.set(c.PlayerID, (sel.get(c.PlayerID) ?? []).filter((t) => !drop.has(t)));
    } else if (cmdName === "Hotkey") {
      const key = `${c.PlayerID}:${typeof c.Group === "number" ? c.Group : nameOf(c.Group)}`;
      const how = nameOf(c.HotkeyType);
      if (how === "Assign") groups.set(key, [...(sel.get(c.PlayerID) ?? [])]);
      else if (how === "Select") sel.set(c.PlayerID, [...(groups.get(key) ?? [])]);
    }
    {
      const orderName = nameOf(c.Order);
      const morphTo = cmdName === "Unit Morph" ? nameOf(c.Unit) : undefined;
      const byMorph = morphTo === "Lurker" ? "Lurker"
        : morphTo === "Guardian" || morphTo === "Devourer" ? morphTo
          : morphTo === "Drone" ? "Worker"
            : morphTo === "Overlord" ? "Transport"
              : morphTo;
      const clicked = (cmdName === "Right Click" || cmdName === "Targeted Order")
        ? nameOf(c.Unit) : undefined;
      const mixedStart = frame !== null && frame < EARLY_ALL_SELECT_FRAMES
        && (sel.get(c.PlayerID)?.length ?? 0) >= 4;
      const byClick = clicked && RESOURCE_TARGETS.has(clicked) && !mixedStart ? "Worker" : undefined;
      const byRole = cmdName && WORKER_CMD_NAMES.has(cmdName) ? "Worker"
        : cmdName && BUILDING_ONLY_CMD_NAMES.has(cmdName) ? "Building" : byClick;
      const named = (cmdName ? USE_CMD_TO_UNIT[cmdName] : undefined)
        ?? (orderName ? CAST_ORDER_TO_UNIT[orderName] : undefined)
        ?? (orderName === PLACE_MINE_ORDER ? "Vulture" : undefined)
        ?? byMorph ?? byRole;
      if (named) {
        for (const t of sel.get(c.PlayerID) ?? []) nameTag(`${c.PlayerID}:${t}`, frame ?? 0, named);
      }
    }
    if (cmdName === "Right Click" || cmdName === "Targeted Order") {
      const pos = s.orderPositions.length < ORDER_POS_CAP ? posOf(c.Pos) : null;
      if (pos && frame !== null) {
        const orderName = nameOf(c.Order);
        const clickedName = cmdName === "Right Click" ? nameOf(c.Unit) : undefined;
        const clickedOwner = typeof c.UnitTag === "number" && c.UnitTag > 0
          ? tagOwner.get(c.UnitTag) : undefined;
        const clickedFoe = clickedOwner !== undefined && clickedOwner !== c.PlayerID
          && teamOf.get(clickedOwner) !== undefined
          && teamOf.get(clickedOwner) !== teamOf.get(c.PlayerID);
        const byClick = cmdName !== "Right Click" ? undefined
          : clickedName && RESOURCE_TARGETS.has(clickedName) && clickedName !== "Vespene Geyser"
            ? undefined
            : clickedFoe ? "attack" as const : "move" as const;
        const kind = orderName === "Move" ? "move" as const
          : orderName?.startsWith("Attack") ? "attack" as const
            : byClick;
        const picked = sel.get(c.PlayerID) ?? [];
        const fly = flying.get(c.PlayerID);
        if (fly && picked.length > 0 && picked.every((tg) => fly.has(tg))) {
          (s.flyPositions ??= []).push({
            frame, x: pos.x / PIXELS_PER_TILE, y: pos.y / PIXELS_PER_TILE,
          });
        }
        if (typeof c.UnitTag === "number" && clickedOwner === c.PlayerID && frame !== null) {
          pendingLoads.push({
            pid: c.PlayerID, frame, x: pos.x / PIXELS_PER_TILE, y: pos.y / PIXELS_PER_TILE,
            tag: c.UnitTag,
          });
        }
        let gid: number | undefined;
        if (picked.length > 0) {
          const gkey = `${c.PlayerID}:${[...picked].sort((a, b) => a - b).join(",")}`;
          gid = selIds.get(gkey);
          if (gid === undefined) {
            const list = selSets.get(c.PlayerID) ?? [];
            let bestInter = 0;
            for (const e of list) {
              if (frame - e.frame > SEL_LINK_FRAMES) continue;
              let inter = 0;
              for (const tg of picked) if (e.tags.has(tg)) inter += 1;
              if (inter >= Math.ceil(Math.max(picked.length, e.tags.size) / 2)
                && inter > bestInter) { bestInter = inter; gid = e.gid; }
            }
            if (gid === undefined) { gid = selIdSeq; selIdSeq += 1; }
            selIds.set(gkey, gid);
          }
          let list = selSets.get(c.PlayerID);
          if (!list) { list = []; selSets.set(c.PlayerID, list); }
          const hit = list.find((e) => e.gid === gid);
          if (hit) { hit.tags = new Set(picked); hit.frame = frame; }
          else list.push({ tags: new Set(picked), gid, frame });
        }
        s.orderPositions.push({
          frame, x: pos.x / PIXELS_PER_TILE, y: pos.y / PIXELS_PER_TILE, ...(kind ? { kind } : {}),
          ...(picked.length > 0 ? { n: picked.length } : {}),
          ...(gid !== undefined ? { g: gid } : {}),
        });
        if (picked.length > 0) {
          pending.push({ pid: c.PlayerID, idx: s.orderPositions.length - 1, tags: [...picked] });
        }
        const whom = clickedFoe && clickedOwner !== undefined
          ? rawOf.get(clickedOwner) : undefined;
        if (whom && s.hits.length < ORDER_POS_CAP) {
          s.hits.push({
            frame, x: pos.x / PIXELS_PER_TILE, y: pos.y / PIXELS_PER_TILE, whom,
          });
        }
      }
    }
    if (cmdName === "Unload" || cmdName === "Unload All") {
      s.unloadCount += 1;
      if (frame !== null && s.firstUnloadFrame === null) s.firstUnloadFrame = frame;
      const pos = posOf(c.Pos);
      if (pos && frame !== null) {
        (s.unloadPositions ??= []).push({
          frame, x: pos.x / PIXELS_PER_TILE, y: pos.y / PIXELS_PER_TILE,
        });
      } else if (frame !== null) {
        const last = s.orderPositions[s.orderPositions.length - 1];
        if (last && frame - last.frame <= 30 / SECONDS_PER_FRAME) {
          (s.unloadPositions ??= []).push({ frame, x: last.x, y: last.y });
        }
      }
    }
    if (cmdName === "Lift Off") {
      s.liftOffCount += 1;
      if (frame !== null && s.firstLiftOffFrame === null) s.firstLiftOffFrame = frame;
      if (frame !== null) (s.lifts ??= []).push(frame);
      const f = flying.get(c.PlayerID) ?? new Set<number>();
      for (const tg of sel.get(c.PlayerID) ?? []) f.add(tg);
      flying.set(c.PlayerID, f);
    } else if (cmdName === "Land") {
      for (const tg of sel.get(c.PlayerID) ?? []) flying.get(c.PlayerID)?.delete(tg);
    } else if (cmdName === "Leave Game") {
      s.leaveFrame = frame;
      s.leaveReason = nameOf(c.Reason);
    }
    if (cmdName === "Chat" && typeof c.Message === "string" && c.Message.trim()) {
      const speaker = typeof c.SenderSlotID === "number" ? idOfSlot.get(c.SenderSlotID) : undefined;
      if (speaker !== undefined) {
        const cs = at(speaker);
        if (cs.chats.length < CHAT_CAP) cs.chats.push({ frame, text: c.Message.trim() });
      }
    }
    const order = wasted ? undefined : nameOf(c.Order);
    const usedTech = order
      ? (CAST_ORDER_TO_TECH[order] ?? (order === PLACE_MINE_ORDER ? "Spider Mines" : null))
      : (!wasted && cmdName ? USE_CMD_TO_TECH[cmdName] ?? null : null);
    if (usedTech) {
      s.techUses[usedTech] = (s.techUses[usedTech] ?? 0) + 1;
      if (frame !== null) (s.techFrames[usedTech] ??= []).push(frame);
      const castAt = posOf(c.Pos);
      if (castAt && frame !== null && s.castPositions.length < ORDER_POS_CAP) {
        s.castPositions.push({
          tech: usedTech, frame,
          x: castAt.x / PIXELS_PER_TILE, y: castAt.y / PIXELS_PER_TILE,
        });
      }
      if (frame !== null && s.firstTechUseFrame[usedTech] === undefined) {
        s.firstTechUseFrame[usedTech] = frame;
      }
    }
    const tech = nameOf(c.Tech);
    if (tech && pushResearch(s.techNames, lastResearchFrame, `${c.PlayerID}:T:${tech}`, tech, frame)) {
      if (frame !== null && s.firstTechFrame[tech] === undefined) s.firstTechFrame[tech] = frame;
    }
    const upgradeRaw = nameOf(c.Upgrade);
    if (upgradeRaw) {
      const upgrade = normalizeUpgradeName(upgradeRaw);
      if (pushResearch(s.upgradeNames, lastResearchFrame, `${c.PlayerID}:U:${upgrade}`, upgrade, frame)
        && frame !== null && s.firstUpgradeFrame[upgrade] === undefined) {
        s.firstUpgradeFrame[upgrade] = frame;
      }
    }
  }
  for (const { pid, idx, tags } of pending) {
    const atFrame = out.get(pid)?.orderPositions[idx]?.frame ?? 0;
    const tally = new Map<string, number>();
    for (const t of tags) {
      const name = nameAt(`${pid}:${t}`, atFrame);
      if (name) tally.set(name, (tally.get(name) ?? 0) + 1);
    }
    const top = [...tally].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] * 2 >= tags.length) {
      const o = out.get(pid)?.orderPositions[idx];
      if (o) {
        o.by = top[0];
        if (top[0] === "Building") {
          const bTag = tags.find((tg) => nameAt(`${pid}:${tg}`, o.frame) === "Building") ?? 0;
          const sig = out.get(pid);
          if (sig && sig.rallies.length < 400) {
            sig.rallies.push({ frame: o.frame, x: o.x, y: o.y, tag: bTag });
          }
        }
      }
    }
  }
  for (const l of pendingLoads) {
    if (nameAt(`${l.pid}:${l.tag}`, l.frame) !== "Transport") continue;
    const sig = out.get(l.pid);
    if (!sig) continue;
    (sig.loadPositions ??= []).push({ frame: l.frame, x: l.x, y: l.y });
  }
  for (const sig of out.values()) {
    sig.loadPositions?.sort((a, b) => a.frame - b.frame);
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  const CHUNK = 4096;
  let s = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

const MAP_PALETTE_MAX = 256;

async function readMapGrid(res: ScrepResult): Promise<ReplayMapGrid | null> {
  const w = res.Header.MapWidth;
  const h = res.Header.MapHeight;
  const raw0 = res.MapData?.Tiles ?? null;
  const raw = raw0 && w && h && raw0.length > w * h ? raw0.slice(0, w * h) : raw0;
  if (!w || !h || !raw || raw.length !== w * h) return null;
  if (!globalThis.crypto?.subtle) return null;

  const groups = new Uint16Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) groups[i] = raw[i] >> 4;
  const uniq = [...new Set(groups)].sort((a, b) => a - b);
  const bucket = uniq.length / MAP_PALETTE_MAX;
  const palette = uniq.length <= MAP_PALETTE_MAX
    ? uniq
    : Array.from({ length: MAP_PALETTE_MAX }, (_, i) => uniq[Math.floor(i * bucket)]);
  const at = new Map(uniq.map((g, i) => [
    g,
    uniq.length <= MAP_PALETTE_MAX ? i : Math.min(MAP_PALETTE_MAX - 1, Math.floor(i / bucket)),
  ]));
  const bytes = new Uint8Array(groups.length);
  for (let i = 0; i < groups.length; i += 1) bytes[i] = at.get(groups[i]) ?? 0;

  const resources = clusterResources(res.MapData);

  const tiles = toBase64(bytes);
  const resKey = resources.map((r) => r.join(",")).join(";");
  const src = new TextEncoder().encode(`${w}x${h}|${palette.join(",")}|${tiles}|${resKey}`);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", src));
  const hash = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
  return { hash, name: res.Header.Map ?? "", width: w, height: h, palette, tiles, resources };
}

const RESOURCE_CLUSTER_RADIUS = 1.2;
const RESOURCE_CLUSTER_MAX = 340;

function clusterResources(md: ScrepResult["MapData"]): [number, number, 0 | 1][] {
  type P = { x: number; y: number };
  const pts: P[] = [];
  for (const m of md?.MineralFields ?? []) pts.push({ x: m.X / 32, y: m.Y / 32 });
  const r2 = RESOURCE_CLUSTER_RADIUS * RESOURCE_CLUSTER_RADIUS;
  const clusters: { xs: number; ys: number; n: number }[] = [];
  for (const p of pts) {
    let hit = null as (typeof clusters)[number] | null;
    for (const c of clusters) {
      const dx = c.xs / c.n - p.x;
      const dy = c.ys / c.n - p.y;
      if (dx * dx + dy * dy <= r2) { hit = c; break; }
    }
    if (hit) { hit.xs += p.x; hit.ys += p.y; hit.n += 1; }
    else clusters.push({ xs: p.x, ys: p.y, n: 1 });
  }
  const zones: [number, number, 0 | 1][] = clusters
    .sort((a, b) => b.n - a.n)
    .slice(0, RESOURCE_CLUSTER_MAX)
    .map((c) => [
      Math.round((c.xs / c.n) * 10) / 10,
      Math.round((c.ys / c.n) * 10) / 10,
      0,
    ]);
  for (const g of md?.Geysers ?? []) {
    if (!g.Point) continue;
    zones.push([
      Math.round((g.Point.X / 32) * 10) / 10,
      Math.round((g.Point.Y / 32) * 10) / 10,
      1,
    ]);
  }
  return zones.slice(0, 384);
}

export async function parseReplayFile(file: File): Promise<ParsedReplay> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let res: ScrepResult;
  try {
    const { default: Screp } = await import("screp-js");
    res = (await Screp.parseBuffer(buf, { cmds: true, mapData: true, mapTiles: true, mapResLoc: true })) as ScrepResult;
  } catch {
    throw new ReplayParseError(`"${file.name}" 파일을 리플레이로 읽지 못했어요.`);
  }

  const descByPlayerId = new Map<number, ScrepPlayerDesc>();
  (res.Computed?.PlayerDescs ?? []).forEach((d) => descByPlayerId.set(d.PlayerID, d));

  const cmds = res.Commands?.Cmds ?? null;
  const buildCountByPlayerId = cmds
    ? cmds.reduce((acc, c) => {
        if (!c.IneffKind && c.Type?.Name && PRODUCTION_CMD_NAMES.has(c.Type.Name)) {
          acc.set(c.PlayerID, (acc.get(c.PlayerID) ?? 0) + 1);
        }
        return acc;
      }, new Map<number, number>())
    : null;
  const buildCountOf = (playerId: number): number | null =>
    buildCountByPlayerId ? buildCountByPlayerId.get(playerId) ?? 0 : null;

  const totalFrames = typeof res.Header.Frames === "number" && res.Header.Frames > 0
    ? res.Header.Frames
    : null;
  const signalsByPlayerId = cmds
    ? collectSignals(cmds, totalFrames, res.Header.Players.map((p) => ({
      id: p.ID, slot: p.SlotID, team: p.Team, obs: p.Observer === true, raw: p.Name,
    })))
    : null;
  const signalsOf = (playerId: number): ReplayPlayerSignals | null =>
    signalsByPlayerId ? signalsByPlayerId.get(playerId) ?? emptySignals() : null;

  const startTileOf = (() => {
    const spots = res.MapData?.StartLocations ?? null;
    if (!spots || spots.length === 0) return () => null;
    const bySlot = new Map(spots.map((s) => [s.SlotID, s]));
    return (slotId: number | undefined): { x: number; y: number } | null => {
      if (slotId === undefined) return null;
      const s = bySlot.get(slotId);
      return s ? { x: s.X / 32, y: s.Y / 32 } : null;
    };
  })();

  const declared: ParsedReplayPlayer[] = (res.Header.Players ?? [])
    .filter((p) => !p.Observer && p.Type?.Name !== "Observer")
    .map((p) => {
      const desc = descByPlayerId.get(p.ID);
      return {
        rawName: p.Name,
        race: RACE_NAME_MAP[p.Race?.Name ?? ""] ?? "",
        color: typeof p.Color?.RGB === "number"
          ? `#${p.Color.RGB.toString(16).padStart(6, "0")}` : null,
        team: p.Team,
        apm: desc?.APM ?? null,
        eapm: desc?.EAPM ?? null,
        cmdCount: desc?.CmdCount ?? null,
        effectiveCmdCount: desc?.EffectiveCmdCount ?? null,
        buildCount: buildCountOf(p.ID),
        isComputer: p.Type?.Name === "Computer",
        startX: startTileOf(p.SlotID)?.x ?? null,
        startY: startTileOf(p.SlotID)?.y ?? null,
        signals: signalsOf(p.ID),
      };
    });

  const declaredTeamIds = [...new Set(declared.map((p) => p.team))].sort((a, b) => a - b);
  const maxEcmd9 = Math.max(0, ...declared.map((x) => x.effectiveCmdCount ?? 0));
  const teamPlayed9 = (tid: number): boolean => declared.some((x) => x.team === tid
    && (x.isComputer || (maxEcmd9 > 0 && (x.effectiveCmdCount ?? 0) > maxEcmd9 * OBSERVER_ECMD_RATIO)));
  const realTeamIds9 = declaredTeamIds.filter(teamPlayed9);
  const playingTeamIds = declaredTeamIds.length > 2 && realTeamIds9.length >= 2
    ? realTeamIds9 : declaredTeamIds.slice(0, 2);
  const onPlayingTeam = declared.filter((p) => playingTeamIds.includes(p.team));

  const typeName9 = res.Header.Type?.Name ?? "";
  const noTeamType9 = typeName9 === "Melee" || typeName9 === "Free For All";
  const noTeamInfo9 = declaredTeamIds.length < 2;
  const ffa = playingTeamIds.length > 2
    || (noTeamType9 && noTeamInfo9 && onPlayingTeam.length > 2);
  const teamSplitUncertain = !ffa && declaredTeamIds.length < 2 && declared.length >= 2;

  const players = onPlayingTeam;
  const guessedObservers = onPlayingTeam
    .filter((p, _i, all) => isObserverByActivity(p, all))
    .map((p) => p.rawName);
  const guessedObserverSet = new Set(guessedObservers);

  const [firstTeam] = playingTeamIds;

  const leaveWinnerTeam = ((): number | null => {
    if (playingTeamIds.length < 2) return null;
    const leftIds = new Set(
      (res.Computed?.LeaveGameCmds ?? []).map((c) => c.PlayerID),
    );
    const played = (res.Header.Players ?? []).filter((p) => (
      !p.Observer && p.Type?.Name !== "Observer" && p.Type?.Name !== "Computer"
      && playingTeamIds.includes(p.Team)
      && (descByPlayerId.get(p.ID)?.CmdCount ?? 0) > 0
    ));
    const allLeft = (team: number): boolean => {
      const ids = played.filter((p) => p.Team === team).map((p) => p.ID);
      return ids.length > 0 && ids.every((id) => leftIds.has(id));
    };
    const remain9 = playingTeamIds.filter((tid) => !allLeft(tid));
    if (remain9.length === 1) return remain9[0];
    if (remain9.length === 0) {
      const teamOfId9 = new Map(played.map((p) => [p.ID, p.Team]));
      let lastF9 = -1;
      let lastTeams9: number[] = [];
      for (const c9 of res.Computed?.LeaveGameCmds ?? []) {
        const tm9 = teamOfId9.get(c9.PlayerID);
        if (tm9 === undefined || !playingTeamIds.includes(tm9)) continue;
        const f9 = c9.Frame ?? 0;
        if (f9 > lastF9) { lastF9 = f9; lastTeams9 = [tm9]; }
        else if (f9 === lastF9 && !lastTeams9.includes(tm9)) lastTeams9.push(tm9);
      }
      if (lastTeams9.length === 1) return lastTeams9[0];
    }
    return null;
  })();
  const screpWinner = res.Computed?.WinnerTeam ?? 0;
  const winnerTeamRaw = screpWinner !== 0 ? screpWinner : leaveWinnerTeam ?? 0;
  const ffaWinnerName = ((): string | null => {
    if (!ffa || !noTeamInfo9) return null;
    const leftAt9 = new Map<number, number>();
    for (const c9 of res.Computed?.LeaveGameCmds ?? []) {
      const f9 = c9.Frame ?? 0;
      const prev9 = leftAt9.get(c9.PlayerID);
      if (prev9 === undefined || f9 > prev9) leftAt9.set(c9.PlayerID, f9);
    }
    const played9 = (res.Header.Players ?? []).filter((p9) => (
      !p9.Observer && p9.Type?.Name !== "Observer"
      && (p9.Type?.Name === "Computer" || (descByPlayerId.get(p9.ID)?.CmdCount ?? 0) > 0)
    ));
    const soleSurvivor9 = (cand9: typeof played9): string | null => {
      if (cand9.length === 0) return null;
      if (cand9.length === 1) return cand9[0].Name;
      const stayed9 = cand9.filter((p9) => !leftAt9.has(p9.ID));
      if (stayed9.length === 1) return stayed9[0].Name;
      if (stayed9.length > 0) return null;
      let lastF9 = -1;
      let last9: string[] = [];
      for (const p9 of cand9) {
        const f9 = leftAt9.get(p9.ID) ?? -1;
        if (f9 > lastF9) { lastF9 = f9; last9 = [p9.Name]; }
        else if (f9 === lastF9) last9.push(p9.Name);
      }
      return last9.length === 1 ? last9[0] : null;
    };
    if (winnerTeamRaw !== 0) {
      return soleSurvivor9(played9.filter((p9) => p9.Team === winnerTeamRaw));
    }
    return soleSurvivor9(played9);
  })();
  const team1 = ffa
    ? (noTeamInfo9
      ? (ffaWinnerName !== null ? players.filter((p) => p.rawName === ffaWinnerName) : [])
      : (winnerTeamRaw !== 0 ? players.filter((p) => p.team === winnerTeamRaw) : []))
    : players.filter((p) => p.team === firstTeam);
  const team2 = ffa
    ? players.filter((p) => !team1.includes(p))
    : players.filter((p) => p.team !== firstTeam);
  const confirmedTeam1 = team1.filter((p) => !guessedObserverSet.has(p.rawName));
  const confirmedTeam2 = team2.filter((p) => !guessedObserverSet.has(p.rawName));
  const matchType: GameType = ffa ? "0103"
    : (confirmedTeam1.length === 1 && confirmedTeam2.length === 1) ? "0101" : "0102";
  const winnerSide: "team1" | "team2" | null = ffa
    ? (team1.length > 0 ? "team1" : null)
    : winnerTeamRaw === 0 ? null
      : winnerTeamRaw === firstTeam ? "team1" : "team2";

  const startTime = new Date(res.Header.StartTime);
  const validStart = !Number.isNaN(startTime.getTime());
  const date = validStart ? fmt(startTime) : fmt(new Date());
  const gameStartedAt = validStart ? startTime.toISOString() : null;

  const frames = res.Header.Frames;
  const durationSeconds = typeof frames === "number" && frames > 0
    ? Math.round(frames * SECONDS_PER_FRAME)
    : null;

  return {
    fileName: file.name,
    date,
    mapName: res.Header.Map ?? "",
    gameTypeId: typeof res.Header.Type?.ID === "number" ? res.Header.Type.ID : null,
    gameTypeName: res.Header.Type?.Name ?? "",
    gameStartedAt,
    durationSeconds,
    players,
    team1,
    team2,
    matchType,
    winnerSide,
    guessedObservers,
    teamSplitUncertain,
    ffa,
    mapGrid: await readMapGrid(res),
    chats: (() => {
      const seen = new Set<string>();
      const out: { frame: number; text: string }[] = [];
      for (const slot of [...team1, ...team2]) {
        for (const c of slot.signals?.chats ?? []) {
          const frame = c.frame ?? 0;
          const key = `${frame} ${c.text}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ frame, text: c.text });
        }
      }
      out.sort((a, b) => a.frame - b.frame || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
      return out;
    })(),
    startSpots: (res.MapData?.StartLocations ?? []).map((sp) => [sp.X / 32, sp.Y / 32] as [number, number]),
  };
}
