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
const TEAM_SIZE_RE = /^([1-8])\s*(?::|대|vs|v)\s*([1-8])$/i;
/** 낱말이 판 유형이면 "a:b"(작은 쪽 먼저), 아니면 null. */
export function teamSizeTerm(chunk: string): string | null {
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
  for (const size of TEAM_SIZE_OPTIONS) add(size, "유형");
  for (const [en, ko] of Object.entries(UNIT_KO)) { add(ko, "유닛"); add(en, "유닛"); }
  for (const [en, ko] of Object.entries(BUILDING_KO)) { add(ko, "건물"); add(en, "건물"); }
  for (const [en, ko] of Object.entries(TECH_KO)) { add(ko, "스킬"); add(en, "스킬"); }
  for (const name of mapNames) add(name, "맵");
  return out;
}


const RACE_ALT: Record<string, string[]> = {
  테란: ["테란"], 프로토스: ["프로토스"], 저그: ["저그"],
  terran: ["테란"], protoss: ["프로토스"], toss: ["프로토스"], zerg: ["저그"],
};

function altsOf(term: string): string {
  const raw = term.replace(/\|/g, " ").trim();
  if (!raw) return "";
  const race = RACE_ALT[raw];
  if (race) return [...new Set([raw, ...race])].join("|");
  const alts = [raw, ...nativeNamesOf(raw).map((x) => normalizeSearchText(x))];
  return [...new Set(alts.filter(Boolean))].join("|");
}

export const squashTerm = (s: string): string => normalizeSearchText(s).replace(/\s+/g, "");

export interface Lexicon { by: Map<string, { text: string; name: boolean }>; max: number }

export const EMPTY_LEXICON: Lexicon = { by: new Map(), max: 1 };

export function buildLexicon(
  memberNames: Iterable<string>, terms: Iterable<GameSuggestion>,
): Lexicon {
  const by = new Map<string, { text: string; name: boolean }>();
  let max = 1;
  const put = (raw: string, name: boolean): void => {
    const k = squashTerm(raw);
    if (!k || by.has(k)) return;
    by.set(k, { text: raw, name });
    if (k.length > max) max = k.length;
  };
  for (const n of memberNames) put(n, true);
  for (const t of terms) put(t.value, false);
  return { by, max };
}

export interface SegPart { text: string; kind: "name" | "term" | "unknown" }

export function segmentChunk(chunk: string, lex: Lexicon): SegPart[] {
  const s = squashTerm(chunk);
  const out: SegPart[] = [];
  let buf = "";
  let i = 0;
  while (i < s.length) {
    let hit: { k: string; v: { text: string; name: boolean } } | null = null;
    for (let j = Math.min(s.length, i + lex.max); j > i; j -= 1) {
      const v = lex.by.get(s.slice(i, j));
      if (v) { hit = { k: s.slice(i, j), v }; break; }
    }
    if (!hit) { buf += s[i]; i += 1; continue; }
    if (buf) { out.push({ text: buf, kind: "unknown" }); buf = ""; }
    out.push({ text: hit.v.text, kind: hit.v.name ? "name" : "term" });
    i += hit.k.length;
  }
  if (buf) out.push({ text: buf, kind: "unknown" });
  return out;
}

export function splitChunks(q: string): string[] {
  return q.split(/[\s,]+/).map((c) => c.trim()).filter(Boolean);
}

export interface ServerQuery { any?: string; linked?: string; }

export function toServerMerged(q: string, lex: Lexicon = EMPTY_LEXICON): ServerQuery {
  const TAB = "\t";
  const US = "\u001f";
  const any: string[] = [];
  const linked: string[] = [];
  for (const chunk of splitChunks(q)) {
    const size = teamSizeTerm(chunk);
    if (size) { any.push(size); continue; }
    const parts = segmentChunk(chunk, lex);
    if (parts.length === 0) continue;
    if (parts.every((p) => p.kind === "unknown")) { any.push(altsOf(normalizeSearchText(chunk))); continue; }
    const names = parts.filter((p) => p.kind === "name").map((p) => p.text);
    const rest = parts.filter((p) => p.kind !== "name").map((p) => p.text);
    if (names.length > 0 && rest.length > 0) {
      linked.push([normalizeSearchText(names[0]),
        ...rest.map((t) => altsOf(normalizeSearchText(t)))].join(US));
      for (const n of names.slice(1)) any.push(altsOf(normalizeSearchText(n)));
      continue;
    }
    for (const p of parts) any.push(altsOf(normalizeSearchText(p.text)));
  }
  return {
    any: any.filter(Boolean).length > 0 ? TAB + any.filter(Boolean).join(TAB) : undefined,
    linked: linked.length > 0 ? TAB + linked.join(TAB) : undefined,
  };
}
