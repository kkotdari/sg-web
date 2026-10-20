import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import Sortable from "sortablejs";
import {
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, GripVertical, Heading, Image as ImageIcon,
  IndentDecrease, IndentIncrease, List as ListIcon, Paperclip,
  Play, Plus, Trash2, Type, X,
} from "lucide-react";
import PhotoViewer from "../../components/common/PhotoViewer";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { showAlert } from "../../components/common/AlertDialog";
import { cx, formatBytes } from "../../utils/format";
import { pickPhoto, readAsDataUrl } from "../../utils/image";
import { attachPopover } from "../../utils/popover";
import type { ScheduleBlock, SchedulePhoto } from "../../types";
import { imgSrc } from "../../utils/imgSrc";
import { canSaveToAlbum, downloadFiles, fetchMedia, isVideoItem, MAX_VIDEO_BYTES, shareToAlbum } from "../../utils/media";

export type DraftBlock = ScheduleBlock & { key: string };
/** 제목 요소 — 글 요소 중 제목 줄만 가진 것(노션의 제목 블록). 새로 만든 빈 제목은 heading 표식으로 안다. */
export const isHeading = (b: ScheduleBlock): boolean => b.kind === "text" && (!!b.title || !!b.heading);
/** ★ 제목을 따로 떼어 낸다(2026-10-18, 요청: "모든 제목 요소를 텍스트 요소로 분리 — 글·사진·목록·파일의 제목이 아닌 별도 요소, 노션처럼").
 *  옛 꼴(목록·사진의 title, 제목+본문 글)은 읽을 때 [제목 요소] + [한 단 들여 쓴 본체]로 편다 — 접힘은 제목이 가진다(접으면 본체가 딸려 숨는다).
 *  떼어 낸 제목의 id 는 원래 id + "h"(글은 본문이 + "t")로 결정적이라 다시 읽어도 같다. 서버는 다음 저장 때 이 꼴로 받는다. */
export const splitTitles = (blocks: ScheduleBlock[]): ScheduleBlock[] => blocks.flatMap((b) => {
  const title = b.title.trim();
  const ind = b.indent ?? 0;
  const under = Math.min(3, ind + 1);
  if (b.kind === "text") {
    if (!title || !b.text) return [b];
    return [
      { ...b, text: "" },
      { ...b, id: `${b.id}t`, title: "", collapsed: false, indent: under },
    ];
  }
  if ((b.kind === "list" || b.kind === "photos") && title) {
    return [
      { ...b, id: `${b.id}h`, kind: "text", title: b.title, text: "", items: [], levels: [], photos: [] },
      { ...b, title: "", collapsed: false, indent: under },
    ];
  }
  return [b];
});
export const withKeys = (blocks: ScheduleBlock[]): DraftBlock[] => splitTitles(blocks).map((b) => ({ ...b, key: b.id }));

const URL_RE = /(https?:\/\/[^\s<>]+)/g;
const TRAIL = /[.,;:!?)\]}'"]+$/;

function linkify(text: string): ReactNode[] {
  return text.split(URL_RE).map((part, i) => {
    if (i % 2 === 0 || !part) return part;
    const tail = TRAIL.exec(part)?.[0] ?? "";
    const href = tail ? part.slice(0, -tail.length) : part;
    return (
      <span key={i}>
        <a
          className="scr-sb-link" href={href} target="_blank" rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
        >
          {href}
        </a>
        {tail}
      </span>
    );
  });
}

function IconBtn({
  label, onClick, danger, expanded, children,
}: {
  label: string; onClick: () => void; danger?: boolean;
  expanded?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button" className={cx("scr-sb-icon", danger && "scr-sb-icon-danger")}
      aria-label={label} title={label} aria-expanded={expanded}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {children}
    </button>
  );
}

function useFold(block: ScheduleBlock, canEdit: boolean, onFold: (collapsed: boolean) => void): [boolean, () => void] {
  const saved = !!block.collapsed;
  const [mine, setMine] = useState<boolean | null>(null);
  useEffect(() => { setMine(null); }, [saved]);
  const folded = canEdit ? saved : mine ?? saved;
  return [folded, () => (canEdit ? onFold(!folded) : setMine(!folded))];
}

function FoldBtn({ folded, onToggle, what }: { folded: boolean; onToggle: () => void; what: string }) {
  return (
    <IconBtn label={folded ? `${what} 펴기` : `${what} 접기`} expanded={!folded} onClick={onToggle}>
      {folded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
    </IconBtn>
  );
}

type FocusPart = "title" | "body" | "item";
type FocusReq = { key: string; part: FocusPart; row?: number; caret: number | "end"; n: number };
/** 요소가 이웃 요소와 나누고 합치고 들여 쓰는 길 — 문서처럼(요청: "다른 요소들 간에도 백스페이스·엔터로 합치고 나누기 · 탭까지"). */
type BlockNav = {
  focus: FocusReq | null;
  slash: (anchor: HTMLElement, part: FocusPart, row?: number) => void;
  split: (before: string, after: string) => void;
  merge: (content: string, row?: number) => boolean;
  exitList: (items: string[], levels: number[]) => void;
  removeSelf: () => void;
  indent: (by: number) => void;
};
const NO_NAV: BlockNav = {
  focus: null, slash: () => {}, split: () => {}, merge: () => false, exitList: () => {}, removeSelf: () => {}, indent: () => {},
};
const placeCaret = (el: HTMLInputElement | HTMLTextAreaElement, caret: number | "end"): void => {
  el.focus();
  const at = caret === "end" ? el.value.length : Math.min(caret, el.value.length);
  el.setSelectionRange(at, at);
};

/** 지우기 전에 한 번 묻는다(요청: "삭제 시에는 한 번 물어봐 줘") — 요소·사진·목록 줄의 지우기 단추. 키보드로 지우는 건(Backspace 등) 묻지 않는다. */
type Ask = (message: string, run: () => void) => void;
const NO_ASK: Ask = (_m, run) => run();

let sorting = 0;
/** 끌어서 차례를 바꾸는 중인가 — 그동안 자동 저장을 미룬다(사진 base64·큰 JSON 만들기가 끌기를 버벅이게 한다). */
export const sortingNow = (): boolean => sorting > 0;

export const NEW_PREFIX = "new:";
const newId = (): string => `${NEW_PREFIX}${Math.random().toString(36).slice(2)}`;
const emptyBlock = (kind: ScheduleBlock["kind"]): DraftBlock => {
  const id = newId();
  return { id, key: id, kind, text: "", title: "", items: [], url: "", name: "", size: 0, photos: [] };
};
const MAX_BLOCKS = 40;
const MAX_INDENT = 3;
const MAX_LEVEL = 2;
const composing = (e: React.KeyboardEvent): boolean => e.nativeEvent.isComposing || e.keyCode === 229;

let keyboardProxy: HTMLInputElement | null = null;
function releaseKeyboard(): void {
  keyboardProxy?.remove();
  keyboardProxy = null;
}
function summonKeyboard(): void {
  if (!window.matchMedia("(hover: none) and (pointer: coarse)").matches) return;
  releaseKeyboard();
  const el = document.createElement("input");
  el.type = "text";
  el.tabIndex = -1;
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;margin:0;padding:0;border:0;"
    + "opacity:0;font-size:16px;pointer-events:none;";
  document.body.appendChild(el);
  el.focus({ preventScroll: true });
  keyboardProxy = el;
  window.setTimeout(() => { if (keyboardProxy === el) releaseKeyboard(); }, 1500);
}

function useAutoGrow(value: string, active: boolean): React.RefObject<HTMLTextAreaElement | null> {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${el.scrollHeight + border}px`;
  }, [value, active]);
  return ref;
}

type FoldProps = { fold?: [boolean, () => void]; hasKids?: boolean };

function TextBlock({
  block, canEdit, grip, onChange, onDelete, nav = NO_NAV, fold, hasKids,
}: {
  block: ScheduleBlock; canEdit: boolean; grip: ReactNode;
  onChange: (patch: { title?: string; text?: string; collapsed?: boolean }) => void; onDelete: () => void;
  nav?: BlockNav;
} & FoldProps) {
  /* 제목도 글 요소다 — 글자 칸은 하나고 모양(CSS)만 다르다(요청: "제목은 글 요소랑 다를 것 없는데 css 만 다른 것").
     제목의 글은 title 에, 글의 글은 text 에 담는다(서버 꼴 그대로). 나누기·잇기·들여쓰기·/ 메뉴는 똑같다. */
  const heading = isHeading(block);
  const value = heading ? block.title : block.text;
  const setValue = (v: string): void => onChange(heading ? { title: v } : { text: v });
  const [editing, setEditing] = useState(false);
  const ownFold = useFold(block, canEdit, (collapsed) => onChange({ collapsed }));
  const [folded, toggle] = fold ?? ownFold;
  const open = canEdit && editing;
  const ref = useAutoGrow(value, open);
  const caretTo = useRef<number | "end" | null>(null);
  useEffect(() => {
    const f = nav.focus;
    if (!f || !canEdit) return;
    caretTo.current = f.caret;
    setEditing(true);
    if (ref.current) { placeCaret(ref.current, f.caret); caretTo.current = null; }
  }, [nav.focus?.n]);
  useLayoutEffect(() => {
    if (!open || caretTo.current === null || !ref.current) return;
    placeCaret(ref.current, caretTo.current);
    caretTo.current = null;
  }, [open]);
  /* 노션처럼(요청: "완전 유연화") — Enter 는 커서 자리에서 나누고(Shift+Enter 는 줄바꿈), 맨 앞 Backspace 는 위 요소에 잇는다.
     Tab 은 요소째 들여 쓴다(딸린 하위 요소도 함께). */
  const onEdgeKey = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (composing(e)) return;
    const el = e.currentTarget;
    const s0 = el.selectionStart ?? 0;
    const s1 = el.selectionEnd ?? s0;
    if (e.key === "Tab") { e.preventDefault(); nav.indent(e.shiftKey ? -1 : 1); return; }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      nav.split(el.value.slice(0, s0), el.value.slice(s1));
      return;
    }
    if (e.key === "Backspace" && s0 === 0 && s1 === 0) {
      if (nav.merge(el.value)) e.preventDefault();
    }
  };
  const foldBtn = hasKids ? <FoldBtn folded={folded} onToggle={() => { setEditing(false); toggle(); }} what={heading ? "제목" : "글"} /> : null;
  const look = cx("scr-sb-text", heading && "scr-sb-heading");
  return (
    <div className={cx("scr-sb-block", "scr-sb-row", canEdit && "scr-sb-block-edit", hasKids && "scr-sb-has-fold")}>
      {open ? (
        <textarea
          ref={ref} className={cx(look, "scr-sb-textarea")} value={value} autoFocus rows={1}
          placeholder={heading ? "제목" : undefined}
          onChange={(e) => {
            const v = e.target.value;
            setValue(v);
            if (v === "/" && !value) nav.slash(e.currentTarget, heading ? "title" : "body");
          }}
          onKeyDown={onEdgeKey}
          onBlur={() => setEditing(false)}
        />
      ) : value || canEdit ? (
        <p
          className={cx(look, canEdit && "scr-sb-editable", !value && "scr-sb-empty")}
          role={canEdit ? "button" : undefined} tabIndex={canEdit ? 0 : undefined}
          aria-label={canEdit && !value ? (heading ? "제목 적기" : "내용 적기") : undefined}
          onClick={canEdit ? (e) => { e.stopPropagation(); setEditing(true); } : undefined}
          onKeyDown={canEdit ? (e) => {
            if (e.key === "Enter") { e.preventDefault(); setEditing(true); }
          } : undefined}
        >
          {value ? linkify(value) : "\u200b"}
        </p>
      ) : null}
      {foldBtn && <div className="scr-sb-fold-corner">{foldBtn}</div>}
      {canEdit && (
        <div className="scr-sb-tools">
          {grip}
          <IconBtn label={heading ? "제목 삭제" : "글 삭제"} onClick={onDelete} danger><Trash2 size={13} /></IconBtn>
        </div>
      )}
    </div>
  );
}

function ListBlock({
  block, canEdit, grip, onChange, onDelete, nav = NO_NAV, fold, ask = NO_ASK,
}: {
  block: ScheduleBlock; canEdit: boolean; grip: ReactNode;
  onChange: (patch: { title?: string; items?: string[]; levels?: number[]; collapsed?: boolean }) => void; onDelete: () => void;
  nav?: BlockNav; ask?: Ask;
} & FoldProps) {
  void fold;
  const open = true;
  const levels = block.items.map((_, i) => block.levels?.[i] ?? 0);
  const [focused, setFocused] = useState<number | null>(null);
  const shift = (i: number, by: number): void => {
    if (i >= block.items.length) return;
    const cap = i === 0 ? 0 : Math.min(MAX_LEVEL, levels[i - 1] + 1);
    const to = Math.max(0, Math.min(cap, levels[i] + by));
    if (to === levels[i]) return;
    const next = [...levels];
    next[i] = to;
    onChange({ levels: next });
  };

  const rows = useRef(new Map<number, HTMLInputElement>());
  /* ★ 여러 줄 고르기(PC · 요청: "목록 중간에서도 마우스로 여러 줄 선택") — 한 줄 글자 칸은 이웃 줄과 선택을 나눌 수 없어,
     줄 밖으로 끌어 다른 줄에 닿으면(또는 Shift+클릭) 줄 단위로 고른다. 고른 줄은 Delete·Backspace 로 지우고, Tab·Shift+Tab 으로
     단을 바꾸고, Ctrl/⌘+C·X 로 복사·잘라내기(단은 앞 칸 두 개씩), Esc 로 푼다. */
  const listRef = useRef<HTMLUListElement | null>(null);
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const selLo = sel ? Math.min(sel.a, sel.b) : -1;
  const selHi = sel ? Math.max(sel.a, sel.b) : -1;
  const rowAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-row]");
    if (!el || !listRef.current?.contains(el)) return null;
    return Number(el.dataset.row);
  };
  const onRowDown = (e: React.PointerEvent, i: number): void => {
    if (!canEdit || e.pointerType !== "mouse" || e.button !== 0 || i >= block.items.length) return;
    if (e.shiftKey && focused !== null && focused !== i) {
      e.preventDefault();
      setSel({ a: focused, b: i });
      (document.activeElement as HTMLElement | null)?.blur();
      listRef.current?.focus();
      return;
    }
    setSel(null);
    const move = (ev: PointerEvent): void => {
      const r = rowAt(ev.clientX, ev.clientY);
      if (r === null || r >= block.items.length) return;
      if (r !== i) {
        ev.preventDefault();
        window.getSelection()?.removeAllRanges();
        setSel({ a: i, b: r });
        if (document.activeElement !== listRef.current) {
          (document.activeElement as HTMLElement | null)?.blur();
          listRef.current?.focus();
        }
      } else setSel((v) => (v ? { a: i, b: i } : v));
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  useEffect(() => {
    if (!sel) return undefined;
    const off = (ev: PointerEvent): void => { if (!listRef.current?.contains(ev.target as Node)) setSel(null); };
    window.addEventListener("pointerdown", off);
    return () => window.removeEventListener("pointerdown", off);
  }, [sel]);
  const copySel = (): void => {
    const text = block.items.slice(selLo, selHi + 1).map((x, k) => `${"  ".repeat(levels[selLo + k] ?? 0)}${x}`).join("\n");
    void navigator.clipboard?.writeText(text).catch(() => {});
  };
  const dropSel = (): void => {
    onChange({
      items: block.items.filter((_, k) => k < selLo || k > selHi),
      levels: levels.filter((_, k) => k < selLo || k > selHi),
    });
    const to = Math.max(0, selLo - 1);
    setSel(null);
    if (block.items.length - (selHi - selLo + 1) > 0) focusAt.current = { row: to, caret: "end" };
  };
  const onSelKey = (e: React.KeyboardEvent<HTMLUListElement>): void => {
    if (!sel || e.target !== listRef.current) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "Escape") { e.preventDefault(); setSel(null); focusRow(sel.b, "end"); return; }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const by = e.key === "ArrowUp" ? -1 : 1;
      // 첫·끝 줄 밖으로 더 넓히면 요소 고르기로 넘긴다(바깥 ScheduleBlocks 가 받는다).
      if (e.shiftKey && (sel.b + by < 0 || sel.b + by >= block.items.length)) { setSel(null); return; }
      e.preventDefault();
      if (e.shiftKey) setSel({ a: sel.a, b: sel.b + by });
      else { setSel(null); focusRow(Math.max(0, Math.min(block.items.length - 1, (by < 0 ? selLo : selHi) + by)), 0); }
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); dropSel(); return; }
    if (e.key === "Tab") {
      e.preventDefault();
      const by = e.shiftKey ? -1 : 1;
      onChange({ levels: levels.map((n, k) => (k < selLo || k > selHi ? n : Math.max(0, Math.min(k === 0 ? 0 : MAX_LEVEL, n + by)))) });
      return;
    }
    if (mod && (e.key === "c" || e.key === "C")) { e.preventDefault(); copySel(); return; }
    if (mod && (e.key === "x" || e.key === "X")) { e.preventDefault(); copySel(); dropSel(); return; }
    if (mod && (e.key === "a" || e.key === "A")) { e.preventDefault(); setSel({ a: 0, b: block.items.length - 1 }); }
  };
  const focusEl = (el: HTMLInputElement | null | undefined, caret: number | "end"): void => {
    if (!el) return;
    el.focus();
    const at = caret === "end" ? el.value.length : caret;
    el.setSelectionRange(at, at);
  };
  const focusRow = (i: number, caret: number | "end" = "end"): void => focusEl(rows.current.get(i), caret);
  const focusAt = useRef<{ row: number; caret: number | "end" } | null>(null);
  useEffect(() => {
    const f = focusAt.current;
    if (!f) return;
    focusAt.current = null;
    focusRow(f.row, f.caret);
  });

  const shown = canEdit && block.items.length === 0 ? [""] : block.items;
  useEffect(() => {
    const f = nav.focus;
    if (!f || !canEdit) return;
    focusAt.current = { row: f.row ?? (f.caret === 0 ? 0 : Math.max(0, shown.length - 1)), caret: f.caret };
    focusRow(focusAt.current.row, f.caret);
  }, [nav.focus?.n]);

  const setItem = (i: number, value: string, el?: HTMLElement): void => {
    if (value === "/" && !(block.items[i] ?? "") && el) {
      const next = block.items.length === 0 ? ["/"] : block.items.map((x, k) => (k === i ? "/" : x));
      onChange({ items: next, levels: block.items.length === 0 ? [0] : levels });
      nav.slash(el, "item", i);
      return;
    }
    if (block.items.length === 0) {
      if (value) onChange({ items: [value], levels: [0] });
      return;
    }
    const next = [...block.items];
    next[i] = value;
    onChange({ items: next });
  };

  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (composing(e)) return;
    const el = e.currentTarget;
    // Shift+위아래는 줄 고르기로 넘어간다(요청: "Shift+화살표로 선택") — 이 줄과 위·아랫줄을 고르고, 이어 누르면 넓힌다.
    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && e.shiftKey && i < block.items.length) {
      const to = i + (e.key === "ArrowUp" ? -1 : 1);
      if (to < 0 || to >= block.items.length) return;
      e.preventDefault();
      setSel({ a: i, b: to });
      el.blur();
      listRef.current?.focus();
      return;
    }
    // 위아래 옮기기는 바깥(ScheduleBlocks)이 맡는다 — 목록 줄끼리도 기억한 열을 함께 쓴다(요청: "목록 안에서도 커서 열 기억").
    if (e.key === "ArrowUp" || e.key === "ArrowDown") return;
    if (e.key === "Tab") {
      e.preventDefault();
      shift(i, e.shiftKey ? -1 : 1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (!el.value) {
        if ((levels[i] ?? 0) > 0) { shift(i, -1); return; }
        if (i >= block.items.length - 1) {
          nav.exitList(block.items.filter((_, k) => k !== i), levels.filter((_, k) => k !== i));
          return;
        }
      }
      const head = el.value.slice(0, el.selectionStart ?? el.value.length);
      const rest = el.value.slice(el.selectionEnd ?? el.value.length);
      const next = [...block.items];
      next.splice(i, 1, head, rest);
      const lv = [...levels];
      lv.splice(i, 1, levels[i] ?? 0, levels[i] ?? 0);
      onChange({ items: next, levels: lv });
      focusAt.current = { row: i + 1, caret: 0 };
    } else if (e.key === "Backspace" && el.selectionStart === 0 && el.selectionEnd === 0) {
      e.preventDefault();
      if (block.items.length === 0) return;
      if ((levels[i] ?? 0) > 0) { shift(i, -1); return; }
      const next = [...block.items];
      const lv = [...levels];
      if (i === 0) {
        if (nav.merge(el.value, 0)) return;
        if (el.value) return;
        next.splice(0, 1);
        lv.splice(0, 1);
        onChange({ items: next, levels: lv });
        if (next.length > 0) focusAt.current = { row: 0, caret: 0 };
        return;
      }
      const above = next[i - 1];
      next.splice(i - 1, 2, above + el.value);
      lv.splice(i - 1, 2, levels[i - 1]);
      onChange({ items: next, levels: lv });
      focusAt.current = { row: i - 1, caret: above.length };
    }
  };

  return (
    <div className={cx("scr-sb-block", "scr-sb-row", canEdit && "scr-sb-block-edit")}>
      {open && (
        <ul
          className={cx("scr-sb-list", sel && "scr-sb-list-selecting")} ref={listRef}
          tabIndex={canEdit ? -1 : undefined} onKeyDown={onSelKey}
        >
          {shown.map((it, i) => (
            <li
              key={i} data-row={i} onPointerDown={(e) => onRowDown(e, i)}
              className={cx("scr-sb-list-item", `scr-sb-lv${levels[i] ?? 0}`, i >= selLo && i <= selHi && "scr-sb-row-sel")}
              style={(levels[i] ?? 0) > 0 ? { paddingLeft: `${(levels[i] ?? 0) * 18}px` } : undefined}
            >
              <span className="scr-sb-list-dot" aria-hidden />
              {canEdit ? (
                <input
                  className="scr-sb-line scr-sb-list-text" value={it}
                  ref={(el) => { if (el) rows.current.set(i, el); else rows.current.delete(i); }}
                  onChange={(e) => setItem(i, e.target.value, e.currentTarget)}
                  onKeyDown={(e) => onKey(i, e)}
                  onFocus={() => setFocused(i)}
                  onBlur={() => setFocused((f) => (f === i ? null : f))}
                />
              ) : (
                <span className="scr-sb-line scr-sb-list-text">{it}</span>
              )}
              {canEdit && focused === i && i < block.items.length && (
                <span className="scr-sb-lv-btns" onPointerDown={(e) => e.preventDefault()}>
                  <IconBtn label="내어쓰기" onClick={() => shift(i, -1)}><IndentDecrease size={13} /></IconBtn>
                  <IconBtn label="들여쓰기" onClick={() => shift(i, 1)}><IndentIncrease size={13} /></IconBtn>
                </span>
              )}
              {canEdit && i < block.items.length && (
                <IconBtn
                  label="줄 삭제" danger
                  onClick={() => ask(`'${block.items[i] || "빈 줄"}' 줄을 지울까요?`, () => onChange({
                    items: block.items.filter((_, k) => k !== i), levels: levels.filter((_, k) => k !== i),
                  }))}
                >
                  <X size={12} />
                </IconBtn>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="scr-sb-tools">
          {grip}
          <IconBtn label="목록 삭제" onClick={onDelete} danger><Trash2 size={13} /></IconBtn>
        </div>
      )}
    </div>
  );
}

/* 사진첩 저장(폰) — 공유 시트는 누른 손짓 안에서 바로 불러야 뜬다. 누른 뒤 받기(fetch)를 기다리면 손짓이 식어(특히 iOS)
   "다운로드 → 또 '사진첩에 저장'" 두 번 눌러야 했다(요청: "이미 화면에 로딩된 애들을 바로 저장하면 안 되나").
   그래서 단추가 화면에 보이면 미리 받아 둔다 — 화면에 뜬 사진은 브라우저 캐시에서 바로 온다. 누를 땐 손에 든 File 로 곧장 공유한다.
   동영상도 미리 받는다(요청: "동영상도 사진첩 저장 한 번에") — 손가락이 닿는 순간(pointerdown)에도 받기를 당긴다.
   그래도 다 받기 전에 누르면(큰 동영상을 막 띄운 참) 옛 두 번째 누름이 남는다. */
function useSaver(photos: SchedulePhoto[], zipName: string) {
  const album = canSaveToAlbum();
  const [busy, setBusy] = useState<string | null>(null);
  const ready = useRef<File[] | null>(null);
  const prep = useRef<Promise<File[]> | null>(null);
  const btn = useRef<HTMLButtonElement | null>(null);
  const [armed, setArmed] = useState(false);
  useEffect(() => { ready.current = null; prep.current = null; setArmed(false); }, [photos]);
  // 받는 중 진행(받은 수/전체)은 미리 받기와 누름이 함께 본다 — 미리 받던 중에 누르면 거기서부터 센다(옛 길은 "0 / N" 에 멈춰 있었다).
  const seen = useRef<((d: number, t: number) => void) | null>(null);
  const got = useRef(0);
  const warm = (): Promise<File[]> => {
    if (!prep.current) {
      got.current = 0;
      const p = fetchMedia(photos, (d, t) => { got.current = d; seen.current?.(d, t); });
      prep.current = p;
      p.then((files) => { if (prep.current === p) ready.current = files; }, () => { if (prep.current === p) prep.current = null; });
    }
    return prep.current;
  };
  const eager = album && photos.length > 0;
  useEffect(() => {
    const el = btn.current;
    if (!eager || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => {
      if (es.some((x) => x.isIntersecting)) { io.disconnect(); void warm().catch(() => {}); }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [eager, photos]);
  const share = async (files: File[]): Promise<void> => {
    try {
      await shareToAlbum(files);
      setArmed(false);
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === "AbortError") return;
      if (name === "NotAllowedError") { setArmed(true); return; }
      throw err;
    }
  };
  const run = async (): Promise<void> => {
    if (busy) return;
    // 미리 받아 둔 것이 있으면 기다림 없이 곧장 — 이 줄 앞에 await 를 두지 마라(손짓이 식는다).
    if (album && ready.current && navigator.canShare({ files: ready.current })) { await share(ready.current); return; }
    const p = warm();
    seen.current = (d, t) => setBusy(`받는 중 ${d}/${t}`);
    setBusy(`받는 중 ${got.current}/${photos.length}`);
    try {
      const files = await p;
      if (album && navigator.canShare({ files })) await share(files);
      else await downloadFiles(files, zipName.trim() || "사진");
    } catch (err) {
      showAlert(err instanceof Error && err.message ? err.message : "내려받지 못했어요.");
    } finally {
      seen.current = null;
      setBusy(null);
    }
  };
  const onPress = (): void => { if (album) void warm().catch(() => {}); };
  return { album, busy, armed, run, btn, onPress };
}

function SaveAllBtn({ photos, title }: { photos: SchedulePhoto[]; title: string }) {
  const { album, busy, armed, run, btn, onPress } = useSaver(photos, title);
  const label = album ? (armed ? "눌러서 저장" : "전체 저장") : "전체 다운로드";
  return (
    <button
      ref={btn} type="button" className={cx("scr-compact-rect-btn", "scr-sb-saveall", armed && "scr-sb-saveall-armed")} disabled={busy !== null}
      onPointerDown={onPress} onClick={(e) => { e.stopPropagation(); void run(); }} aria-label={label} title={label}
    >
      <Download size={13} aria-hidden />
      <span>{busy ?? label}</span>
    </button>
  );
}

const SaveOneBtn = memo(function SaveOneBtn({ photo, className }: { photo: SchedulePhoto; className: string }) {
  const one = useMemo(() => [photo], [photo]);
  const { album, busy, armed, run, btn, onPress } = useSaver(one, photo.name);
  const label = armed ? "눌러서 사진첩에 저장" : album ? "사진첩에 저장" : "다운로드";
  return (
    <button
      ref={btn} type="button" className={cx(className, armed && "is-armed")} disabled={busy !== null}
      onClick={(e) => { e.stopPropagation(); void run(); }} onPointerDown={(e) => { e.stopPropagation(); onPress(); }}
      aria-label={label} title={label}
    >
      <Download size={15} aria-hidden />
    </button>
  );
});

const SORT_SLOP = 6;
/* 손가락은 오래 눌러야 끌기가 된다(요청: "바로 드래그 아니고 오래 눌러야 드래그 모드 · 스크롤하다가 드래그가 돼 버림") —
   LONG_PRESS_MS 안에 손가락이 SORT_SLOP 넘게 움직이면 끌기가 아니라 쓸어 넘기기(스크롤)로 보고 놓는다. 마우스는 끌면 바로 끈다. */
const LONG_PRESS_MS = 250;

type CellAct = { pick: (i: number) => void; ref: (id: string) => (el: HTMLButtonElement | null) => void };

const OrderCell = memo(function OrderCell({ p, i, on, sortable, act }: {
  p: SchedulePhoto; i: number; on: boolean; sortable: boolean; act: CellAct;
}) {
  return (
    <button
      type="button" ref={act.ref(p.id)}
      className={cx("scr-sb-order-cell", on && "scr-sb-order-on")}
      aria-label={sortable ? `${i + 1}번째 ${p.name} — 끌어서 옮기기` : `${i + 1}번째 ${p.name} 보기`}
      onContextMenu={sortable ? (e) => e.preventDefault() : undefined}
      onClick={(e) => { e.stopPropagation(); act.pick(i); }}
    >
      {/* 칸은 **썸네일**(긴 변 240 · 2026-10-19, 요청: "일정 사진의 240p 섬네일은 필요할듯.. 다운이 너무 오래걸려 · 동영상도 섬네일 필요하고") — 없으면 원본·동영상 첫 장면. */}
      {isVideoItem(p) ? (
        <>
          {p.thumbUrl
            ? <img src={imgSrc(p.thumbUrl)} alt="" loading="lazy" decoding="async" draggable={false} />
            : <video src={`${imgSrc(p.url)}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} />}
          <span className="scr-sb-order-play" aria-hidden><Play size={12} /></span>
        </>
      ) : (
        <img src={imgSrc(p.thumbUrl ?? p.url)} alt="" loading="lazy" decoding="async" draggable={false} />
      )}
      <span className="scr-sb-order-n" aria-hidden>{i + 1}</span>
    </button>
  );
});

function PhotoOrder({
  photos, at, onPick, onReorder, sortable, onAdd,
}: {
  photos: SchedulePhoto[]; at: number;
  onPick: (i: number) => void; onReorder: (next: SchedulePhoto[]) => void;
  sortable: boolean; onAdd?: () => void;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const cells = useRef(new Map<string, HTMLButtonElement>());
  const byId = new Map(photos.map((p) => [p.id, p]));
  const order = photos.map((p) => p.id);
  const live = useRef({ photos, onPick, onReorder });
  live.current = { photos, onPick, onReorder };
  const lastDrop = useRef(0);
  // 칸은 memo(OrderCell) — 넘길 때(at)·차례를 바꿀 때 바뀐 칸만 다시 그린다. 손잡이는 늘 같은 그릇으로 넘긴다.
  const cellAct = useRef<CellAct>({ pick: () => {}, ref: () => () => {} }).current;
  const cellRefs = useRef(new Map<string, (el: HTMLButtonElement | null) => void>());
  cellAct.pick = (i) => { if (Date.now() - lastDrop.current > 250) live.current.onPick(i); };
  cellAct.ref = (id) => {
    let f = cellRefs.current.get(id);
    if (!f) {
      f = (el) => { if (el) cells.current.set(id, el); else { cells.current.delete(id); cellRefs.current.delete(id); } };
      cellRefs.current.set(id, f);
    }
    return f;
  };
  /* ★ 끌어 옮기기는 SortableJS 가 맡는다(요청: "시작 시도 느리고 이동 시에도 느려 · 그냥 sortablejs 를 쓰는 게 나으려나") — 끄는 동안의
     DOM 옮김·비켜 주는 애니메이션은 Sortable 이, 놓은 뒤 차례는 React 가 쥔다. 놓으면 Sortable 이 옮긴 DOM 을 제자리로 되돌리고
     (React 가 아는 DOM 과 어긋나지 않게) 새 차례를 flushSync 로 한 번에 그린다 — 되돌린 장이 한 프레임도 안 보인다.
     폰은 길게 눌러야 들린다(delayOnTouchOnly · LONG_PRESS_MS) — 그 전에 손가락이 움직이면 스크롤이다. */
  useEffect(() => {
    const el = wrap.current;
    if (!sortable || !el) return;
    const renumber = (): void => {
      Array.from(el.querySelectorAll<HTMLElement>(".scr-sb-order-cell")).forEach((c, i) => {
        const t = c.querySelector(".scr-sb-order-n")?.firstChild;
        if (t && t.nodeType === Node.TEXT_NODE && t.nodeValue !== String(i + 1)) t.nodeValue = String(i + 1);
      });
    };
    // supportPointer 는 SortableJS 옵션인데 @types/sortablejs 에 빠져 있어 단언으로 넘긴다.
    // supportPointer 는 SortableJS 옵션인데 @types/sortablejs 에 빠져 있어 단언으로 넘긴다.
    /* ★ 끄는 동안 그리드를 제 크기로 못 박고 contain: strict 로 가둔다(지적: "적은 양이 바뀔 땐 괜찮다 · 7~10개 바뀌기 시작하면 느려짐") —
       칸이 비켜 설 때마다 '다시 배치' 표시가 조상으로 올라가, 활동 목록처럼 형제가 많은 부모에서는 그때마다 목록 전체를 다시 훑었다.
       크기까지 가둔 상자(contain: strict)는 배치의 경계가 돼 그 안에서 끝난다. 크기는 끄는 동안 안 바뀌니 못 박아도 된다.
       (실측 · 큰 쪽 · CPU 4배: 10칸 밀기 끌기 중 배치 940ms → 아래 표) */
    const sortableObj = Sortable.create(el, {
      /* 비켜 서는 애니메이션은 끈다(animation: 0) — Sortable 의 애니메이션은 칸마다 transform·강제 배치를 걸어 밀리는 칸 수만큼 그리기가
         늘었다(지적: "7~10개 바뀌기 시작하면 느려짐"). 실측(피드 꼴 쪽 · CPU 4배 · 10칸 밀기): 작업 2.7초 → 1.0초 · 그리기 전 단계 1.5초 → 0.27초.
         칸은 즉시 자리를 바꾸고, 들어갈 자리는 옅은 빈칸(ghost)이 보여 준다. */
      animation: 0,
      draggable: ".scr-sb-order-cell",
      filter: ".scr-sb-order-addcell",
      preventOnFilter: false,
      delay: LONG_PRESS_MS,
      delayOnTouchOnly: true,
      touchStartThreshold: SORT_SLOP,
      // 포인터 이벤트 갈래는 끄지 않는다(supportPointer: false) — 켜 두면 길게 누르는 중 브라우저가 스크롤로 가져가 pointercancel 이 나면
      // Sortable 이 든 칸(dragEl)을 안 놓아, 한 번 쓸어 넘긴 뒤로는 아무리 길게 눌러도 안 들렸다(크롬 폰 · SortableJS 1.15).
      // 터치 이벤트 갈래는 touchend·touchcancel 로 깨끗이 놓는다.
      supportPointer: false,
      ghostClass: "scr-sb-order-ghost",
      chosenClass: "scr-sb-order-chosen",
      dragClass: "scr-sb-order-drag",
      onChoose: () => { navigator.vibrate?.(12); },
      onStart: () => { sorting += 1; },
      onMove: (e) => !e.related.classList.contains("scr-sb-order-addcell"),
      onChange: renumber,
      onEnd: (e) => {
        sorting = Math.max(0, sorting - 1);
        lastDrop.current = Date.now();
        const from = e.oldDraggableIndex ?? -1;
        const to = e.newDraggableIndex ?? -1;
        if (from < 0 || to < 0 || from === to) { renumber(); return; }
        const next = [...live.current.photos];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        // Sortable 이 놓기를 마친 뒤(다음 일)에 차례를 반영한다 — 그 사이 화면은 Sortable 이 옮겨 둔 DOM 그대로다. 같은 일에서
        // DOM 을 제자리로 되돌리고(React 가 아는 DOM 과 맞게) 새 차례를 flushSync 로 그리므로 되돌린 장은 안 보인다.
        // (React 다시 그리기는 PhotoSlide·OrderCell memo 로 바뀐 장만 다시 그린다.)
        const { item, from: box } = e;
        const oldIndex = e.oldIndex ?? -1;
        window.setTimeout(() => {
          if (oldIndex >= 0 && item.parentNode === box) {
            item.remove();
            box.insertBefore(item, box.children[oldIndex] ?? null);
          }
          flushSync(() => live.current.onReorder(next));
          renumber();
        }, 30);
      },
    } as Sortable.Options);
    return () => sortableObj.destroy();
  }, [sortable]);

  return (
    <div className={cx("scr-sb-order", !sortable && "scr-sb-order-view")} ref={wrap} aria-label={sortable ? "끌어서 순서 바꾸기" : "사진 고르기"}>
      {order.map((id, i) => (
        <OrderCell key={id} p={byId.get(id)!} i={i} on={photos[at]?.id === id} sortable={sortable} act={cellAct} />
      ))}
      {onAdd && (
        <span className="scr-sb-order-addcell">
          <button
            type="button" className="scr-sb-order-add" aria-label="사진 추가" title="사진 추가"
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
          >
            <Plus size={18} />
          </button>
        </span>
      )}
    </div>
  );
}

type SlideAct = {
  play: (id: string, i: number) => void; stop: () => void; view: (i: number) => void; remove: (p: SchedulePhoto) => void;
};

const PhotoSlide = memo(function PhotoSlide({ p, i, playing, canEdit, act }: {
  p: SchedulePhoto; i: number; playing: boolean; canEdit: boolean; act: SlideAct;
}) {
  const video = isVideoItem(p);
  return (
    <div className="scr-sb-slide">
      {playing ? (
        <video
          className="scr-sb-slide-video" src={imgSrc(p.url)} poster={p.thumbUrl ? imgSrc(p.thumbUrl) : undefined} controls autoPlay playsInline
          onClick={(e) => e.stopPropagation()} onEnded={() => act.stop()}
        />
      ) : (
        <button
          type="button" className="scr-sb-slide-img"
          /* 원본이 오는 동안 썸네일을 깔아 둔다(흐린 첫 그림 · 2026-10-19) — 원본이 그 위를 덮는다. */
          style={p.thumbUrl ? { backgroundImage: `url("${imgSrc(p.thumbUrl)}")` } : undefined}
          onClick={(e) => { e.stopPropagation(); if (video) act.play(p.id, i); else act.view(i); }}
          aria-label={video ? `${p.name} 재생` : `${p.name} 크게 보기`}
        >
          {video ? (
            <>
              {p.thumbUrl
                ? <img src={imgSrc(p.thumbUrl)} alt={p.name} loading="lazy" decoding="async" draggable={false} />
                : <video src={`${imgSrc(p.url)}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} />}
              <span className="scr-sb-slide-play" aria-hidden><Play size={22} /></span>
            </>
          ) : (
            <img src={imgSrc(p.url)} alt={p.name} loading="lazy" decoding="async" draggable={false} />
          )}
        </button>
      )}
      <SaveOneBtn photo={p} className="scr-sb-slide-save" />
      {canEdit && (
        <button
          type="button" className="scr-sb-slide-x" aria-label="이 사진 삭제" title="이 사진 삭제"
          onClick={(e) => { e.stopPropagation(); act.remove(p); }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
});

function PhotosBlock({
  block, canEdit, grip, onChange, onAdd, onDelete, fold, hasKids, ask = NO_ASK,
}: {
  block: ScheduleBlock; canEdit: boolean; grip: ReactNode;
  onChange: (patch: { title?: string; photos?: SchedulePhoto[]; collapsed?: boolean }) => void;
  onAdd: () => void; onDelete: () => void; ask?: Ask;
} & FoldProps) {
  const ownFold = useFold(block, canEdit, (collapsed) => onChange({ collapsed }));
  const [folded, toggle] = fold ?? ownFold;
  const strip = useRef<HTMLDivElement | null>(null);
  const [at, setAt] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const n = block.photos.length;
  const idx = Math.min(at, Math.max(0, n - 1));
  const go = (i: number, smooth = true): void => {
    const el = strip.current;
    if (!el) return;
    const to = Math.max(0, Math.min(n - 1, i));
    el.scrollTo({ left: to * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
  };
  const onScroll = (): void => {
    const el = strip.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setAt(i);
    if (playing && block.photos[i]?.id !== playing) setPlaying(null);
  };
  const shown = open === null ? null : block.photos[Math.min(open, n - 1)] ?? null;
  const view = (i: number): void => { setPlaying(null); setOpen(i); go(i, false); };
  /* 슬라이드 하나하나는 memo(PhotoSlide) — 넘길 때(onScroll → at)·차례를 바꿀 때 바뀐 장만 다시 그린다(옛 길은 장 전부를 다시 그려
     200장에서 놓기 한 번이 0.35초였다 · CPU 4배 느림). 손잡이는 늘 같은 그릇(slideAct)으로 넘기고 그 속만 갈아 끼운다. */
  const slideAct = useRef<SlideAct>({ play: () => {}, stop: () => {}, view: () => {}, remove: () => {} }).current;
  slideAct.play = (id, i) => { setPlaying(id); setAt(i); };
  slideAct.stop = () => setPlaying(null);
  slideAct.view = view;
  slideAct.remove = (p) => ask(isVideoItem(p) ? "이 동영상을 지울까요?" : "이 사진을 지울까요?", () => onChange({ photos: block.photos.filter((x) => x.id !== p.id) }));
  return (
    <div className={cx("scr-sb-block", canEdit && "scr-sb-block-edit")}>
      {(canEdit || n > 0) && (
        <div className="scr-sb-photos-head">
          {block.title ? <div className="scr-sb-line scr-sb-list-title">{block.title}</div> : <span className="scr-sb-photos-gap" />}
          {/* 단추 묶음은 저장·접기 앞(왼쪽)에 둔다 — 뒤에 두면 저장을 누르는 순간(포커스) 묶음이 펴지며 저장 단추를 왼쪽으로 밀어,
              손가락 밑에 다른 단추가 와 엉뚱한 것이 눌렸다(요청: "사진첩에 저장 버튼을 눌렀는데 버튼 펼치기가 돼 버림"). */}
          {canEdit && (
            <span className="scr-sb-handles">
              {grip}
              <IconBtn label="사진 목록 삭제" onClick={onDelete} danger><X size={14} /></IconBtn>
            </span>
          )}
          {n > 0 && <SaveAllBtn photos={block.photos} title={block.title || "사진"} />}
          {hasKids && <FoldBtn folded={folded} onToggle={toggle} what="사진 목록" />}
        </div>
      )}
      {n > 0 && (
        <div className="scr-sb-slides-wrap">
          <div
            className="scr-sb-slides" ref={strip} onScroll={onScroll} tabIndex={0}
            role="group" aria-roledescription="슬라이드" aria-label={`사진 ${n}장`}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") { e.preventDefault(); go(idx - 1); }
              else if (e.key === "ArrowRight") { e.preventDefault(); go(idx + 1); }
            }}
          >
            {block.photos.map((p, i) => (
              <PhotoSlide key={p.id} p={p} i={i} playing={playing === p.id} canEdit={canEdit} act={slideAct} />
            ))}
          </div>
          {n > 1 && (
            <>
              <button
                type="button" className="scr-sb-slide-nav scr-sb-slide-prev" aria-label="이전 사진"
                onClick={(e) => { e.stopPropagation(); go(idx - 1); }} disabled={idx === 0}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button" className="scr-sb-slide-nav scr-sb-slide-next" aria-label="다음 사진"
                onClick={(e) => { e.stopPropagation(); go(idx + 1); }} disabled={idx === n - 1}
              >
                <ChevronRight size={18} />
              </button>
              <div className="scr-sb-slide-count" aria-hidden>{idx + 1} / {n}</div>
              {/* (걷어냄 · 2026-10-19, 요청: "일정 사진목록의 아래 점점점 제거 · 별 효과가 없는듯 숫자만 있으면 돼") 아래 점 줄(.scr-sb-slide-dots) — 몇 번째인지는 위 숫자가 말한다. */}
            </>
          )}
        </div>
      )}
      {(canEdit || n > 1) && (
        <PhotoOrder
          photos={block.photos} at={idx} onPick={(i) => go(i, false)}
          onReorder={(next) => onChange({ photos: next })}
          sortable={canEdit} onAdd={canEdit ? onAdd : undefined}
        />
      )}
      {shown && open !== null && (
        <PhotoViewer
          src={shown.url} alt={shown.name} video={isVideoItem(shown)} onClose={() => setOpen(null)}
          onPrev={open > 0 ? () => view(open - 1) : undefined}
          onNext={open < n - 1 ? () => view(open + 1) : undefined}
          counter={n > 1 ? `${open + 1} / ${n}` : undefined}
          extra={<SaveOneBtn photo={shown} className="scr-icon-btn scr-photo-save" />}
        />
      )}
    </div>
  );
}

function MediaBlock({
  block, canEdit, grip, onChange, onDelete, fold, hasKids,
}: {
  block: ScheduleBlock; canEdit: boolean; grip: ReactNode;
  onChange: (patch: { collapsed?: boolean }) => void; onDelete: () => void;
} & FoldProps) {
  const [open, setOpen] = useState(false);
  const ownFold = useFold(block, canEdit, (collapsed) => onChange({ collapsed }));
  const [folded, toggle] = fold ?? ownFold;
  const photo = block.kind === "photo";
  const foldBtn = hasKids ? <FoldBtn folded={folded} onToggle={toggle} what={photo ? "사진" : "파일"} /> : null;
  return (
    <div className={cx("scr-sb-block", "scr-sb-row", canEdit && "scr-sb-block-edit")}>
      {photo ? (
        <button
          type="button" className="scr-sb-photo"
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          aria-label={`${block.name} 크게 보기`}
        >
          <img src={imgSrc(block.url)} alt={block.name} loading="lazy" />
        </button>
      ) : (
        <div className="scr-sb-file-row">
          <a
            className="scr-sb-file" href={imgSrc(block.url)} download={block.name}
            target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}
          >
            <Paperclip size={13} aria-hidden />
            <span className="scr-sb-file-name">{block.name}</span>
            {block.size > 0 && <span className="scr-sb-file-size">{formatBytes(block.size)}</span>}
          </a>
        </div>
      )}
      {canEdit && (
        <div className="scr-sb-tools">
          {grip}
          <IconBtn label={photo ? "사진 삭제" : "파일 삭제"} onClick={onDelete} danger>
            <Trash2 size={13} />
          </IconBtn>
        </div>
      )}
      {foldBtn && <div className="scr-sb-fold-corner">{foldBtn}</div>}
      {open && <PhotoViewer src={block.url} alt={block.name} onClose={() => setOpen(false)} />}
    </div>
  );
}

/* ★ 요소 한 줄 — memo. 한 요소를 고쳐도(글자·접기·사진) 다른 요소는 다시 그리지 않는다(요청: "일정 내에서도 한 부분 변한다고 다른 부분이 다시 그리지 않게").
   고친 요소만 새 객체가 되고(patch) 나머지는 그대로라 비교가 맞는다. 손잡이는 늘 같은 그릇(act)으로 받고 누를 때 그릇 안의 최신 것을 부른다. */
type RowActs = {
  patch: (key: string, part: Partial<ScheduleBlock>) => void;
  indentBy: (key: string, by: number) => void;
  startDrag: (e: React.PointerEvent, key: string) => void;
  pickPhotos: (key: string) => void;
  askDrop: (key: string) => void;
  fold: (key: string) => void;
  ask: Ask;
  nav: (b: { key: string }) => BlockNav;
  rowRef: (key: string, el: HTMLDivElement | null) => void;
  touchPick: (key: string) => void;
};
const BlockRow = memo(function BlockRow({ b, kids, folded, canEdit, lifted, sel, picked, focus, act }: {
  b: DraftBlock; kids: number; folded: boolean; canEdit: boolean; lifted: boolean; sel: boolean; picked: boolean;
  focus: FocusReq | null; act: React.RefObject<RowActs>;
}) {
  const key = b.key;
  const on = () => act.current;
  const grip = (
    <span className="scr-sb-handles">
      <IconBtn label="요소 내어쓰기" onClick={() => on().indentBy(key, -1)}><IndentDecrease size={13} /></IconBtn>
      <IconBtn label="요소 들여쓰기" onClick={() => on().indentBy(key, 1)}><IndentIncrease size={13} /></IconBtn>
      <span
        className="scr-sb-grip" role="button" tabIndex={-1}
        aria-label="끌어서 차례 바꾸기" title="끌어서 차례 바꾸기"
        onPointerDown={(e) => on().startDrag(e, key)}
      >
        <GripVertical size={13} />
      </span>
    </span>
  );
  const fold: [boolean, () => void] = [folded, () => on().fold(key)];
  const nav: BlockNav = canEdit ? {
    focus,
    slash: (anchor, part, row) => on().nav(b).slash(anchor, part, row),
    split: (before, after) => on().nav(b).split(before, after),
    merge: (content, row) => on().nav(b).merge(content, row),
    exitList: (items, levels) => on().nav(b).exitList(items, levels),
    removeSelf: () => on().nav(b).removeSelf(),
    indent: (by) => on().nav(b).indent(by),
  } : NO_NAV;
  const ask: Ask = (message, run) => on().ask(message, run);
  const onChange = (part: Partial<ScheduleBlock>): void => on().patch(key, part);
  const onDelete = (): void => on().askDrop(key);
  const rowRef = useCallback((el: HTMLDivElement | null) => act.current.rowRef(key, el), [act, key]);
  const touchDown = useRef(false);
  return (
    <div
      data-block={key} data-indent={b.indent ?? 0}
      className={cx("scr-sb-item", lifted && "scr-sb-item-lifted", sel && "scr-sb-item-sel", picked && "scr-sb-item-picked")}
      /* 폰은 만진 요소를 고른다(단추 줄을 낸다) — 누름이 **끝난 뒤**(click)에 고른다. 닿는 순간 고르면 그 자리에 뜬 단추 줄이 손을 뗄 때의
         누름을 가로채(원래 누르려던 사진·접기 대신 들여쓰기·삭제가 눌림) 원래 단추가 제 일을 못 했다(2026-10-20, 요청: "원래 단추의 작동은 하면서"). */
      onPointerDown={canEdit ? (e) => { touchDown.current = e.pointerType === "touch"; } : undefined}
      onClickCapture={canEdit ? () => { if (touchDown.current) on().touchPick(key); } : undefined}
      style={b.indent ? ({ "--sb-indent": b.indent } as React.CSSProperties) : undefined}
      ref={rowRef}
    >
      {b.kind === "text" ? (
        <TextBlock block={b} canEdit={canEdit} grip={grip} onDelete={onDelete} onChange={onChange} nav={nav} fold={fold} hasKids={kids > 0} />
      ) : b.kind === "list" ? (
        <ListBlock block={b} canEdit={canEdit} grip={grip} onDelete={onDelete} onChange={onChange} nav={nav} fold={fold} hasKids={kids > 0} ask={ask} />
      ) : b.kind === "photos" ? (
        <PhotosBlock
          block={b} canEdit={canEdit} grip={grip} onDelete={onDelete} onChange={onChange}
          onAdd={() => on().pickPhotos(key)} fold={fold} hasKids={kids > 0} ask={ask}
        />
      ) : (
        <MediaBlock block={b} canEdit={canEdit} grip={grip} onDelete={onDelete} onChange={onChange} fold={fold} hasKids={kids > 0} />
      )}
    </div>
  );
});

export default function ScheduleBlocks({
  blocks, canEdit, onChange, onSaveNow,
}: {
  blocks: DraftBlock[];
  canEdit: boolean;
  onChange: (next: DraftBlock[]) => void;
  /** 곧바로 저장(자동 저장의 쉼 2초를 안 기다린다) — 접기·펴기처럼 한 번 누름이 곧 끝난 고침일 때. */
  onSaveNow?: () => void;
}) {
  const photoRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const photoTarget = useRef<{ key: string | null; at: number }>({ key: null, at: 0 });
  const fileAt = useRef(0);

  const [slot, setSlot] = useState<{ at: number; key: string; part: FocusPart; row?: number; replace: boolean } | null>(null);
  const [slotOn, setSlotOn] = useState(0);
  const slotAnchor = useRef<HTMLElement | null>(null);
  const slotDrop = useRef<HTMLDivElement | null>(null);
  const [focusReq, setFocusReq] = useState<FocusReq | null>(null);
  const focusSeq = useRef(0);
  const focusOn = (key: string, part: FocusPart, caret: number | "end", row?: number): void =>
    setFocusReq({ key, part, caret, row, n: (focusSeq.current += 1) });
  useLayoutEffect(() => {
    if (slot === null || !slotAnchor.current || !slotDrop.current) return undefined;
    return attachPopover(slotAnchor.current, slotDrop.current, { growToContent: true, maxWidth: 200, placement: "bottom" });
  }, [slot]);

  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const listRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{
    key: string; pointerId: number; grabY: number; grabTop: number; lastY: number; raf: number; kids: string[];
  } | null>(null);
  const flipFrom = useRef<Map<string, number> | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  /* 폰에서 손가락으로 만진 요소(2026-10-20, 요청: "사진 줄도 무조건 나오지 말고 선택하면 보이게 · 실수로 만질 수 있음") — 고칠 글 칸이 없는
     사진·파일 요소는 만져서 고른 동안만 단추 줄을 낸다. 다른 곳을 만지면 풀린다. */
  const [touchKey, setTouchKey] = useState<string | null>(null);
  useEffect(() => {
    if (touchKey === null) return undefined;
    const off = (e: PointerEvent): void => {
      if (!(e.target as Element | null)?.closest?.(`[data-block="${CSS.escape(touchKey)}"]`)) setTouchKey(null);
    };
    document.addEventListener("pointerdown", off, true);
    return () => document.removeEventListener("pointerdown", off, true);
  }, [touchKey]);
  const [preview, setPreview] = useState<string[] | null>(null);
  const previewRef = useRef<string[] | null>(null);
  const [asking, setAsking] = useState<{ message: string; run: () => void } | null>(null);
  const ask: Ask = (message, run) => setAsking({ message, run });
  const KIND_KO: Record<ScheduleBlock["kind"], string> = { text: "글", list: "목록", photo: "사진", photos: "사진 목록", file: "파일" };
  const askDrop = (b: DraftBlock): void => {
    const what = isHeading(b) ? "제목" : KIND_KO[b.kind];
    const kids = kidsAt(latest.current, latest.current.findIndex((x) => x.key === b.key));
    ask(kids > 0 ? `이 ${what}을(를) 지울까요? 딸린 요소 ${kids}개는 남아요.` : `이 ${what}을(를) 지울까요?`, () => drop(b.key));
  };
  const [viewFold, setViewFold] = useState<Record<string, boolean>>({});
  const foldedOf = (b: DraftBlock): boolean => (canEdit ? !!b.collapsed : viewFold[b.key] ?? !!b.collapsed);
  /** i 번째 요소 아래로 이어지는 더 깊은 들여쓰기 요소 수 — 그 요소에 딸린 하위 요소다(요청: "글 다음 사진이 들여쓰기 되면 사진은 글에 포함"). */
  const kidsAt = (list: DraftBlock[], i: number): number => {
    const base = list[i]?.indent ?? 0;
    let j = i + 1;
    while (j < list.length && (list[j].indent ?? 0) > base) j += 1;
    return j - i - 1;
  };

  const patch = (key: string, part: Partial<ScheduleBlock>): void =>
    onChange(blocks.map((b) => (b.key === key ? { ...b, ...part } : b)));
  const drop = (key: string): void => onChange(blocks.filter((b) => b.key !== key));

  const latest = useRef(blocks);
  latest.current = blocks;
  const rowAct = useRef<RowActs>(null as unknown as RowActs);

  const focusNew = useRef<string | null>(null);
  const insertAt = (at: number, b: DraftBlock): void => {
    const now = latest.current;
    const i = Math.max(0, Math.min(at, now.length));
    onChange([...now.slice(0, i), b, ...now.slice(i)]);
    focusNew.current = b.key;
  };
  useLayoutEffect(() => {
    const k = focusNew.current;
    if (!k) return;
    const row = rowRefs.current.get(k);
    if (!row) return;
    focusNew.current = null;
    row.querySelector<HTMLElement>("input:not([type=file]), textarea")?.focus();
    releaseKeyboard();
  });
  const NAV = "input.scr-sb-list-title, input.scr-sb-list-text, textarea.scr-sb-textarea, p.scr-sb-editable";
  /* 위아래로 옮길 때 커서는 같은 열에 선다(요청: "캐럿은 아랫줄 캐럿이랑 같은 위치") — 짧은 줄을 지나도 처음 열을 기억해
     다음 줄에서 되찾는다(보통 글 편집기처럼). 다른 키를 누르거나 마우스로 누르면 잊는다. */
  const goalCol = useRef<number | null>(null);
  /* ★ 요소 여러 개 고르기(요청: "다른 요소들 간 Shift+화살표 위아래로 선택") — 글자 칸의 맨 위·맨 아래(목록은 첫·끝 줄 밖)에서
     Shift+위아래를 누르면 글자 대신 요소째 고른다(노션처럼). 이어 누르면 넓히고 좁힌다. 고른 요소는 Delete·Backspace(한 번 묻는다),
     Tab·Shift+Tab(들여쓰기), Ctrl/⌘+C(글 복사)로 다루고, Esc·화살표로 푼다. 접혀 숨은 하위는 위 요소와 함께 움직인다. */
  const [blockSel, setBlockSel] = useState<{ a: string; b: string } | null>(null);
  const visibleKeys = useRef<string[]>([]);
  const selRange = (): string[] => {
    if (!blockSel) return [];
    const vis = visibleKeys.current;
    const ia = vis.indexOf(blockSel.a);
    const ib = vis.indexOf(blockSel.b);
    if (ia < 0 || ib < 0) return [];
    return vis.slice(Math.min(ia, ib), Math.max(ia, ib) + 1);
  };
  const withKids = (keys: string[]): Set<string> => {
    const now = latest.current;
    const out = new Set<string>();
    for (const k of keys) {
      const i = now.findIndex((x) => x.key === k);
      if (i < 0) continue;
      out.add(k);
      for (const x of now.slice(i + 1, i + 1 + kidsAt(now, i))) out.add(x.key);
    }
    return out;
  };
  const startBlockSel = (e: React.KeyboardEvent): void => {
    if (!canEdit || e.defaultPrevented || composing(e)) return;
    const t = e.target as HTMLElement;
    if (!t.matches(NAV) && !t.matches("ul.scr-sb-list")) return;
    const up = e.key === "ArrowUp";
    if ((t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) && !t.matches("input.scr-sb-list-text")) {
      const atEdge = up ? (t.selectionStart ?? 0) === 0 : (t.selectionEnd ?? 0) === t.value.length;
      if (!atEdge) return;
    }
    const key = t.closest<HTMLElement>("[data-block]")?.dataset.block;
    if (!key) return;
    const vis = visibleKeys.current;
    const i = vis.indexOf(key);
    if (i < 0) return;
    e.preventDefault();
    setBlockSel({ a: key, b: vis[Math.max(0, Math.min(vis.length - 1, i + (up ? -1 : 1)))] });
    t.blur();
    listRef.current?.focus();
  };
  const blockText = (b: DraftBlock): string => (
    b.kind === "text" ? (isHeading(b) ? b.title : b.text)
      : b.kind === "list" ? b.items.map((x, k) => `${"  ".repeat(b.levels?.[k] ?? 0)}- ${x}`).join("\n")
        : b.kind === "photos" ? `[사진 ${b.photos.length}장]` : b.name
  );
  const onBlockSelKey = (e: React.KeyboardEvent): void => {
    if (!blockSel || e.target !== listRef.current) return;
    const vis = visibleKeys.current;
    const keys = selRange();
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const by = e.key === "ArrowUp" ? -1 : 1;
      if (e.shiftKey) {
        const ib = vis.indexOf(blockSel.b);
        setBlockSel({ a: blockSel.a, b: vis[Math.max(0, Math.min(vis.length - 1, ib + by))] });
      } else {
        const edge = by < 0 ? keys[0] : keys[keys.length - 1];
        setBlockSel(null);
        const nb = latest.current.find((x) => x.key === edge);
        if (nb) focusEnd(nb);
      }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); setBlockSel(null); return; }
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      const gone = withKids(keys);
      ask(`요소 ${keys.length}개를 지울까요?${gone.size > keys.length ? ` 접혀 있던 하위 ${gone.size - keys.length}개도 함께 지워요.` : ""}`, () => {
        setBlockSel(null);
        onChange(latest.current.filter((x) => !gone.has(x.key)));
      });
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const by = e.shiftKey ? -1 : 1;
      const moved = withKids(keys);
      const ind = latest.current.filter((x) => moved.has(x.key)).map((x) => x.indent ?? 0);
      if (Math.max(...ind) + by > MAX_INDENT || Math.min(...ind) + by < 0) return;
      onChange(latest.current.map((x) => (moved.has(x.key) ? { ...x, indent: (x.indent ?? 0) + by } : x)));
      return;
    }
    if (mod && (e.key === "c" || e.key === "C" || e.key === "x" || e.key === "X")) {
      e.preventDefault();
      const byKey = new Map(latest.current.map((x) => [x.key, x]));
      void navigator.clipboard?.writeText(keys.map((k) => byKey.get(k)).filter((x): x is DraftBlock => !!x).map(blockText).join("\n")).catch(() => {});
    }
  };
  const caretFor = (value: string, col: number, up: boolean): number => {
    if (up) {
      const ls = value.lastIndexOf("\n") + 1;
      return ls + Math.min(col, value.length - ls);
    }
    const le = value.indexOf("\n");
    return Math.min(col, le < 0 ? value.length : le);
  };
  const onNavKey = (e: React.KeyboardEvent): void => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") { goalCol.current = null; return; }
    if (e.shiftKey) { startBlockSel(e); return; }
    if (!canEdit || e.defaultPrevented || composing(e)) return;
    const t = e.target as HTMLElement;
    if (!t.matches(NAV)) return;
    const up = e.key === "ArrowUp";
    if (t instanceof HTMLTextAreaElement) {
      const before = t.value.slice(0, t.selectionStart ?? 0);
      const after = t.value.slice(t.selectionEnd ?? t.value.length);
      if (up ? before.includes("\n") : after.includes("\n")) return;
    }
    if (goalCol.current === null && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)) {
      const c = t.selectionStart ?? 0;
      goalCol.current = c - (t.value.lastIndexOf("\n", c - 1) + 1);
    }
    const col = goalCol.current ?? 0;
    const all = Array.from(listRef.current?.querySelectorAll<HTMLElement>(NAV) ?? []);
    const i = all.indexOf(t);
    const next = i < 0 ? undefined : all[i + (up ? -1 : 1)];
    if (!next) return;
    e.preventDefault();
    /* 아직 안 펼친 글(p)은 칸이 아니라 커서가 안 선다(지적: "화살표로 아래위 이동 시 커서가 없어짐") — 그 요소를 고침 칸으로
       열고 커서를 끝(위로)·처음(아래로)에 둔다. */
    if (next.matches("p.scr-sb-editable")) {
      const key = next.closest<HTMLElement>("[data-block]")?.dataset.block;
      const nb = key ? latest.current.find((x) => x.key === key) : undefined;
      if (key && nb) { focusOn(key, "body", caretFor(isHeading(nb) ? nb.title : nb.text, col, up)); return; }
    }
    next.focus();
    if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) {
      const at = caretFor(next.value, col, up);
      next.setSelectionRange(at, at);
    }
  };
  const addPhotos = async (target: string | null, at: number, files: FileList | null): Promise<void> => {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    const into = target ? latest.current.find((b) => b.key === target) : undefined;
    if (!into && latest.current.length >= MAX_BLOCKS) { showAlert(`요소는 ${MAX_BLOCKS}개까지예요.`); return; }
    const picked = list.filter((f) => !(f.type.startsWith("video/") && f.size > MAX_VIDEO_BYTES));
    if (picked.length < list.length) showAlert(`동영상은 하나에 ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)}MB까지예요. 큰 동영상은 빼고 넣었어요.`);
    if (picked.length === 0) return;
    const made: SchedulePhoto[] = picked.map((f) => ({ id: newId(), ...pickPhoto(f) }));
    const now = latest.current;
    if (into) onChange(now.map((b) => (b.key === target ? { ...b, photos: [...b.photos, ...made] } : b)));
    else insertAt(at, { ...emptyBlock("photos"), photos: made });
  };
  const addFiles = async (at: number, files: FileList | null): Promise<void> => {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    const room = MAX_BLOCKS - latest.current.length;
    if (room <= 0) { showAlert(`요소는 ${MAX_BLOCKS}개까지예요.`); return; }
    const picked = list.slice(0, room);
    if (picked.length < list.length) showAlert(`요소는 ${MAX_BLOCKS}개까지라 ${picked.length}개만 넣었어요.`);
    const made = await Promise.all(picked.map(async (f) => ({
      ...emptyBlock("file"), url: await readAsDataUrl(f), name: f.name, size: f.size,
    })));
    const now = latest.current;
    const i = Math.max(0, Math.min(at, now.length));
    onChange([...now.slice(0, i), ...made, ...now.slice(i)]);
  };
  const pickPhotos = (target: string | null, at = latest.current.length): void => {
    photoTarget.current = { key: target, at };
    photoRef.current?.click();
  };
  const pickFiles = (at: number): void => {
    fileAt.current = at;
    fileRef.current?.click();
  };

  const shiftOf = (el: HTMLElement): number => {
    const t = getComputedStyle(el).transform;
    return t && t !== "none" ? new DOMMatrixReadOnly(t).m42 : 0;
  };
  const layoutTop = (el: HTMLElement): number => el.getBoundingClientRect().top - shiftOf(el);

  const keepUnderFinger = (): void => {
    const d = drag.current;
    const el = d && rowRefs.current.get(d.key);
    if (!d || !el) return;
    const dy = (d.lastY - d.grabY) - (layoutTop(el) - d.grabTop);
    el.style.transition = "none";
    el.style.transform = `translateY(${dy}px)`;
  };
  const reorder = (): void => {
    const d = drag.current;
    const el = d && rowRefs.current.get(d.key);
    if (!d || !el) return;
    const keys = previewRef.current ?? latest.current.map((b) => b.key);
    const from = keys.indexOf(d.key);
    if (from < 0) return;
    const top = d.lastY - (d.grabY - d.grabTop);
    const bottom = top + el.offsetHeight;
    let to = from;
    for (let i = 0; i < keys.length; i += 1) {
      const row = rowRefs.current.get(keys[i]);
      if (!row || i === from) continue;
      const mid = layoutTop(row) + row.offsetHeight / 2;
      if (i < from && top < mid) { to = i; break; }
      if (i > from && bottom > mid) to = i;
    }
    if (to === from) return;
    if (to > from) {
      const byKey = new Map(latest.current.map((b) => [b.key, b]));
      while (to + 1 < keys.length && !rowRefs.current.get(keys[to + 1])
        && (byKey.get(keys[to + 1])?.indent ?? 0) > (byKey.get(keys[to])?.indent ?? 0)) to += 1;
    }
    const from_ = new Map<string, number>();
    for (const [k, row] of rowRefs.current) from_.set(k, row.getBoundingClientRect().top);
    flipFrom.current = from_;
    const next = [...keys];
    next.splice(to, 0, ...next.splice(from, 1));
    previewRef.current = next;
    setPreview(next);
  };
  const scrollBy = (dy: number): void => {
    for (let n: HTMLElement | null = listRef.current; n && n !== document.body; n = n.parentElement) {
      const oy = getComputedStyle(n).overflowY;
      if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) { n.scrollTop += dy; return; }
    }
    window.scrollBy(0, dy);
  };
  const autoScroll = (): void => {
    const d = drag.current;
    if (!d) return;
    const EDGE = 72;
    const h = window.innerHeight;
    const v = d.lastY < EDGE ? -Math.ceil((EDGE - d.lastY) / 5)
      : d.lastY > h - EDGE ? Math.ceil((d.lastY - (h - EDGE)) / 5) : 0;
    if (v !== 0) { scrollBy(v); keepUnderFinger(); reorder(); }
    d.raf = requestAnimationFrame(autoScroll);
  };

  const moveDrag = (e: PointerEvent): void => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    d.lastY = e.clientY;
    keepUnderFinger();
    reorder();
  };
  const startDrag = (e: React.PointerEvent, key: string): void => {
    const el = rowRefs.current.get(key);
    if (!el || drag.current) return;
    e.preventDefault();
    e.stopPropagation();
    const now = latest.current;
    const at = now.findIndex((b) => b.key === key);
    const kids = now.slice(at + 1, at + 1 + kidsAt(now, at)).map((b) => b.key);
    drag.current = {
      key, pointerId: e.pointerId, grabY: e.clientY, grabTop: el.getBoundingClientRect().top,
      lastY: e.clientY, raf: 0, kids,
    };
    if (kids.length > 0) {
      const keys = now.map((b) => b.key).filter((k) => !kids.includes(k));
      previewRef.current = keys;
      setPreview(keys);
    }
    setDragKey(key);
    sorting += 1;
    window.addEventListener("pointermove", moveDrag);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    drag.current.raf = requestAnimationFrame(autoScroll);
  };
  function endDrag(): void {
    const d = drag.current;
    if (!d) return;
    window.removeEventListener("pointermove", moveDrag);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
    cancelAnimationFrame(d.raf);
    drag.current = null;
    sorting = Math.max(0, sorting - 1);
    const shown = previewRef.current;
    previewRef.current = null;
    const keys = shown && shown.flatMap((k) => (k === d.key ? [k, ...d.kids] : [k]));
    if (keys) {
      const now = latest.current;
      const byKey = new Map(now.map((b) => [b.key, b]));
      const next = keys.map((k) => byKey.get(k)).filter((b): b is DraftBlock => !!b);
      for (const b of now) if (!keys.includes(b.key)) next.push(b);
      if (next.some((b, i) => b.key !== now[i]?.key)) onChange(next);
      setPreview(null);
    }
    const el = rowRefs.current.get(d.key);
    if (!el) { setDragKey(null); return; }
    el.style.transition = "transform .2s cubic-bezier(0.2, 0, 0, 1)";
    el.style.transform = "";
    window.setTimeout(() => {
      el.style.transition = "";
      setDragKey((k) => (k === d.key ? null : k));
    }, 220);
  }
  useEffect(() => () => { if (drag.current) endDrag(); }, []);

  useLayoutEffect(() => {
    const from = flipFrom.current;
    if (!from) return;
    flipFrom.current = null;
    const d = drag.current;
    for (const [key, el] of rowRefs.current) {
      if (key === d?.key) continue;
      const before = from.get(key);
      if (before === undefined) continue;
      const delta = before - layoutTop(el);
      if (Math.abs(delta) < 0.5) continue;
      el.style.transition = "none";
      el.style.transform = `translateY(${delta}px)`;
      void el.offsetHeight;
      el.style.transition = "transform .22s cubic-bezier(0.2, 0, 0, 1)";
      el.style.transform = "";
    }
    keepUnderFinger();
  });

  if (blocks.length === 0 && !canEdit) return null;

  const focusEnd = (b: DraftBlock | undefined): void => {
    if (!b) return;
    if (b.kind === "text") focusOn(b.key, b.text || !b.title ? "body" : "title", "end");
    else if (b.kind === "list") {
      if (b.items.length) focusOn(b.key, "item", "end", b.items.length - 1);
      else focusOn(b.key, "title", "end");
    } else if (b.kind === "photos") focusOn(b.key, "title", "end");
  };
  const textAfter = (cur: DraftBlock, text: string): DraftBlock => ({ ...emptyBlock("text"), text, indent: cur.indent ?? 0 });
  const navFor = (b: { key: string }): BlockNav => ({
    focus: focusReq && focusReq.key === b.key ? focusReq : null,
    slash: (anchor, part, row) => {
      slotAnchor.current = anchor;
      const now = latest.current;
      const i = now.findIndex((x) => x.key === b.key);
      const cur = now[i];
      const replace = !!cur && cur.kind === "text" && (!cur.title || cur.title === "/") && (!cur.text || cur.text === "/")
        && (part === "body" || part === "title");
      setSlotOn(0);
      setSlot({ at: replace ? i : i + 1, key: b.key, part, row, replace });
    },
    split: (before, after) => {
      const now = latest.current;
      const i = now.findIndex((x) => x.key === b.key);
      if (i < 0) return;
      const cur = now[i];
      const kids = kidsAt(now, i);
      const added: DraftBlock = { ...emptyBlock("text"), text: after, indent: kids > 0 ? (now[i + 1].indent ?? 0) : (cur.indent ?? 0) };
      const next = now.map((x) => (x.key !== b.key ? x
        : isHeading(cur) ? { ...x, title: before, heading: true } : { ...x, text: before }));
      next.splice(i + 1, 0, added);
      onChange(next);
      focusOn(added.key, "body", 0);
    },
    /* 맨 앞 Backspace — 이 요소(목록이면 그 첫 줄)의 글을 바로 위 요소 끝에 잇는다(요청: "위의 제목에 이어져야 하고 아래 요소들은
       한 단계 앞으로"). 이 요소가 없어지면 딸려 있던 하위 요소는 위 요소의 하위가 되도록 단을 옮긴다(둘의 단 차만큼).
       위가 사진·파일이면 글을 이을 데가 없어 빈 요소일 때만 지운다. */
    merge: (content, row) => {
      const now = latest.current;
      const i = now.findIndex((x) => x.key === b.key);
      const cur = now[i];
      const prev = now[i - 1];
      if (!cur || !prev) return false;
      if (content && prev.kind !== "text" && prev.kind !== "list") return false;
      let next: DraftBlock[];
      let gone = true;
      if (row !== undefined && cur.kind === "list") {
        const items = cur.items.filter((_, k) => k !== row);
        const lv = cur.items.map((_, k) => cur.levels?.[k] ?? 0).filter((_, k) => k !== row);
        gone = items.length === 0;
        next = gone ? now.filter((x) => x.key !== b.key) : now.map((x) => (x.key === b.key ? { ...x, items, levels: lv } : x));
      } else next = now.filter((x) => x.key !== b.key);
      if (gone) {
        const kidKeys = new Set(now.slice(i + 1, i + 1 + kidsAt(now, i)).map((x) => x.key));
        const by = (prev.indent ?? 0) - (cur.indent ?? 0);
        if (by !== 0 && kidKeys.size > 0) {
          next = next.map((x) => (kidKeys.has(x.key)
            ? { ...x, indent: Math.max(0, Math.min(MAX_INDENT, (x.indent ?? 0) + by)) } : x));
        }
      }
      let after: () => void = () => focusEnd(prev);
      if (prev.kind === "text" && isHeading(prev)) {
        const t = prev.title;
        next = next.map((x) => (x.key === prev.key ? { ...x, title: t + content.replace(/\n+/g, " ") } : x));
        after = () => focusOn(prev.key, "title", t.length);
      } else if (prev.kind === "text") {
        const t = prev.text;
        next = next.map((x) => (x.key === prev.key ? { ...x, text: t + content } : x));
        after = () => focusOn(prev.key, "body", t.length);
      } else if (prev.kind === "list" && content) {
        const lv = prev.items.map((_, k) => prev.levels?.[k] ?? 0);
        const lines = content.split("\n").filter((x) => x.trim());
        next = next.map((x) => (x.key === prev.key ? {
          ...x, items: [...prev.items, ...lines], levels: [...lv, ...lines.map(() => lv[lv.length - 1] ?? 0)],
        } : x));
        after = () => focusOn(prev.key, "item", 0, prev.items.length);
      }
      onChange(next);
      after();
      return true;
    },
    exitList: (items, levels) => {
      const now = latest.current;
      const i = now.findIndex((x) => x.key === b.key);
      if (i < 0) return;
      const added = textAfter(now[i], "");
      const next = now.map((x) => (x.key === b.key ? { ...x, items, levels } : x));
      next.splice(i + 1, 0, added);
      onChange(next);
      focusOn(added.key, "body", 0);
    },
    removeSelf: () => {
      const now = latest.current;
      const i = now.findIndex((x) => x.key === b.key);
      if (i < 0) return;
      onChange(now.filter((x) => x.key !== b.key));
      focusEnd(now[i - 1] ?? now[i + 1]);
    },
    indent: (by) => indentBy(b.key, by),
  });
  const SLASH_OPTS = [
    { kind: "heading" as const, label: "제목", icon: <Heading size={14} aria-hidden /> },
    { kind: "text" as const, label: "글", icon: <Type size={14} aria-hidden /> },
    { kind: "list" as const, label: "목록", icon: <ListIcon size={14} aria-hidden /> },
    { kind: "photos" as const, label: "사진", icon: <ImageIcon size={14} aria-hidden /> },
    { kind: "file" as const, label: "파일", icon: <Paperclip size={14} aria-hidden /> },
  ];
  const clearSlash = (bs: DraftBlock[], sl: NonNullable<typeof slot>): DraftBlock[] => bs.map((x) => {
    if (x.key !== sl.key) return x;
    if (sl.part === "body") return { ...x, text: x.text === "/" ? "" : x.text };
    if (sl.part === "title") return { ...x, title: x.title === "/" ? "" : x.title };
    const r = sl.row ?? -1;
    if (x.items[r] !== "/") return x;
    return { ...x, items: x.items.filter((_, k) => k !== r), levels: x.levels?.filter((_, k) => k !== r) };
  });
  const choose = (kind: (typeof SLASH_OPTS)[number]["kind"]): void => {
    const sl = slot;
    setSlot(null);
    if (!sl) return;
    let next = clearSlash(latest.current, sl);
    if (sl.replace) next = next.filter((x) => x.key !== sl.key);
    const at = Math.max(0, Math.min(sl.at, next.length));
    const src = latest.current.find((x) => x.key === sl.key);
    if (kind === "file") { onChange(next); pickFiles(at); return; }
    if (next.length >= MAX_BLOCKS) { onChange(next); showAlert(`요소는 ${MAX_BLOCKS}개까지예요.`); return; }
    const made: DraftBlock = kind === "heading"
      ? { ...emptyBlock("text"), heading: true, indent: src?.indent ?? 0 }
      : { ...emptyBlock(kind), indent: src?.indent ?? 0 };
    next.splice(at, 0, made);
    summonKeyboard();
    onChange(next);
    focusOn(made.key, kind === "heading" ? "title" : kind === "list" ? "item" : "body", 0, kind === "list" ? 0 : undefined);
  };
  const onSlashKey = (e: React.KeyboardEvent): void => {
    if (!slot) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); e.stopPropagation();
      setSlotOn((v) => (v + (e.key === "ArrowDown" ? 1 : SLASH_OPTS.length - 1)) % SLASH_OPTS.length);
    } else if (e.key === "Enter" && !composing(e)) {
      e.preventDefault(); e.stopPropagation();
      choose(SLASH_OPTS[slotOn].kind);
    } else if (e.key === "Escape") {
      e.preventDefault(); e.stopPropagation();
      setSlot(null);
    } else if (e.key.length === 1 || e.key === "Backspace") setSlot(null);
  };
  const openComposer = (): void => {
    const now = latest.current;
    const last = now[now.length - 1];
    if (last && last.kind === "text" && !last.text && !last.title) { focusOn(last.key, "body", 0); return; }
    if (now.length >= MAX_BLOCKS) { showAlert(`요소는 ${MAX_BLOCKS}개까지예요.`); return; }
    const made = emptyBlock("text");
    summonKeyboard();
    onChange([...now, made]);
    focusOn(made.key, "body", 0);
  };

  /** 요소의 들여쓰기를 to 로 — 딸린 하위 요소도 같은 만큼 함께 옮긴다(요청: "상위 요소 들여쓰기를 바꾸면 하위도 자동으로").
   *  가장 깊은 하위가 한도(MAX_INDENT)를 넘게 되면 통째로 안 움직인다 — 하위만 눌리면 딸림이 풀린다. */
  const indentTo = (key: string, to: number): boolean => {
    const now = latest.current;
    const i = now.findIndex((x) => x.key === key);
    if (i < 0) return false;
    const from = now[i].indent ?? 0;
    const by = Math.max(0, Math.min(MAX_INDENT, to)) - from;
    if (by === 0) return false;
    const end = i + 1 + kidsAt(now, i);
    const deepest = now.slice(i, end).reduce((m, x) => Math.max(m, x.indent ?? 0), 0);
    if (deepest + by > MAX_INDENT) return false;
    onChange(now.map((x, k) => (k >= i && k < end ? { ...x, indent: (x.indent ?? 0) + by } : x)));
    return true;
  };
  const indentBy = (key: string, by: number): void => {
    const b = latest.current.find((x) => x.key === key);
    if (b) indentTo(key, (b.indent ?? 0) + by);
  };
  const onIndentKey = (e: React.KeyboardEvent): void => {
    if (!canEdit || e.defaultPrevented || e.key !== "Tab" || composing(e)) return;
    const t = e.target as HTMLElement;
    if (!t.matches("input.scr-sb-list-title")) return;
    const key = t.closest<HTMLElement>("[data-block]")?.dataset.block;
    if (!key) return;
    e.preventDefault();
    indentBy(key, e.shiftKey ? -1 : 1);
  };

  const selSet = new Set(selRange());
  // 요소 줄은 memo(BlockRow) — 손잡이는 늘 같은 그릇(rowAct)으로 넘기고 그릇 안만 갈아 끼운다(아래 ★).
  rowAct.current = {
    patch, indentBy, startDrag, pickPhotos, ask, nav: navFor,
    askDrop: (key) => { const b = latest.current.find((x) => x.key === key); if (b) askDrop(b); },
    fold: (key) => {
      const b = latest.current.find((x) => x.key === key);
      if (!b) return;
      /* 접기·펴기는 화면에 먼저 반영하고(요청: "화면에 먼저 반영 후 api 요청") 곧바로 저장한다 — 쉼(2초)을 안 기다린다. */
      if (canEdit) { patch(b.key, { collapsed: !b.collapsed }); onSaveNow?.(); }
      else setViewFold((v) => ({ ...v, [b.key]: !foldedOf(b) }));
    },
    rowRef: (key, el) => { if (el) rowRefs.current.set(key, el); else rowRefs.current.delete(key); },
    touchPick: (key) => setTouchKey(key),
  };
  return (
    <div
      className={cx("scr-sb", dragKey !== null && "scr-sb-dragging")} ref={listRef}
      tabIndex={canEdit ? -1 : undefined}
      onKeyDown={(e) => { onBlockSelKey(e); onNavKey(e); onIndentKey(e); }}
      onPointerDown={() => { goalCol.current = null; if (blockSel) setBlockSel(null); }}
      // 단추 묶음을 눌러도 글 칸의 포커스를 뺏지 않는다 — 묶음은 글을 고칠 때만 뜨므로(CSS), 누르는 순간 포커스가 빠지면 묶음이 숨어 누름이 헛돈다.
      onMouseDown={(e) => { if ((e.target as HTMLElement).closest(".scr-sb-tools, .scr-sb-handles")) e.preventDefault(); }}
      onKeyDownCapture={onSlashKey}
    >
      {(() => {
        const list = preview ? preview.map((k) => blocks.find((b) => b.key === k)).filter((b): b is DraftBlock => !!b) : blocks;
        const out: { b: DraftBlock; kids: number }[] = [];
        let hideBelow: number | null = null;
        list.forEach((b, i) => {
          const ind = b.indent ?? 0;
          if (hideBelow !== null && ind > hideBelow) return;
          hideBelow = null;
          const kids = kidsAt(list, i);
          out.push({ b, kids });
          if (kids > 0 && foldedOf(b)) hideBelow = ind;
        });
        visibleKeys.current = out.map((o) => o.b.key);
        return out;
      })().map(({ b, kids }) => (
        <BlockRow
          key={b.key} b={b} kids={kids} folded={foldedOf(b)} canEdit={canEdit}
          lifted={dragKey === b.key} sel={selSet.has(b.key)} picked={touchKey === b.key}
          focus={focusReq && focusReq.key === b.key ? focusReq : null} act={rowAct}
        />
      ))}

      {canEdit && (
        <div
          className="scr-sb-composer" role="button" tabIndex={0}
          onClick={(e) => { e.stopPropagation(); openComposer(); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); openComposer(); } }}
        >
        </div>
      )}
      {asking && (
        <ConfirmDialog
          title="지우기" message={asking.message} confirmLabel="지우기"
          onConfirm={() => { const run = asking.run; setAsking(null); run(); }}
          onCancel={() => setAsking(null)}
        />
      )}
      {canEdit && slot !== null && createPortal(
        <>
          <div
            className="scr-activity-add-backdrop scr-menu-pop-backdrop"
            onPointerDown={(e) => { e.preventDefault(); setSlot(null); }} aria-hidden
          />
          <div
            className="scr-menu-pop-drop scr-activity-post-menu-drop scr-scroll scr-sb-slot-menu" ref={slotDrop}
            role="menu" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.preventDefault()}
          >
            {SLASH_OPTS.map((o, k) => (
              <button
                key={o.kind} type="button" role="menuitem"
                className={cx("scr-menu-pop-opt", k === slotOn && "scr-sb-slot-on")}
                onMouseEnter={() => setSlotOn(k)} onClick={() => choose(o.kind)}
              >
                {o.icon} {o.label}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
      {canEdit && (
        <>
          <input
            ref={photoRef} type="file" accept="image/*,video/*" multiple hidden
            onChange={(e) => { void addPhotos(photoTarget.current.key, photoTarget.current.at, e.target.files); e.target.value = ""; }}
          />
          <input
            ref={fileRef} type="file" multiple hidden
            onChange={(e) => { void addFiles(fileAt.current, e.target.files); e.target.value = ""; }}
          />
        </>
      )}
    </div>
  );
}
