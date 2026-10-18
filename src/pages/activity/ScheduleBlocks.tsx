import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, GripVertical, Image as ImageIcon, List as ListIcon, Paperclip,
  Play, Plus, Trash2, Type, X,
} from "lucide-react";
import PhotoViewer from "../../components/common/PhotoViewer";
import { showAlert } from "../../components/common/AlertDialog";
import { cx, formatBytes } from "../../utils/format";
import { pickPhoto, readAsDataUrl } from "../../utils/image";
import { attachPopover } from "../../utils/popover";
import type { ScheduleBlock, SchedulePhoto } from "../../types";
import { imgSrc } from "../../utils/imgSrc";
import { canSaveToAlbum, downloadFiles, fetchMedia, isVideoItem, MAX_VIDEO_BYTES, shareToAlbum } from "../../utils/media";

export type DraftBlock = ScheduleBlock & { key: string };
export const withKeys = (blocks: ScheduleBlock[]): DraftBlock[] => blocks.map((b) => ({ ...b, key: b.id }));

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

export const NEW_PREFIX = "new:";
const newId = (): string => `${NEW_PREFIX}${Math.random().toString(36).slice(2)}`;
const emptyBlock = (kind: ScheduleBlock["kind"]): DraftBlock => {
  const id = newId();
  return { id, key: id, kind, text: "", title: "", items: [], url: "", name: "", size: 0, photos: [] };
};
const MAX_BLOCKS = 40;
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

function TextBlock({
  block, canEdit, grip, onChange, onDelete,
}: {
  block: ScheduleBlock; canEdit: boolean; grip: ReactNode;
  onChange: (patch: { title?: string; text?: string; collapsed?: boolean }) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [folded, toggle] = useFold(block, canEdit, (collapsed) => onChange({ collapsed }));
  const open = canEdit && editing && !folded;
  const ref = useAutoGrow(block.text, open);
  const fold = block.text ? <FoldBtn folded={folded} onToggle={() => { setEditing(false); toggle(); }} what="글" /> : null;
  const preview = block.text.split("\n", 1)[0];
  return (
    <div className={cx("scr-sb-block", canEdit && "scr-sb-block-edit")}>
      {canEdit ? (
        <div className="scr-sb-list-head">
          <input
            className="scr-sb-line scr-sb-list-title" value={block.title} placeholder="글 제목 (선택)"
            onChange={(e) => onChange({ title: e.target.value })}
            onKeyDown={(e) => {
              if (composing(e) || e.key !== "Enter") return;
              e.preventDefault();
              if (folded) toggle();
              if (open) { ref.current?.focus(); ref.current?.setSelectionRange(0, 0); } else setEditing(true);
            }}
          />
          {fold}
        </div>
      ) : block.title || folded ? (
        <div className="scr-sb-list-head">
          <div className={cx("scr-sb-line scr-sb-list-title", !block.title && "scr-sb-folded-preview")}>{block.title || preview}</div>
          {fold}
        </div>
      ) : null}
      {folded ? null : open ? (
        <textarea
          ref={ref} className="scr-sb-text scr-sb-textarea" value={block.text} autoFocus rows={1}
          onChange={(e) => onChange({ text: e.target.value })}
          onBlur={() => setEditing(false)}
        />
      ) : block.text || canEdit ? (
        <p
          className={cx("scr-sb-text", canEdit && "scr-sb-editable", !block.text && "scr-sb-empty")}
          role={canEdit ? "button" : undefined} tabIndex={canEdit ? 0 : undefined}
          aria-label={canEdit && !block.text ? "내용 적기" : undefined}
          onClick={canEdit ? (e) => { e.stopPropagation(); setEditing(true); } : undefined}
          onKeyDown={canEdit ? (e) => {
            if (e.key === "Enter") { e.preventDefault(); setEditing(true); }
          } : undefined}
        >
          {block.text ? linkify(block.text) : "\u200b"}
        </p>
      ) : null}
      {!canEdit && !block.title && !folded && fold && <div className="scr-sb-fold-corner">{fold}</div>}
      {canEdit && (
        <div className="scr-sb-tools">
          {grip}
          <IconBtn label="글 삭제" onClick={onDelete} danger><Trash2 size={13} /></IconBtn>
        </div>
      )}
    </div>
  );
}

function ListBlock({
  block, canEdit, grip, onChange, onDelete,
}: {
  block: ScheduleBlock; canEdit: boolean; grip: ReactNode;
  onChange: (patch: { title?: string; items?: string[]; collapsed?: boolean }) => void; onDelete: () => void;
}) {
  const [folded, toggle] = useFold(block, canEdit, (collapsed) => onChange({ collapsed }));
  const open = !folded;

  const rows = useRef(new Map<number, HTMLInputElement>());
  const titleRef = useRef<HTMLInputElement | null>(null);
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

  const setItem = (i: number, value: string): void => {
    if (block.items.length === 0) {
      if (value) onChange({ items: [value] });
      return;
    }
    const next = [...block.items];
    next[i] = value;
    onChange({ items: next });
  };

  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (composing(e)) return;
    const el = e.currentTarget;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const caret = el.selectionStart ?? 0;
      const to = i + (e.key === "ArrowUp" ? -1 : 1);
      if (to < 0) { e.preventDefault(); focusEl(titleRef.current, caret); return; }
      if (to >= shown.length) return;
      e.preventDefault();
      focusRow(to, caret);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (!el.value && i >= block.items.length - 1) return;
      const head = el.value.slice(0, el.selectionStart ?? el.value.length);
      const rest = el.value.slice(el.selectionEnd ?? el.value.length);
      const next = [...block.items];
      next.splice(i, 1, head, rest);
      onChange({ items: next });
      focusAt.current = { row: i + 1, caret: 0 };
    } else if (e.key === "Backspace" && el.selectionStart === 0 && el.selectionEnd === 0) {
      e.preventDefault();
      if (block.items.length === 0) return;
      const next = [...block.items];
      if (i === 0) {
        if (el.value) return;
        next.splice(0, 1);
        onChange({ items: next });
        if (next.length > 0) focusAt.current = { row: 0, caret: 0 };
        return;
      }
      const above = next[i - 1];
      next.splice(i - 1, 2, above + el.value);
      onChange({ items: next });
      focusAt.current = { row: i - 1, caret: above.length };
    }
  };

  return (
    <div className={cx("scr-sb-block", canEdit && "scr-sb-block-edit")}>
      <div className="scr-sb-list-head">
        {canEdit ? (
          <input
            ref={titleRef}
            className="scr-sb-line scr-sb-list-title" value={block.title} placeholder="목록 제목"
            onChange={(e) => onChange({ title: e.target.value })}
            onKeyDown={(e) => {
              if (composing(e)) return;
              if (e.key === "Enter") { e.preventDefault(); focusRow(0, 0); }
              else if (e.key === "ArrowDown") { e.preventDefault(); focusRow(0, e.currentTarget.selectionStart ?? 0); }
            }}
          />
        ) : (
          <div className="scr-sb-line scr-sb-list-title">{block.title}</div>
        )}
        {!open && block.items.length > 0 && (
          <span className="scr-sb-list-count" aria-hidden>{block.items.length}</span>
        )}
        <FoldBtn folded={folded} onToggle={toggle} what="목록" />
      </div>
      {open && (
        <ul className="scr-sb-list">
          {shown.map((it, i) => (
            <li key={i} className="scr-sb-list-item">
              <span className="scr-sb-list-dot" aria-hidden />
              {canEdit ? (
                <input
                  className="scr-sb-line scr-sb-list-text" value={it}
                  ref={(el) => { if (el) rows.current.set(i, el); else rows.current.delete(i); }}
                  onChange={(e) => setItem(i, e.target.value)}
                  onKeyDown={(e) => onKey(i, e)}
                />
              ) : (
                <span className="scr-sb-line scr-sb-list-text">{it}</span>
              )}
              {canEdit && i < block.items.length && (
                <IconBtn
                  label="줄 삭제" danger
                  onClick={() => onChange({ items: block.items.filter((_, k) => k !== i) })}
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

function useSaver(photos: SchedulePhoto[], zipName: string) {
  const album = canSaveToAlbum();
  const [busy, setBusy] = useState<string | null>(null);
  const ready = useRef<File[] | null>(null);
  const [armed, setArmed] = useState(false);
  useEffect(() => { ready.current = null; setArmed(false); }, [photos]);
  const share = async (files: File[]): Promise<void> => {
    try {
      await shareToAlbum(files);
      ready.current = null; setArmed(false);
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === "AbortError") return;
      if (name === "NotAllowedError") { ready.current = files; setArmed(true); return; }
      throw err;
    }
  };
  const run = async (): Promise<void> => {
    if (busy) return;
    if (ready.current) { await share(ready.current); return; }
    setBusy(`0 / ${photos.length}`);
    try {
      const files = await fetchMedia(photos, (d, t) => setBusy(`${d} / ${t}`));
      if (album && navigator.canShare({ files })) await share(files);
      else await downloadFiles(files, zipName.trim() || "사진");
    } catch (err) {
      showAlert(err instanceof Error && err.message ? err.message : "내려받지 못했어요.");
    } finally {
      setBusy(null);
    }
  };
  return { album, busy, armed, run };
}

function SaveAllBtn({ photos, title }: { photos: SchedulePhoto[]; title: string }) {
  const { album, busy, armed, run } = useSaver(photos, title);
  const label = album ? (armed ? "사진첩에 저장" : "전체 사진첩에 저장") : "전체 다운로드";
  return (
    <button
      type="button" className={cx("scr-sb-saveall", armed && "scr-sb-saveall-armed")} disabled={busy !== null}
      onClick={(e) => { e.stopPropagation(); void run(); }} aria-label={label} title={label}
    >
      <Download size={13} aria-hidden />
      <span>{busy ?? (armed ? "눌러서 저장" : album ? "사진첩에 저장" : "전체 다운로드")}</span>
    </button>
  );
}

function SaveOneBtn({ photo, className }: { photo: SchedulePhoto; className: string }) {
  const one = useMemo(() => [photo], [photo]);
  const { album, busy, armed, run } = useSaver(one, photo.name);
  const label = armed ? "눌러서 사진첩에 저장" : album ? "사진첩에 저장" : "다운로드";
  return (
    <button
      type="button" className={cx(className, armed && "is-armed")} disabled={busy !== null}
      onClick={(e) => { e.stopPropagation(); void run(); }} onPointerDown={(e) => e.stopPropagation()}
      aria-label={label} title={label}
    >
      <Download size={15} aria-hidden />
    </button>
  );
}

function PhotoOrder({
  photos, at, onPick, onReorder,
}: {
  photos: SchedulePhoto[]; at: number;
  onPick: (i: number) => void; onReorder: (next: SchedulePhoto[]) => void;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const press = useRef<{ id: string; pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const latest = useRef(photos);
  latest.current = photos;
  const onDown = (e: React.PointerEvent<HTMLButtonElement>, id: string): void => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    press.current = { id, pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  };
  const onMove = (e: React.PointerEvent<HTMLButtonElement>): void => {
    const pr = press.current;
    if (!pr || pr.pointerId !== e.pointerId) return;
    if (!pr.moved) {
      if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) < 6) return;
      pr.moved = true;
      setDragId(pr.id);
    }
    const cells = Array.from(wrap.current?.querySelectorAll<HTMLElement>("[data-pid]") ?? []);
    const hit = cells.find((c) => {
      const r = c.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    const to = hit ? latest.current.findIndex((p) => p.id === hit.dataset.pid) : -1;
    const from = latest.current.findIndex((p) => p.id === pr.id);
    if (to < 0 || from < 0 || to === from) return;
    const next = [...latest.current];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    latest.current = next;
    onReorder(next);
  };
  const onUp = (e: React.PointerEvent<HTMLButtonElement>): void => {
    const pr = press.current;
    if (!pr || pr.pointerId !== e.pointerId) return;
    press.current = null;
    setDragId(null);
    if (!pr.moved) onPick(latest.current.findIndex((p) => p.id === pr.id));
  };
  return (
    <div className="scr-sb-order" ref={wrap} aria-label="끌어서 순서 바꾸기">
      {photos.map((p, i) => (
        <button
          key={p.id} type="button" data-pid={p.id}
          className={cx("scr-sb-order-cell", i === at && "scr-sb-order-on", p.id === dragId && "scr-sb-order-drag")}
          aria-label={`${i + 1}번째 ${p.name} — 끌어서 옮기기`}
          onPointerDown={(e) => onDown(e, p.id)} onPointerMove={onMove} onPointerUp={onUp}
          onPointerCancel={() => { press.current = null; setDragId(null); }}
          onClick={(e) => e.stopPropagation()}
        >
          {isVideoItem(p) ? (
            <>
              <video src={`${imgSrc(p.url)}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} />
              <span className="scr-sb-order-play" aria-hidden><Play size={12} /></span>
            </>
          ) : (
            <img src={imgSrc(p.thumbUrl ?? p.url)} alt="" loading="lazy" decoding="async" draggable={false} />
          )}
          <span className="scr-sb-order-n" aria-hidden>{i + 1}</span>
        </button>
      ))}
    </div>
  );
}

function PhotosBlock({
  block, canEdit, grip, onChange, onAdd, onDelete,
}: {
  block: ScheduleBlock; canEdit: boolean; grip: ReactNode;
  onChange: (patch: { title?: string; photos?: SchedulePhoto[]; collapsed?: boolean }) => void;
  onAdd: () => void; onDelete: () => void;
}) {
  const [folded, toggle] = useFold(block, canEdit, (collapsed) => onChange({ collapsed }));
  const strip = useRef<HTMLDivElement | null>(null);
  const [at, setAt] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
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
    setAt(Math.round(el.scrollLeft / el.clientWidth));
  };
  const shown = open === null ? null : block.photos[Math.min(open, n - 1)] ?? null;
  const view = (i: number): void => { setOpen(i); go(i, false); };
  return (
    <div className={cx("scr-sb-block", canEdit && "scr-sb-block-edit")}>
      {(canEdit || block.title || n > 0) && (
        <div className="scr-sb-photos-head">
          {canEdit ? (
            <input
              className="scr-sb-line scr-sb-list-title" value={block.title} placeholder="사진 목록 제목"
              onChange={(e) => onChange({ title: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && !composing(e)) e.currentTarget.blur(); }}
            />
          ) : (
            <div className="scr-sb-line scr-sb-list-title">{block.title}</div>
          )}
          {folded && n > 0 && <span className="scr-sb-list-count" aria-hidden>{n}</span>}
          {n > 0 && !folded && <SaveAllBtn photos={block.photos} title={block.title} />}
          {n > 0 && <FoldBtn folded={folded} onToggle={toggle} what="사진 목록" />}
          {canEdit && (
            <>
              {grip}
              <IconBtn label="사진 목록 삭제" onClick={onDelete} danger><X size={14} /></IconBtn>
            </>
          )}
        </div>
      )}
      {n > 0 && !folded && (
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
              <div key={p.id} className="scr-sb-slide">
                <button
                  type="button" className="scr-sb-slide-img"
                  onClick={(e) => { e.stopPropagation(); view(i); }}
                  aria-label={`${p.name} 크게 보기`}
                >
                  {isVideoItem(p) ? (
                    <>
                      <video src={`${imgSrc(p.url)}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} />
                      <span className="scr-sb-slide-play" aria-hidden><Play size={22} /></span>
                    </>
                  ) : (
                    <img src={imgSrc(p.thumbUrl ?? p.url)} alt={p.name} loading="lazy" decoding="async" draggable={false} />
                  )}
                </button>
                <SaveOneBtn photo={p} className="scr-sb-slide-save" />
                {canEdit && (
                  <button
                    type="button" className="scr-sb-slide-x" aria-label="이 사진 삭제" title="이 사진 삭제"
                    onClick={(e) => { e.stopPropagation(); onChange({ photos: block.photos.filter((x) => x.id !== p.id) }); }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
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
              <div className="scr-sb-slide-dots" aria-hidden>
                {block.photos.map((p, i) => (
                  <span key={p.id} className={cx("scr-sb-slide-dot", i === idx && "scr-sb-slide-dot-on")} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {canEdit && n > 1 && !folded && (
        <PhotoOrder
          photos={block.photos} at={idx} onPick={(i) => go(i)}
          onReorder={(next) => onChange({ photos: next })}
        />
      )}
      {canEdit && !folded && (
        <button type="button" className="scr-sb-photos-add" onClick={(e) => { e.stopPropagation(); onAdd(); }}>
          <Plus size={14} aria-hidden /> 사진 추가
        </button>
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
  block, canEdit, grip, onChange, onDelete,
}: {
  block: ScheduleBlock; canEdit: boolean; grip: ReactNode;
  onChange: (patch: { collapsed?: boolean }) => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [folded, toggle] = useFold(block, canEdit, (collapsed) => onChange({ collapsed }));
  const photo = block.kind === "photo";
  const fold = <FoldBtn folded={folded} onToggle={toggle} what={photo ? "사진" : "파일"} />;
  return (
    <div className={cx("scr-sb-block", canEdit && "scr-sb-block-edit")}>
      {folded || photo ? (
        <div className="scr-sb-list-head">
          <div className="scr-sb-line scr-sb-list-title scr-sb-folded-preview">
            {photo ? <ImageIcon size={13} aria-hidden /> : <Paperclip size={13} aria-hidden />} {block.name}
          </div>
          {fold}
        </div>
      ) : null}
      {folded ? null : photo ? (
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
          {fold}
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
      {open && <PhotoViewer src={block.url} alt={block.name} onClose={() => setOpen(false)} />}
    </div>
  );
}

export default function ScheduleBlocks({
  blocks, canEdit, onChange,
}: {
  blocks: DraftBlock[];
  canEdit: boolean;
  onChange: (next: DraftBlock[]) => void;
}) {
  const photoRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const photoTarget = useRef<{ key: string | null; at: number }>({ key: null, at: 0 });
  const fileAt = useRef(0);

  const [slot, setSlot] = useState<number | null>(null);
  const slotAnchor = useRef<HTMLButtonElement | null>(null);
  const slotDrop = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (slot === null || !slotAnchor.current || !slotDrop.current) return undefined;
    return attachPopover(slotAnchor.current, slotDrop.current, { growToContent: true, maxWidth: 200, placement: "bottom" });
  }, [slot]);

  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const listRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{
    key: string; pointerId: number; grabY: number; grabTop: number; lastY: number; raf: number;
  } | null>(null);
  const flipFrom = useRef<Map<string, number> | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);

  const patch = (key: string, part: Partial<ScheduleBlock>): void =>
    onChange(blocks.map((b) => (b.key === key ? { ...b, ...part } : b)));
  const drop = (key: string): void => onChange(blocks.filter((b) => b.key !== key));

  const latest = useRef(blocks);
  latest.current = blocks;

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
  const onNavKey = (e: React.KeyboardEvent): void => {
    if (!canEdit || e.defaultPrevented || (e.key !== "ArrowUp" && e.key !== "ArrowDown") || composing(e)) return;
    const t = e.target as HTMLElement;
    if (!t.matches(NAV)) return;
    const up = e.key === "ArrowUp";
    if (t instanceof HTMLTextAreaElement) {
      const before = t.value.slice(0, t.selectionStart ?? 0);
      const after = t.value.slice(t.selectionEnd ?? t.value.length);
      if (up ? before.includes("\n") : after.includes("\n")) return;
    }
    const all = Array.from(listRef.current?.querySelectorAll<HTMLElement>(NAV) ?? []);
    const i = all.indexOf(t);
    const next = i < 0 ? undefined : all[i + (up ? -1 : 1)];
    if (!next) return;
    e.preventDefault();
    next.focus();
    if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) {
      const at = up ? next.value.length : 0;
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
    const list = latest.current;
    const from = list.findIndex((b) => b.key === d.key);
    if (from < 0) return;
    const top = d.lastY - (d.grabY - d.grabTop);
    const bottom = top + el.offsetHeight;
    let to = from;
    for (let i = 0; i < list.length; i += 1) {
      const row = rowRefs.current.get(list[i].key);
      if (!row || i === from) continue;
      const mid = layoutTop(row) + row.offsetHeight / 2;
      if (i < from && top < mid) { to = i; break; }
      if (i > from && bottom > mid) to = i;
    }
    if (to === from) return;
    const from_ = new Map<string, number>();
    for (const [k, row] of rowRefs.current) from_.set(k, row.getBoundingClientRect().top);
    flipFrom.current = from_;
    const next = [...list];
    next.splice(to, 0, ...next.splice(from, 1));
    onChange(next);
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
    drag.current = {
      key, pointerId: e.pointerId, grabY: e.clientY, grabTop: el.getBoundingClientRect().top,
      lastY: e.clientY, raf: 0,
    };
    setDragKey(key);
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

  const slotBtn = (at: number, where: "top" | "mid" | "bottom" | "inrow"): ReactNode => (
    <button
      type="button" className={cx("scr-sb-slot", `scr-sb-slot-${where}`)}
      aria-label="여기에 요소 추가" title="여기에 요소 추가" aria-expanded={slot === at}
      ref={(el) => { if (slot === at) slotAnchor.current = el; }}
      onClick={(e) => { e.stopPropagation(); setSlot((v) => (v === at ? null : at)); }}
    >
      <Plus size={12} />
    </button>
  );
  const pick = (make: (at: number) => void): void => {
    const at = slot;
    setSlot(null);
    if (at !== null) make(at);
  };

  const gripFor = (b: DraftBlock): ReactNode => (
    <span
      className="scr-sb-grip" role="button" tabIndex={-1}
      aria-label="끌어서 차례 바꾸기" title="끌어서 차례 바꾸기"
      onPointerDown={(e) => startDrag(e, b.key)}
    >
      <GripVertical size={13} />
    </span>
  );

  return (
    <div className={cx("scr-sb", dragKey !== null && "scr-sb-dragging")} ref={listRef} onKeyDown={onNavKey}>
      {blocks.map((b, i) => {
        const grip = gripFor(b);
        return (
          <div
            key={b.key}
            className={cx("scr-sb-item", dragKey === b.key && "scr-sb-item-lifted")}
            ref={(el) => { if (el) rowRefs.current.set(b.key, el); else rowRefs.current.delete(b.key); }}
          >
            {canEdit && slotBtn(i, i === 0 ? "top" : "mid")}
            {canEdit && i === blocks.length - 1 && slotBtn(i + 1, "bottom")}
            {b.kind === "text" ? (
              <TextBlock
                block={b} canEdit={canEdit} grip={grip} onDelete={() => drop(b.key)}
                onChange={(part) => patch(b.key, part)}
              />
            ) : b.kind === "list" ? (
              <ListBlock
                block={b} canEdit={canEdit} grip={grip} onDelete={() => drop(b.key)}
                onChange={(part) => patch(b.key, part)}
              />
            ) : b.kind === "photos" ? (
              <PhotosBlock
                block={b} canEdit={canEdit} grip={grip} onDelete={() => drop(b.key)}
                onChange={(part) => patch(b.key, part)} onAdd={() => pickPhotos(b.key)}
              />
            ) : (
              <MediaBlock
                block={b} canEdit={canEdit} grip={grip} onDelete={() => drop(b.key)}
                onChange={(part) => patch(b.key, part)}
              />
            )}
          </div>
        );
      })}

      {canEdit && blocks.length === 0 && <div className="scr-sb-slot-row">{slotBtn(0, "inrow")}</div>}
      {canEdit && slot !== null && createPortal(
        <>
          <div
            className="scr-activity-add-backdrop scr-menu-pop-backdrop"
            onClick={(e) => { e.stopPropagation(); setSlot(null); }} aria-hidden
          />
          <div
            className="scr-menu-pop-drop scr-activity-post-menu-drop scr-scroll scr-sb-slot-menu" ref={slotDrop}
            role="menu" onClick={(e) => e.stopPropagation()}
          >
            <button type="button" role="menuitem" className="scr-menu-pop-opt" onClick={() => { summonKeyboard(); pick((at) => insertAt(at, emptyBlock("text"))); }}>
              <Type size={14} aria-hidden /> 글
            </button>
            <button type="button" role="menuitem" className="scr-menu-pop-opt" onClick={() => { summonKeyboard(); pick((at) => insertAt(at, emptyBlock("list"))); }}>
              <ListIcon size={14} aria-hidden /> 목록
            </button>
            <button type="button" role="menuitem" className="scr-menu-pop-opt" onClick={() => { summonKeyboard(); pick((at) => insertAt(at, emptyBlock("photos"))); }}>
              <ImageIcon size={14} aria-hidden /> 사진
            </button>
            <button type="button" role="menuitem" className="scr-menu-pop-opt" onClick={() => pick((at) => pickFiles(at))}>
              <Paperclip size={14} aria-hidden /> 파일
            </button>
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
