import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";
import { useIsMobile } from "../../hooks/useIsMobile";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import KakaoShareButton from "../../components/common/KakaoShareButton";
import { type KakaoShareContent } from "../../utils/kakaoShare";
import { pad } from "../../utils/date";
import { LoadingMark } from "../../components/common/Feedback";
import { useLockBodyScroll } from "../../utils/bodyScrollLock";
import { readAsDataUrl } from "../../utils/image";
import { releaseKeyboardHold } from "../../utils/keyboardHold";
import { showAlert } from "../../components/common/AlertDialog";
import { isPhotoSet, type ScheduleBlock, type SchedulePhoto, type ScheduleBlockWrite } from "../../types";
import { FeedCard } from "../feed/FeedCard";
import ScheduleBlocks, { NEW_PREFIX, sortingNow, splitTitles, withKeys, type DraftBlock } from "./ScheduleBlocks";

/* ★ 블록 문서 카드(2026-10-26, 요청: "자유게시판 만들어줘 · 일정 폼 재사용(공통화)") — 일정 카드(ScheduleCard)의 늘 편집 상태 ·
   저장 단추 · 사진 올리기 가림막 · 요소 편집(ScheduleBlocks)을 여기로 옮겼다. 문서 종류마다 다른 것은
   머리 칸(제목 + 일시 · 꼭지 …) · 저장 꼴 · 서버 길 · 공유 · 지우기 글귀뿐이라 그것만 DocSpec 으로 받는다(글 PostCard).
   ★ 공동 편집은 걷었다(2026-10-26, 요청: "일정 공동편집 제거하고 다른 글들과 똑같이 취급") — 옛 일정은 누구나 고쳐 남의 고침을 8초마다 받아
   내 고침과 합쳤다(묻기 · 합치기 · 그새 바뀜 409). 글은 쓴 사람만 고치므로 서버 판은 늘 내 판이다 — 저장 응답만 받는다. */

/** 머리 칸 — 제목과 그 문서 종류의 글자 칸들(일정: date·time · 글: category). 값은 모두 글자. */
export type DocHead = { title: string; [key: string]: string };

export interface BlockDoc {
  id: number;
  title: string;
  blocks?: ScheduleBlock[];
  createdBy: { nickname: string };
  updatedAt: string;
}

export interface DocSpec<D extends BlockDoc, W> {
  /** 갓 만든 문서에 커서를 둘 때의 열쇠 머리(focusFirstLineOnOpen). */
  kind: string;
  icon: ReactNode;
  label: string;
  /** 머리 칸의 이름들 — 첫째는 늘 "title". */
  headKeys: readonly string[];
  headOf: (doc: D) => DocHead;
  /** 서버 판의 지문 — 같으면 다시 받은 판을 건너뛴다. */
  serverKeyOf: (doc: D) => string;
  /** 저장해도 되는 머리인가(제목 · 일정은 날짜까지). */
  ready: (head: DocHead) => boolean;
  writeOf: (head: DocHead, blocks: ScheduleBlockWrite[]) => W;
  update: (id: number, payload: W) => Promise<D>;
  remove: (id: number) => Promise<void>;
  share: (doc: D) => KakaoShareContent;
  toolsLabel: string;
  deleteTitle: string;
  deleteMessage: string;
  byline: (doc: D) => string;
  /** 제목 아래 한 줄(일정: 일시 · 글: 꼭지·공지). */
  HeadLine: (p: { doc: D; head: DocHead; editing: boolean; onChange: (part: Partial<DocHead>) => void }) => ReactNode;
  /** 도구 줄의 앞 단추(글: 운영자 공지). adopt 는 그 단추가 서버에서 받은 새 판을 카드에 싣는다. */
  extraTools?: (p: { doc: D; adopt: (saved: D) => void }) => ReactNode;
  /** 블록 앞에 그리는 옛 본문(일정의 옛 글·링크·첨부). */
  legacy?: (doc: D) => ReactNode;
  /** 아직 서버에 없는 새 문서(글쓰기 · 2026-10-26, 요청: "등록시 바로 등록폼으로 가고 제목과 분류같은거도 거기서 입력") —
   *  도구 줄(공유·삭제)을 걷고, 저장 단추는 등록 · 취소는 onDiscard(글쓰기를 떠난다) · 제목에 커서. */
  draft?: { saveLabel: string; onDiscard: () => void };
}

/* saved = 서버와 같음 · dirty = 저장 안 한 고침 · saving = 보내는 중 · failed = 보냈는데 실패. */
type SaveState = "saved" | "dirty" | "saving" | "failed";
const savedAtText = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return d.toDateString() === new Date().toDateString() ? time : `${d.getMonth() + 1}/${d.getDate()} ${time}`;
};

function DocHeadRow<D extends BlockDoc, W>({
  spec, doc, head, canEdit, editing, saveState, savedAt, menu, onChange, onSave, onDiscard,
}: {
  spec: DocSpec<D, W>;
  doc: D;
  head: DocHead;
  canEdit: boolean;
  editing: boolean;
  saveState: SaveState;
  savedAt: string;
  menu: ReactNode;
  onChange: (part: Partial<DocHead>) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const mobile = useIsMobile();
  const HeadLine = spec.HeadLine;
  const draft = spec.draft;
  return (
    <>
      <div className="scr-schedule-title-row">
        {editing ? (
          <input
            className="scr-schedule-title scr-sb-line" value={head.title} placeholder="제목"
            ref={draft ? focusTitle : undefined}
            onChange={(e) => onChange({ title: e.target.value })}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <h3 className="scr-schedule-title scr-sb-line">{head.title}</h3>
        )}
        {/* ★ 저장은 단추로(2026-10-20, 요청: "수정 시 저장 버튼 눌러야 서버에 반영") — 고친 게 있으면 [취소 | 저장], 없으면 마지막 저장 시각.
            취소는 저장 안 한 고침을 버리고 마지막 저장 판으로 돌아간다(옛 요청 "방금 전으로 되돌리기"의 몫).
            폰은 마지막 저장 시각을 안 띄운다(2026-10-23, 요청: "모바일에서 일정 마지막 저장 표시 X"). */}
        {canEdit && editing && (saveState === "saved" && !draft ? (mobile ? null : (
          <span className="scr-schedule-save-state" role="status" aria-live="polite">
            마지막 저장: {savedAtText(savedAt)}
          </span>
        )) : (
          <span className="scr-schedule-save-btns" role="group" aria-label="저장">
            {saveState === "failed" && <span className="scr-schedule-save-state scr-schedule-save-state-failed" role="status">저장 안 됨</span>}
            <button
              type="button" className="scr-compact-rect-btn is-secondary" disabled={saveState === "saving"}
              onClick={(e) => { e.stopPropagation(); if (draft) draft.onDiscard(); else onDiscard(); }}
            >
              취소
            </button>
            <button
              type="button" className="scr-compact-rect-btn" disabled={saveState === "saving" || (!!draft && !spec.ready(head))}
              onClick={(e) => { e.stopPropagation(); onSave(); }}
            >
              {saveState === "saving" ? "저장 중…" : draft?.saveLabel ?? "저장"}
            </button>
          </span>
        ))}
        {!draft && menu}
      </div>

      <div className="scr-schedule-when-line">
        <HeadLine doc={doc} head={head} editing={editing} onChange={onChange} />
      </div>
    </>
  );
}

/** 글쓰기 제목 칸 — 그려지자마자 커서를 둔다(2026-10-26, 요청: "글쓰기 누르면 자동으로 제목에 커서 포커스").
 *  글쓰기 단추가 누름 안에서 붙든 자판(utils/keyboardHold)을 넘겨받고 임시 칸을 걷는다. */
function focusTitle(el: HTMLInputElement | null): void {
  if (!el || document.activeElement === el) return;
  el.focus();
  releaseKeyboardHold();
}

/* 문서 도구 — 늘 보이는 단추 줄(2026-10-22, 요청: "케밥 메뉴 쓰는 곳을 전부 항시 노출 버튼 툴박스로") · 옛 ⋯ 메뉴(공유 · 삭제)를 펼친 꼴. */
function DocTools<D extends BlockDoc, W>({ spec, doc, canDelete, onDeleted, adopt }: {
  spec: DocSpec<D, W>;
  doc: D;
  canDelete: boolean;
  onDeleted: (id: number) => void;
  adopt: (saved: D) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setErr(null);
    try {
      await spec.remove(doc.id);
      onDeleted(doc.id);
      setConfirmOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scr-tools scr-schedule-menu" role="toolbar" aria-label={spec.toolsLabel} onClick={(e) => e.stopPropagation()}>
      {spec.extraTools?.({ doc, adopt })}
      <KakaoShareButton className="scr-tools-btn" icon="share" label="공유" content={() => spec.share(doc)} />
      {canDelete && (
        <button
          type="button" className="scr-icon-btn scr-tools-btn is-danger" title="삭제" aria-label="삭제"
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 size={15} />
        </button>
      )}
      {confirmOpen && (
        <ConfirmDialog
          title={spec.deleteTitle}
          message={spec.deleteMessage}
          confirmLabel={busy ? "삭제 중..." : "삭제"}
          error={err}
          onConfirm={() => void remove()}
          onCancel={() => { setConfirmOpen(false); setErr(null); }}
        />
      )}
    </div>
  );
}

type Draft = { head: DocHead; blocks: DraftBlock[] };

const draftOf = <D extends BlockDoc, W>(spec: DocSpec<D, W>, s: D, prev: DraftBlock[] = []): Draft => {
  const keyOf = new Map(prev.map((b) => [b.id, b.key]));
  return { head: spec.headOf(s), blocks: splitTitles(s.blocks ?? []).map((b) => ({ ...b, key: keyOf.get(b.id) ?? b.id })) };
};
const levelsOf = (b: ScheduleBlock): number[] => b.items.map((_, i) => b.levels?.[i] ?? 0);
const sameBlock = (a: ScheduleBlock, b: ScheduleBlock): boolean =>
  a.kind === b.kind && a.text === b.text && a.title === b.title && a.url === b.url
  && a.items.length === b.items.length && a.items.every((x, i) => x === b.items[i])
  && a.photos.length === b.photos.length && a.photos.every((x, i) => x.id === b.photos[i].id)
  && !!a.collapsed === !!b.collapsed && (a.indent ?? 0) === (b.indent ?? 0)
  && levelsOf(a).every((x, i) => x === levelsOf(b)[i]);
const normBlock = (b: ScheduleBlock): ScheduleBlock => {
  const lv = levelsOf(b);
  const kept = b.items.map((x, i) => [x.trim(), lv[i]] as const).filter(([x]) => x);
  return {
    ...b, text: b.text.trim(), title: b.title.trim(),
    items: kept.map(([x]) => x), levels: kept.map(([, n]) => n),
  };
};
const isEphemeral = (b: ScheduleBlock): boolean =>
  (b.kind === "text" && !b.text.trim() && !b.title.trim()) || (b.kind === "list" && !b.title.trim() && !b.items.some((x) => x.trim()))
  || (isPhotoSet(b) && b.photos.length === 0);
const isNew = (id: string): boolean => id.startsWith(NEW_PREFIX);

/** 저장될 내용의 지문 — 키(화면용)는 빼고 서버가 남기는 꼴로 줄인다. 마지막 저장본과 같으면 저장을 건너뛴다(요청: "자동 저장은 변경이 있을 때만"). */
const snapOf = (keys: readonly string[], d: Draft): string => JSON.stringify([
  ...keys.map((k) => (k === "title" ? d.head.title.trim() : d.head[k] || "")),
  d.blocks.filter((b) => !isEphemeral(b)).map((b) => {
    const n = normBlock(b);
    const lv = n.levels ?? [];
    return [n.kind, isNew(n.id) ? "new" : n.id, n.title, n.text, n.items, lv.some((x) => x) ? lv : [],
      n.photos.map((p) => p.id), !!n.collapsed, n.indent ?? 0, n.kind === "photo" || n.kind === "file" ? n.name : ""];
  }),
]);

const countNewPhotos = (d: Draft): number =>
  d.blocks.reduce((n, b) => n + (isPhotoSet(b) ? b.photos.filter((p) => isNew(p.id)).length : 0), 0);
const PHOTO_BATCH_BYTES = 12_000_000;

async function blocksPayloadOf(d: Draft): Promise<{ blocks: ScheduleBlockWrite[]; deferred: Set<string> }> {
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
    if (b.kind === "photos" || b.kind === "slides") {
      const photos: Extract<ScheduleBlockWrite, { kind: "photos" | "slides" }>["photos"] = [];
      for (const p of b.photos) {
        if (!isNew(p.id)) { photos.push({ id: p.id }); continue; }
        if (bytes > 0 && bytes + p.size > PHOTO_BATCH_BYTES) { deferred.add(p.id); continue; }
        bytes += p.size;
        photos.push({ file: { name: p.name, data: p.file ? await readAsDataUrl(p.file) : p.url } });
      }
      blocks.push({ kind: b.kind, id: b.id, title: b.title, photos, collapsed, indent });
      continue;
    }
    blocks.push(isNew(b.id) ? { kind: b.kind, file: { name: b.name, data: b.url }, collapsed, indent } : { kind: b.kind, id: b.id, collapsed, indent });
  }
  return { blocks, deferred };
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
        : b.kind === "list" || isPhotoSet(b) ? s.title === b.title.trim()
          : s.name === b.name)
      : b.id === s.id);
    if (!fits) continue;
    const a: Adopted = {};
    if (b.id !== s.id) a.id = s.id;
    if (isPhotoSet(b)) {
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
    if (isPhotoSet(b)) {
      const sp = new Map(sb.photos.map((p) => [p.id, p]));
      let hit = false;
      const photos = b.photos.map((p) => {
        const q = sp.get(p.id);
        if (!q || (!p.file && p.url === q.url && (p.thumbUrl ?? null) === (q.thumbUrl ?? null))) return p;
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

export type BlockDocCardProps<D extends BlockDoc, W> = {
  spec: DocSpec<D, W>;
  doc: D;
  timeText?: ReactNode;
  dateLabel?: string;
  canEdit: boolean;
  canDelete: boolean;
  onDeleted: (id: number) => void;
  footer?: ReactNode;
};

/* 갓 등록한 문서 — 상세가 열리면 첫 글 줄을 만들어 커서를 둔다(2026-10-20, 요청: "등록하면 바로 상세 편집으로" → "커서 포커싱까지").
   등록 창(GamesScreen)이 상세로 가기 전에 그 문서의 열쇠(종류:id)를 적어 두고, 카드가 편집 상태가 되는 순간 한 번 쓰고 지운다. */
let focusFirstLineOf: string | null = null;
export function focusFirstLineOnOpen(kind: string, id: number): void { focusFirstLineOf = `${kind}:${id}`; }

/* ★ 카드는 memo — 제 문서·권한·날짜 글자가 바뀔 때만 다시 그린다(요청: "요소 접기·펼치기도 전체 다시 그리는 등의 이유로 느린지 확인").
   손잡이(onDeleted)는 늘 새로 오지만 안에서 최신 것을 쓰고, footer 는 문서 id 로만 갈린다. spec 은 모듈 상수다.
   카드 안 저장은 목록에 알리지 않는다(요청: "목록은 신경쓰지말고 목록에서 상세 들어갈때마다 새로 받아야지") — 상세는 들어갈 때마다 서버에서 받는다(PostDetailPage ★). */
const BlockDocCard = memo(BlockDocCardInner, (a, b) => (
  a.doc === b.doc && a.spec === b.spec && a.canEdit === b.canEdit && a.canDelete === b.canDelete
  && a.dateLabel === b.dateLabel && a.timeText === b.timeText
)) as <D extends BlockDoc, W>(p: BlockDocCardProps<D, W>) => ReactNode;
export default BlockDocCard;

function BlockDocCardInner<D extends BlockDoc, W>({
  spec, doc: given, timeText, dateLabel, canEdit, canDelete, onDeleted, footer,
}: BlockDocCardProps<D, W>) {
  const keys = spec.headKeys;
  /* 도구 단추(글의 공지)가 받은 새 판 — 부모가 새 판을 주면 그것을 따른다. */
  const [taken, setTaken] = useState<D | null>(null);
  useEffect(() => { setTaken(null); }, [given]);
  const doc = taken ?? given;
  const readBlocks = useMemo(() => withKeys(doc.blocks ?? []), [doc.blocks]);

  const [editing, setEditing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [savedAt, setSavedAt] = useState(doc.updatedAt);
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

  const editVer = useRef(0);
  const savedSnap = useRef("");
  const savedVer = useRef(0);
  const saving = useRef(false);
  const lastKey = useRef("");
  /* 내가 저장해 만든 판(서버 updatedAt) — 저장 응답으로 돌아온 판이면 화면의 글·차례는 그대로 두고 비교 기준만 맞춘다
     (서버 꼴로 갈아 끼우면 커서·저장 중 고침이 흔들린다). */
  const mineAt = useRef("");
  const lastServer = useRef<D | null>(null);
  const latest = useRef({ doc });
  latest.current = { doc };
  const latestDeleted = useRef(onDeleted);
  latestDeleted.current = onDeleted;

  const dirty = (): boolean => editVer.current !== savedVer.current;
  /* 저장 단추를 띄울 고침(글·차례·사진…)이 저장 전인가 — 접기·펴기만 바뀐 것은 여기에 안 든다(조용히 곧바로 저장 · 아래 onSaveNow). */
  const contentDirty = useRef(false);
  /* 접기·펴기 저장이 다른 저장이 오가는 도중에 들어오면 그 저장이 끝난 뒤 한 번 더 보낸다(2026-10-20, 지적: "폰에서 접기 펼치기 누르면
     나타났다 사라졌어 · 펼치기 동작은 무시됐고" — 접은 저장이 가는 동안 편 것은 저장되지 않았다). */
  const foldQueued = useRef(false);
  const markEdited = (content = true): void => {
    editVer.current += 1;
    if (content) { contentDirty.current = true; setSaveState("dirty"); }
  };
  /* 저장 단추는 서버에 보낼 꼴(snapOf)이 마지막 저장과 달라졌을 때만 — 빈 곳을 눌러 생긴 빈 줄·쳤다 지운 글처럼 보낼 것이 같으면 띄우지 않는다. */
  const markContent = (next: Draft): void => {
    editVer.current += 1;
    contentDirty.current = snapOf(keys, next) !== savedSnap.current;
    setSaveState(contentDirty.current ? "dirty" : "saved");
  };

  const absorb = (s: D): void => {
    lastServer.current = s;
    const key = spec.serverKeyOf(s);
    if (key === lastKey.current) return;
    lastKey.current = key;
    const d = draftRef.current;
    if (!d) return;
    const server = draftOf(spec, s, d.blocks);
    if (!!mineAt.current && s.updatedAt === mineAt.current) {
      const media = adoptServerMedia(d, server);
      if (media) setDraft(media);
    } else if (!dirty()) setDraft(server);   // 다른 창(같은 사람)에서 고친 판 — 손에 든 고침이 없을 때만 갈아 끼운다
    savedSnap.current = snapOf(keys, server);
  };

  /** 도구 단추가 서버에서 받은 새 판 — 내가 만든 판이니 화면의 고침은 그대로 두고 기준만 맞춘다. */
  const adopt = (saved: D): void => {
    mineAt.current = saved.updatedAt;
    setTaken(saved);
    if (draftRef.current) absorb(saved);
  };

  const enter = (from: D = doc): void => {
    lastServer.current = from;
    const d = draftOf(spec, from);
    savedSnap.current = snapOf(keys, d);
    editVer.current = 0;
    savedVer.current = 0;
    contentDirty.current = false;
    foldQueued.current = false;
    lastKey.current = spec.serverKeyOf(from);
    setSaveState("saved");
    setSavedAt(from.updatedAt);
    setDraft(d);
    setEditing(true);
  };
  /* 취소 — 저장 안 한 고침을 버리고 마지막으로 받은 서버 판으로 돌아간다. */
  const discard = (): void => {
    if (saving.current) return;
    enter(lastServer.current ?? doc);
  };

  const edit = (part: Partial<DocHead>): void => {
    const d = draftRef.current;
    if (!d) return;
    const changed = keys.some((k) => part[k] !== undefined && part[k] !== d.head[k]);
    const next = { ...d, head: { ...d.head, ...part } as DocHead };
    if (changed) markContent(next);
    setDraft(next);
  };

  const onBlocks = (next: DraftBlock[]): void => {
    const d = draftRef.current;
    if (!d) return;
    const prev = new Map(d.blocks.map((b) => [b.key, b]));
    const changed = next.length !== d.blocks.length || next.some((b, i) => b.key !== d.blocks[i].key)
      || next.some((b) => { const p = prev.get(b.key); return !p || !sameBlock(p, b); });
    // 접기·펴기만 바뀌었나(같은 차례 · 접힘 말고는 같음) — 그러면 저장 단추를 안 띄운다.
    const foldOnly = next.length === d.blocks.length && next.every((b, i) => {
      const p = d.blocks[i];
      return p.key === b.key && sameBlock({ ...p, collapsed: b.collapsed }, b);
    });
    if (changed) { if (foldOnly) markEdited(false); else markContent({ ...d, blocks: next }); }
    setDraft({ ...d, blocks: next });
  };

  const save = async (quiet = false): Promise<boolean> => {
    const d = draftRef.current;
    if (!d || saving.current || !spec.ready(d.head)) return false;
    if (snapOf(keys, d) === savedSnap.current) {
      savedVer.current = editVer.current;
      contentDirty.current = false;
      setSaveState("saved");
      return true;
    }
    saving.current = true;
    if (!quiet) setSaveState("saving");
    const ver = editVer.current;
    const sent = d;
    const pending = countNewPhotos(sent);
    if (pending > 0 && !uploadTotal.current) uploadTotal.current = pending;
    /* 가림막(화면 어둡게 · 입력 막기)은 사진을 올릴 때만(2026-10-18, 지적: "접기·펴기가 왜 이렇게 딜레이가 있어 보이지") — 여태는 글 한 자·
       접기 하나를 저장할 때도 응답이 올 때까지 화면 전체를 덮고 입력을 삼켜 고침이 늦게 먹는 것처럼 보였다. 저장 중 고침은 editVer 로 따로 챙긴다. */
    if (uploadTotal.current > 0) setShield({ done: uploadTotal.current - pending, total: uploadTotal.current });
    try {
      const { blocks, deferred } = await blocksPayloadOf(d);
      const saved = await spec.update(latest.current.doc.id, spec.writeOf(d.head, blocks));
      mineAt.current = saved.updatedAt;
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
      }
      if (editVer.current === ver && deferred.size === 0) {
        savedVer.current = ver;
        contentDirty.current = false;
        setSaveState("saved");
      } else if (deferred.size === 0) setSaveState(contentDirty.current ? "dirty" : "saved");
      absorb(saved);
      return true;
    } catch (e) {
      uploadTotal.current = 0;
      setShield(null);
      showAlert(e instanceof Error ? e.message : "저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
      setSaveState("failed");
      return false;
    } finally {
      saving.current = false;
      if (foldQueued.current) {
        foldQueued.current = false;
        if (dirty() && !contentDirty.current) setTimeout(() => { void save(true); }, 0);
      }
    }
  };

  /* 편집 모드는 따로 없다(2026-10-18, 요청: "편집 모드 없이 항상 편집 모드로") — 고칠 수 있는 사람에게는 카드가 늘 편집 상태다.
     저장은 단추로만(2026-10-20 · 위 DocHeadRow ★) — 옛 자동 저장(쉼 2초 · 최대 15초 · 사진 넣자마자 · 화면 숨김·떠날 때)은 걷었다. */
  useEffect(() => { if (canEdit && !editing) enter(); }, [canEdit]);
  useEffect(() => {
    if (!editing || focusFirstLineOf !== `${spec.kind}:${doc.id}`) return;
    focusFirstLineOf = null;
    if ((draftRef.current?.blocks.length ?? 0) > 0) return;
    requestAnimationFrame(() => cardRef.current?.querySelector<HTMLElement>(".scr-sb-composer")?.click());
  }, [editing]);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { if (editing) absorb(given); }, [given, editing]);

  useEffect(() => {
    if (!editing) return undefined;
    // 저장 안 한 고침이 있는데 창을 닫거나 새로 고치면 브라우저가 묻는다.
    const onLeave = (e: BeforeUnloadEvent): void => { if (contentDirty.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [editing]);

  const head = draft?.head ?? spec.headOf(doc);

  return (
    <FeedCard
      dateLabel={dateLabel}
      icon={spec.icon}
      label={spec.label}
      timeText={timeText}
      comment={footer}
    >
      {/* ★ 본문이 빈 문서(갓 만든 문서)는 카드의 빈 곳 어디를 눌러도 첫 글 줄이 생기고 그 맨 앞에 커서가 선다(2026-10-20, 요청: "처음 일정
          만들고 글쓰기할 때 아무 데나 클릭해도 커서가 생겨야 해 · 당연히 처음 위치에") — 글쓰기 칸(.scr-sb-composer)을 대신 누른다(누름 안에서
          불러야 폰 자판이 뜬다). 제목·머리 줄·메뉴·저장처럼 제 일이 있는 것을 누른 때는 건드리지 않는다. */}
      <div
        className="scr-schedule-card" ref={cardRef}
        onClick={(e) => {
          if (!editing || !draftRef.current || draftRef.current.blocks.length > 0) return;
          if ((e.target as Element).closest("button, a, input, textarea, select, label, [role=button], [role=menu], [role=dialog], .scr-sb-item")) return;
          cardRef.current?.querySelector<HTMLElement>(".scr-sb-composer")?.click();
        }}
      >
        <DocHeadRow
          spec={spec} doc={doc} head={head} canEdit={canEdit} editing={editing} saveState={saveState} savedAt={savedAt}
          onSave={() => { void save(); }} onDiscard={discard}
          menu={<DocTools spec={spec} doc={doc} canDelete={canDelete} onDeleted={(id) => latestDeleted.current(id)} adopt={adopt} />}
          onChange={edit}
        />

        {spec.legacy?.(doc)}

        <ScheduleBlocks
          blocks={draft ? draft.blocks : readBlocks} canEdit={editing}
          onSaveNow={() => {
            /* 접기·펴기는 보는 사람도 하는 일이라 그것만 바뀐 때는 조용히 곧바로 저장한다(저장 단추를 안 띄운다). 다른 고침이 저장
               전이면 접기도 그 고침과 함께 저장 단추로 간다. 다른 저장이 오가는 중이면 끝난 뒤 이어 보낸다. 화면이 먼저 그려진 다음에 보낸다. */
            if (contentDirty.current) return;
            if (saving.current) { foldQueued.current = true; return; }
            requestAnimationFrame(() => setTimeout(() => {
              if (saving.current) foldQueued.current = true;
              else void save(true);
            }, 0));
          }}
          onChange={onBlocks}
        />

        {/* 누가 올렸는지 또렷이(2026-10-20, 요청: "등록자도 누구 등록으로 명확하게") — 옛 "— 정구".
            글쓰기(아직 없는 글)에는 안 띄운다(2026-10-26, 요청: "이건 없어도 됨 누구 작성" — 쓰는 사람이 저다). */}
        {!spec.draft && <div className="scr-schedule-by">{spec.byline(doc)}</div>}
      </div>
      {shield && createPortal(
        <div className="scr-save-shield">
          <LoadingMark />
          {shield.total > 0 && <p className="scr-save-shield-text">{shield.done} / {shield.total}</p>}
        </div>,
        document.body,
      )}
    </FeedCard>
  );
}
