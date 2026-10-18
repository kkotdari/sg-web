import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ExternalLink, MoreHorizontal, Paperclip } from "lucide-react";
import PhotoViewer from "../../components/common/PhotoViewer";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import KakaoShareButton from "../../components/common/KakaoShareButton";
import { shareThumb, type KakaoShareContent } from "../../utils/kakaoShare";
import { cx, formatBytes } from "../../utils/format";
import { formatWhen, pad } from "../../utils/date";
import { LoadingMark } from "../../components/common/Feedback";
import { useLockBodyScroll } from "../../utils/bodyScrollLock";
import { attachPopover } from "../../utils/popover";
import { api, apiStatusOf } from "../../api/client";
import { readAsDataUrl } from "../../utils/image";
import { showAlert } from "../../components/common/AlertDialog";
import type { Schedule, ScheduleBlock, ScheduleFile, SchedulePhoto, ScheduleWrite, ScheduleBlockWrite } from "../../types";
import { ActivityCard } from "./ActivityCard";
import ScheduleBlocks, { NEW_PREFIX, sortingNow, withKeys, type DraftBlock } from "./ScheduleBlocks";
import { imgSrc } from "../../utils/imgSrc";

function whenTextOf(date: string, time: string | null): string {
  const day = formatWhen(date);
  return time ? `${day} ${time}` : `${day} · 시간 미정`;
}
function whenText(schedule: Schedule): string {
  return whenTextOf(schedule.scheduledDate, schedule.scheduledTime);
}

type Head = { title: string; date: string; time: string };
type SaveState = "saved" | "saving" | "failed";
const savedAtText = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return d.toDateString() === new Date().toDateString() ? time : `${d.getMonth() + 1}/${d.getDate()} ${time}`;
};

function ScheduleHead({
  head, canEdit, editing, busy, saveState, savedAt, menu, onChange, onToggle,
}: {
  head: Head;
  canEdit: boolean;
  editing: boolean;
  busy: boolean;
  saveState: SaveState;
  savedAt: string;
  menu: ReactNode;
  onChange: (part: Partial<Head>) => void;
  onToggle: () => void;
}) {
  const [whenOpen, setWhenOpen] = useState(false);
  return (
    <>
      <div className="scr-schedule-title-row">
        {editing ? (
          <input
            className="scr-schedule-title scr-sb-line" value={head.title} placeholder="제목"
            onChange={(e) => onChange({ title: e.target.value })}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <h3 className="scr-schedule-title scr-sb-line">{head.title}</h3>
        )}
        {canEdit && editing && (
          <span
            className={cx("scr-schedule-save-state", saveState === "failed" && "scr-schedule-save-state-failed")}
            role="status" aria-live="polite"
          >
            {saveState === "failed" ? "저장 안 됨" : `마지막 저장: ${savedAtText(savedAt)}`}
          </span>
        )}
        {canEdit && (
          <button
            type="button"
            className={cx("scr-schedule-edit-btn", editing && "scr-schedule-edit-btn-on")}
            aria-pressed={editing} disabled={busy}
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
          >
            {editing ? "편집끝내기" : "편집하기"}
          </button>
        )}
        {menu}
      </div>

      <div className="scr-schedule-when-line">
        {editing && whenOpen ? (
          <span className="scr-schedule-when-edit" onClick={(e) => e.stopPropagation()} role="presentation">
            <input
              className="scr-sb-line" type="date" value={head.date} autoFocus
              onChange={(e) => onChange({ date: e.target.value })}
            />
            <input
              className="scr-sb-line" type="time" value={head.time}
              onChange={(e) => onChange({ time: e.target.value })}
              onBlur={() => setWhenOpen(false)}
            />
          </span>
        ) : (
          <span
            className={cx(editing && "scr-sb-editable")}
            role={editing ? "button" : undefined} tabIndex={editing ? 0 : undefined}
            onClick={editing ? (e) => { e.stopPropagation(); setWhenOpen(true); } : undefined}
            onKeyDown={editing ? (e) => {
              if (e.key === "Enter") { e.preventDefault(); setWhenOpen(true); }
            } : undefined}
          >
            {whenTextOf(head.date, head.time)}
          </span>
        )}
      </div>
    </>
  );
}

function shareContentOf(schedule: Schedule): KakaoShareContent {
  const when = whenText(schedule);
  return {
    title: schedule.title,
    description: when,
    ...shareThumb("schedule"),
    link: `${window.location.origin}/schedules/${schedule.id}`,
    fallbackText: `[스타게이트] ${schedule.title} — ${when}`,
  };
}

function ScheduleActionsMenu({ schedule, canDelete, onDeleted }: {
  schedule: Schedule;
  canDelete: boolean;
  onDeleted: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !dropRef.current) return undefined;
    return attachPopover(anchorRef.current, dropRef.current, { growToContent: true, maxWidth: 200, placement: "bottom-end" });
  }, [open]);

  const remove = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.deleteSchedule(schedule.id);
      onDeleted(schedule.id);
      setConfirmOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scr-activity-chal-menu scr-schedule-menu">
      <button
        type="button" ref={anchorRef} className="scr-activity-post-menu-btn scr-activity-kebab-btn"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-label="더보기" aria-haspopup="menu" aria-expanded={open}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && createPortal(
        <>
          <div
            className="scr-activity-add-backdrop scr-menu-pop-backdrop"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            aria-hidden
          />
          <div
            className="scr-menu-pop-drop scr-activity-post-menu-drop scr-scroll" ref={dropRef} role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            <KakaoShareButton
              variant="menu" content={() => shareContentOf(schedule)} onDone={() => setOpen(false)}
            />
            {canDelete && (
              <button
                type="button" role="menuitem"
                className={cx("scr-menu-pop-opt", "scr-activity-post-menu-opt-danger")}
                onClick={() => { setOpen(false); setConfirmOpen(true); }}
              >
                삭제
              </button>
            )}
          </div>
        </>,
        document.body,
      )}
      {confirmOpen && (
        <ConfirmDialog
          title="일정 삭제"
          message="이 일정을 삭제할까요? 달린 댓글과 첨부파일도 함께 사라져요."
          confirmLabel={busy ? "삭제 중..." : "삭제"}
          error={err}
          onConfirm={() => void remove()}
          onCancel={() => { setConfirmOpen(false); setErr(null); }}
        />
      )}
    </div>
  );
}

const IMAGE_NAME = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;
const isImageFile = (f: ScheduleFile): boolean =>
  f.url.startsWith("data:image/") || IMAGE_NAME.test(f.name);

function SchedulePhotos({ photos }: { photos: ScheduleFile[] }) {
  const [open, setOpen] = useState<ScheduleFile | null>(null);
  return (
    <>
      <ul className={cx("scr-schedule-photos", photos.length === 1 && "scr-schedule-photos-one")}>
        {photos.map((f) => (
          <li key={f.url}>
            <button
              type="button" className="scr-schedule-photo"
              onClick={(e) => { e.stopPropagation(); setOpen(f); }}
              aria-label={`${f.name} 크게 보기`}
            >
              <img src={imgSrc(f.url)} alt={f.name} loading="lazy" />
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <PhotoViewer src={open.url} alt={open.name} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

const SAVE_IDLE_MS = 2000;
const SAVE_MAX_MS = 15000;
const REFRESH_MS = 4000;
const RETRY_MS = 5000;

const NO_KEYBOARD = new Set(["checkbox", "radio", "button", "submit", "reset", "file", "range", "color", "image"]);
function typingNow(): boolean {
  const box = (document.activeElement as HTMLElement | null)
    ?.closest<HTMLElement>("input, textarea, [contenteditable]:not([contenteditable=false])");
  if (!box) return false;
  return !(box instanceof HTMLInputElement) || !NO_KEYBOARD.has(box.type);
}

type Draft = Head & { blocks: DraftBlock[] };
const HEAD_KEYS = ["title", "date", "time"] as const;

const headOf = (s: Schedule): Head => ({ title: s.title, date: s.scheduledDate, time: s.scheduledTime ?? "" });
const draftOf = (s: Schedule, prev: DraftBlock[] = []): Draft => {
  const keyOf = new Map(prev.map((b) => [b.id, b.key]));
  return { ...headOf(s), blocks: (s.blocks ?? []).map((b) => ({ ...b, key: keyOf.get(b.id) ?? b.id })) };
};
const serverKeyOf = (s: Schedule): string =>
  JSON.stringify([s.title, s.scheduledDate, s.scheduledTime, s.blocks ?? []]);
const levelsOf = (b: ScheduleBlock): number[] => b.items.map((_, i) => b.levels?.[i] ?? 0);
const sameBlock = (a: ScheduleBlock, b: ScheduleBlock): boolean =>
  a.kind === b.kind && a.text === b.text && a.title === b.title && a.url === b.url
  && a.items.length === b.items.length && a.items.every((x, i) => x === b.items[i])
  && a.photos.length === b.photos.length && a.photos.every((x, i) => x.id === b.photos[i].id)
  && !!a.collapsed === !!b.collapsed && (a.indent ?? 0) === (b.indent ?? 0)
  && levelsOf(a).every((x, i) => x === levelsOf(b)[i]);
const startsWith = (xs: string[], prefix: string[]): boolean =>
  prefix.length <= xs.length && prefix.every((x, i) => x === xs[i]);
const normBlock = (b: ScheduleBlock): ScheduleBlock => {
  const lv = levelsOf(b);
  const kept = b.items.map((x, i) => [x.trim(), lv[i]] as const).filter(([x]) => x);
  return {
    ...b, text: b.text.trim(), title: b.title.trim(),
    items: kept.map(([x]) => x), levels: kept.map(([, n]) => n),
  };
};
const equivalent = (mine: ScheduleBlock, server: ScheduleBlock): boolean => sameBlock(normBlock(mine), server);
const isEphemeral = (b: ScheduleBlock): boolean =>
  (b.kind === "text" && !b.text.trim() && !b.title.trim()) || (b.kind === "list" && !b.title.trim())
  || (b.kind === "photos" && b.photos.length === 0);
const isNew = (id: string): boolean => id.startsWith(NEW_PREFIX);

const countNewPhotos = (d: Draft): number =>
  d.blocks.reduce((n, b) => n + (b.kind === "photos" ? b.photos.filter((p) => isNew(p.id)).length : 0), 0);
const PHOTO_BATCH_BYTES = 12_000_000;
type Outgoing = { payload: ScheduleWrite; deferred: Set<string> };

async function payloadOf(d: Draft, expectedUpdatedAt: string): Promise<Outgoing> {
  const deferred = new Set<string>();
  let bytes = 0;
  const blocks: ScheduleBlockWrite[] = [];
  for (const b of d.blocks) {
    const collapsed = !!b.collapsed;
    const indent = b.indent ?? 0;
    if (b.kind === "text") { blocks.push({ kind: "text", id: b.id, title: b.title, text: b.text, collapsed, indent }); continue; }
    if (b.kind === "list") {
      blocks.push({ kind: "list", id: b.id, title: b.title, items: b.items, levels: levelsOf(b), collapsed, indent });
      continue;
    }
    if (b.kind === "photos") {
      const photos: Extract<ScheduleBlockWrite, { kind: "photos" }>["photos"] = [];
      for (const p of b.photos) {
        if (!isNew(p.id)) { photos.push({ id: p.id }); continue; }
        if (bytes > 0 && bytes + p.size > PHOTO_BATCH_BYTES) { deferred.add(p.id); continue; }
        bytes += p.size;
        photos.push({ file: { name: p.name, data: p.file ? await readAsDataUrl(p.file) : p.url } });
      }
      blocks.push({ kind: "photos", id: b.id, title: b.title, photos, collapsed, indent });
      continue;
    }
    blocks.push(isNew(b.id) ? { kind: b.kind, file: { name: b.name, data: b.url }, collapsed, indent } : { kind: b.kind, id: b.id, collapsed, indent });
  }
  return {
    payload: { title: d.title.trim(), scheduledDate: d.date, scheduledTime: d.time || null, expectedUpdatedAt, blocks },
    deferred,
  };
}

type Adopted = { id?: string; photos?: Map<string, string> };
function adoptPhotoIds(sent: SchedulePhoto[], saved: SchedulePhoto[], deferred: Set<string>): Map<string, string> {
  const ids = new Map<string, string>();
  let j = 0;
  for (const p of sent) {
    if (deferred.has(p.id)) continue;
    const s = saved[j];
    if (!s) break;
    if (isNew(p.id) ? s.name !== p.name : s.id !== p.id) continue;
    if (p.id !== s.id) ids.set(p.id, s.id);
    j += 1;
  }
  return ids;
}
function adoptIds(sent: DraftBlock[], saved: ScheduleBlock[], deferred: Set<string>): Map<string, Adopted> {
  const out = new Map<string, Adopted>();
  let j = 0;
  for (const b of sent) {
    const s = saved[j];
    if (!s) break;
    const fits = s.kind === b.kind && (isNew(b.id)
      ? (b.kind === "text" ? s.text === b.text.trim() && s.title === b.title.trim()
        : b.kind === "list" || b.kind === "photos" ? s.title === b.title.trim()
          : s.name === b.name)
      : b.id === s.id);
    if (!fits) continue;
    const a: Adopted = {};
    if (b.id !== s.id) a.id = s.id;
    if (b.kind === "photos") {
      const photos = adoptPhotoIds(b.photos, s.photos, deferred);
      if (photos.size > 0) a.photos = photos;
    }
    if (a.id || a.photos) out.set(b.key, a);
    j += 1;
  }
  return out;
}
function applyAdopted(blocks: DraftBlock[], adopted: Map<string, Adopted>): DraftBlock[] {
  return blocks.map((b) => {
    const a = adopted.get(b.key);
    if (!a) return b;
    return {
      ...b,
      id: a.id ?? b.id,
      photos: a.photos ? b.photos.map((p) => ({ ...p, id: a.photos!.get(p.id) ?? p.id })) : b.photos,
    };
  });
}

function keepLocal(server: Draft, mine: Draft): Draft {
  const local = new Map(mine.blocks.map((b) => [b.key, b]));
  const blocks: DraftBlock[] = server.blocks.map((s) => {
    const l = local.get(s.key);
    return l && equivalent(l, s) ? { ...l, id: s.id } : s;
  });
  mine.blocks.forEach((b, i) => {
    if (isNew(b.id) && isEphemeral(b)) blocks.splice(Math.min(i, blocks.length), 0, b);
  });
  return {
    title: mine.title.trim() === server.title ? mine.title : server.title,
    date: server.date,
    time: server.time,
    blocks,
  };
}

function merge(
  server: Draft, mine: Draft, touched: Set<string>, removed: Set<string>, base: Map<string, DraftBlock>,
): Draft {
  const theirs = new Map(server.blocks.map((b) => [b.key, b]));
  const blocks: DraftBlock[] = [];
  for (const b of mine.blocks) {
    const t = theirs.get(b.key);
    if (!touched.has(b.key)) {
      if (t) blocks.push(equivalent(b, t) ? { ...b, id: t.id } : t);
      else if (isNew(b.id)) blocks.push(b);
      continue;
    }
    if (t && b.kind === "list") {
      const old = base.get(b.key)?.items ?? [];
      if (t.items.length > old.length && startsWith(t.items, old)) {
        blocks.push({
          ...b, items: [...b.items, ...t.items.slice(old.length)],
          levels: [...levelsOf(b), ...levelsOf(t).slice(old.length)],
        });
        continue;
      }
    }
    blocks.push(b);
  }
  let pos = -1;
  for (const t of server.blocks) {
    const at = blocks.findIndex((b) => b.key === t.key);
    if (at >= 0) { pos = at; continue; }
    if (removed.has(t.id)) continue;
    blocks.splice(pos + 1, 0, t);
    pos += 1;
  }
  return {
    title: touched.has("title") || mine.title.trim() === server.title ? mine.title : server.title,
    date: touched.has("date") ? mine.date : server.date,
    time: touched.has("time") ? mine.time : server.time,
    blocks,
  };
}

export default function ScheduleCard({
  schedule, timeText, dateLabel, canEdit, canDelete, onChanged, onDeleted, footer,
}: {
  schedule: Schedule;
  timeText?: React.ReactNode;
  dateLabel?: string;
  canEdit: boolean;
  canDelete: boolean;
  onChanged: (s: Schedule) => void;
  onDeleted: (id: number) => void;
  footer?: React.ReactNode;
}) {
  const photos = schedule.files.filter(isImageFile);
  const docs = schedule.files.filter((f) => !isImageFile(f));
  const readBlocks = useMemo(() => withKeys(schedule.blocks ?? []), [schedule.blocks]);

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [savedAt, setSavedAt] = useState(schedule.updatedAt);
  const [shield, setShield] = useState<{ done: number; total: number } | null>(null);
  const uploadTotal = useRef(0);
  const shielding = shield !== null;
  const heavy = (shield?.total ?? 0) > 0;
  useLockBodyScroll(shielding);
  useEffect(() => {
    if (!shielding) return undefined;
    const swallow = (e: Event): void => { e.preventDefault(); e.stopPropagation(); };
    const opts: AddEventListenerOptions = { capture: true };
    document.addEventListener("beforeinput", swallow, opts);
    document.addEventListener("keydown", swallow, opts);
    document.addEventListener("paste", swallow, opts);
    return () => {
      document.removeEventListener("beforeinput", swallow, opts);
      document.removeEventListener("keydown", swallow, opts);
      document.removeEventListener("paste", swallow, opts);
    };
  }, [shielding]);
  useEffect(() => {
    if (!heavy) return undefined;
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    const had = document.activeElement as HTMLElement | null;
    had?.blur?.();
    return () => {
      root?.removeAttribute("inert");
      if (had?.isConnected && window.matchMedia("(hover: hover)").matches) had.focus({ preventScroll: true });
    };
  }, [heavy]);
  const [draft, setDraftState] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const setDraft = (d: Draft | null): void => { draftRef.current = d; setDraftState(d); };

  const touched = useRef(new Set<string>());
  const removed = useRef(new Set<string>());
  const base = useRef(new Map<string, DraftBlock>());
  const editVer = useRef(0);
  const savedVer = useRef(0);
  const lastEditAt = useRef(0);
  const dirtySince = useRef(0);
  const saving = useRef(false);
  const lastRefreshAt = useRef(0);
  const failedAt = useRef(0);
  const lastKey = useRef("");
  const baseUpdatedAt = useRef("");
  const latest = useRef({ schedule, onChanged });
  latest.current = { schedule, onChanged };

  const dirty = (): boolean => editVer.current !== savedVer.current;
  const markEdited = (): void => {
    const now = Date.now();
    if (!dirty()) dirtySince.current = now;
    editVer.current += 1;
    lastEditAt.current = now;
    setSaveState("saving");
  };

  const absorb = (s: Schedule): void => {
    baseUpdatedAt.current = s.updatedAt;
    const key = serverKeyOf(s);
    if (key === lastKey.current) return;
    lastKey.current = key;
    const d = draftRef.current;
    if (!d) return;
    const server = draftOf(s, d.blocks);
    setDraft(dirty() ? merge(server, d, touched.current, removed.current, base.current) : keepLocal(server, d));
    base.current = new Map(server.blocks.map((b) => [b.key, b]));
  };

  const enter = (): void => {
    const d = draftOf(schedule);
    touched.current.clear();
    removed.current.clear();
    base.current = new Map(d.blocks.map((b) => [b.key, b]));
    editVer.current = 0;
    savedVer.current = 0;
    failedAt.current = 0;
    lastRefreshAt.current = Date.now();
    lastKey.current = serverKeyOf(schedule);
    baseUpdatedAt.current = schedule.updatedAt;
    setSaveState("saved");
    setSavedAt(schedule.updatedAt);
    setDraft(d);
    setEditing(true);
  };

  const edit = (part: Partial<Head>): void => {
    const d = draftRef.current;
    if (!d) return;
    for (const k of HEAD_KEYS) if (part[k] !== undefined && part[k] !== d[k]) touched.current.add(k);
    markEdited();
    setDraft({ ...d, ...part });
  };

  const onBlocks = (next: DraftBlock[]): void => {
    const d = draftRef.current;
    if (!d) return;
    const prev = new Map(d.blocks.map((b) => [b.key, b]));
    for (const b of next) {
      const p = prev.get(b.key);
      if (!p || !sameBlock(p, b)) touched.current.add(b.key);
    }
    const kept = new Set(next.map((b) => b.key));
    for (const p of d.blocks) if (!kept.has(p.key) && !isNew(p.id)) removed.current.add(p.id);
    markEdited();
    setDraft({ ...d, blocks: next });
    if (countNewPhotos({ ...d, blocks: next }) > countNewPhotos(d)) void save();
  };

  const save = async (): Promise<boolean> => {
    const d = draftRef.current;
    if (!d || saving.current || !d.title.trim() || !d.date) return false;
    saving.current = true;
    const ver = editVer.current;
    const sent = d;
    const pending = countNewPhotos(sent);
    if (pending > 0 && !uploadTotal.current) uploadTotal.current = pending;
    setShield({ done: uploadTotal.current - pending, total: uploadTotal.current });
    try {
      const { payload, deferred } = await payloadOf(d, baseUpdatedAt.current);
      const saved = await api.updateSchedule(latest.current.schedule.id, payload);
      failedAt.current = 0;
      setSavedAt(saved.updatedAt);
      if (deferred.size === 0) { uploadTotal.current = 0; setShield(null); }
      else {
        setShield({ done: uploadTotal.current - deferred.size, total: uploadTotal.current });
        setTimeout(() => { if (!saving.current && draftRef.current && !sortingNow()) void save(); }, 0);
      }
      const cur = draftRef.current;
      if (cur) {
        const adopted = adoptIds(sent.blocks, saved.blocks ?? [], deferred);
        if (adopted.size > 0) setDraft({ ...cur, blocks: applyAdopted(cur.blocks, adopted) });
        const now = draftRef.current!;
        for (const k of HEAD_KEYS) if (now[k] === sent[k]) touched.current.delete(k);
        for (const b of sent.blocks) {
          const c = now.blocks.find((x) => x.key === b.key);
          if (c && sameBlock(c, b) && !b.photos.some((p) => deferred.has(p.id))) touched.current.delete(b.key);
        }
      }
      removed.current.clear();
      if (editVer.current === ver && deferred.size === 0) { savedVer.current = ver; setSaveState("saved"); }
      base.current = new Map(draftRef.current?.blocks.map((b) => [b.key, b]) ?? []);
      for (const b of sent.blocks) if (!base.current.has(b.key)) base.current.set(b.key, b);
      absorb(saved);
      latest.current.onChanged(saved);
      return true;
    } catch (e) {
      uploadTotal.current = 0;
      setShield(null);
      if (apiStatusOf(e) === 409) {
        try {
          const s = await api.getSchedule(latest.current.schedule.id);
          absorb(s);
          latest.current.onChanged(s);
        } catch { }
        return false;
      }
      if (!failedAt.current) showAlert(e instanceof Error ? e.message : "저장하지 못했어요. 잠시 뒤 다시 보내요.");
      failedAt.current = Date.now();
      setSaveState("failed");
      return false;
    } finally {
      saving.current = false;
    }
  };

  const refresh = async (): Promise<void> => {
    if (saving.current || dirty()) return;
    lastRefreshAt.current = Date.now();
    try {
      const s = await api.getSchedule(latest.current.schedule.id);
      if (!draftRef.current) return;
      absorb(s);
      latest.current.onChanged(s);
    } catch {
    }
  };

  const done = async (): Promise<void> => {
    const d = draftRef.current;
    if (!d) return;
    if (!d.title.trim() || !d.date) { showAlert("제목과 날짜는 비울 수 없어요."); return; }
    setBusy(true);
    while (saving.current) await new Promise((r) => { setTimeout(r, 60); });
    while (dirty()) { if (!(await save())) { setBusy(false); return; } }
    setBusy(false);
    setEditing(false);
    setDraft(null);
  };

  useEffect(() => { if (editing) absorb(schedule); }, [schedule, editing]);

  useEffect(() => {
    if (!editing) return undefined;
    const tick = (): void => {
      if (saving.current) return;
      const now = Date.now();
      if (dirty()) {
        if (failedAt.current && now - failedAt.current < RETRY_MS) return;
        if (typingNow() || sortingNow()) return;
        const rush = draftRef.current ? countNewPhotos(draftRef.current) > 0 : false;
        if (rush || now - lastEditAt.current >= SAVE_IDLE_MS || now - dirtySince.current >= SAVE_MAX_MS) void save();
      } else if (now - lastRefreshAt.current >= REFRESH_MS) {
        void refresh();
      }
    };
    const timer = window.setInterval(tick, 1000);
    const onVisibility = (): void => {
      if (document.hidden) { if (dirty() && !saving.current) void save(); } else lastRefreshAt.current = 0;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      const d = draftRef.current;
      if (d && dirty() && !saving.current && d.title.trim() && d.date) {
        void payloadOf(d, baseUpdatedAt.current)
          .then(({ payload }) => api.updateSchedule(latest.current.schedule.id, payload)).catch(() => {});
      }
    };
  }, [editing]);

  const head = draft ?? headOf(schedule);

  return (
    <ActivityCard
      dateLabel={dateLabel}
      icon={<CalendarDays size={16} aria-hidden />}
      label="일정"
      timeText={timeText}
      comment={footer}
    >
      <div className="scr-schedule-card">
        <ScheduleHead
          head={head} canEdit={canEdit} editing={editing} busy={busy} saveState={saveState} savedAt={savedAt}
          menu={<ScheduleActionsMenu schedule={schedule} canDelete={canDelete} onDeleted={onDeleted} />}
          onChange={edit} onToggle={() => { if (editing) void done(); else enter(); }}
        />

        {schedule.content && <p className="scr-schedule-content">{schedule.content}</p>}

        {schedule.linkUrl && (
          <a
            className="scr-schedule-link"
            href={schedule.linkUrl} target="_blank" rel="noreferrer noopener"
          >
            <ExternalLink size={13} aria-hidden />
            <span className="scr-schedule-link-text">{schedule.linkUrl}</span>
          </a>
        )}

        {docs.length > 0 && (
          <ul className="scr-schedule-files">
            {docs.map((f) => (
              <li key={f.url}>
                <a className="scr-schedule-file-link" href={imgSrc(f.url)} download={f.name} target="_blank" rel="noreferrer noopener">
                  <Paperclip size={13} aria-hidden />
                  <span className="scr-schedule-file-link-name">{f.name}</span>
                  <span className="scr-schedule-file-size">{formatBytes(f.size)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}

        {photos.length > 0 && <SchedulePhotos photos={photos} />}

        <ScheduleBlocks
          blocks={draft ? draft.blocks : readBlocks} canEdit={editing}
          onChange={onBlocks}
        />

        <div className="scr-schedule-by">— {schedule.createdBy.nickname}</div>
      </div>
      {shield && createPortal(
        <div className="scr-save-shield">
          <LoadingMark />
          {shield.total > 0 && <p className="scr-save-shield-text">{shield.done} / {shield.total}</p>}
        </div>,
        document.body,
      )}
    </ActivityCard>
  );
}
