import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import Avatar from "./Avatar";
import { cx } from "../../utils/format";
import { normalizeSearchText } from "../../utils/memberSearch";
import type { Member } from "../../types";

/* 칩 입력(게임 목록 검색폼에서 꺼냄 · 2026-10-21, 요청: "통계 검색창 칩형태로 변경(게임목록처럼)") — 게임 검색폼 칸들과 통계 유저 검색이 함께 쓴다. */

export type ChipOpt = { value: string; tag?: string; member?: Member };

const MAX_OPTS = 30;

/** 칩 입력 — 엔터 · 탭 · 자동완성으로 값을 칩으로 담는다(칸 안 여러 값). 빈 칸에서 엔터면 onSubmit.
 *  쉼표·띄어쓰기로는 끊지 않는다(2026-10-20, 요청: "쉼표 사용 제거" → "칩 인풋은 띄어쓰기가 필요 없음") — 띄어쓰기는 글자 그대로라
 *  "Fighting " 처럼 치면 **띄어쓰기까지 맞는 후보만** 남는다. */
export default function ChipInput({ values, onChange, options, placeholder, onSubmit, single }: {
  values: string[];
  onChange: (next: string[]) => void;
  options: ChipOpt[];
  placeholder: string;
  onSubmit?: () => void;
  /** 하나만(한 사람 조건의 선수) — 새 값이 옛 값을 갈아 끼운다. */
  single?: boolean;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const q = normalizeSearchText(text.trimStart());
  const shown = useMemo(() => {
    if (!q.trim()) return [];
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
      onSubmit?.();
      return;
    }
    if (e.key === "Tab") {
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
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
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
