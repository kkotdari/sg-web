import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Plus, Search, X } from "lucide-react";
import ChipInput, { type ChipOpt as Opt } from "../../components/common/ChipInput";
import { cx } from "../../utils/format";
import {
  EMPTY_GAME_SEARCH, GAME_KIND_OPTIONS, TEAM_SIZE_OPTIONS, gameSearchEmpty,
  type GameSearchForm as Form, type GameSearchLink, type GameSuggestion,
} from "../../utils/gameSearch";
import type { Member } from "../../types";

/* ★★ 게임 목록 검색폼(2026-10-20, 요청: "게임목록 검색창 개편 · 현재 가능한 검색 조합을 모두 별도 검색폼으로 분리(단 각 인풋에서 병렬 검색은 가능) ·
   디자인도 너에게 맡길게"). 옛 한 줄 검색(띄어쓰기 = 그리고 · 붙여 쓰기 = 그 사람이 직접)의 조합을 칸으로 나눴다 — 서버 질의는 formToServer.
   접힌 머리 줄에 고른 조건이 칩으로 서고, 펼치면 칸마다 고친다 · [검색] 이나 칸 안 엔터가 적용 · [초기화] 는 모두 비운다. */

const RACES = ["테란", "프로토스", "저그"] as const;
const RACE_TONE: Record<string, string> = { 테란: "var(--terran)", 프로토스: "var(--protoss)", 저그: "var(--zerg)" };

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="scr-gs-field">
      <span className="scr-gs-label">{label}{hint && <i>{hint}</i>}</span>
      <div className="scr-gs-ctl">{children}</div>
    </div>
  );
}

export default function GameSearchForm({ value, onApply, members, terms, maps, defaultOpen = false }: {
  /** 적용된 조건(주소 f=). */
  value: Form;
  onApply: (next: Form) => void;
  members: Member[];
  /** 유닛 · 건물 · 스킬 자동완성(gameSuggestions 의 그 꼬리표들). */
  terms: GameSuggestion[];
  maps: string[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraftState] = useState<Form>(value);
  /* 최신 초안 — 칸을 떠나며(blur) 담은 칩이 같은 누름의 [검색]에 실리게 ref 로도 쥔다. */
  const draftRef = useRef<Form>(value);
  const setDraft = (next: Form | ((d: Form) => Form)): void => {
    const v = typeof next === "function" ? next(draftRef.current) : next;
    draftRef.current = v;
    setDraftState(v);
  };
  useEffect(() => { draftRef.current = value; setDraftState(value); }, [value]);
  const set = <K extends keyof Form>(k: K, v: Form[K]): void => setDraft((d) => ({ ...d, [k]: v }));
  const apply = (next?: Form): void => { onApply(next ?? draftRef.current); };

  const memberOpts = useMemo<Opt[]>(() => members.map((m) => ({ value: m.nickname, member: m })), [members]);
  const itemOpts = useMemo<Opt[]>(() => {
    const seen = new Set<string>();
    return terms.filter((t) => (t.tag === "유닛" || t.tag === "건물" || t.tag === "스킬" || t.tag === "전술") && !seen.has(t.value) && (seen.add(t.value), true))
      .map((t) => ({ value: t.value, tag: t.tag }));
  }, [terms]);
  /* 한 사람 줄은 종족도 받는다(2026-10-26, 요청: "여기서 조건으로 종족도 받게 해 줘 — 종족 유닛 스킬 등등") — 서버는 그 사람이 그 종족으로 뛰었나로 본다. */
  const linkOpts = useMemo<Opt[]>(() => [...RACES.map((r) => ({ value: r, tag: "종족" })), ...itemOpts], [itemOpts]);
  const mapOpts = useMemo<Opt[]>(() => maps.map((m) => ({ value: m, tag: "맵" })), [maps]);

  const setLink = (i: number, p: Partial<GameSearchLink>): void =>
    setDraft((d) => ({ ...d, links: d.links.map((l, k) => (k === i ? { ...l, ...p } : l)) }));

  /* 접힌 머리 줄의 요약 칩 — 적용된 조건(value)만. 칩의 ×는 그 조건만 바로 빼고 다시 찾는다. */
  const summary: { key: string; label: string; drop: () => void }[] = [];
  const dropFrom = (k: "players" | "races" | "items" | "maps" | "nos", v: string) => () => apply({ ...value, [k]: value[k].filter((x) => x !== v) });
  value.players.forEach((v) => summary.push({ key: `p${v}`, label: v, drop: dropFrom("players", v) }));
  value.races.forEach((v) => summary.push({ key: `r${v}`, label: v, drop: dropFrom("races", v) }));
  value.items.forEach((v) => summary.push({ key: `i${v}`, label: v, drop: dropFrom("items", v) }));
  if (value.maps.length) summary.push({ key: "m", label: `맵 ${value.maps.join(" / ")}`, drop: () => apply({ ...value, maps: [] }) });
  if (value.size) summary.push({ key: "s", label: value.size, drop: () => apply({ ...value, size: "" }) });
  if (value.nos.length) summary.push({ key: "n", label: `#${value.nos.join(" / ")}`, drop: () => apply({ ...value, nos: [] }) });
  value.links.forEach((l, i) => {
    if (!l.name.trim()) return;
    summary.push({ key: `l${i}`, label: `${l.name}: ${l.items.filter(Boolean).join(" · ") || "직접"}`, drop: () => apply({ ...value, links: value.links.filter((_, k) => k !== i) }) });
  });
  const empty = gameSearchEmpty(value);

  return (
    <div className={cx("scr-gs", open && "is-open")}>
      <div className="scr-gs-bar">
        <button type="button" className="scr-gs-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <Search size={14} aria-hidden />
          <span>검색 조건</span>
          {open ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
        </button>
        <div className="scr-gs-summary">
          {empty ? <span className="scr-gs-none">조건 없음 — 모든 게임</span> : summary.map((c) => (
            <span key={c.key} className="scr-gs-chip is-applied">
              {c.label}
              <button type="button" aria-label={`${c.label} 조건 빼기`} onClick={c.drop}><X size={11} /></button>
            </span>
          ))}
        </div>
        {!empty && <button type="button" className="scr-text-btn scr-gs-clear" onClick={() => apply(EMPTY_GAME_SEARCH)}>초기화</button>}
      </div>

      {open && (
        <div className="scr-gs-panel">
          <Field label="선수" hint="모두 뛴 판">
            <ChipInput values={draft.players} onChange={(v) => set("players", v)} options={memberOpts} placeholder="닉네임" onSubmit={() => apply()} />
          </Field>
          <Field label="맵" hint="그중 한 맵">
            <ChipInput values={draft.maps} onChange={(v) => set("maps", v)} options={mapOpts} placeholder="맵 이름" onSubmit={() => apply()} />
          </Field>
          <Field label="종족" hint="그 종족이 있던 판">
            <div className="scr-gs-toggles">
              {RACES.map((r) => {
                const on = draft.races.includes(r);
                return (
                  <button key={r} type="button" aria-pressed={on} className={cx("scr-gs-tog", on && "is-on")}
                    onClick={() => set("races", on ? draft.races.filter((x) => x !== r) : [...draft.races, r])}>
                    <i style={{ background: RACE_TONE[r] }} />{r}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="유형" hint="팀 인원 · 판 종류">
            <div className="scr-gs-toggles">
              {[...TEAM_SIZE_OPTIONS, ...GAME_KIND_OPTIONS].map((t) => (
                <button key={t} type="button" aria-pressed={draft.size === t} className={cx("scr-gs-tog", draft.size === t && "is-on")}
                  onClick={() => set("size", draft.size === t ? "" : t)}>{t}</button>
              ))}
            </div>
          </Field>
          <Field label="유닛·건물·스킬·전술" hint="모두 나온 판">
            <ChipInput values={draft.items} onChange={(v) => set("items", v)} options={itemOpts} placeholder="캐리어 · 사이오닉 스톰 · 몰래 배럭" onSubmit={() => apply()} />
          </Field>
          <Field label="게임번호" hint="그중 하나">
            <ChipInput values={draft.nos} onChange={(v) => set("nos", v)} options={[]} placeholder="261019213105 · 앞자리만(261019)도 됨" onSubmit={() => apply()} />
          </Field>
          <div className="scr-gs-field scr-gs-links">
            <span className="scr-gs-label">한 사람이 직접<i>그 선수가 그 종족으로 · 그 유닛·전술을</i></span>
            <div className="scr-gs-ctl scr-gs-link-list">
              {draft.links.map((l, i) => (
                <div key={i} className="scr-gs-link">
                  {/* 한 사람 조건은 값을 담는 엔터에 **바로 찾는다**(2026-10-24, 요청) — ChipInput submitOnAdd. */}
                  <ChipInput single values={l.name ? [l.name] : []} onChange={(v) => setLink(i, { name: v[0] ?? "" })} options={memberOpts} placeholder="선수" onSubmit={() => apply()} submitOnAdd />
                  <ChipInput values={l.items} onChange={(v) => setLink(i, { items: v })} options={linkOpts} placeholder="종족·유닛·건물·스킬·전술" onSubmit={() => apply()} submitOnAdd />
                  <button type="button" className="scr-icon-btn scr-gs-link-x" aria-label="이 조건 빼기" onClick={() => set("links", draft.links.filter((_, k) => k !== i))}><X size={13} /></button>
                </div>
              ))}
              <button type="button" className="scr-compact-rect-btn is-secondary scr-gs-link-add" onClick={() => set("links", [...draft.links, { name: "", items: [] }])}>
                <Plus size={13} aria-hidden /> 조건 추가
              </button>
            </div>
          </div>
          <div className="scr-gs-foot">
            <button type="button" className="scr-text-btn" onClick={() => { setDraft(EMPTY_GAME_SEARCH); apply(EMPTY_GAME_SEARCH); }}>초기화</button>
            <button type="button" className="scr-compact-rect-btn scr-gs-go" onClick={() => { apply(); setOpen(false); }}>
              <Search size={13} aria-hidden /> 검색
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
