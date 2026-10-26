import { SEARCH_ROLES9, TACTIC_TERMS9 } from "scplay";
import { normalizeSearchText } from "./memberSearch";
import { BUILDING_KO, TECH_KO, UNIT_KO } from "./replayNames";

function nativeNamesOf(term: string): string[] {
  const out: string[] = [];
  for (const table of [UNIT_KO, BUILDING_KO, TECH_KO]) {
    for (const [en, ko] of Object.entries(table)) {
      if (normalizeSearchText(ko).includes(term)) out.push(en);
    }
  }
  return out;
}

export interface GameSuggestion { value: string; tag: string; }

/* ★ 판 유형(팀 인원) 조건(2026-10-15, 요청: "게임 검색창에 조건중 유형도 넣을수있나 1:1 2:3(3:2도 포함) 4:4 이런거") — "a:b" 한 낱말이 곧 조건이다.
   서버(sg-api repository _team_size_cond)가 두 편의 인원(관전자 뺌)을 **차례 없이** 맞춘다 — 2:3 은 3:2 도 걸린다. 개인전(난투)은 안 걸린다.
   "2대3" · "2vs3" · "2v3" 도 같은 낱말로 읽는다. */
export const TEAM_SIZE_OPTIONS = ["1:1", "2:2", "3:3", "4:4", "1:2", "2:3", "3:4", "1:3", "2:4", "1:4"];
/** 인원이 아닌 판 종류(2026-10-20, 요청: "유형에 프리포올과 유즈맵도") — 낱말 그대로 서버로(repository any_terms 의 판 종류 조건). */
export const GAME_KIND_OPTIONS = ["프리포올", "유즈맵"];
const TEAM_SIZE_RE = /^([1-8])\s*(?::|대|vs|v)\s*([1-8])$/i;
/** 낱말이 판 유형이면 "a:b"(작은 쪽 먼저) · "프리포올" · "유즈맵", 아니면 null. */
export function teamSizeTerm(chunk: string): string | null {
  if (GAME_KIND_OPTIONS.includes(chunk.trim())) return chunk.trim();
  const m = TEAM_SIZE_RE.exec(chunk.trim());
  if (!m) return null;
  const a = Number(m[1]); const b = Number(m[2]);
  return `${Math.min(a, b)}:${Math.max(a, b)}`;
}

export function gameSuggestions(mapNames: Iterable<string>): GameSuggestion[] {
  const out: GameSuggestion[] = [];
  const seen = new Set<string>();
  const add = (value: string, tag: string): void => {
    const key = `${tag}:${normalizeSearchText(value)}`;
    if (!value || seen.has(key)) return;
    seen.add(key);
    out.push({ value, tag });
  };
  for (const race of ["테란", "프로토스", "저그"]) add(race, "종족");
  for (const size of [...TEAM_SIZE_OPTIONS, ...GAME_KIND_OPTIONS]) add(size, "유형");
  for (const [en, ko] of Object.entries(UNIT_KO)) { add(ko, "유닛"); add(en, "유닛"); }
  for (const [en, ko] of Object.entries(BUILDING_KO)) { add(ko, "건물"); add(en, "건물"); }
  for (const [en, ko] of Object.entries(TECH_KO)) { add(ko, "스킬"); add(en, "스킬"); }
  /* 전술 낱말(2026-10-20, 요청: "유닛건물스킬에 전술도 · 몰래 배럭 오버로드 사냥 …") · 공격함/공격당함/견제함/견제당함 — 서버가 게임 색인(운영자 재분석이
     굽는 사건 줄 · utils/gameIndex)에서 찾는다. "…함"은 그 사건의 주인 · "…당함"은 타겟이다. */
  for (const w of [...TACTIC_TERMS9, ...SEARCH_ROLES9]) add(w, "전술");
  for (const name of mapNames) add(name, "맵");
  return out;
}

const RACE_ALT: Record<string, string[]> = {
  테란: ["테란"], 프로토스: ["프로토스"], 저그: ["저그"],
  terran: ["테란"], protoss: ["프로토스"], toss: ["프로토스"], zerg: ["저그"],
};

export function altsOf(term: string): string {
  const raw = term.replace(/\|/g, " ").trim();
  if (!raw) return "";
  const race = RACE_ALT[raw];
  if (race) return [...new Set([raw, ...race])].join("|");
  const alts = [raw, ...nativeNamesOf(raw).map((x) => normalizeSearchText(x))];
  return [...new Set(alts.filter(Boolean))].join("|");
}

export interface ServerQuery { any?: string; linked?: string; }

/* ★★ 게임 목록 검색폼(2026-10-20, 요청: "현재 가능한 검색 조합을 모두 별도 검색폼으로 분리 · 각 인풋에서 병렬 검색은 가능") — 칸마다 따로 받고
   서버 질의(any · linked)는 옛 한 줄 검색과 **같은 꼴**로 만든다(서버는 그대로).
   · 선수 · 종족 · 유닛/건물/스킬 — 칸 안의 값마다 조건 하나(**모두** 맞아야 · 그 판에 있었나)
   · 맵 · 게임번호 — 칸 안의 값끼리는 **그중 하나**(한 판엔 맵이 하나라서)
   · 유형 — 하나만(a:b · 차례 없음)
   · 한 사람 조건 — 줄마다 [선수 · 종족·유닛·건물·스킬·전술…] 을 **그 사람이 직접**(옛 붙여 쓰기) — 서버는 그 사람이 주인인(…당함이면 타겟인) 게임 색인 사건으로,
     종족 낱말은 그 사람이 그 종족으로 뛰었나로 찾는다(2026-10-26, 요청: "여기서 조건으로 종족도 받게" — 2026-10-20 "사람 종족 타겟에서 종족만 제거"로 걷었던 것을 되살림). */
export interface GameSearchLink { name: string; items: string[] }
export interface GameSearchForm {
  players: string[];
  races: string[];
  items: string[];
  maps: string[];
  size: string;
  nos: string[];
  links: GameSearchLink[];
}
export const EMPTY_GAME_SEARCH: GameSearchForm = { players: [], races: [], items: [], maps: [], size: "", nos: [], links: [] };

export function gameSearchEmpty(f: GameSearchForm): boolean {
  return f.players.length + f.races.length + f.items.length + f.maps.length + f.nos.length === 0
    && !f.size && f.links.every((l) => !l.name.trim());
}

export function formToServer(f: GameSearchForm): ServerQuery {
  const TAB = "\t";
  const US = "\u001f";
  const norm = (x: string): string => altsOf(normalizeSearchText(x));
  const any: string[] = [];
  for (const x of [...f.players, ...f.races, ...f.items]) any.push(norm(x));
  const orOf = (xs: string[]): string => [...new Set(xs.flatMap((x) => norm(x).split("|")).filter(Boolean))].join("|");
  if (f.maps.length) any.push(orOf(f.maps));
  if (f.nos.length) any.push(orOf(f.nos));
  const size = f.size ? teamSizeTerm(f.size) : null;
  if (size) any.push(size);
  const linked: string[] = [];
  for (const l of f.links) {
    const name = l.name.trim();
    const rest = l.items.filter(Boolean);
    if (!name) continue;
    if (rest.length === 0) { any.push(norm(name)); continue; }
    linked.push([normalizeSearchText(name), ...rest.map(norm)].join(US));
  }
  const anyOk = any.filter(Boolean);
  return {
    any: anyOk.length > 0 ? TAB + anyOk.join(TAB) : undefined,
    linked: linked.length > 0 ? TAB + linked.join(TAB) : undefined,
  };
}

/** 주소(f=) 안의 폼 — 짧은 열쇠의 JSON. 망가진 값은 빈 폼. */
export function encodeGameSearch(f: GameSearchForm): string {
  if (gameSearchEmpty(f)) return "";
  const o: Record<string, unknown> = {};
  if (f.players.length) o.p = f.players;
  if (f.races.length) o.r = f.races;
  if (f.items.length) o.i = f.items;
  if (f.maps.length) o.m = f.maps;
  if (f.size) o.s = f.size;
  if (f.nos.length) o.n = f.nos;
  const links = f.links.filter((l) => l.name.trim());
  if (links.length) o.l = links.map((l) => [l.name, ...l.items]);
  return JSON.stringify(o);
}
export function decodeGameSearch(raw: string): GameSearchForm {
  if (!raw) return EMPTY_GAME_SEARCH;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    return {
      players: arr(o.p), races: arr(o.r), items: arr(o.i), maps: arr(o.m),
      size: typeof o.s === "string" ? o.s : "", nos: arr(o.n),
      /* 옛 주소는 [이름, 종족, …유닛]이었다 — 빈 종족 자리만 버린다(종족 이름은 이제 한 사람 줄의 조건 · 2026-10-26). */
      links: Array.isArray(o.l) ? o.l.map((x) => { const a = arr(x); return { name: a[0] ?? "", items: a.slice(1).filter((t) => t) }; }) : [],
    };
  } catch {
    return EMPTY_GAME_SEARCH;
  }
}
