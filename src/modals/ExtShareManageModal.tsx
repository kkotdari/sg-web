import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Trash2, Pencil, Plus, Lock } from "lucide-react";
import ModalHash from "../utils/modalHash";
import { Spinner } from "../components/common/Feedback";
import ConfirmDialog from "../components/common/ConfirmDialog";
import { api } from "../api/client";
import { showAlert } from "../components/common/AlertDialog";
import { showToast } from "../components/common/Toast";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import { cx } from "../utils/format";
import { formatAgo } from "../utils/date";
import { gamePlayable } from "../utils/gamePlayable";
import { RowCheck, SelectionBar } from "../components/common/Selection";
import { useSelection } from "../hooks/useSelection";
import { useIsMobile } from "../hooks/useIsMobile";
import { useAppStore } from "../store/appStore";
import { batchSummary, runBatch } from "../utils/batch";
import { GameRowNames, GameRowStatus, ListRow } from "../pages/activity/GameRow";
import type { ExtShareList, GameResult } from "../types";

const REMOVE_FORMS = { did: "뺐어요", couldNot: "빼지 못했어요" };

export default function ExtShareManageModal({ onClose }: { onClose: () => void }) {
  useLockBodyScroll();
  const [lists, setLists] = useState<ExtShareList[] | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [games, setGames] = useState<GameResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmDel, setConfirmDel] = useState<{ id: number; name: string } | null>(null);
  const [draft, setDraft] = useState<Record<number, { name: string; password: string }>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const memberOf = useAppStore((s) => s.memberOf);
  const isMobile = useIsMobile();
  const sel = useSelection();
  const selClear = sel.clear;
  useEffect(() => { selClear(); }, [pick, selClear]);
  const pickedGames = games ? games.filter((g) => sel.picked.has(String(g.id))) : [];
  const [bulkDel, setBulkDel] = useState<GameResult[] | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkErr, setBulkErr] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<ExtShareList[]> => {
    const rows = await api.adminExtShareLists();
    setLists(rows);
    return rows;
  }, []);

  useEffect(() => {
    void reload()
      .then((rows) => setPick((cur) => cur ?? rows[0]?.id ?? null))
      .catch((e: Error) => showAlert(e.message));
  }, [reload]);

  useEffect(() => {
    if (pick === null) { setGames(null); return; }
    setGames(null);
    api.adminExtShareGames(pick).then(setGames).catch((e: Error) => showAlert(e.message));
  }, [pick]);

  const refreshGames = async (): Promise<void> => {
    if (pick === null) return;
    setGames(await api.adminExtShareGames(pick));
  };

  const addList = async (): Promise<void> => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const made = await api.adminCreateExtShareList(newName.trim(), newPass.trim());
      setNewName(""); setNewPass("");
      setAddOpen(false);
      await reload();
      setPick(made.id);
    } catch (e) { showAlert((e as Error).message); } finally { setBusy(false); }
  };

  const patchList = async (id: number, patch: { name?: string; password?: string }) => {
    try {
      await api.adminPatchExtShareList(id, patch);
      await reload();
      setDraft((v) => { const n = { ...v }; delete n[id]; return n; });
      setEditing((cur) => (cur === id ? null : cur));
      showToast("고쳤습니다.", { kind: "ok" });
    } catch (e) { showAlert((e as Error).message); }
  };

  const doDelete = async (): Promise<void> => {
    if (!confirmDel) return;
    setBusy(true);
    try {
      await api.adminDeleteExtShareList(confirmDel.id);
      const rows = await reload();
      setPick(rows[0]?.id ?? null);
    } catch (e) { showAlert((e as Error).message); }
    finally { setBusy(false); setConfirmDel(null); }
  };

  const runBulkRemove = async (targets: GameResult[]): Promise<void> => {
    if (pick === null) return;
    const listId = pick;
    setBulkErr(null);
    setBulkProgress({ done: 0, total: targets.length });
    setBusy(true);
    try {
      const { done, failed } = await runBatch(targets, (g) => api.adminRemoveExtShareGame(listId, g.id), {
        onProgress: (n) => setBulkProgress({ done: n, total: targets.length }),
      });
      if (done.length > 0) {
        await refreshGames();
        await reload();
      }
      if (failed.length > 0 && done.length === 0) {
        setBulkErr(batchSummary("", 0, failed.length, "판", REMOVE_FORMS));
        return;
      }
      setBulkDel(null);
      selClear();
      showToast(batchSummary("", done.length, failed.length, "판", REMOVE_FORMS), { kind: failed.length > 0 ? "warn" : "ok" });
    } finally {
      setBulkProgress(null);
      setBusy(false);
    }
  };

  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash="ext-share-games" onClose={onClose} />
      <div className="scr-modal scr-extshare-modal">
        <div className="scr-modal-head">
          <span>외부 공개 관리</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>

        <div className="scr-modal-body">

          <div className="scr-extshare-adm-head">
            <div className="scr-notice-edit-label">재생 목록</div>
            <button
              type="button" className="scr-rect-btn"
              onClick={() => setAddOpen((v) => !v)} disabled={busy}
              aria-expanded={addOpen}
            >
              <Plus size={12} /> 추가
            </button>
          </div>
          {(addOpen || (lists !== null && lists.length === 0)) && (
            <div className="scr-extshare-adm-row">
              <input
                className="scr-extshare-adm-name" value={newName} placeholder="목록 이름"
                onChange={(e) => setNewName(e.target.value)}
              />
              <input
                className="scr-extshare-adm-pass" value={newPass}
                placeholder="비밀번호(비우면 잠금 없음)"
                onChange={(e) => setNewPass(e.target.value)}
              />
              <button
                type="button" className="scr-rect-btn"
                onClick={() => void addList()} disabled={busy || !newName.trim()}
              >
                {busy ? <Spinner /> : "만들기"}
              </button>
            </div>
          )}
          {lists === null ? <Spinner /> : (
            <div className="scr-extshare-adm-lists">
              {lists.length === 0 && <p className="scr-adm-note">목록이 없어요</p>}
              {lists.map((l) => (
                <div
                  key={l.id}
                  className={cx("scr-extshare-adm-row", pick === l.id && "is-on")}
                  onClick={() => setPick(l.id)}
                  role="presentation"
                >
                  {editing === l.id ? (() => {
                    const d = draft[l.id] ?? { name: l.name, password: l.password ?? "" };
                    const dirty = d.name.trim() !== l.name
                      || d.password.trim() !== (l.password ?? "");
                    return (
                      <>
                        <input
                          className="scr-extshare-adm-name" value={d.name}
                          onChange={(e) => setDraft((v) => ({
                            ...v, [l.id]: { ...d, name: e.target.value },
                          }))}
                        />
                        <input
                          className="scr-extshare-adm-pass" value={d.password}
                          placeholder="비밀번호(비우면 잠금 없음)"
                          onChange={(e) => setDraft((v) => ({
                            ...v, [l.id]: { ...d, password: e.target.value },
                          }))}
                        />
                        <button
                          type="button" className="scr-rect-btn"
                          disabled={!dirty || !d.name.trim()}
                          onClick={() => void patchList(l.id, {
                            name: d.name.trim(), password: d.password.trim(),
                          })}
                        >
                          수정
                        </button>
                        <button
                          type="button" className="scr-icon-btn" aria-label="목록 삭제"
                          onClick={() => setConfirmDel({ id: l.id, name: l.name })}
                        >
                          <Trash2 size={14} />
                        </button>
                        <button
                          type="button" className="scr-icon-btn" aria-label="수정 접기" title="접기"
                          onClick={() => {
                            setDraft((v) => { const n = { ...v }; delete n[l.id]; return n; });
                            setEditing(null);
                          }}
                        >
                          <X size={14} />
                        </button>
                      </>
                    );
                  })() : (
                    <>
                      <span className="scr-extshare-adm-name">{l.name}</span>
                      <span className="scr-adm-card-meta">
                        {l.locked ? <><Lock size={11} /> {l.password}</> : "잠금 없음"}
                      </span>
                      <span className="scr-adm-card-meta">{l.gameCount}판</span>
                      <button
                        type="button" className="scr-icon-btn"
                        aria-label="이름·비밀번호 수정" title="이름·비밀번호 수정"
                        onClick={(e) => { e.stopPropagation(); setEditing(l.id); }}
                      >
                        <Pencil size={14} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {pick !== null && (
            <>
              <div className="scr-notice-edit-label scr-extshare-adm-hint">
                게임 목록에서 경기를 고른 뒤 '공개'를 누르면 이 목록에 담겨요.
              </div>
              {games && games.length > 0 && (
                <SelectionBar
                  total={games.length} count={pickedGames.length}
                  onSelectAll={() => sel.setMany(games.map((g) => String(g.id)), true)}
                  onClear={sel.clear}
                  mode={sel.mode} onExit={sel.exit}
                >
                  <button
                    type="button" className="scr-pill-btn"
                    disabled={pickedGames.length === 0 || busy}
                    onClick={() => { setBulkErr(null); setBulkDel(pickedGames); }}
                  >
                    빼기
                  </button>
                </SelectionBar>
              )}
              {games === null ? <Spinner /> : (
                <div className="scr-activity-rows">
                  {games.length === 0 && <p className="scr-adm-note">게임이 없어요</p>}
                  {games.map((g) => {
                    const key = String(g.id);
                    const picked = sel.picked.has(key);
                    return (
                      <ListRow
                        key={g.id}
                        check={<RowCheck checked={picked} onChange={() => sel.toggle(key)} label="경기 선택" />}
                        picked={picked}
                        className="scr-activity-row-game"
                        onClick={() => sel.toggle(key)}
                        onLongPress={isMobile ? () => sel.toggle(key) : undefined}
                        status={<GameRowStatus game={g} />}
                        desc={<>
                          <GameRowNames game={g} memberOf={memberOf} mobile={isMobile} playable={gamePlayable(g)} />
                        </>}
                        side={formatAgo(g.gameStartedAt ?? g.date)}
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {confirmDel && (
        <ConfirmDialog
          title="목록 삭제"
          message={`"${confirmDel.name}" 목록을 지웁니다. 담긴 경기는 그대로 남아요.`}
          confirmLabel="삭제"
          onConfirm={() => void doDelete()}
          onCancel={() => setConfirmDel(null)}
        />
      )}
      {bulkDel && (
        <ConfirmDialog
          title={`선택한 ${bulkDel.length}판을 목록에서 뺄까요?`}
          message="경기는 그대로 남고 이 목록에서만 빠져요."
          confirmLabel={bulkProgress ? `빼는 중... ${bulkProgress.done}/${bulkProgress.total}` : "빼기"}
          error={bulkErr}
          onConfirm={() => { if (!bulkProgress) void runBulkRemove(bulkDel); }}
          onCancel={() => { if (!bulkProgress) { setBulkDel(null); setBulkErr(null); } }}
        />
      )}
    </div>,
    document.body,
  );
}
