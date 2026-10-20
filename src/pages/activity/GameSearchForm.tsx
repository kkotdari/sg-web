import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Plus, Search, X } from "lucide-react";
import Avatar from "../../components/common/Avatar";
import { cx } from "../../utils/format";
import { normalizeSearchText } from "../../utils/memberSearch";
import {
  EMPTY_GAME_SEARCH, TEAM_SIZE_OPTIONS, gameSearchEmpty,
  type GameSearchForm as Form, type GameSearchLink, type GameSuggestion,
} from "../../utils/gameSearch";
import type { Member } from "../../types";

/* ★★ 게임 목록 검색폼(2026-10-20, 요청: "게임목록 검색창 개편 · 현재 가능한 검색 조합을 모두 별도 검색폼으로 분리(단 각 인풋에서 병렬 검색은 가능) ·
   디자인도 너에게 맡길게"). 옛 한 줄 검색(띄어쓰기 = 그리고 · 붙여 쓰기 = 그 사람이 직접)의 조합을 칸으로 나눴다 — 서버 질의는 formToServer.
   접힌 머리 줄에 고른 조건이 칩으로 서고, 펼치면 칸마다 고친다 · [검색] 이나 칸 안 엔터가 적용 · [초기화] 는 모두 비운다. */

type Opt = { value: string; tag?: string; member?: Member };

const RACES = ["테란", "프로토스", "저그"] as const;
const RACE_TONE: Record<string, string> = { 테란: "var(--terran)", 프로토스: "var(--protoss)", 저그: "var(--zerg)" };
const MAX_OPTS = 30;

/** 칩 입력 — 엔터 · 쉼표 · 자동완성으로 값을 칩으로 담는다(칸 안 여러 값). 빈 칸에서 엔터면 onSubmit. */
function ChipInput({ values, onChange, options, placeholder, onSubmit, single, spaceSplits }: {
  values: string[];
  onChange: (next: string[]) => void;
  options: Opt[];
  placeholder: string;
  onSubmit: () => void;
  /** 하나만(한 사람 조건의 선수) — 새 값이 옛 값을 갈아 끼운다. */
  single?: boolean;
  /** 띄어쓰기도 값을 끊는다(선수 · 게임번호 — 값에 띄어쓰기가 없다). 맵 · 유닛 칸은 이름에 띄어쓰기가 있어(Fighting Spirit · 사이오닉 스톰) 끊지 않는다. */
  spaceSplits?: boolean;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const q = normalizeSearchText(text.trim());
  const shown = useMemo(() => {
    if (!q) return [];
    const have = new Set(values.map((v) => normalizeSearchText(v)));
    return options.filter((o) => !have.has(normalizeSearchText(o.value)) && normalizeSearchText(o.value).includes(q)).slice(0, MAX_OPTS);
  }, [q, options, values]);
  useEffect(() => { setHi(0); }, [q]);
  const add = (v: string): void => {
    const t = v.trim();
    if (!t) return;
    if (!values.some((x) => normalizeSearchText(x) === normalizeSearchText(t))) onChange(single ? [t] : [...values, t]);
    setText(""); setOpen(false);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown" && shown.length) { e.preventDefault(); setOpen(true); setHi((h) => Math.min(shown.length - 1, h + 1)); return; }
    if (e.key === "ArrowUp" && shown.length) { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      if (open && shown[hi]) { add(shown[hi].value); return; }
      if (text.trim()) { add(text); return; }
      onSubmit();
      return;
    }
    if (e.key === "," || e.key === "Tab" || (spaceSplits && e.key === " ")) {
      if (!text.trim()) return;
      e.preventDefault();
      add(open && shown[hi] ? shown[hi].value : text);
      return;
    }
    if (e.key === "Backspace" && !text && values.length) onChange(values.slice(0, -1));
    if (e.key === "Escape") setOpen(false);
  };
  return (
    <div className="scr-gs-chips" ref={wrapRef} onClick={() => wrapRef.current?.querySelector("input")?.focus()}>
      {values.map((v) => (
        <span key={v} className="scr-gs-chip">
          {v}
          <button type="button" aria-label={`${v} 빼기`} onClick={(e) => { e.stopPropagation(); onChange(values.filter((x) => x !== v)); }}><X size={11} /></button>
        </span>
      ))}
      {(!single || values.length === 0) && (
        <input
          className="scr-gs-input" value={text} placeholder={values.length ? "" : placeholder}
          onChange={(e) => {
            const raw = e.target.value;
            /* 붙여 넣은 여러 값 — 쉼표(띄어쓰기를 끊는 칸이면 띄어쓰기도)로 나눠 한꺼번에 칩으로. */
            const parts = raw.split(spaceSplits ? /[\s,]+/ : /,+/);
            if (parts.length > 1) {
              const last = parts.pop() ?? "";
              const fresh = parts.map((x) => x.trim()).filter((x) => x && !values.some((v) => normalizeSearchText(v) === normalizeSearchText(x)));
              if (fresh.length) onChange(single ? [fresh[0]] : [...values, ...fresh]);
              setText(last);
            } else {
              setText(raw);
            }
            setOpen(true);
          }}
          onKeyDown={onKey}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            /* 치다 만 글자도 칩으로 — [검색]을 눌러 칸을 떠나도 빠지지 않는다. */
            if (text.trim()) add(text);
            window.setTimeout(() => setOpen(false), 120);
          }}
          autoComplete="off"
        />
      )}
      {open && shown.length > 0 && (
        <div className="scr-gs-drop scr-scroll" role="listbox">
          {shown.map((o, i) => (
            <button
              key={`${o.tag}:${o.value}`} type="button" role="option" aria-selected={i === hi}
              className={cx("scr-gs-opt", i === hi && "is-on")}
              onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => add(o.value)}
            >
              {o.member && <Avatar member={o.member} size={20} />}
              <span className="scr-gs-opt-v">{o.value}</span>
              {o.tag && <span className="scr-gs-opt-tag">{o.tag}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
    return terms.filter((t) => (t.tag === "유닛" || t.tag === "건물" || t.tag === "스킬") && !seen.has(t.value) && (seen.add(t.value), true))
      .map((t) => ({ value: t.value, tag: t.tag }));
  }, [terms]);
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
    summary.push({ key: `l${i}`, label: `${l.name}: ${[l.race, ...l.items].filter(Boolean).join(" · ") || "직접"}`, drop: () => apply({ ...value, links: value.links.filter((_, k) => k !== i) }) });
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
            <ChipInput spaceSplits values={draft.players} onChange={(v) => set("players", v)} options={memberOpts} placeholder="닉네임 · 띄어쓰기나 쉼표로 여럿" onSubmit={() => apply()} />
          </Field>
          <Field label="맵" hint="그중 한 맵">
            <ChipInput values={draft.maps} onChange={(v) => set("maps", v)} options={mapOpts} placeholder="맵 이름 · 쉼표로 여럿" onSubmit={() => apply()} />
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
          <Field label="유형" hint="팀 인원">
            <div className="scr-gs-toggles">
              {TEAM_SIZE_OPTIONS.map((t) => (
                <button key={t} type="button" aria-pressed={draft.size === t} className={cx("scr-gs-tog", draft.size === t && "is-on")}
                  onClick={() => set("size", draft.size === t ? "" : t)}>{t}</button>
              ))}
            </div>
          </Field>
          <Field label="유닛·건물·스킬" hint="모두 나온 판">
            <ChipInput values={draft.items} onChange={(v) => set("items", v)} options={itemOpts} placeholder="캐리어, 사이오닉 스톰 · 쉼표로 여럿" onSubmit={() => apply()} />
          </Field>
          <Field label="게임번호" hint="그중 하나">
            <ChipInput spaceSplits values={draft.nos} onChange={(v) => set("nos", v)} options={[]} placeholder="261019213105 · 앞자리만(261019)도 됨" onSubmit={() => apply()} />
          </Field>
          <div className="scr-gs-field scr-gs-links">
            <span className="scr-gs-label">한 사람이 직접<i>그 선수가 그 종족으로 · 그 유닛을</i></span>
            <div className="scr-gs-ctl scr-gs-link-list">
              {draft.links.map((l, i) => (
                <div key={i} className="scr-gs-link">
                  <ChipInput single values={l.name ? [l.name] : []} onChange={(v) => setLink(i, { name: v[0] ?? "" })} options={memberOpts} placeholder="선수" onSubmit={() => apply()} />
                  <select className="scr-gs-select" value={l.race} onChange={(e) => setLink(i, { race: e.target.value })} aria-label="종족">
                    <option value="">종족 무관</option>
                    {RACES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <ChipInput values={l.items} onChange={(v) => setLink(i, { items: v })} options={itemOpts} placeholder="유닛·건물·스킬" onSubmit={() => apply()} />
                  <button type="button" className="scr-icon-btn scr-gs-link-x" aria-label="이 조건 빼기" onClick={() => set("links", draft.links.filter((_, k) => k !== i))}><X size={13} /></button>
                </div>
              ))}
              <button type="button" className="scr-compact-rect-btn is-secondary scr-gs-link-add" onClick={() => set("links", [...draft.links, { name: "", race: "", items: [] }])}>
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
