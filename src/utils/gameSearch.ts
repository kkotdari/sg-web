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
