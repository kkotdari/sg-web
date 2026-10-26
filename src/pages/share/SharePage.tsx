import { useEffect, useState } from "react";
import { GameDetailCloseContext } from "../games/gameDetailClose";
import { LoadingMark } from "../../components/common/Feedback";
import { api } from "../../api/client";
import { useAppStore } from "../../store/appStore";
import RankingShiftCard from "../games/RankingShiftCard";
import { GameResultCard, gameResultItem } from "../games/GamesScreen";
import { formatWhen, shortDate } from "../../utils/date";
import type { GameResult, RankingShift } from "../../types";

export type ShareTarget =
  | { type: "gameResult" | "rankingShift"; id: number };

export default function SharePage({ target, onExit }: { target: ShareTarget; onExit: () => void }) {
  const memberOf = useAppStore((s) => s.memberOf);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [shift, setShift] = useState<RankingShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const targetKey = String(target.id);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");
    setGameResult(null);
    setShift(null);
    void (async () => {
      try {
        if (target.type === "gameResult") {
          const m = await api.getGameResult(target.id);
          if (alive) setGameResult(m);
        } else {
          const snaps = await api.listRankingShifts();
          const s = snaps.find((it) => it.id === target.id) ?? null;
          if (alive) {
            setShift(s);
            if (!s) setErr("공유된 순위변동을 찾을 수 없어요.");
          }
        }
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "불러오지 못했어요.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [target.type, targetKey]);

  return (
    <div className="scr-share-page">
      <div className="scr-share-body">
        {loading ? (
          <LoadingMark />
        ) : err ? (
          <div className="scr-err">{err}</div>
        ) : gameResult ? (
          <GameDetailCloseContext.Provider value={onExit}>
            <div className="scr-feed-list">
              <GameResultCard
                item={gameResultItem(gameResult)} memberOf={memberOf} onDeleted={() => {}}
                onChanged={() => {}}
                dateLabel={shortDate(gameResult.date)}
              />
            </div>
          </GameDetailCloseContext.Provider>
        ) : shift ? (
          <div className="scr-feed-list">
            <RankingShiftCard shift={shift} timeText={formatWhen(shift.createdAt, { clock: true })} />
          </div>
        ) : null}
      </div>
      <ShareFoot onExit={onExit} />
    </div>
  );
}

function ShareFoot({ onExit }: { onExit: () => void }) {
  return (
    <div className="scr-share-foot">
      <button type="button" className="scr-rect-btn" onClick={onExit}>
        스타게이트로
      </button>
    </div>
  );
}
