import { useEffect, useState } from "react";
import { GameDetailCloseContext } from "../activity/gameDetailClose";
import { LoadingMark } from "../../components/common/Feedback";
import ChallengeInboxModal from "../../modals/ChallengeInboxModal";
import { api } from "../../api/client";
import { useAppStore } from "../../store/appStore";
import RankingShiftCard from "../activity/RankingShiftCard";
import ScheduleCard from "../activity/ScheduleCard";
import { GameResultCard, gameResultItem } from "../activity/ActivityScreen";
import { formatWhen, shortDate } from "../../utils/date";
import type { Challenge, GameResult, RankingShift, Schedule } from "../../types";

export type ShareTarget =
  | { type: "gameResult" | "challenge" | "challengeReply" | "rankingShift" | "schedule"; id: number };

export default function SharePage({ target, onExit }: { target: ShareTarget; onExit: () => void }) {
  const memberOf = useAppStore((s) => s.memberOf);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [shift, setShift] = useState<RankingShift | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const targetKey = String(target.id);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");
    setGameResult(null);
    setChallenge(null);
    setShift(null);
    setSchedule(null);
    void (async () => {
      try {
        if (target.type === "gameResult") {
          const m = await api.getGameResult(target.id);
          if (alive) setGameResult(m);
        } else if (target.type === "schedule") {
          const items = await api.listSchedules();
          const s = items.find((it) => it.id === target.id) ?? null;
          if (alive) {
            setSchedule(s);
            if (!s) setErr("공유된 일정을 찾을 수 없어요.");
          }
        } else if (target.type === "rankingShift") {
          const snaps = await api.listRankingShifts();
          const s = snaps.find((it) => it.id === target.id) ?? null;
          if (alive) {
            setShift(s);
            if (!s) setErr("공유된 순위변동을 찾을 수 없어요.");
          }
        } else {
          const { items } = await api.getChallenges();
          const c = items.find((it) => it.id === target.id) ?? null;
          if (alive) {
            setChallenge(c);
            if (!c) setErr("공유된 너 나와를 찾을 수 없어요.");
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

  if (target.type === "challenge" || target.type === "challengeReply") {
    if (loading) return <div className="scr-share-page"><div className="scr-share-body"><LoadingMark /></div></div>;
    if (challenge) {
      return (
        <ChallengeInboxModal
          challenges={[challenge]} onClose={onExit} closeLabel="스타게이트로" shareBackdrop skipEnvelope
          reply={target.type === "challengeReply"}
        />
      );
    }
    return (
      <div className="scr-share-page">
        <div className="scr-share-body"><div className="scr-err">{err || "찾을 수 없어요."}</div></div>
        <ShareFoot onExit={onExit} />
      </div>
    );
  }

  return (
    <div className="scr-share-page">
      <div className="scr-share-body">
        {loading ? (
          <LoadingMark />
        ) : err ? (
          <div className="scr-err">{err}</div>
        ) : gameResult ? (
          <GameDetailCloseContext.Provider value={onExit}>
            <div className="scr-activity-list">
              <GameResultCard
                item={gameResultItem(gameResult)} memberOf={memberOf} onDeleted={() => {}}
                onChanged={() => {}}
                dateLabel={shortDate(gameResult.date)}
              />
            </div>
          </GameDetailCloseContext.Provider>
        ) : shift ? (
          <div className="scr-activity-list">
            <RankingShiftCard shift={shift} timeText={formatWhen(shift.createdAt, { clock: true })} />
          </div>
        ) : schedule ? (
          <div className="scr-activity-list">
            <ScheduleCard
              schedule={schedule}
              timeText={formatWhen(schedule.scheduledDate)}
              canEdit={false}
              canDelete={false}
              onChanged={setSchedule}
              onDeleted={() => {}}
            />
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
      <button type="button" className="scr-rect-btn is-fill" onClick={onExit}>
        스타게이트로
      </button>
    </div>
  );
}
