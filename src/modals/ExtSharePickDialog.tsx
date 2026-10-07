import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Lock } from "lucide-react";
import { Spinner } from "../components/common/Feedback";
import { showToast } from "../components/common/Toast";
import { api } from "../api/client";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import { cx } from "../utils/format";
import type { ExtShareList, GameResult } from "../types";

export default function ExtSharePickDialog({ games, onClose, onDone }: {
  games: GameResult[];
  onClose: () => void;
  onDone: () => void;
}) {
  useLockBodyScroll();
  const [lists, setLists] = useState<ExtShareList[] | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    api.adminExtShareLists()
      .then((rows) => {
        if (dead) return;
        setLists(rows);
        setPick(rows[0]?.id ?? null);
      })
      .catch((e: Error) => { if (!dead) { setLists([]); setErr(e.message); } });
    return () => { dead = true; };
  }, []);

  const submit = async (): Promise<void> => {
    if (pick === null || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.adminAddExtShareGames(pick, games.map((g) => g.id));
      const name = lists?.find((l) => l.id === pick)?.name ?? "";
      const extra = [
        r.already > 0 ? `이미 있음 ${r.already}` : "",
        r.skipped > 0 ? `못 담음 ${r.skipped}` : "",
      ].filter(Boolean).join(" · ");
      showToast(`'${name}'에 ${r.added}판 담았어요${extra ? ` (${extra})` : ""}`, {
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
      <div className="scr-modal scr-modal-sm scr-modal-confirm">
        <div className="scr-confirm-head">
          <span>외부 공개 목록에 담기 ({games.length})</span>
        </div>
        {lists === null ? <Spinner /> : lists.length === 0 ? (
          <p className="scr-confirm-msg">외부 공개 목록이 없어요. 제어판의 '외부 공개 관리'에서 먼저 만들어 주세요.</p>
        ) : (
          <div className="scr-extshare-pick" role="radiogroup" aria-label="외부 공개 목록">
            {lists.map((l) => (
              <label key={l.id} className={cx("scr-extshare-pick-item", pick === l.id && "is-on")}>
                <input
                  type="radio" name="ext-share-pick"
                  checked={pick === l.id} onChange={() => setPick(l.id)}
                />
                <span className="scr-extshare-pick-name">{l.name}</span>
                {l.locked && <Lock size={11} aria-label="비밀번호" />}
                <span className="scr-extshare-pick-meta">{l.gameCount}판</span>
              </label>
            ))}
          </div>
        )}
        {err && <div className="scr-err" role="alert">{err}</div>}
        <div className="scr-form-actions">
          <button type="button" className="scr-rect-btn scr-lighting-color" onClick={onClose} disabled={busy}>취소</button>
          <button
            type="button" className="scr-rect-btn scr-lighting-color-fill"
            onClick={() => void submit()} disabled={busy || pick === null}
          >
            {busy ? <Spinner size={14} /> : "담기"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
