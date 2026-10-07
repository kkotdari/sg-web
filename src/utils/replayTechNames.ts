import { TECH_KO } from "./replayNames";

export const TECH_NAMES = [
  "Stim Packs", "Lockdown", "EMP Shockwave", "Spider Mines", "Scanner Sweep",
  "Tank Siege Mode", "Defensive Matrix", "Irradiate", "Yamato Gun", "Cloaking Field",
  "Personnel Cloaking", "Burrowing", "Infestation", "Spawn Broodlings", "Dark Swarm",
  "Plague", "Consume", "Ensnare", "Parasite", "Psionic Storm",
  "Hallucination", "Recall", "Stasis Field", "Archon Warp", "Restoration",
  "Disruption Web", "Mind Control", "Dark Archon Meld", "Feedback", "Optical Flare",
  "Maelstrom", "Lurker Aspect", "Healing",
  "Nuclear Strike",
] as const;
export type TechName = (typeof TECH_NAMES)[number];

export const UPGRADE_NAMES = [
  "Terran Infantry Armor", "Terran Vehicle Plating", "Terran Ship Plating",
  "Zerg Carapace", "Zerg Flyer Carapace", "Protoss Ground Armor", "Protoss Air Armor",
  "Terran Infantry Weapons", "Terran Vehicle Weapons", "Terran Ship Weapons",
  "Zerg Melee Attacks", "Zerg Missile Attacks", "Zerg Flyer Attacks",
  "Protoss Ground Weapons", "Protoss Air Weapons", "Protoss Plasma Shields",
  "U-238 Shells", "Ion Thrusters", "Titan Reactor", "Ocular Implants", "Moebius Reactor",
  "Apollo Reactor", "Colossus Reactor", "Ventral Sacs", "Antennae", "Pneumatized Carapace",
  "Metabolic Boost", "Adrenal Glands", "Muscular Augments", "Grooved Spines",
  "Gamete Meiosis", "Defiler Energy", "Singularity Charge", "Leg Enhancement",
  "Scarab Damage", "Reaver Capacity", "Gravitic Drive", "Sensor Array", "Gravitic Booster",
  "Khaydarin Amulet", "Apial Sensors", "Gravitic Thrusters", "Carrier Capacity",
  "Khaydarin Core", "Argus Jewel", "Argus Talisman", "Caduceus Reactor",
  "Chitinous Plating", "Anabolic Synthesis", "Charon Boosters",
] as const;
export type UpgradeName = (typeof UPGRADE_NAMES)[number];

export function normalizeUpgradeName(raw: string): string {
  const i = raw.indexOf(" (");
  return (i === -1 ? raw : raw.slice(0, i)).trim();
}

export const ARMOR_WEAPON_PAIRS: Record<string, { weapon: UpgradeName; armor: UpgradeName }[]> = {
  테란: [
    { weapon: "Terran Infantry Weapons", armor: "Terran Infantry Armor" },
    { weapon: "Terran Vehicle Weapons", armor: "Terran Vehicle Plating" },
    { weapon: "Terran Ship Weapons", armor: "Terran Ship Plating" },
  ],
  저그: [
    { weapon: "Zerg Melee Attacks", armor: "Zerg Carapace" },
    { weapon: "Zerg Missile Attacks", armor: "Zerg Carapace" },
    { weapon: "Zerg Flyer Attacks", armor: "Zerg Flyer Carapace" },
  ],
  프로토스: [
    { weapon: "Protoss Ground Weapons", armor: "Protoss Ground Armor" },
    { weapon: "Protoss Air Weapons", armor: "Protoss Air Armor" },
  ],
};

export const UPGRADE_LINE_KO: Record<string, string> = {
  "Terran Infantry Weapons": "보병",
  "Terran Vehicle Weapons": "메카닉",
  "Terran Ship Weapons": "공중",
  "Zerg Melee Attacks": "저글링",
  "Zerg Missile Attacks": "히드라",
  "Zerg Flyer Attacks": "공중",
  "Protoss Ground Weapons": "지상",
  "Protoss Air Weapons": "공중",
};

export const SIGNATURE_UPGRADE_KO: Partial<Record<UpgradeName, string>> = {
  "Metabolic Boost": "저글링 속업",
  "Adrenal Glands": "저글링 아드레날린",
  "Muscular Augments": "히드라 속업",
  "Grooved Spines": "히드라 사업",
  "Pneumatized Carapace": "오버로드 속업",
  "Ventral Sacs": "오버로드 수송",
  "Chitinous Plating": "울트라 방업",
  "Anabolic Synthesis": "울트라 속업",
  "U-238 Shells": "마린 사업",
  "Ion Thrusters": "벌처 속업",
  "Charon Boosters": "골리앗 사업",
  "Singularity Charge": "드라군 사업",
  "Leg Enhancement": "질럿 속업",
  "Gravitic Drive": "셔틀 속업",
  "Carrier Capacity": "캐리어 인터셉터 증설",
  "Reaver Capacity": "리버 스캐럽 증설",
  "Scarab Damage": "스캐럽 공업",
  "Khaydarin Amulet": "템플러 에너지업",
  "Gravitic Booster": "옵저버 속업",
  "Sensor Array": "옵저버 시야업",
  "Gravitic Thrusters": "스카웃 속업",
  "Apial Sensors": "스카웃 시야업",
  "Argus Talisman": "다크아콘 에너지업",
  "Argus Jewel": "커세어 에너지업",
  "Defiler Energy": "디파일러 에너지업",
  "Khaydarin Core": "아비터 에너지업",
  "Gamete Meiosis": "퀸 에너지업",
  "Moebius Reactor": "고스트 에너지업",
  "Ocular Implants": "고스트 시야업",
  "Titan Reactor": "베슬 에너지업",
  "Caduceus Reactor": "메딕 에너지업",
  "Apollo Reactor": "레이스 에너지업",
  "Colossus Reactor": "배틀크루저 에너지업",
  Antennae: "오버로드 시야업",
};

export const UPGRADE_KO: Record<UpgradeName, string> = {
  "Terran Infantry Armor": "보병 방어", "Terran Vehicle Plating": "메카닉 방어",
  "Terran Ship Plating": "공중 방어", "Zerg Carapace": "지상 방어",
  "Zerg Flyer Carapace": "공중 방어", "Protoss Ground Armor": "지상 방어",
  "Protoss Air Armor": "공중 방어", "Protoss Plasma Shields": "실드",
  "Terran Infantry Weapons": "보병 공격", "Terran Vehicle Weapons": "메카닉 공격",
  "Terran Ship Weapons": "공중 공격", "Zerg Melee Attacks": "저글링 공격",
  "Zerg Missile Attacks": "히드라 공격", "Zerg Flyer Attacks": "공중 공격",
  "Protoss Ground Weapons": "지상 공격", "Protoss Air Weapons": "공중 공격",
  "U-238 Shells": "마린 사업", "Ion Thrusters": "벌처 속업",
  "Titan Reactor": "베슬 에너지업", "Ocular Implants": "고스트 시야업",
  "Moebius Reactor": "고스트 에너지업", "Apollo Reactor": "레이스 에너지업",
  "Colossus Reactor": "배틀크루저 에너지업", "Ventral Sacs": "오버로드 수송",
  Antennae: "오버로드 시야업", "Pneumatized Carapace": "오버로드 속업",
  "Metabolic Boost": "저글링 속업", "Adrenal Glands": "저글링 아드레날린",
  "Muscular Augments": "히드라 속업", "Grooved Spines": "히드라 사업",
  "Gamete Meiosis": "퀸 에너지업", "Defiler Energy": "디파일러 에너지업",
  "Singularity Charge": "드라군 사업", "Leg Enhancement": "질럿 속업",
  "Scarab Damage": "스캐럽 공업", "Reaver Capacity": "리버 스캐럽 증설",
  "Gravitic Drive": "셔틀 속업", "Sensor Array": "옵저버 시야업",
  "Gravitic Booster": "옵저버 속업", "Khaydarin Amulet": "템플러 에너지업",
  "Apial Sensors": "스카웃 시야업", "Gravitic Thrusters": "스카웃 속업",
  "Carrier Capacity": "캐리어 인터셉터 증설", "Khaydarin Core": "아비터 에너지업",
  "Argus Jewel": "커세어 에너지업", "Argus Talisman": "다크아콘 에너지업",
  "Caduceus Reactor": "메딕 에너지업", "Chitinous Plating": "울트라 방업",
  "Anabolic Synthesis": "울트라 속업", "Charon Boosters": "골리앗 사업",
};

export function researchKo(name: string): string {
  return TECH_KO[name] ?? UPGRADE_KO[name as UpgradeName] ?? name;
}

export const UPGRADE_ONE_LETTER: Record<string, string> = { 속업: "속", 사업: "사" };

export const UNIT_UPGRADE_TAG: Partial<Record<UpgradeName, { unit: string; tag: string }>> = {
  "Metabolic Boost": { unit: "Zergling", tag: "속업" },
  "Adrenal Glands": { unit: "Zergling", tag: "아드레날린" },
  "Muscular Augments": { unit: "Hydralisk", tag: "속업" },
  "Grooved Spines": { unit: "Hydralisk", tag: "사업" },
  "Chitinous Plating": { unit: "Ultralisk", tag: "방업" },
  "Anabolic Synthesis": { unit: "Ultralisk", tag: "속업" },
  "Pneumatized Carapace": { unit: "Overlord", tag: "속업" },
  "Ventral Sacs": { unit: "Overlord", tag: "수송업" },
  "Defiler Energy": { unit: "Defiler", tag: "에너지업" },
  "Gamete Meiosis": { unit: "Queen", tag: "에너지업" },
  "U-238 Shells": { unit: "Marine", tag: "사업" },
  "Ion Thrusters": { unit: "Vulture", tag: "속업" },
  "Charon Boosters": { unit: "Goliath", tag: "사업" },
  "Moebius Reactor": { unit: "Ghost", tag: "에너지업" },
  "Titan Reactor": { unit: "Science Vessel", tag: "에너지업" },
  "Apollo Reactor": { unit: "Wraith", tag: "에너지업" },
  "Colossus Reactor": { unit: "Battlecruiser", tag: "에너지업" },
  "Singularity Charge": { unit: "Dragoon", tag: "사업" },
  "Leg Enhancement": { unit: "Zealot", tag: "속업" },
  "Gravitic Drive": { unit: "Shuttle", tag: "속업" },
  "Khaydarin Amulet": { unit: "High Templar", tag: "에너지업" },
  "Khaydarin Core": { unit: "Arbiter", tag: "에너지업" },
  "Argus Talisman": { unit: "Dark Archon", tag: "에너지업" },
  "Argus Jewel": { unit: "Corsair", tag: "에너지업" },
  "Gravitic Booster": { unit: "Observer", tag: "속업" },
  "Gravitic Thrusters": { unit: "Scout", tag: "속업" },
};

export const UPGRADE_UNITS: Record<string, readonly string[]> = {
  "Stim Packs": ["Marine", "Firebat"],
  "U-238 Shells": ["Marine"],
  "Caduceus Reactor": ["Medic"],
  Restoration: ["Medic"],
  "Optical Flare": ["Medic"],
  "Ion Thrusters": ["Vulture"],
  "Spider Mines": ["Vulture"],
  "Tank Siege Mode": ["Siege Tank", "Siege Tank (Tank Mode)", "Siege Tank (Siege Mode)"],
  "Charon Boosters": ["Goliath"],
  "Cloaking Field": ["Wraith"],
  "Apollo Reactor": ["Wraith"],
  "Titan Reactor": ["Science Vessel"],
  "EMP Shockwave": ["Science Vessel"],
  Irradiate: ["Science Vessel"],
  "Defensive Matrix": ["Science Vessel"],
  "Yamato Gun": ["Battlecruiser"],
  "Colossus Reactor": ["Battlecruiser"],
  "Personnel Cloaking": ["Ghost"],
  Lockdown: ["Ghost"],
  "Moebius Reactor": ["Ghost"],
  "Ocular Implants": ["Ghost"],
  "Nuclear Strike": ["Ghost"],
  "Protoss Plasma Shields": [
    "Probe", "Zealot", "Dragoon", "High Templar", "Dark Templar", "Archon", "Dark Archon",
    "Shuttle", "Reaver", "Observer", "Scout", "Corsair", "Carrier", "Arbiter", "Interceptor",
  ],
  "Singularity Charge": ["Dragoon"],
  "Leg Enhancement": ["Zealot"],
  "Leg Enhancements": ["Zealot"],
  "Psionic Storm": ["High Templar"],
  Hallucination: ["High Templar"],
  "Khaydarin Amulet": ["High Templar"],
  Maelstrom: ["Dark Archon"],
  "Mind Control": ["Dark Archon"],
  Feedback: ["Dark Archon"],
  "Argus Talisman": ["Dark Archon"],
  Recall: ["Arbiter"],
  "Stasis Field": ["Arbiter"],
  "Khaydarin Core": ["Arbiter"],
  "Disruption Web": ["Corsair"],
  "Argus Jewel": ["Corsair"],
  "Scarab Damage": ["Reaver"],
  "Reaver Capacity": ["Reaver"],
  "Gravitic Drive": ["Shuttle"],
  "Gravitic Booster": ["Observer"],
  "Gravitic Boosters": ["Observer"],
  "Sensor Array": ["Observer"],
  "Carrier Capacity": ["Carrier"],
  "Gravitic Thrusters": ["Scout"],
  "Apial Sensors": ["Scout"],
  "Metabolic Boost": ["Zergling"],
  "Adrenal Glands": ["Zergling"],
  "Muscular Augments": ["Hydralisk"],
  "Grooved Spines": ["Hydralisk"],
  "Lurker Aspect": ["Hydralisk", "Lurker"],
  "Pneumatized Carapace": ["Overlord"],
  "Ventral Sacs": ["Overlord"],
  Antennae: ["Overlord"],
  "Chitinous Plating": ["Ultralisk"],
  "Anabolic Synthesis": ["Ultralisk"],
  Plague: ["Defiler"],
  Consume: ["Defiler"],
  "Metasynaptic Node": ["Defiler"],
  "Defiler Energy": ["Defiler"],
  Ensnare: ["Queen"],
  "Spawn Broodlings": ["Queen"],
  Parasite: ["Queen"],
  "Gamete Meiosis": ["Queen"],
  Infestation: ["Queen"],
  Burrowing: ["Zergling", "Hydralisk", "Drone", "Defiler", "Lurker", "Infested Terran"],
};

export const UPGRADE_RANK: Partial<Record<UpgradeName, number>> = {
  "Metabolic Boost": 6, "Adrenal Glands": 6, "Muscular Augments": 6, "Grooved Spines": 6,
  "Singularity Charge": 6, "Leg Enhancement": 6, "Ion Thrusters": 6, "Charon Boosters": 6,
  "U-238 Shells": 6, "Anabolic Synthesis": 6, "Chitinous Plating": 6,
  "Ventral Sacs": 4, "Gravitic Drive": 4, "Gravitic Booster": 4, "Gravitic Thrusters": 4,
  "Pneumatized Carapace": 4, "Scarab Damage": 4,
  "Khaydarin Amulet": 2, "Khaydarin Core": 2, "Argus Talisman": 2, "Argus Jewel": 2,
  "Defiler Energy": 2, "Gamete Meiosis": 2, "Moebius Reactor": 2, "Titan Reactor": 2,
  "Colossus Reactor": 2, "Apollo Reactor": 2, "Caduceus Reactor": 2,
  "Sensor Array": 2, "Apial Sensors": 2, "Ocular Implants": 2, Antennae: 2,
};

export const TECH_RANK: Partial<Record<TechName, number>> = {
  "Nuclear Strike": 10,
  "Mind Control": 10, Maelstrom: 9, "Spawn Broodlings": 9, "Disruption Web": 9,
  "Optical Flare": 8, Restoration: 8, Hallucination: 8,
  "Psionic Storm": 7, "Yamato Gun": 7, "Stasis Field": 7, Plague: 7, Recall: 7,
  Irradiate: 6, Lockdown: 6, Consume: 6, Ensnare: 6, "EMP Shockwave": 6,
  "Dark Swarm": 5, "Lurker Aspect": 5,
  "Cloaking Field": 4, "Personnel Cloaking": 4,
  "Spider Mines": 2, Burrowing: 2, "Stim Packs": 1, "Tank Siege Mode": 1,
};

export interface TechSignalsLike {
  techNames: string[];
  upgradeNames: string[];
  firstTechFrame: Record<string, number>;
  firstUpgradeFrame: Record<string, number>;
  techUses: Record<string, number>;
  firstTechUseFrame: Record<string, number>;
}

export function hasTech(s: TechSignalsLike, name: TechName): boolean {
  return s.techNames.includes(name);
}

export function hasUpgrade(s: TechSignalsLike, name: UpgradeName): boolean {
  return s.upgradeNames.includes(name);
}

export function upgradeLevel(s: TechSignalsLike, name: UpgradeName): number {
  let n = 0;
  for (const u of s.upgradeNames) if (u === name) n += 1;
  return Math.min(n, MAX_UPGRADE_LEVEL);
}

export const MAX_UPGRADE_LEVEL = 3;

export function techFrame(s: TechSignalsLike, name: TechName): number | null {
  return s.firstTechFrame[name] ?? null;
}

export function upgradeFrame(s: TechSignalsLike, name: UpgradeName): number | null {
  return s.firstUpgradeFrame[name] ?? null;
}

export function topTech(s: TechSignalsLike): TechName | null {
  let best: TechName | null = null;
  let bestRank = 0;
  for (const raw of s.techNames) {
    const name = raw as TechName;
    const rank = TECH_RANK[name] ?? 0;
    if (rank > bestRank) { bestRank = rank; best = name; }
  }
  return best;
}

export const CAST_ORDER_TO_TECH: Record<string, TechName> = {
  CastPsionicStorm: "Psionic Storm",
  CastLockdown: "Lockdown",
  CastEMPShockwave: "EMP Shockwave",
  CastIrradiate: "Irradiate",
  FireYamatoGun: "Yamato Gun",
  CastDefensiveMatrix: "Defensive Matrix",
  CastScannerSweep: "Scanner Sweep",
  CastRestoration: "Restoration",
  CastOpticalFlare: "Optical Flare",
  CastDarkSwarm: "Dark Swarm",
  CastPlague: "Plague",
  CastConsume: "Consume",
  CastEnsnare: "Ensnare",
  CastParasite: "Parasite",
  CastSpawnBroodlings: "Spawn Broodlings",
  CastInfestation: "Infestation",
  CastRecall: "Recall",
  CastStasisField: "Stasis Field",
  CastHallucination: "Hallucination",
  CastDisruptionWeb: "Disruption Web",
  CastMindControl: "Mind Control",
  CastFeedback: "Feedback",
  CastMaelstrom: "Maelstrom",
  MedicHeal: "Healing",
  CastNuclearStrike: "Nuclear Strike",
  NukePaint: "Nuclear Strike",
  NukeLaunch: "Nuclear Strike",
  NukeUnit: "Nuclear Strike",
  NukeGround: "Nuclear Strike",
};

export const USE_CMD_TO_TECH: Record<string, TechName> = {
  Siege: "Tank Siege Mode",
  Burrow: "Burrowing",
  Cloack: "Personnel Cloaking",
  Stim: "Stim Packs",
};

export const PLACE_MINE_ORDER = "PlaceMine";

export function techUseCount(s: TechSignalsLike, name: TechName): number {
  return s.techUses[name] ?? 0;
}

const USE_BONUS_MAX = 2;
export function topUsedTech(s: TechSignalsLike): TechName | null {
  let best: TechName | null = null;
  let bestScore = 0;
  let bestUses = 0;
  for (const [raw, uses] of Object.entries(s.techUses)) {
    if (uses <= 0) continue;
    const name = raw as TechName;
    const rank = TECH_RANK[name] ?? 0;
    if (rank <= 0) continue;
    const score = rank + Math.min(USE_BONUS_MAX, Math.floor(uses / 10));
    if (score > bestScore || (score === bestScore && uses > bestUses)) {
      bestScore = score;
      bestUses = uses;
      best = name;
    }
  }
  return best;
}

export const SECOND_TECH_MIN_RANK = 5;
export const SECOND_TECH_MIN_USES = 3;
export function topUsedTechs(s: TechSignalsLike, max: number): TechName[] {
  const scored: { name: TechName; score: number; uses: number }[] = [];
  for (const [raw, uses] of Object.entries(s.techUses)) {
    if (uses <= 0) continue;
    const name = raw as TechName;
    const rank = TECH_RANK[name] ?? 0;
    if (rank <= 0) continue;
    scored.push({ name, score: rank + Math.min(USE_BONUS_MAX, Math.floor(uses / 10)), uses });
  }
  scored.sort((a, b) => b.score - a.score || b.uses - a.uses);
  return scored
    .filter((x, i) => i === 0
      || ((TECH_RANK[x.name] ?? 0) >= SECOND_TECH_MIN_RANK && x.uses >= SECOND_TECH_MIN_USES))
    .slice(0, max)
    .map((x) => x.name);
}

export const TECH_USE_PHRASE: Partial<Record<TechName, string[]>> = {
  "Tank Siege Mode": ["시즈를 {n}번 폄", "탱크를 {n}번 앉혔다 일으킴"],
  "Spider Mines": ["마인을 {n}개 깜", "길목마다 마인을 {n}개 심음"],
  Burrowing: ["버로우로 {n}번 숨음", "{n}번 땅에 숨어 기다림"],
  "Personnel Cloaking": ["고스트를 {n}번 숨김", "고스트를 {n}번 지워 놓고 움직임"],
  "Cloaking Field": ["레이스를 {n}번 숨김", "레이스를 {n}번 지워 놓고 들어감"],
  "Stim Packs": ["스팀팩을 {n}번 씀", "스팀을 {n}번 올려 달려듦"],
  "Psionic Storm": [
    "스톰을 {n}번 뿌림", "사이오닉 스톰으로 {n}번 지짐", "머리 위로 스톰을 {n}번 떨굼",
  ],
  "Stasis Field": [
    "스테이시스로 {n}번 병력을 통째로 묶음", "스테이시스 필드를 {n}번 걸어 시간을 벌음",
  ],
  Hallucination: ["할루시네이션으로 {n}번 허상을 앞세움", "환영을 {n}번 만들어 앞세움"],
  "Mind Control": ["마인드컨트롤로 {n}번 빼앗음", "다크아콘으로 {n}번 남의 유닛을 가져옴"],
  Feedback: ["피드백으로 {n}번 마나를 터뜨림", "상대 마법 유닛을 {n}번 피드백으로 지움"],
  "Disruption Web": ["디스럽션 웹을 {n}번 깔아 지상 공격을 막음", "웹을 {n}번 깔아 길을 끊음"],
  Maelstrom: ["마엘스트롬으로 {n}번 얼려 세움", "마엘스트롬을 {n}번 걸어 발을 묶음"],
  "Dark Swarm": [
    "다크스웜을 {n}번 깔아 총알을 지움", "스웜 아래로 {n}번 밀고 들어감",
  ],
  Plague: ["플레이그를 {n}번 뿌려 체력을 깎음", "플레이그로 {n}번 병력을 갉아 놓음"],
  Consume: ["컨슘으로 {n}번 마나를 채움", "저글링을 {n}번 삼켜 마나를 채움"],
  Ensnare: ["인스네어를 {n}번 뿌려 발을 묶음", "인스네어로 {n}번 속도를 죽임"],
  Parasite: ["패러사이트로 {n}번 시야를 훔침", "{n}번 패러사이트를 걸어 속을 들여다봄"],
  "Spawn Broodlings": [
    "브루들링으로 {n}번 유닛을 통째로 지움", "브루들링을 {n}번 심어 한 방에 없앰",
  ],
  Lockdown: ["락다운으로 {n}번 묶어 놓음", "락다운을 {n}번 걸어 세워 둠"],
  "EMP Shockwave": ["EMP로 {n}번 마나와 실드를 날림", "EMP를 {n}번 터뜨려 판을 정리함"],
  Irradiate: ["이레디에이트를 {n}번 걸음", "이레디로 {n}번 뭉친 병력을 녹임"],
  "Yamato Gun": ["야마토를 {n}번 쏨", "야마토로 {n}번 큰 것을 지움"],
  Restoration: ["리스토레이션으로 {n}번 풀어냄", "걸린 마법을 {n}번 풀어 줌"],
  "Optical Flare": ["옵티컬 플레어로 {n}번 눈을 멀게 함", "{n}번 눈을 멀게 해 놓고 붙음"],
  "Defensive Matrix": ["디펜시브 매트릭스를 {n}번 씌움", "{n}번 매트릭스로 감싸 살림"],
};

export const CAST_ORDER_TO_UNIT: Record<string, string> = {
  MoveUnload: "Transport",
  CastNuclearStrike: "Ghost",
  CastPsionicStorm: "High Templar",
  CastHallucination: "High Templar",
  CastLockdown: "Ghost",
  CastEMPShockwave: "Science Vessel",
  CastIrradiate: "Science Vessel",
  CastDefensiveMatrix: "Science Vessel",
  FireYamatoGun: "Battlecruiser",
  CastRestoration: "Medic",
  CastOpticalFlare: "Medic",
  MedicHeal: "Medic",
  HealMove: "Medic",
  Repair: "SCV",
  CastDarkSwarm: "Defiler",
  CastPlague: "Defiler",
  CastConsume: "Defiler",
  CastEnsnare: "Queen",
  CastParasite: "Queen",
  CastSpawnBroodlings: "Queen",
  CastInfestation: "Queen",
  CastRecall: "Arbiter",
  CastStasisField: "Arbiter",
  CastDisruptionWeb: "Corsair",
  CastMindControl: "Dark Archon",
  CastFeedback: "Dark Archon",
  CastMaelstrom: "Dark Archon",
};

export const USE_CMD_TO_UNIT: Record<string, string> = {
  Siege: "Siege Tank",
  Unsiege: "Siege Tank",
  Stim: "Bionic",
  "Train Fighter": "Carrier",
  "Merge Archon": "High Templar",
  "Merge Dark Archon": "Dark Templar",
  "Unload All": "Transport",
  Unload: "Transport",
  Burrow: "Burrower",
  Unburrow: "Burrower",
  Cloak: "Cloaker",
  Decloak: "Cloaker",
};
