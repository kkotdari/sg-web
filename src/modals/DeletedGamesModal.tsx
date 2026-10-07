import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, RotateCcw, Trash2 } from "lucide-react";
import ModalHash from "../utils/modalHash";
import { Spinner } from "../components/common/Feedback";
import ConfirmDialog from "../components/common/ConfirmDialog";
import { api } from "../api/client";
import { showAlert } from "../components/common/AlertDialog";
import { showToast } from "../components/common/Toast";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import { cx } from "../utils/format";
import { formatAgo, serverMs } from "../utils/date";
import { RowCheck, SelectionBar } from "../components/common/Selection";
import { useSelection } from "../hooks/useSelection";
import { batchSummary, runBatch } from "../utils/batch";
import type { DeletedGameResult } from "../types";

type Action = "restore" | "purge";

function rosterOf(g: DeletedGameResult): string {
  const names = (side: DeletedGameResult["team1"]) =>
    side.map((s) => s.rawName || s.memberId).filter(Boolean).join(", ");
  const a = names(g.team1);
  const b = names(g.team2);
  return a && b ? `${a}  vs  ${b}` : a || b;
}

export default function DeletedGamesModal({ onClose }: { onClose: () => void }) {
  useLockBodyScroll();
  const [rows, setRows] = useState<DeletedGameResult[] | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ kind: Action; game: DeletedGameResult } | null>(null);
  const [confirmErr, setConfirmErr] = useState<string | null>(null);
  const sel = useSelection();
  const [bulk, setBulk] = useState<{ kind: Action; games: DeletedGameResult[] } | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const reload = useCallback(async () => {
    try {
      setRows(await api.listDeletedGameResults());
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "삭제된 경기 목록을 받지 못했어요.");
      setRows([]);
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const q = query.trim().toLowerCase();
  const filtered = (rows ?? []).filter((g) => {
    if (!q) return true;
    const hay = [
      g.matchNo, g.date, g.mapCanonName ?? "", g.mapName ?? "", rosterOf(g),
      g.deletedBy?.nickname ?? "", g.createdBy?.nickname ?? "",
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });

  const runBulk = async (kind: Action, games: DeletedGameResult[]) => {
    const verb = kind === "restore" ? "복원" : "완전 삭제";
    setConfirmErr(null);
    setBulkProgress({ done: 0, total: games.length });
    const { done, failed } = await runBatch(
      games,
      (g) => (kind === "restore" ? api.restoreGameResult(g.id).then(() => undefined) : api.purgeGameResult(g.id)),
      { onProgress: (n) => setBulkProgress({ done: n, total: games.length }) },
    );
    const doneIds = new Set(done.map((g) => g.id));
    if (doneIds.size > 0) setRows((prev) => (prev ? prev.filter((g) => !doneIds.has(g.id)) : prev));
    setBulkProgress(null);
    if (failed.length > 0 && done.length === 0) {
      setConfirmErr(batchSummary(verb, 0, failed.length, "판"));
      return;
    }
    setBulk(null);
    sel.clear();
    showToast(batchSummary(verb, done.length, failed.length, "판"), { kind: failed.length > 0 ? "warn" : "ok" });
  };

  const pickedRows = filtered.filter((g) => sel.picked.has(String(g.id)));

  const run = async (kind: Action, game: DeletedGameResult) => {
    setBusyId(game.id);
    setConfirmErr(null);
    try {
      if (kind === "restore") {
        await api.restoreGameResult(game.id);
        showToast(`${game.matchNo} 경기를 복원했어요.`, { kind: "ok" });
      } else {
        await api.purgeGameResult(game.id);
        showToast(`${game.matchNo} 경기를 완전히 지웠어요.`, { kind: "ok" });
      }
      setRows((prev) => (prev ? prev.filter((g) => g.id !== game.id) : prev));
      setConfirm(null);
    } catch (e) {
      setConfirmErr(e instanceof Error ? e.message : "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setBusyId(null);
    }
  };

  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash="deleted-games" onClose={onClose} />
      <div className="scr-modal scr-modal-md scr-trash" onClick={(e) => e.stopPropagation()}>
        <div className="scr-modal-head">
          <span>삭제된 경기{rows && rows.length > 0 ? ` (${rows.length})` : ""}</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>
        <div className="scr-modal-body scr-trash-body">
          <p className="scr-trash-note">
            지운 경기는 목록·통계에 안 보이고, 등록기가 같은 리플레이를 올려도 다시 등록되지 않아요.
            복원하면 그대로 돌아오고, 완전 삭제하면 리플레이 파일까지 지워져 그 뒤엔 새 경기로 등록될 수 있어요.
          </p>
          {rows === null ? (
            <div className="scr-trash-empty"><Spinner /> 삭제된 경기를 받는 중…</div>
          ) : rows.length === 0 ? (
            <div className="scr-trash-empty">게임이 없어요</div>
          ) : (
            <>
              <div className="scr-trash-tools">
                <input
                  type="search"
                  className="scr-input scr-trash-search"
                  placeholder="경기번호·날짜·맵·선수·지운 사람으로 찾기"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              {filtered.length > 0 && (
                <SelectionBar
                  total={filtered.length} count={pickedRows.length}
                  onSelectAll={() => sel.setMany(filtered.map((g) => String(g.id)), true)}
                  onClear={sel.clear}
                >
                  <button
                    type="button" className="scr-lighting-pill-btn"
                    disabled={pickedRows.length === 0 || busyId !== null}
                    onClick={() => { setConfirmErr(null); setBulk({ kind: "restore", games: pickedRows }); }}
                  >
                    복원
                  </button>
                  <button
                    type="button" className="scr-lighting-pill-btn"
                    disabled={pickedRows.length === 0 || busyId !== null}
                    onClick={() => { setConfirmErr(null); setBulk({ kind: "purge", games: pickedRows }); }}
                  >
                    완전 삭제
                  </button>
                </SelectionBar>
              )}
              <div className="scr-trash-list">
                {filtered.map((g) => {
                  const busy = busyId === g.id;
                  const key = String(g.id);
                  const picked = sel.picked.has(key);
                  return (
                    <div
                      key={g.id}
                      className={cx("scr-trash-row scr-trash-row-sel", busy && "is-busy", picked && "is-picked")}
                    >
                      <RowCheck checked={picked} onChange={() => sel.toggle(key)} label={`${g.matchNo} 선택`} />
                      <div className="scr-trash-main">
                        <div className="scr-trash-top">
                          <span className="scr-trash-no">{g.matchNo}</span>
                          <span className="scr-trash-map">{g.mapCanonName || g.mapName || "(맵 미상)"}</span>
                          <span className="scr-trash-date">{g.gameStartedAt ? g.gameStartedAt.slice(0, 10) : g.date}</span>
                        </div>
                        <div className="scr-trash-who">{rosterOf(g) || "(참가자 없음)"}</div>
                        <div className="scr-trash-meta">
                          {g.deletedBy?.nickname ?? "알 수 없음"} 삭제 · {formatAgo(serverMs(g.deletedAt))}
                          {g.replay ? " · 리플레이 있음" : " · 리플레이 없음"}
                        </div>
                      </div>
                      <div className="scr-trash-actions">
                        <button
                          type="button" className="scr-btn scr-btn-sm scr-trash-restore"
                          onClick={() => { setConfirmErr(null); setConfirm({ kind: "restore", game: g }); }}
                          disabled={busyId !== null}
                          title="복원 — 목록·통계로 되돌립니다"
                        >
                          {busy ? <Spinner size={14} /> : <><RotateCcw size={13} /> 복원</>}
                        </button>
                        <button
                          type="button" className="scr-icon-btn scr-trash-purge"
                          onClick={() => { setConfirmErr(null); setConfirm({ kind: "purge", game: g }); }}
                          disabled={busyId !== null}
                          aria-label="완전 삭제"
                          title="완전 삭제 — 리플레이 파일까지 지웁니다(되돌릴 수 없음)"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="scr-trash-empty">결과가 없어요</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {bulk && (
        <ConfirmDialog
          title={bulk.kind === "restore"
            ? `선택한 ${bulk.games.length}판을 복원할까요?`
            : `선택한 ${bulk.games.length}판을 완전히 지울까요?`}
          message={bulk.kind === "restore"
            ? "목록·통계·활동에 다시 나타나고, 그 뒤 같은 리플레이가 올라오면 그 경기에 갱신돼요."
            : "리플레이 파일까지 지워지고 되돌릴 수 없어요. 그 뒤에 같은 리플레이가 올라오면 새 경기로 등록돼요."}
          confirmLabel={bulkProgress
            ? `${bulk.kind === "restore" ? "복원" : "지우는"} 중... ${bulkProgress.done}/${bulkProgress.total}`
            : (bulk.kind === "restore" ? "복원" : "완전 삭제")}
          error={confirmErr}
          onConfirm={() => { if (!bulkProgress) void runBulk(bulk.kind, bulk.games); }}
          onCancel={() => { if (!bulkProgress) { setBulk(null); setConfirmErr(null); } }}
        />
      )}
      {confirm && confirm.kind === "restore" && (
        <ConfirmDialog
          title={`${confirm.game.matchNo} 경기를 복원할까요?`}
          message="목록·통계·활동에 다시 나타나고, 그 뒤 같은 리플레이가 올라오면 이 경기에 갱신돼요."
          confirmLabel={busyId === confirm.game.id ? "복원 중..." : "복원"}
          error={confirmErr}
          onConfirm={() => { void run("restore", confirm.game); }}
          onCancel={() => { setConfirm(null); setConfirmErr(null); }}
        />
      )}
      {confirm && confirm.kind === "purge" && (
        <ConfirmDialog
          title={`${confirm.game.matchNo} 경기를 완전히 지울까요?`}
          message="리플레이 파일까지 지워지고 되돌릴 수 없어요. 그 뒤에 같은 리플레이가 올라오면 새 경기로 등록돼요. 다시 올라오면 안 되는 경기라면 지운 채로 두세요."
          confirmLabel={busyId === confirm.game.id ? "지우는 중..." : "완전 삭제"}
          error={confirmErr}
          onConfirm={() => { void run("purge", confirm.game); }}
          onCancel={() => { setConfirm(null); setConfirmErr(null); }}
        />
      )}
    </div>,
    document.body,
  );
}
