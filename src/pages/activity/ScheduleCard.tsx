import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import ScheduleBlocks, { NEW_PREFIX, sortingNow, splitTitles, withKeys, type DraftBlock } from "./ScheduleBlocks";
import { imgSrc } from "../../utils/imgSrc";

function whenTextOf(date: string, time: string | null): string {
  const day = formatWhen(date);
  return time ? `${day} ${time}` : day;
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
  head, canEdit, editing, saveState, savedAt, menu, onChange,
}: {
  head: Head;
  canEdit: boolean;
  editing: boolean;
  saveState: SaveState;
  savedAt: string;
  menu: ReactNode;
  onChange: (part: Partial<Head>) => void;
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
/* 남의 고침을 묻는 간격 4 → 8초(2026-10-18, 지적: "드래그 앤 드롭도 너무 느려 · 서버에서 계속 갱신해서 조회하는 거 때문인가") —
   보이는 카드마다 4초마다 받아 와 목록 전체를 다시 그렸다. 이제 바뀐 게 없으면 아무것도 안 하고, 끌거나 치는 동안은 묻지 않는다. */
const REFRESH_MS = 8000;
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
  return { ...headOf(s), blocks: splitTitles(s.blocks ?? []).map((b) => ({ ...b, key: keyOf.get(b.id) ?? b.id })) };
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
  (b.kind === "text" && !b.text.trim() && !b.title.trim()) || (b.kind === "list" && !b.title.trim() && !b.items.some((x) => x.trim()))
  || (b.kind === "photos" && b.photos.length === 0);
const isNew = (id: string): boolean => id.startsWith(NEW_PREFIX);

/** 저장될 내용의 지문 — 키(화면용)는 빼고 서버가 남기는 꼴로 줄인다. 마지막 저장본과 같으면 자동 저장을 건너뛴다(요청: "자동 저장은 변경이 있을 때만"). */
const snapOf = (d: Draft): string => JSON.stringify([
  d.title.trim(), d.date, d.time || "",
  d.blocks.filter((b) => !isEphemeral(b)).map((b) => {
    const n = normBlock(b);
    const lv = n.levels ?? [];
    return [n.kind, isNew(n.id) ? "new" : n.id, n.title, n.text, n.items, lv.some((x) => x) ? lv : [],
      n.photos.map((p) => p.id), !!n.collapsed, n.indent ?? 0, n.kind === "photo" || n.kind === "file" ? n.name : ""];
  }),
]);

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

/** 내 판을 받을 때 — 글·차례는 손대지 않고, 막 올린 사진·파일만 서버 주소(썸네일)로 바꿔 손에 든 File 을 놓는다. 바뀐 게 없으면 null. */
function adoptServerMedia(mine: Draft, server: Draft): Draft | null {
  const byId = new Map(server.blocks.map((b) => [b.id, b]));
  let changed = false;
  const blocks = mine.blocks.map((b) => {
    const sb = byId.get(b.id);
    if (!sb || sb.kind !== b.kind) return b;
    if (b.kind === "photos") {
      const sp = new Map(sb.photos.map((p) => [p.id, p]));
      let hit = false;
      const photos = b.photos.map((p) => {
        const q = sp.get(p.id);
        if (!q || (!p.file && p.url === q.url)) return p;
        hit = true;
        return q;
      });
      if (!hit) return b;
      changed = true;
      return { ...b, photos };
    }
    if ((b.kind === "photo" || b.kind === "file") && b.url !== sb.url) {
      changed = true;
      return { ...b, url: sb.url, name: sb.name, size: sb.size };
    }
    return b;
  });
  return changed ? { ...mine, blocks } : null;
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

type ScheduleCardProps = {
  schedule: Schedule;
  timeText?: React.ReactNode;
  dateLabel?: string;
  canEdit: boolean;
  canDelete: boolean;
  onChanged: (s: Schedule) => void;
  onDeleted: (id: number) => void;
  footer?: React.ReactNode;
};

/* ★ 카드는 memo — 일정 하나를 저장(접기 하나라도)하면 활동 목록이 그 일정을 갈아 끼우며 목록 전체를 다시 그리는데, 여태는 화면의 일정 카드가
   전부 요소까지 통째로 다시 그려졌다(요청: "요소 접기·펼치기도 전체 다시 그리는 등의 이유로 느린지 확인"). 제 일정·권한·날짜 글자가 바뀔 때만
   다시 그린다 — 손잡이(onChanged·onDeleted)는 늘 새로 오지만 안에서 최신 것을 쓰고, footer 는 일정 id 로만 갈린다. */
const ScheduleCard = memo(ScheduleCardInner, (a, b) => (
  a.schedule === b.schedule && a.canEdit === b.canEdit && a.canDelete === b.canDelete
  && a.dateLabel === b.dateLabel && a.timeText === b.timeText
));
export default ScheduleCard;

function ScheduleCardInner({
  schedule, timeText, dateLabel, canEdit, canDelete, onChanged, onDeleted, footer,
}: ScheduleCardProps) {
  const photos = schedule.files.filter(isImageFile);
  const docs = schedule.files.filter((f) => !isImageFile(f));
  const readBlocks = useMemo(() => withKeys(schedule.blocks ?? []), [schedule.blocks]);

  const [editing, setEditing] = useState(false);
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
  const savedSnap = useRef("");
  const savedVer = useRef(0);
  const lastEditAt = useRef(0);
  const dirtySince = useRef(0);
  const saving = useRef(false);
  const lastRefreshAt = useRef(0);
  const failedAt = useRef(0);
  const lastKey = useRef("");
  const baseUpdatedAt = useRef("");
  /* ★ 내가 저장해 만든 판(서버 updatedAt)을 기억한다(요청: "일정 저장 버전을 만들어서 내가 수정한 버전이면 업데이트 안 하게") —
     저장 응답이나 다시 묻기(refresh)로 돌아온 판이 이 값이면 내 판이니, 비교 기준(lastKey·base)만 맞추고 화면의 글·차례는
     그대로 둔다. 여태는 내 저장도 서버 꼴로 다시 갈아 끼워 커서·고침이 흔들렸다. 남이 고쳐 판이 바뀐 때만 받아 합친다. */
  const mineAt = useRef("");
  const latest = useRef({ schedule, onChanged });
  latest.current = { schedule, onChanged };
  const latestDeleted = useRef(onDeleted);
  latestDeleted.current = onDeleted;

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
    const own = !!mineAt.current && s.updatedAt === mineAt.current;
    if (!own) setDraft(dirty() ? merge(server, d, touched.current, removed.current, base.current) : keepLocal(server, d));
    else {
      const media = adoptServerMedia(d, server);
      if (media) setDraft(media);
    }
    base.current = new Map(server.blocks.map((b) => [b.key, b]));
    savedSnap.current = snapOf(server);
  };

  const enter = (): void => {
    const d = draftOf(schedule);
    savedSnap.current = snapOf(d);
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
    let changed = false;
    for (const k of HEAD_KEYS) if (part[k] !== undefined && part[k] !== d[k]) { touched.current.add(k); changed = true; }
    if (changed) markEdited();
    setDraft({ ...d, ...part });
  };

  const onBlocks = (next: DraftBlock[]): void => {
    const d = draftRef.current;
    if (!d) return;
    const prev = new Map(d.blocks.map((b) => [b.key, b]));
    let changed = next.length !== d.blocks.length || next.some((b, i) => b.key !== d.blocks[i].key);
    for (const b of next) {
      const p = prev.get(b.key);
      if (!p || !sameBlock(p, b)) { touched.current.add(b.key); changed = true; }
    }
    const kept = new Set(next.map((b) => b.key));
    for (const p of d.blocks) if (!kept.has(p.key) && !isNew(p.id)) removed.current.add(p.id);
    if (changed) markEdited();
    setDraft({ ...d, blocks: next });
    if (countNewPhotos({ ...d, blocks: next }) > countNewPhotos(d)) void save();
  };

  const save = async (): Promise<boolean> => {
    const d = draftRef.current;
    if (!d || saving.current || !d.title.trim() || !d.date) return false;
    if (snapOf(d) === savedSnap.current) {
      savedVer.current = editVer.current;
      setSaveState("saved");
      return true;
    }
    saving.current = true;
    const ver = editVer.current;
    const sent = d;
    const pending = countNewPhotos(sent);
    if (pending > 0 && !uploadTotal.current) uploadTotal.current = pending;
    /* 가림막(화면 어둡게 · 입력 막기)은 사진을 올릴 때만(2026-10-18, 지적: "접기·펴기가 왜 이렇게 딜레이가 있어 보이지") — 여태는 글 한 자·
       접기 하나를 저장할 때도 응답이 올 때까지 화면 전체를 덮고 입력을 삼켜 고침이 늦게 먹는 것처럼 보였다. 저장 중 고침은 editVer 로 따로 챙긴다. */
    if (uploadTotal.current > 0) setShield({ done: uploadTotal.current - pending, total: uploadTotal.current });
    try {
      const { payload, deferred } = await payloadOf(d, baseUpdatedAt.current);
      const saved = await api.updateSchedule(latest.current.schedule.id, payload);
      mineAt.current = saved.updatedAt;
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
    if (saving.current || dirty() || sortingNow() || typingNow()) return;
    lastRefreshAt.current = Date.now();
    try {
      const s = await api.getSchedule(latest.current.schedule.id);
      if (!draftRef.current || sortingNow()) return;
      // 같은 내용이거나 내가 저장한 그 판이면 끝 — 위(활동 목록)에 알리면 목록의 카드가 전부 다시 그려진다.
      if (serverKeyOf(s) === lastKey.current || s.updatedAt === mineAt.current) {
        baseUpdatedAt.current = s.updatedAt;
        lastKey.current = serverKeyOf(s);
        return;
      }
      absorb(s);
      latest.current.onChanged(s);
    } catch {
    }
  };

  /* 편집 모드는 따로 없다(2026-10-18, 요청: "편집 모드 없이 항상 편집 모드로") — 고칠 수 있는 사람에게는 카드가 늘 편집 상태다.
     저장은 그대로 자동(바뀐 것이 있을 때만)이다. */
  useEffect(() => { if (canEdit && !editing) enter(); }, [canEdit]);
  /* 늘 편집 상태라 목록의 카드마다 남의 고침을 4초마다 물어 왔다 — 화면에 보이는 카드만 묻는다. 저장은 보이든 말든 한다. */
  const cardRef = useRef<HTMLDivElement | null>(null);
  const onScreen = useRef(false);
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { onScreen.current = true; return undefined; }
    const io = new IntersectionObserver(([en]) => { onScreen.current = !!en?.isIntersecting; });
    io.observe(el);
    return () => io.disconnect();
  }, []);

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
      } else if (onScreen.current && now - lastRefreshAt.current >= REFRESH_MS) {
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
      <div className="scr-schedule-card" ref={cardRef}>
        <ScheduleHead
          head={head} canEdit={canEdit} editing={editing} saveState={saveState} savedAt={savedAt}
          menu={<ScheduleActionsMenu schedule={schedule} canDelete={canDelete} onDeleted={(id) => latestDeleted.current(id)} />}
          onChange={edit}
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
          onSaveNow={() => {
            // 화면이 먼저 그려진 다음에 보낸다 — 저장 준비(지문·본문 만들기)가 그 프레임을 붙잡지 않게.
            requestAnimationFrame(() => setTimeout(() => { if (!saving.current) void save(); }, 0));
          }}
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
