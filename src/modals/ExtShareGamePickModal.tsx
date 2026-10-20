import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Spinner } from "../components/common/Feedback";
import { RowCheck, SelectAllToggle } from "../components/common/Selection";
import { showToast } from "../components/common/Toast";
import { api } from "../api/client";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useAppStore } from "../store/appStore";
import { formatAgo } from "../utils/date";
import { gamePlayable } from "../utils/gamePlayable";
import { GameRowNames, GameRowStatus, ListRow } from "../pages/activity/GameRow";
import type { GameResult } from "../types";

const PAGE = 50;

/** 외부 공개 목록에 게임 담기 — 제어판 '외부 공개 관리'의 + 단추(2026-10-12, 요청: "목록에서 공개 누르는 게 아니라 제어판 외부 공개 관리에서
 *  목록 선택 후 + 버튼으로 지정하기(게임 목록 노출되며 선택)"). 고르는 것이 할 일의 전부라 줄을 눌러 바로 고른다(폰도 길게 누르기 없이). */
export default function ExtShareGamePickModal({ listId, listName, have, onClose, onDone }: {
  listId: number;
  listName: string;
  /** 이미 이 목록에 든 게임 — 고를 수 없게 '담김'으로 둔다. */
  have: Set<number>;
  onClose: () => void;
  onDone: () => void;
}) {
  const memberOf = useAppStore((s) => s.memberOf);
  const [query, setQuery] = useState("");
  const q = useDebouncedValue(query.trim(), 300);
  const [rows, setRows] = useState<GameResult[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    setRows(null);
    setCursor(null);
    api.getGameResultsPage({ limit: PAGE, q: q || undefined })
      .then((page) => { if (!dead) { setRows(page.items); setCursor(page.hasMore ? page.nextCursor : null); } })
      .catch((e: Error) => { if (!dead) { setRows([]); setErr(e.message); } });
    return () => { dead = true; };
  }, [q]);

  const loadMore = async (): Promise<void> => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.getGameResultsPage({ cursor, limit: PAGE, q: q || undefined });
      setRows((cur) => [...(cur ?? []), ...page.items]);
      setCursor(page.hasMore ? page.nextCursor : null);
    } catch (e) { setErr((e as Error).message); } finally { setLoadingMore(false); }
  };

  const open = (rows ?? []).filter((g) => !have.has(g.id));
  const allShown = open.length > 0 && open.every((g) => picked.has(g.id));
  const toggle = (id: number) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setPicked((prev) => {
    const next = new Set(prev);
    if (allShown) open.forEach((g) => next.delete(g.id)); else open.forEach((g) => next.add(g.id));
    return next;
  });

  const submit = async (): Promise<void> => {
    if (picked.size === 0 || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.adminAddExtShareGames(listId, [...picked]);
      const extra = [
        r.already > 0 ? `이미 있음 ${r.already}` : "",
        r.skipped > 0 ? `못 담음 ${r.skipped}` : "",
      ].filter(Boolean).join(" · ");
      showToast(`'${listName}'에 ${r.added}판 담았어요${extra ? ` (${extra})` : ""}`, {
        kind: r.skipped > 0 ? "warn" : "ok",
      });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="scr-modal-overlay">
      <div className="scr-modal scr-modal-md scr-redo-pick scr-extshare-add" onClick={(e) => e.stopPropagation()}>
        <div className="scr-modal-head">
          <span>'{listName}'에 게임 담기</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기" disabled={busy}><X size={14} /></button>
        </div>
        <div className="scr-modal-body scr-redo-pick-body">
          <input
            type="search" className="scr-input scr-redo-pick-search"
            placeholder="게임번호·맵·선수로 찾기"
            value={query} onChange={(e) => setQuery(e.target.value)}
          />
          {rows !== null && open.length > 0 && (
            <SelectAllToggle
              className="scr-redo-pick-all" all={allShown} count={picked.size} onToggle={toggleAll}
              suffix={` (${open.length}건)`}
            />
          )}
          <div className="scr-extshare-add-list">
            {rows === null ? (
              <div className="scr-redo-pick-empty"><Spinner /> 게임 목록을 받는 중…</div>
            ) : rows.length === 0 ? (
              <div className="scr-redo-pick-empty">{q ? "결과가 없어요" : "게임이 없어요"}</div>
            ) : (
              <div className="scr-activity-rows">
                {rows.map((g) => {
                  const inList = have.has(g.id);
                  const on = picked.has(g.id);
                  return (
                    <ListRow
                      key={g.id}
                      check={<RowCheck checked={on || inList} disabled={inList} disabledTitle="이미 담긴 게임" onChange={() => toggle(g.id)} label="게임 선택" />}
                      picked={on}
                      disabled={inList}
                      className={["scr-activity-row-game scr-gm", inList && "is-in"].filter(Boolean).join(" ")}
                      onClick={() => toggle(g.id)}
                      status={<GameRowStatus game={g} playable={gamePlayable(g)} />}
                      desc={<GameRowNames game={g} memberOf={memberOf} mobile playable={gamePlayable(g)} />}
                      top={inList ? <span className="scr-extshare-add-in">담김</span> : undefined}
                      side={formatAgo(g.gameStartedAt ?? g.date)}
                    />
                  );
                })}
                {cursor && (
                  <button
                    type="button" className="scr-rect-btn is-secondary scr-extshare-add-more"
                    onClick={() => void loadMore()} disabled={loadingMore}
                  >
                    {loadingMore ? <Spinner size={14} /> : "더 보기"}
                  </button>
                )}
              </div>
            )}
          </div>
          {err && <div className="scr-redo-pick-err" role="alert">{err}</div>}
        </div>
        <div className="scr-modal-foot scr-redo-pick-foot">
          <span className="scr-redo-pick-count">{picked.size}판 선택</span>
          <button type="button" className="scr-rect-btn" disabled={picked.size === 0 || busy} onClick={() => void submit()}>
            {busy ? <Spinner size={14} /> : "담기"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
