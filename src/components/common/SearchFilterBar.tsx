import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Building2, Flag, Map as MapIcon, Search, Sparkles, Swords, X } from "lucide-react";
import Avatar from "./Avatar";
import { attachPopover } from "../../utils/popover";
import { Spinner } from "./Feedback";
import { cx } from "../../utils/format";
import { normalizeSearchText, type MemberSearchSuggestion } from "../../utils/memberSearch";
import { lastWordOf, withPickedTerm } from "../../utils/searchTerms";
import { segmentChunk, squashTerm, type GameSuggestion, type Lexicon } from "../../utils/gameSearch";

const TAG_ICON: Record<string, ReactNode> = {
  종족: <Flag size={14} />,
  유닛: <Swords size={14} />,
  건물: <Building2 size={14} />,
  스킬: <Sparkles size={14} />,
  맵: <MapIcon size={14} />,
};

type SuggestItem = {
  key: string; name: string;
  member?: MemberSearchSuggestion["member"];
  tag?: string;
};

interface SearchFilterBarProps {
  count: number;
  countLabel: string;
  countLoading?: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchEnter?: (value: string) => void;
  searchPlaceholder?: string;
  suggestions?: MemberSearchSuggestion[];
  lexicon?: Lexicon;
  termSuggestions?: GameSuggestion[];
  searchLabel?: string;
  filterPanel?: ReactNode;
  trailing?: ReactNode;
  searchLeading?: ReactNode;
  showSearch?: boolean;
  showCount?: boolean;
  countInline?: boolean;
  heading?: ReactNode;
}

const MAX_SUGGESTIONS = 50;

export default function SearchFilterBar({
  count, countLabel, countLoading = false,
  searchValue, onSearchChange, onSearchEnter, searchPlaceholder = "유저 검색",
  suggestions, termSuggestions, lexicon, searchLabel = "유저",
  filterPanel,
  trailing,
  searchLeading,
  showSearch = true,
  showCount = true,
  countInline = false,
  heading,
}: SearchFilterBarProps) {
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [pickSeq, setPickSeq] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const justPicked = useRef(false);
  const chunkAt = (v: string): number =>
    Math.max(v.lastIndexOf(" "), v.lastIndexOf(","), v.lastIndexOf("\t")) + 1;
  const chunkParts = useMemo(
    () => (lexicon ? segmentChunk(searchValue.slice(chunkAt(searchValue)), lexicon) : null),
    [lexicon, searchValue],
  );
  const liveText = chunkParts
    ? (chunkParts.length > 0 ? chunkParts[chunkParts.length - 1].text : "")
    : lastWordOf(searchValue);
  const chosen = useMemo(
    () => new Set((lexicon
      ? searchValue.split(/[\s,\t]+/).flatMap((c) => segmentChunk(c, lexicon).map((p) => p.text))
      : searchValue.split(",")).map((w) => normalizeSearchText(w.trim())).filter(Boolean)),
    [searchValue, lexicon],
  );

  const pick = (name: string, endChunk = false, searchNow = false) => {
    const next = chunkParts
      ? searchValue.slice(0, chunkAt(searchValue))
        + chunkParts.slice(0, -1).map((p) => squashTerm(p.text)).join("")
        + squashTerm(name) + (endChunk ? " " : "")
      : withPickedTerm(searchValue, name);
    justPicked.current = true;
    setPickSeq((n) => n + 1);
    onSearchChange(next);
    setSuggestOpen(false);
    if (searchNow) {
      onSearchEnter?.(next);
      justPicked.current = false;
      return;
    }
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) { justPicked.current = false; return; }
      el.focus();
      el.setSelectionRange(next.length, next.length);
      justPicked.current = false;
    });
  };

  const matchedSuggestions = useMemo<SuggestItem[]>(() => {
    const raw = liveText.trim();
    if (raw === "") return [];
    const q = normalizeSearchText(raw.startsWith("@") ? raw.slice(1) : raw);
    const items: SuggestItem[] = [];
    for (const s of suggestions ?? []) {
      if (items.length >= MAX_SUGGESTIONS) break;
      const nick = normalizeSearchText(s.member.nickname);
      if (nick !== q && chosen.has(nick)) continue;
      if (!s.matchTexts.some((x) => normalizeSearchText(x).includes(q))) continue;
      items.push({ key: `m:${s.member.id}`, name: s.member.nickname, member: s.member });
    }
    for (const t of termSuggestions ?? []) {
      if (items.length >= MAX_SUGGESTIONS) break;
      const v = normalizeSearchText(t.value);
      if (v !== q && chosen.has(v)) continue;
      if (!v.includes(q)) continue;
      items.push({ key: `${t.tag}:${v}`, name: t.value, tag: t.tag });
    }
    return items;
  }, [suggestions, termSuggestions, liveText, chosen]);

  const suggestShown = suggestOpen && matchedSuggestions.length > 0;

  useEffect(() => {
    if (!suggestShown || !inputRef.current || !dropRef.current) return;
    return attachPopover(inputRef.current, dropRef.current, { matchAnchor: true });
  }, [suggestShown]);

  useEffect(() => {
    if (!suggestOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (dropRef.current?.contains(t)) return;
      setSuggestOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [suggestOpen]);

  useEffect(() => { setHighlight(0); }, [matchedSuggestions]);

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape") { setSuggestOpen(false); return; }
    if (!suggestShown) {
      if (e.key === "Enter") { onSearchEnter?.(searchValue); inputRef.current?.blur(); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => (h + 1) % matchedSuggestions.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => (h - 1 + matchedSuggestions.length) % matchedSuggestions.length); }
    else if (e.key === "Enter" || e.key === "Tab" || (e.key === " " && chunkParts)) {
      e.preventDefault();
      pick(matchedSuggestions[Math.min(highlight, matchedSuggestions.length - 1)].name,
        e.key === " ", e.key === "Enter");
    }
  };

  const searchItem = (
    <div className="scr-list-search-wrap" ref={wrapRef}>
      {searchLeading}
      <span className="scr-field-label-text">{searchLabel}</span>
      <input
        key={`si-${pickSeq}`}
        ref={inputRef}
        className="scr-input scr-list-search-input"
        value={searchValue}
        onChange={(e) => { onSearchChange(e.target.value); setSuggestOpen(true); }}
        onFocus={() => { if (!justPicked.current) setSuggestOpen(true); }}
        onBlur={() => setSuggestOpen(false)}
        onKeyDown={onSearchKeyDown}
        placeholder={searchPlaceholder}
        autoComplete="off"
      />
      {searchValue !== "" && (
        <button
          type="button"
          className="scr-list-search-clear"
          aria-label="검색어 지우기"
          title="지우기"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onSearchChange("");
            onSearchEnter?.("");
            setSuggestOpen(false);
            inputRef.current?.focus();
          }}
        >
          <X size={14} aria-hidden />
        </button>
      )}
      {suggestShown && createPortal(
        <div className="scr-pv-drop scr-scroll" ref={dropRef}>
          {matchedSuggestions.map((s, i) => (
            <button
              type="button" key={s.key}
              className={cx("scr-pv-opt scr-mention-opt", i === highlight && "scr-pv-opt-active")}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s.name)}
            >
              {s.member
                ? <Avatar member={s.member} size={22} />
                : <span className="scr-suggest-ic" aria-hidden>{TAG_ICON[s.tag ?? ""] ?? <Search size={14} />}</span>}
              <span className="scr-mention-name">{s.name}</span>
              {s.tag && <span className="scr-term-opt-tag">{s.tag}</span>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );

  const countItem = showCount ? (
    <span className="scr-list-count scr-filter-bar-count">
      {count}{countLabel}
      {countLoading && <Spinner size={11} />}
    </span>
  ) : null;

  const panelItem = filterPanel ? <div className="scr-filter-panel">{filterPanel}</div> : null;

  const hasInlineContent = (!countInline && panelItem)
    || showSearch || (countInline && (panelItem || countItem)) || trailing;

  return (
    <div className="scr-filter-bar">
      {hasInlineContent && (
        <div className="scr-filter-inline-stack">
          {!countInline && panelItem}
          {showSearch && (
            <div className="scr-search-filter-float">{searchItem}</div>
          )}
          {countInline && (panelItem || countItem) && (
            <div className="scr-filter-inline-tail">{panelItem}{countItem}</div>
          )}
          {trailing}
        </div>
      )}
      {!countInline && (heading ? (
        <div className="scr-filter-head-row">{heading}{countItem}</div>
      ) : countItem)}
    </div>
  );
}
