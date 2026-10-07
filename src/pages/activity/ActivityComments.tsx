import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CornerDownLeft, X, Trash2 } from "lucide-react";
import Avatar from "../../components/common/Avatar";
import { Spinner } from "../../components/common/Feedback";
import { useLockBodyScroll } from "../../utils/bodyScrollLock";
import { useIsMobile } from "../../hooks/useIsMobile";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { useAppStore } from "../../store/appStore";
import { api } from "../../api/client";
import { cx } from "../../utils/format";
import { attachPopover } from "../../utils/popover";
import { formatWhen, serverMs } from "../../utils/date";

const COMMENT_NEW_WINDOW_MS = 12 * 60 * 60 * 1000;
function isFreshComment(createdAt: string): boolean {
  const age = Date.now() - serverMs(createdAt);
  return age >= 0 && age <= COMMENT_NEW_WINDOW_MS;
}
import type { Member, ActivityComment, ActivityTargetType } from "../../types";

const MESSAGE_MAX_LENGTH = 50;

function extractMentionIds(text: string, members: Member[]): string[] {
  const active = members.filter((m) => m.status === "active" && m.nickname);
  const sorted = active.slice().sort((a, b) => b.nickname.length - a.nickname.length);
  if (sorted.length === 0) return [];
  const byName = new Map(sorted.map((m) => [m.nickname, m.id]));
  const esc = sorted.map((m) => m.nickname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`@(${esc.join("|")})`, "g");
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const id = byName.get(m[1]);
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

function renderInline(text: string, mentions: { nickname: string }[]) {
  const names = mentions.map((t) => t.nickname).filter(Boolean);
  if (names.length === 0) return text;
  const esc = names
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`@(${esc.join("|")})`, "g");
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(<span key={`t${last}`}>{text.slice(last, m.index)}</span>);
    out.push(<span key={`c${m.index}`} className="scr-comment-mention">@{m[1]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(<span key={`t${last}`}>{text.slice(last)}</span>);
  return out;
}

function NoteComposer({
  members,
  initialText,
  submitting,
  onSubmit,
  onCancel,
  placeholder,
  submitLabel,
}: {
  members: Member[];
  initialText: string;
  submitting: boolean;
  onSubmit: (text: string, memberIds: string[]) => void;
  onCancel?: () => void;
  placeholder: string;
  submitLabel: React.ReactNode;
}) {
  const [text, setText] = useState(initialText);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const candidates = useMemo(() => {
    const q = (mentionQuery ?? "").toLowerCase();
    return members
      .filter((m) => m.status === "active")
      .filter((m) => !q || m.nickname.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
      .sort((a, b) => a.nickname.localeCompare(b.nickname, "ko"))
      .slice(0, 50);
  }, [members, mentionQuery]);
  const mentionShown = mentionQuery !== null && candidates.length > 0;

  useEffect(() => { setHighlight(0); }, [candidates]);
  useEffect(() => {
    dropRef.current?.querySelector(".scr-pv-opt-active")?.scrollIntoView({ block: "nearest" });
  }, [highlight]);
  useLayoutEffect(() => {
    if (!mentionShown || !inputRef.current || !dropRef.current) return;
    return attachPopover(inputRef.current, dropRef.current, { matchAnchor: true });
  }, [mentionShown]);
  useEffect(() => {
    if (!mentionShown) return;
    const closeOnOutside = (e: Event) => {
      const t = e.target as Node | null;
      if (inputRef.current?.contains(t) || dropRef.current?.contains(t)) return;
      setMentionQuery(null);
    };
    const closeOnScroll = (e: Event) => {
      const t = e.target as Node | null;
      if (t && dropRef.current?.contains(t)) return;
      setMentionQuery(null);
    };
    document.addEventListener("pointerdown", closeOnOutside, true);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside, true);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [mentionShown]);

  const detectQuery = (value: string, cursor: number) => {
    const before = value.slice(0, cursor);
    const m = before.match(/@([^\s@]*)$/);
    setMentionQuery(m ? m[1] : null);
  };
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v.length > MESSAGE_MAX_LENGTH) return;
    setText(v);
    detectQuery(v, e.target.selectionStart ?? v.length);
  };
  const insertMention = (member: Member) => {
    const el = inputRef.current;
    const cursor = el?.selectionStart ?? text.length;
    const before = text.slice(0, cursor);
    const after = text.slice(cursor);
    const m = before.match(/@([^\s@]*)$/);
    const start = m ? cursor - m[0].length : cursor;
    const token = `@${member.nickname} `;
    const next = text.slice(0, start) + token + after;
    if (next.length > MESSAGE_MAX_LENGTH) return;
    setText(next);
    setMentionQuery(null);
    const pos = start + token.length;
    requestAnimationFrame(() => {
      const e = inputRef.current;
      if (e) { e.focus(); e.setSelectionRange(pos, pos); }
    });
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape") {
      if (mentionShown) { setMentionQuery(null); return; }
      onCancel?.();
      return;
    }
    if (!mentionShown) {
      if (e.key === "Enter") { e.preventDefault(); doSubmit(); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => (h + 1) % candidates.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => (h - 1 + candidates.length) % candidates.length); }
    else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(candidates[Math.min(highlight, candidates.length - 1)]);
    }
  };

  const doSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    onSubmit(trimmed, extractMentionIds(trimmed, members));
  };

  const isEmpty = text === "";
  const canSubmit = text.trim().length > 0 && !submitting;

  const clear = () => {
    setText("");
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  return (
    <div className="scr-comment-compose-row scr-activity-note-compose-row">
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
        {mentionShown && createPortal(
          <div className="scr-pv-drop scr-scroll" ref={dropRef}>
            {candidates.map((m, i) => (
              <button
                key={m.id} type="button"
                className={cx("scr-pv-opt scr-mention-opt", i === highlight && "scr-pv-opt-active")}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertMention(m)}
              >
                <Avatar member={m} size={22} />
                <span className="scr-mention-name">{m.nickname}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
      </div>
      {onCancel && (
        <button
          type="button"
          className="scr-btn scr-comment-submit-btn scr-comment-cancel-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCancel}
          aria-label="수정 취소"
        >
          <X size={14} />
        </button>
      )}
      <button
        type="button"
        className="scr-btn scr-btn-primary scr-btn-primary-solid scr-comment-submit-btn"
        disabled={!canSubmit}
        onClick={doSubmit}
        aria-label="메모 등록"
      >
        {submitting ? <Spinner size={14} /> : submitLabel}
      </button>
    </div>
  );
}

function hiddenOffset(el: HTMLElement): number {
  return Math.max(0, window.innerHeight - el.getBoundingClientRect().top);
}

const SWIPE_CLOSE_PX = 96;

const primed = new Map<string, ActivityComment[]>();
let primedOnce = false;
const keyOf = (t: ActivityTargetType, id: number) => `${t}:${id}`;

const listeners = new Set<() => void>();
function notifyComments(): void {
  queueMicrotask(() => { for (const fn of listeners) fn(); });
}
export function subscribeComments(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function commentStatOf(
  targetType: ActivityTargetType, targetId: number,
): { count: number; latestMs: number } {
  const list = primed.get(keyOf(targetType, targetId));
  if (!list || list.length === 0) return { count: 0, latestMs: NaN };
  return { count: list.length, latestMs: Math.max(...list.map((c) => serverMs(c.createdAt))) };
}

export async function primeActivityComments(items: ActivityComment[]): Promise<void> {
  primed.clear();
  for (const c of items) {
    const k = keyOf(c.targetType, c.targetId);
    const at = primed.get(k);
    if (at) at.push(c); else primed.set(k, [c]);
  }
  primedOnce = true;
  notifyComments();
}

export default function ActivityComments({ targetType, targetId, overModal = false }: {
  targetType: ActivityTargetType;
  targetId: number;
  overModal?: boolean;
}) {
  const [composerOpen, setComposerOpen] = useState(false);
  const composerWrapRef = useRef<HTMLDivElement>(null);
  const openComposer = () => {
    composerWrapRef.current?.querySelector("input")?.focus();
    setComposerOpen(true);
  };
  const user = useAppStore((s) => s.user);
  const members = useAppStore((s) => s.members);
  const [notes, setNotes] = useState<ActivityComment[]>(
    () => (primedOnce ? primed.get(keyOf(targetType, targetId)) ?? [] : []),
  );
  const [editingId, setEditingId] = useState<number | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ActivityComment | null>(null);
  const mobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
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
    if (primedOnce) { setNotes(primed.get(keyOf(targetType, targetId)) ?? []); return; }
    let cancelled = false;
    api.listActivityComments(targetType, targetId)
      .then((items) => { if (!cancelled) setNotes(items); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [targetType, targetId]);

  const apply = (next: (prev: ActivityComment[]) => ActivityComment[]) => {
    setNotes((prev) => {
      const out = next(prev);
      if (primedOnce) { primed.set(keyOf(targetType, targetId), out); notifyComments(); }
      return out;
    });
  };

  const create = async (text: string, ids: string[]) => {
    setBusy(true);
    setErr(null);
    try {
      const created = await api.createActivityComment(targetType, targetId, text, ids);
      apply((prev) => [...prev, created]);
      setComposerKey((k) => k + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "메모를 남기지 못했어요.");
    } finally {
      setBusy(false);
    }
  };
  const update = async (id: number, text: string, ids: string[]) => {
    setBusy(true);
    setErr(null);
    try {
      const updated = await api.updateActivityComment(id, text, ids);
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
      await api.deleteActivityComment(id);
      apply((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "메모를 삭제하지 못했어요.");
    } finally {
      setBusy(false);
      setDeleteTarget(null);
    }
  };

  const renderNote = (c: ActivityComment, interactive: boolean) => (
    <li key={c.id} className="scr-comment-item scr-activity-note-item">
      <Avatar
        member={{ id: c.author.memberId, nickname: c.author.nickname, avatar: c.author.avatar }}
        size={28}
        className="scr-activity-note-avatar"
      />
      <div className="scr-activity-note-body">
        <div className="scr-comment-item-top">
          <div className="scr-comment-author">
            <span className="scr-comment-author-name">{c.author.nickname}</span>
            <span className="scr-activity-note-time">{formatWhen(c.createdAt, { clock: true })}</span>
            {isFreshComment(c.createdAt) && <span className="scr-comment-new">NEW</span>}
          </div>
        </div>
        {interactive && editingId === c.id ? (
          <NoteComposer
            members={members}
            initialText={c.text}
            submitting={busy}
            onSubmit={(text, ids) => void update(c.id, text, ids)}
            onCancel={() => setEditingId(null)}
            placeholder="메모 수정"
            submitLabel={<CornerDownLeft size={14} />}
          />
        ) : (
          <p className="scr-comment-text scr-activity-note-text">
            {renderInline(c.text, c.mentions)}
            {interactive && c.canEdit && (
              <span className="scr-comment-actions scr-activity-note-actions">
                <button
                  type="button" className="scr-activity-note-icon-btn scr-activity-note-icon-danger"
                  onClick={() => setDeleteTarget(c)}
                  aria-label="삭제"
                >
                  <Trash2 size={11} />
                </button>
              </span>
            )}
          </p>
        )}
      </div>
    </li>
  );

  const composer = (
    <NoteComposer
      key={composerKey}
      members={members}
      initialText=""
      submitting={busy}
      onSubmit={(text, ids) => void create(text, ids)}
      placeholder="댓글 남기기 (@로 유저 태그)"
      submitLabel={<CornerDownLeft size={14} />}
    />
  );

  return (
    <div
      className="scr-activity-notes"
      onClick={(e) => e.stopPropagation()}
    >
      {notes.length > 0 && <div className="scr-activity-comments-heading">댓글 {notes.length}</div>}
      {mobile ? (
        <>
          {notes.length > 0 ? (
            <div
              className="scr-activity-notes-preview" role="button" tabIndex={0}
              aria-label={`댓글 ${notes.length}개 보기`}
              onClick={openSheet}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSheet(); } }}
            >
              <ul className="scr-comment-list scr-activity-notes-list">
                {notes.map((c) => renderNote(c, false))}
              </ul>
            </div>
          ) : user ? (
            <div className="scr-activity-comment-row">
              <button
                type="button" className="scr-activity-comments-toggle"
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
            <ul className="scr-comment-list scr-activity-notes-list">
              {notes.map((c) => renderNote(c, true))}
            </ul>
          )}

          {err && <div className="scr-err scr-activity-note-err">{err}</div>}

          {user && editingId === null && (
            <div className={cx("scr-activity-comment-row", composerOpen && "scr-activity-comment-row-open")}>
              <button
                type="button" className="scr-activity-comments-toggle"
                onClick={openComposer}
                aria-expanded={composerOpen} title="댓글 쓰기"
                tabIndex={composerOpen ? -1 : 0}
              >
                댓글 추가
              </button>
              <div
                ref={composerWrapRef}
                className="scr-activity-comment-composer"
                onBlur={(e) => {
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
          className={cx("scr-comment-sheet scr-activity-card-comment scr-activity-notes", typing && "scr-comment-sheet-typing", overModal && "scr-comment-sheet-over-modal")}
          role="dialog" aria-label="댓글"
          onFocus={() => setTyping(true)}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setTyping(false); }}
        >
          <div className="scr-comment-sheet-head">
            <span className="scr-comment-sheet-title">댓글 {notes.length}</span>
            <button type="button" className="scr-icon-btn scr-comment-sheet-close" onClick={closeSheet} aria-label="닫기">
              <X size={16} />
            </button>
          </div>
          <div className="scr-comment-sheet-body scr-scroll" ref={sheetBodyRef}>
            {notes.length > 0 ? (
              <ul className="scr-comment-list scr-activity-notes-list">
                {notes.map((c) => renderNote(c, true))}
              </ul>
            ) : (
              <p className="scr-comment-sheet-empty">댓글이 없어요</p>
            )}
          </div>
          {err && <div className="scr-err scr-activity-note-err">{err}</div>}
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
