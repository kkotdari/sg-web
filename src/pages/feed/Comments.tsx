import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CornerDownLeft, X, Trash2, Paperclip, Play } from "lucide-react";
import Avatar from "../../components/common/Avatar";
import { Spinner } from "../../components/common/Feedback";
import { useLockBodyScroll } from "../../utils/bodyScrollLock";
import { useIsMobile } from "../../hooks/useIsMobile";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { useAppStore } from "../../store/appStore";
import { api } from "../../api/client";
import { cx } from "../../utils/format";
import { mentionIdsOf, renderTags, tagRefocusing, tagsToEdit, tagsToStore, useInlineTags } from "../../components/common/InlineTags";
import { formatWhen, serverMs } from "../../utils/date";
import { readAsDataUrl } from "../../utils/image";
import { imgSrc } from "../../utils/imgSrc";
import { downloadHref } from "../../utils/fileDownload";
import PhotoViewer from "../../components/common/PhotoViewer";

const COMMENT_NEW_WINDOW_MS = 12 * 60 * 60 * 1000;
function isFreshComment(createdAt: string): boolean {
  const age = Date.now() - serverMs(createdAt);
  return age >= 0 && age <= COMMENT_NEW_WINDOW_MS;
}
import type { Member, ItemComment, CommentTargetType, CommentAttachment, CommentAttachmentIn } from "../../types";

const MESSAGE_MAX_LENGTH = 50;
/* ★ 댓글 첨부(2026-11-16, 요청: "댓글에도 파일이랑 사진 등 등록 가능해야 해" · sg-api activity attachments) — 하나에 10개 · 한 파일 50MB(서버 data URL 상한 안). */
const ATT_MAX = 10;
const ATT_MAX_BYTES = 50 * 1024 * 1024;
/** 입력 칸의 첨부 — 옛 첨부(id)와 새 파일(file)을 한 줄로. */
interface AttDraft { key: string; id?: string; name: string; size: number; file?: File; preview?: string; kind: "photo" | "video" | "file" }
const kindOf = (f: File): AttDraft["kind"] => (f.type.startsWith("video/") ? "video" : f.type.startsWith("image/") ? "photo" : "file");
/** 파일 고르기 창이 떠 있나 — 그 사이 입력 칸이 초점을 잃어도(창이 가져간다) 접지 않는다(아래 composer onBlur). */
let attPicking9 = false;
const fmtSize = (n: number): string => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

/* 회원 태그 뽑기·칩 그리기는 글 속 태그(InlineTags · 2026-10-26)와 같은 한 벌이다 — 댓글엔 게임 태그(/g → #게임번호)도 함께 선다. */
function renderInline(text: string, mentions: { nickname: string }[]) {
  return renderTags(text, mentions.map((t) => t.nickname));
}

function NoteComposer({
  members,
  initialText,
  initialAtts,
  submitting,
  onSubmit,
  onCancel,
  placeholder,
  submitLabel,
}: {
  members: Member[];
  initialText: string;
  /** 고칠 때의 옛 첨부(남기거나 뺀다). */
  initialAtts?: CommentAttachment[];
  submitting: boolean;
  onSubmit: (text: string, memberIds: string[], atts: CommentAttachmentIn[]) => void;
  onCancel?: () => void;
  placeholder: string;
  submitLabel: React.ReactNode;
}) {
  const [text, setText] = useState(initialText);
  const [atts, setAtts] = useState<AttDraft[]>(() => (initialAtts ?? []).map((a) => ({ key: a.id, id: a.id, name: a.name, size: a.size, kind: a.kind, preview: a.thumbUrl ? imgSrc(a.thumbUrl) : a.kind === "photo" ? imgSrc(a.url) : undefined })));
  const [reading, setReading] = useState(false);
  const [attErr, setAttErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => { for (const a of atts) if (a.file && a.preview) URL.revokeObjectURL(a.preview); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const addFiles = (list: FileList | null): void => {
    if (!list) return;
    setAttErr(null);
    const next: AttDraft[] = [];
    for (const f of Array.from(list)) {
      if (f.size > ATT_MAX_BYTES) { setAttErr(`${f.name} — 50MB 까지 올릴 수 있어요.`); continue; }
      const kind = kindOf(f);
      next.push({ key: `n${Date.now()}${Math.random()}`, name: f.name, size: f.size, file: f, kind, preview: kind === "photo" ? URL.createObjectURL(f) : undefined });
    }
    setAtts((cur) => {
      const merged = [...cur, ...next];
      if (merged.length > ATT_MAX) setAttErr(`첨부는 ${ATT_MAX}개까지예요.`);
      return merged.slice(0, ATT_MAX);
    });
  };
  const dropAtt = (key: string): void => setAtts((cur) => cur.filter((a) => {
    if (a.key === key && a.file && a.preview) URL.revokeObjectURL(a.preview);
    return a.key !== key;
  }));
  const inputRef = useRef<HTMLInputElement>(null);
  const tags = useInlineTags({ inputRef, value: text, setValue: setText, maxLength: MESSAGE_MAX_LENGTH });

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v.length > MESSAGE_MAX_LENGTH) return;
    setText(v);
    tags.onInput(v, e.target.selectionStart ?? v.length);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (tags.onKeyDown(e)) return;
    if (e.key === "Escape") { onCancel?.(); return; }
    if (e.key === "Enter") { e.preventDefault(); void doSubmit(); }
  };

  const doSubmit = async () => {
    const trimmed = text.trim();
    if ((!trimmed && atts.length === 0) || submitting || reading) return;
    const stored = tagsToStore(trimmed, members);   // 회원 태그는 아이디로 저장(InlineTags ID_TAG ★ · 칸의 50자는 보이는 글자로 잰다)
    setReading(true);
    try {
      const payload: CommentAttachmentIn[] = await Promise.all(atts.map(async (a) => (a.file
        ? { file: { name: a.name, data: await readAsDataUrl(a.file) } }
        : { id: a.id ?? "" })));
      onSubmit(stored, mentionIdsOf(stored, members), payload);
    } catch {
      setAttErr("파일을 읽지 못했어요.");
    } finally {
      setReading(false);
    }
  };

  const isEmpty = text === "";
  const canSubmit = (text.trim().length > 0 || atts.length > 0) && !submitting && !reading;

  const clear = () => {
    setText("");
    tags.close();
    inputRef.current?.focus();
  };

  return (
    <div className="scr-cmt-compose">
    {atts.length > 0 && (
      <div className="scr-cmt-att-drafts">
        {atts.map((a) => (
          <span key={a.key} className={cx("scr-cmt-att-chip", a.preview && "has-img")}>
            {a.preview ? <img src={a.preview} alt="" /> : a.kind === "video" ? <Play size={12} aria-hidden /> : <Paperclip size={12} aria-hidden />}
            <em>{a.name}</em><small>{fmtSize(a.size)}</small>
            <button type="button" onClick={() => dropAtt(a.key)} aria-label={`${a.name} 빼기`}><X size={11} /></button>
          </span>
        ))}
      </div>
    )}
    {attErr && <p className="scr-cmt-att-err">{attErr}</p>}
    <div className="scr-comment-compose-row scr-feed-note-compose-row">
      <input ref={fileRef} type="file" multiple hidden onChange={(e) => { attPicking9 = false; addFiles(e.target.files); e.target.value = ""; }} />
      <button type="button" className="scr-rect-btn scr-comment-submit-btn scr-cmt-attach-btn" onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          attPicking9 = true;
          window.addEventListener("focus", () => { window.setTimeout(() => { attPicking9 = false; }, 600); }, { once: true });   // 고르지 않고 닫아도 풀린다
          fileRef.current?.click();
        }} aria-label="파일 · 사진 첨부" title="파일 · 사진 첨부" disabled={atts.length >= ATT_MAX}>
        <Paperclip size={14} />
      </button>
      <div className="scr-comment-input-wrap">
        <div
          className="scr-input scr-comment-editor"
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            inputRef.current?.focus();
          }}
        >
          <input
            ref={inputRef}
            className="scr-comment-input"
            value={text}
            onChange={onChange}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            autoComplete="off"
          />
        </div>
        {!isEmpty && (
          <button
            type="button"
            className="scr-comment-clear-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
            aria-label="지우기"
          >
            <X size={14} />
          </button>
        )}
        {tags.popover}
      </div>
      {onCancel && (
        <button
          type="button"
          className="scr-rect-btn scr-comment-submit-btn scr-comment-cancel-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCancel}
          aria-label="수정 취소"
        >
          <X size={14} />
        </button>
      )}
      <button
        type="button"
        className="scr-rect-btn scr-comment-submit-btn"
        disabled={!canSubmit}
        onClick={() => void doSubmit()}
        aria-label="메모 등록"
      >
        {submitting || reading ? <Spinner size={14} /> : submitLabel}
      </button>
    </div>
    </div>
  );
}

/** 댓글의 첨부 — 사진 · 동영상은 썸네일(누르면 크게) · 파일은 원래 이름으로 받기(downloadHref). */
function NoteAttachments({ atts }: { atts: CommentAttachment[] }) {
  const [open, setOpen] = useState<CommentAttachment | null>(null);
  const media = atts.filter((a) => a.kind !== "file");
  const files = atts.filter((a) => a.kind === "file");
  return (
    <div className="scr-cmt-atts">
      {media.length > 0 && (
        <div className="scr-cmt-att-media">
          {media.map((a) => (
            <button key={a.id} type="button" className="scr-cmt-att-thumb" onClick={() => setOpen(a)} aria-label={`${a.name} 크게 보기`}>
              {a.kind === "video" && !a.thumbUrl ? <Play size={18} aria-hidden /> : <img src={imgSrc(a.thumbUrl || a.url)} alt={a.name} loading="lazy" />}
              {a.kind === "video" && a.thumbUrl && <span className="scr-cmt-att-play"><Play size={14} aria-hidden /></span>}
            </button>
          ))}
        </div>
      )}
      {files.map((a) => (
        <a key={a.id} className="scr-sb-file scr-cmt-att-file" href={downloadHref(a.url, a.name)} download={a.name} target="_blank" rel="noreferrer noopener">
          <Paperclip size={12} aria-hidden /><span className="scr-sb-file-name">{a.name}</span>
          {a.size > 0 && <span className="scr-sb-file-size">{fmtSize(a.size)}</span>}
        </a>
      ))}
      {open && <PhotoViewer src={imgSrc(open.url)} alt={open.name} video={open.kind === "video"} onClose={() => setOpen(null)} />}
    </div>
  );
}

function hiddenOffset(el: HTMLElement): number {
  return Math.max(0, window.innerHeight - el.getBoundingClientRect().top);
}

const SWIPE_CLOSE_PX = 96;

const primed = new Map<string, ItemComment[]>();
let primedOnce = false;
const keyOf = (t: CommentTargetType, id: number) => `${t}:${id}`;

const listeners = new Set<() => void>();
function notifyComments(): void {
  queueMicrotask(() => { for (const fn of listeners) fn(); });
}
export function subscribeComments(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function commentStatOf(
  targetType: CommentTargetType, targetId: number,
): { count: number; latestMs: number } {
  const list = primed.get(keyOf(targetType, targetId));
  if (!list || list.length === 0) return { count: 0, latestMs: NaN };
  return { count: list.length, latestMs: Math.max(...list.map((c) => serverMs(c.createdAt))) };
}

export async function primeComments(items: ItemComment[]): Promise<void> {
  primed.clear();
  for (const c of items) {
    const k = keyOf(c.targetType, c.targetId);
    const at = primed.get(k);
    if (at) at.push(c); else primed.set(k, [c]);
  }
  primedOnce = true;
  notifyComments();
}

export default function Comments({ targetType, targetId, overModal = false, sheetOnly = false, onSheetClose, onCount, fresh = false }: {
  targetType: CommentTargetType;
  targetId: number;
  overModal?: boolean;
  /** 폰에서 댓글 시트만 띄운다(본문 미리보기 없이 · 처음부터 열림) — 닫히면 onSheetClose(2026-10-29 · 게임 목록 댓글 수 누름). */
  sheetOnly?: boolean;
  onSheetClose?: () => void;
  /** 댓글 수가 바뀌면(불러옴·달기·지우기) 알린다 — 목록 줄의 수를 맞춘다. */
  onCount?: (n: number) => void;
  /** 미리 받은 묶음(primed · 피드에 실린 판만)이 있어도 서버에서 다시 받는다 — 피드 밖 판(명예의 전당 등)은 묶음에 없어 비어 보였다(2026-10-29 실기 지적). */
  fresh?: boolean;
}) {
  const [composerOpen, setComposerOpen] = useState(false);
  const composerWrapRef = useRef<HTMLDivElement>(null);
  const openComposer = () => {
    composerWrapRef.current?.querySelector("input")?.focus();
    setComposerOpen(true);
  };
  const user = useAppStore((s) => s.user);
  const members = useAppStore((s) => s.members);
  const [notes, setNotes] = useState<ItemComment[]>(
    () => (primedOnce ? primed.get(keyOf(targetType, targetId)) ?? [] : []),
  );
  const [editingId, setEditingId] = useState<number | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ItemComment | null>(null);
  const mobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(() => sheetOnly && mobile);
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetBodyRef = useRef<HTMLDivElement>(null);
  const [typing, setTyping] = useState(false);
  const closingRef = useRef(false);
  const closeAnimRef = useRef<Animation | null>(null);
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const openSheet = () => {
    closeAnimRef.current?.cancel();
    closeAnimRef.current = null;
    closingRef.current = false;
    if (sheetRef.current) sheetRef.current.style.transform = "";
    setTyping(false);
    setErr(null); setEditingId(null); setSheetOpen(true);
  };
  const closeSheetFrom = (fromY: number) => {
    const el = sheetRef.current;
    if (closingRef.current) return;
    if (!el || reducedMotion()) { setEditingId(null); setSheetOpen(false); return; }
    closingRef.current = true;
    const total = hiddenOffset(el);
    const a = el.animate(
      [{ transform: `translateY(${fromY}px)` }, { transform: `translateY(${total}px)` }],
      {
        duration: Math.max(90, Math.round(160 * (1 - Math.min(1, fromY / Math.max(1, total))))),
        easing: "cubic-bezier(0.32, 0, 0.67, 0)", fill: "both",
      },
    );
    (document.activeElement as HTMLElement | null)?.blur?.();
    closeAnimRef.current = a;
    void a.finished.then(() => {
      closeAnimRef.current = null;
      setEditingId(null);
      setSheetOpen(false);
      closingRef.current = false;
    }).catch(() => { });
  };
  const closeSheet = () => closeSheetFrom(0);
  /* 시트만 띄운 판(sheetOnly)은 시트가 닫히면 부른 쪽도 닫는다. */
  const sheetWasOpenRef = useRef(false);
  useEffect(() => {
    if (sheetOpen) { sheetWasOpenRef.current = true; return; }
    if (sheetOnly && sheetWasOpenRef.current) onSheetClose?.();
  }, [sheetOpen, sheetOnly, onSheetClose]);
  const onCountRef = useRef(onCount); onCountRef.current = onCount;
  const countSeenRef = useRef(notes.length);
  useEffect(() => {   // 첫 그림(불러오기 전 0)은 건너뛰고 바뀔 때만
    if (countSeenRef.current === notes.length) return;
    countSeenRef.current = notes.length;
    onCountRef.current?.(notes.length);
  }, [notes.length]);
  useEffect(() => { if (!mobile) setSheetOpen(false); }, [mobile]);
  const pinnedScrollRef = useRef(0);
  useEffect(() => {
    if (!mobile || !sheetOpen) return;
    const doc = document.scrollingElement ?? document.documentElement;
    pinnedScrollRef.current = doc.scrollTop;
    const restore = () => { doc.scrollTop = pinnedScrollRef.current; };
    let raf = 0;
    const onFocusOut = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = document.activeElement;
        const tag = el instanceof HTMLElement ? el.tagName : "";
        const stillTyping =
          tag === "INPUT" || tag === "TEXTAREA" || (el instanceof HTMLElement && el.isContentEditable);
        if (!stillTyping) restore();
      });
    };
    document.addEventListener("focusout", onFocusOut);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("focusout", onFocusOut);
      restore();
    };
  }, [mobile, sheetOpen]);
  useEffect(() => {
    if (!(mobile && sheetOpen && typing)) return;
    const root = document.documentElement;
    root.classList.add("scr-comment-typing");
    return () => root.classList.remove("scr-comment-typing");
  }, [mobile, sheetOpen, typing]);
  useLockBodyScroll(mobile && sheetOpen, closeSheet);
  useLayoutEffect(() => {
    const el = sheetRef.current;
    if (!sheetOpen || !el || reducedMotion()) return;
    const dy = hiddenOffset(el);
    el.style.transform = `translateY(${dy}px)`;
    const a = el.animate(
      [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
      { duration: 280, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "both" },
    );
    void a.finished.then(() => {
      try { a.cancel(); } catch { }
      el.style.transform = "";
    }).catch(() => {});
    return () => { try { a.cancel(); } catch { } };
  }, [sheetOpen]);
  useEffect(() => {
    const el = sheetRef.current;
    if (!mobile || !sheetOpen || !el) return;
    let startY = 0;
    let dy = 0;
    let tracking = false;
    let dragging = false;
    const onStart = (e: TouchEvent) => {
      if (closingRef.current || e.touches.length !== 1) return;
      startY = e.touches[0].clientY;
      dy = 0;
      tracking = true;
      dragging = false;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const delta = e.touches[0].clientY - startY;
      if (!dragging) {
        if (Math.abs(delta) < 6) return;
        const body = sheetBodyRef.current;
        const inBody = !!body && body.contains(e.target as Node | null);
        if (delta < 0 || (inBody && body!.scrollTop > 0)) { tracking = false; return; }
        dragging = true;
        startY = e.touches[0].clientY;
        return;
      }
      dy = Math.max(0, delta);
      if (e.cancelable) e.preventDefault();
      el.style.transform = `translateY(${dy}px)`;
    };
    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (!dragging) return;
      const moved = dy;
      dy = 0;
      if (moved > SWIPE_CLOSE_PX) { closeSheetFrom(moved); return; }
      const back = el.animate(
        [{ transform: `translateY(${moved}px)` }, { transform: "translateY(0)" }],
        { duration: 190, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "both" },
      );
      void back.finished.then(() => {
        try { back.cancel(); } catch { }
        el.style.transform = "";
      }).catch(() => {});
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [mobile, sheetOpen]);

  useLayoutEffect(() => {
    if (!sheetOpen) return;
    const el = sheetBodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [sheetOpen, notes.length]);

  useEffect(() => {
    if (primedOnce && !fresh) { setNotes(primed.get(keyOf(targetType, targetId)) ?? []); return; }
    let cancelled = false;
    api.listComments(targetType, targetId)
      .then((items) => { if (!cancelled) setNotes(items); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [targetType, targetId, fresh]);

  const apply = (next: (prev: ItemComment[]) => ItemComment[]) => {
    setNotes((prev) => {
      const out = next(prev);
      if (primedOnce) { primed.set(keyOf(targetType, targetId), out); notifyComments(); }
      return out;
    });
  };

  const create = async (text: string, ids: string[], atts: CommentAttachmentIn[]) => {
    setBusy(true);
    setErr(null);
    try {
      const created = await api.createComment(targetType, targetId, text, ids, atts.length ? atts : undefined);
      apply((prev) => [...prev, created]);
      setComposerKey((k) => k + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "메모를 남기지 못했어요.");
    } finally {
      setBusy(false);
    }
  };
  const update = async (id: number, text: string, ids: string[], atts: CommentAttachmentIn[]) => {
    setBusy(true);
    setErr(null);
    try {
      const updated = await api.updateComment(id, text, ids, atts);
      apply((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setEditingId(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "메모를 수정하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: number) => {
    setBusy(true);
    setErr(null);
    try {
      await api.deleteComment(id);
      apply((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "메모를 삭제하지 못했어요.");
    } finally {
      setBusy(false);
      setDeleteTarget(null);
    }
  };

  const renderNote = (c: ItemComment, interactive: boolean) => (
    <li key={c.id} className="scr-comment-item scr-feed-note-item">
      <Avatar
        member={{ id: c.author.memberId, nickname: c.author.nickname, avatar: c.author.avatar }}
        size={28}
        className="scr-feed-note-avatar"
      />
      <div className="scr-feed-note-body">
        <div className="scr-comment-item-top">
          <div className="scr-comment-author">
            <span className="scr-comment-author-name">{c.author.nickname}</span>
            <span className="scr-feed-note-time">{formatWhen(c.createdAt, { clock: true })}</span>
            {isFreshComment(c.createdAt) && <span className="scr-comment-new">NEW</span>}
          </div>
        </div>
        {interactive && editingId === c.id ? (
          <NoteComposer
            members={members}
            initialText={tagsToEdit(c.text, members)}
            initialAtts={c.attachments}
            submitting={busy}
            onSubmit={(text, ids, atts) => void update(c.id, text, ids, atts)}
            onCancel={() => setEditingId(null)}
            placeholder="메모 수정"
            submitLabel={<CornerDownLeft size={14} />}
          />
        ) : (
          <p className="scr-comment-text scr-feed-note-text">
            {renderInline(c.text, c.mentions)}
            {interactive && c.canEdit && (
              <span className="scr-comment-actions scr-feed-note-actions">
                <button
                  type="button" className="scr-feed-note-icon-btn scr-feed-note-icon-danger"
                  onClick={() => setDeleteTarget(c)}
                  aria-label="삭제"
                >
                  <Trash2 size={11} />
                </button>
              </span>
            )}
          </p>
        )}
        {!(interactive && editingId === c.id) && c.attachments && c.attachments.length > 0 && <NoteAttachments atts={c.attachments} />}
      </div>
    </li>
  );

  const composer = (
    <NoteComposer
      key={composerKey}
      members={members}
      initialText=""
      submitting={busy}
      onSubmit={(text, ids, atts) => void create(text, ids, atts)}
      placeholder="댓글 남기기 (@ 유저 · /g 게임 태그)"
      submitLabel={<CornerDownLeft size={14} />}
    />
  );

  return (
    <div
      className="scr-feed-notes"
      onClick={(e) => e.stopPropagation()}
    >
      {!sheetOnly && notes.length > 0 && <div className="scr-feed-comments-heading">댓글 {notes.length}</div>}
      {sheetOnly ? null : mobile ? (
        <>
          {notes.length > 0 ? (
            <div
              className="scr-feed-notes-preview" role="button" tabIndex={0}
              aria-label={`댓글 ${notes.length}개 보기`}
              onClick={openSheet}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSheet(); } }}
            >
              <ul className="scr-comment-list scr-feed-notes-list">
                {notes.map((c) => renderNote(c, false))}
              </ul>
            </div>
          ) : user ? (
            <div className="scr-feed-comment-row">
              <button
                type="button" className="scr-feed-comments-toggle"
                onClick={openSheet} title="댓글 쓰기"
              >
                댓글 추가
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          {notes.length > 0 && (
            <ul className="scr-comment-list scr-feed-notes-list">
              {notes.map((c) => renderNote(c, true))}
            </ul>
          )}

          {err && <div className="scr-err scr-feed-note-err">{err}</div>}

          {user && editingId === null && (
            <div className={cx("scr-feed-comment-row", composerOpen && "scr-feed-comment-row-open")}>
              <button
                type="button" className="scr-feed-comments-toggle"
                onClick={openComposer}
                aria-expanded={composerOpen} title="댓글 쓰기"
                tabIndex={composerOpen ? -1 : 0}
              >
                댓글 추가
              </button>
              <div
                ref={composerWrapRef}
                className="scr-feed-comment-composer"
                onBlur={(e) => {
                  if (tagRefocusing()) return;   // 태그 고르며 한글 조합 끊기(InlineTags insert ★) — 떠난 게 아니다
                  if (attPicking9 || e.currentTarget.querySelector(".scr-cmt-att-chip")) return;   // 파일 고르는 중 · 첨부를 담아 둔 동안은 안 접는다(2026-11-16 댓글 첨부)
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setComposerOpen(false);
                }}
              >
                {composer}
              </div>
            </div>
          )}
        </>
      )}

      {mobile && sheetOpen && createPortal(
        <div
          ref={sheetRef}
          className={cx("scr-comment-sheet scr-feed-card-comment scr-feed-notes", typing && "scr-comment-sheet-typing", overModal && "scr-comment-sheet-over-modal")}
          role="dialog" aria-label="댓글"
          onFocus={() => setTyping(true)}
          onBlur={(e) => { if (!tagRefocusing() && !e.currentTarget.contains(e.relatedTarget as Node | null)) setTyping(false); }}
        >
          <div className="scr-comment-sheet-head">
            <span className="scr-comment-sheet-title">댓글 {notes.length}</span>
            <button type="button" className="scr-icon-btn scr-comment-sheet-close" onClick={closeSheet} aria-label="닫기">
              <X size={16} />
            </button>
          </div>
          <div className="scr-comment-sheet-body scr-scroll" ref={sheetBodyRef}>
            {notes.length > 0 ? (
              <ul className="scr-comment-list scr-feed-notes-list">
                {notes.map((c) => renderNote(c, true))}
              </ul>
            ) : (
              <p className="scr-comment-sheet-empty">댓글이 없어요</p>
            )}
          </div>
          {err && <div className="scr-err scr-feed-note-err">{err}</div>}
          {user && editingId === null && (
            <div className="scr-comment-sheet-compose">
              <Avatar member={user} size={34} />
              {composer}
            </div>
          )}
        </div>,
        document.body,
      )}

      {deleteTarget && createPortal(
        <div className={overModal ? "scr-comment-confirm-over-modal" : undefined}>
          <ConfirmDialog
            title="메모를 삭제할까요?"
            message="삭제하면 되돌릴 수 없어요."
            confirmLabel={busy ? "삭제 중..." : "삭제"}
            cancelLabel="취소"
            onConfirm={() => void remove(deleteTarget.id)}
            onCancel={() => setDeleteTarget(null)}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}
