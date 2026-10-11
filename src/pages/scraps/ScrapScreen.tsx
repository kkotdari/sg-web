import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { navigateTo, wasPushed } from "../../utils/route";
import { createPortal } from "react-dom";
import { Pencil, Trash2, ArrowLeft } from "lucide-react";
import { api } from "../../api/client";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { RowCheck, SelectionBar } from "../../components/common/Selection";
import { showToast } from "../../components/common/Toast";
import { useSelection } from "../../hooks/useSelection";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useLongPress } from "../../hooks/useLongPress";
import { batchSummary, runBatch } from "../../utils/batch";
import { cx } from "../../utils/format";
import KakaoShareButton from "../../components/common/KakaoShareButton";
import { shareThumb } from "../../utils/kakaoShare";
import { formatWhen } from "../../utils/date";
import type { KakaoShareContent } from "../../utils/kakaoShare";
import type { SceneScrap } from "../../types";

const ERASE_FORMS = { did: "지웠어요", couldNot: "지우지 못했어요" };

export default function ScrapScreen() {
  const [items, setItems] = useState<SceneScrap[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<SceneScrap | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const editRef = useRef<HTMLInputElement | null>(null);
  const [confirmDel, setConfirmDel] = useState<SceneScrap | null>(null);
  const sel = useSelection();
  const isMobile = useIsMobile();
  const selClear = sel.clear;
  const pickedRows = items ? items.filter((r) => sel.picked.has(String(r.id))) : [];
  const [bulkConfirm, setBulkConfirm] = useState<SceneScrap[] | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkErr, setBulkErr] = useState<string | null>(null);
  const runBulkDelete = async (targets: SceneScrap[]) => {
    setBulkErr(null);
    setBulkProgress({ done: 0, total: targets.length });
    const { done, failed } = await runBatch(targets, (r) => api.deleteSceneScrap(r.id), {
      onProgress: (n) => setBulkProgress({ done: n, total: targets.length }),
    });
    const doneIds = new Set(done.map((r) => r.id));
    if (doneIds.size > 0) setItems((prev) => (prev ? prev.filter((r) => !doneIds.has(r.id)) : prev));
    setBulkProgress(null);
    if (failed.length > 0 && done.length === 0) {
      setBulkErr(batchSummary("지우기", 0, failed.length, "개", ERASE_FORMS));
      return;
    }
    setBulkConfirm(null);
    selClear();
    showToast(batchSummary("지우기", done.length, failed.length, "개", ERASE_FORMS), { kind: failed.length > 0 ? "warn" : "ok" });
  };

  const load = useCallback(() => {
    let dead = false;
    api.listSceneScraps()
      .then((rows) => { if (!dead) { setItems(rows); setErr(null); } })
      .catch(() => { if (!dead) { setItems([]); setErr("목록을 불러오지 못했어요."); } });
    return () => { dead = true; };
  }, []);
  useEffect(() => load(), [load]);
  useEffect(() => {
    if (!edit) return undefined;
    const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") setEdit(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edit]);

  const shareOf = (row: SceneScrap): KakaoShareContent => ({
    title: row.title,
    description: row.subtitle || undefined,
    ...shareThumb("gameResult"),
    link: `${window.location.origin}${row.link}`,
    fallbackText: `[스타게이트 게임결과]\n${row.title}${row.subtitle ? `\n${row.subtitle}` : ""}`,
  });

  const open = (row: SceneScrap): void => {
    window.location.href = `${window.location.origin}${row.link}`;
  };
  const startEdit = (row: SceneScrap): void => {
    setEdit(row);
    setDraft(row.title);
    setSaveErr(null);
    requestAnimationFrame(() => editRef.current?.select());
  };
  const saveEdit = async (): Promise<void> => {
    const row = edit;
    const title = draft.trim();
    if (!row || !title || busy) return;
    setBusy(true);
    try {
      const next = await api.renameSceneScrap(row.id, title);
      setItems((prev) => (prev ? prev.map((r) => (r.id === next.id ? next : r)) : prev));
      setEdit(null);
    } catch {
      setSaveErr("제목을 고치지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: SceneScrap): Promise<void> => {
    setItems((prev) => (prev ? prev.filter((r) => r.id !== row.id) : prev));
    try { await api.deleteSceneScrap(row.id); } catch { load(); }
  };

  return (
    <div className="scr-scrap-screen">
      <div className="scr-v2-toolbar">
        <div className="scr-v2-toolbar-title-row">
          <button
            type="button" className="scr-crumb-back"
            onClick={() => (wasPushed() ? window.history.back() : navigateTo("/games", { replace: true }))}
          >
            <ArrowLeft size={16} />
            <span>게임</span>
          </button>
          <h1 className="scr-title scr-v2-toolbar-title">스크랩한 장면</h1>
        </div>
      </div>
      {items && items.length > 0 && (
        <SelectionBar
          total={items.length} count={pickedRows.length}
          onSelectAll={() => sel.setMany(items.map((r) => String(r.id)), true)}
          onClear={sel.clear}
          mode={sel.mode} onExit={sel.exit}
        >
          <button
            type="button" className="scr-pill-btn"
            disabled={pickedRows.length === 0}
            onClick={() => { setBulkErr(null); setBulkConfirm(pickedRows); }}
          >
            지우기
          </button>
        </SelectionBar>
      )}
      {items === null ? (
        <div className="scr-empty">불러오는 중…</div>
      ) : items.length === 0 ? (
        <div className="scr-empty">
          {err ?? "스크랩한 장면이 없어요. 재생 화면의 ‘장면 스크랩’으로 담아 두세요."}
        </div>
      ) : (
        <ul className="scr-scrap-list">
          {items.map((row) => {
            const key = String(row.id);
            const picked = sel.picked.has(key);
            return (
            <li key={row.id} className={cx("scr-scrap-row", picked && "is-picked")}>
              <RowCheck checked={picked} onChange={() => sel.toggle(key)} label={`${row.title} 선택`} />
              <ScrapMain
                onClick={() => (isMobile && sel.mode ? sel.toggle(key) : open(row))}
                onLongPress={isMobile ? () => sel.toggle(key) : undefined}
                title={row.title}
              >
                <span className="scr-scrap-title">{row.title}</span>
                {row.subtitle && <span className="scr-scrap-sub">{row.subtitle}</span>}
                <span className="scr-scrap-when">{formatWhen(row.createdAt, { clock: true })}</span>
              </ScrapMain>
              <div className="scr-scrap-acts">
                <button
                  type="button" className="scr-icon-btn"
                  onClick={() => startEdit(row)}
                  aria-label="제목 수정" title="제목 수정"
                >
                  <Pencil size={16} />
                </button>
                <KakaoShareButton
                  variant="icon" label="장면 공유" icon="share"
                  content={() => shareOf(row)}
                />
                <button
                  type="button" className="scr-icon-btn scr-scrap-del"
                  onClick={() => setConfirmDel(row)}
                  aria-label="스크랩 지우기" title="지우기"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
            );
          })}
        </ul>
      )}
      {bulkConfirm && (
        <ConfirmDialog
          title={`선택한 스크랩 ${bulkConfirm.length}개를 지울까요?`}
          message="담아 둔 장면이 목록에서 사라져요. 되돌릴 수 없어요(경기는 그대로예요)."
          confirmLabel={bulkProgress ? `지우는 중... ${bulkProgress.done}/${bulkProgress.total}` : "지우기"}
          error={bulkErr}
          onConfirm={() => { if (!bulkProgress) void runBulkDelete(bulkConfirm); }}
          onCancel={() => { if (!bulkProgress) { setBulkConfirm(null); setBulkErr(null); } }}
        />
      )}
      {confirmDel && (
        <ConfirmDialog
          title={`"${confirmDel.title}" 스크랩을 지울까요?`}
          message="담아 둔 장면이 목록에서 사라져요. 되돌릴 수 없어요(경기는 그대로예요)."
          confirmLabel="지우기"
          onConfirm={() => {
            const target = confirmDel;
            setConfirmDel(null);
            void remove(target);
          }}
          onCancel={() => setConfirmDel(null)}
        />
      )}
      {edit && createPortal((
        <div
          className="scr-scrap-modal"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setEdit(null); }}
        >
          <div
            className="scr-scrap-pop"
            role="dialog" aria-modal="true" aria-label="스크랩 제목 수정"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <input
              ref={editRef}
              className="scr-input scr-scrap-pop-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                if (e.key === "Enter") { e.preventDefault(); void saveEdit(); }
                if (e.key === "Escape") setEdit(null);
              }}
              placeholder="제목"
              maxLength={60}
              aria-label="스크랩 제목"
            />
            <div className="scr-scrap-pop-hint">
              {saveErr ?? "이 스크랩의 제목만 바뀌어요 — 담아 둔 장면은 그대로예요."}
            </div>
            <div className="scr-scrap-pop-btns">
              <button
                type="button" className="scr-rect-btn is-secondary"
                onClick={() => setEdit(null)}
              >
                취소
              </button>
              <button
                type="button" className="scr-rect-btn"
                onClick={() => void saveEdit()} disabled={busy || !draft.trim()}
              >
                {busy ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}

/** 스크랩 줄의 본문 단추 — 폰은 길게 눌러 선택 모드로(useLongPress · Selection.tsx ★). */
function ScrapMain({ onClick, onLongPress, title, children }: {
  onClick: () => void; onLongPress?: () => void; title: string; children: ReactNode;
}) {
  const hold = useLongPress(onLongPress);
  return (
    <button type="button" className="scr-scrap-main" onClick={onClick} title={title} {...hold}>
      {children}
    </button>
  );
}
