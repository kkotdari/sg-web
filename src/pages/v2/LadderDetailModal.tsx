import { useEffect, useMemo, useState } from "react";
import { LADDER_GAME_TYPES } from "../../constants/gameTypes";
import ModalHash from "../../utils/modalHash";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import Avatar from "../../components/common/Avatar";
import Select from "../../components/common/Select";
import { Spinner } from "../../components/common/Feedback";
import PointDetailHistory from "./PointDetailHistory";
import { api } from "../../api/client";
import { rankOf } from "./rankOrder";
import { useAppStore } from "../../store/appStore";
import { useLockBodyScroll } from "../../utils/bodyScrollLock";
import { currentMonthValue, monthInputToRange, shiftMonthValue } from "../../utils/date";
import type { GameResult, GameType, Member } from "../../types";

const LADDER_TYPE: GameType = LADDER_GAME_TYPES[0];
const TREND_MONTHS = 5;
const HISTORY_LIMIT = 100;
const EMPTY_DELTAS = new Map<string, number>();

const W = 300;
const H = 140;
const PAD_X = 32;
const PAD_TOP = 38;
const PAD_BOTTOM = 30;

interface TrendPoint {
  label: string;
  rank: number | null;
}

async function rankAt(month: string, poolIds: string[], memberId: string): Promise<number | null> {
  const { from, to } = monthInputToRange(month);
  const res = await api.getGameResultStats({
    memberIds: poolIds, dateFrom: from, dateTo: to,
    matchType: LADDER_TYPE, race: "all", ratingScope: "period",
  });
  const byId: Record<string, (typeof res.members)[number]> = {};
  res.members.forEach((e) => { byId[e.memberId] = e; });
  return rankOf(byId, poolIds).get(memberId) ?? null;
}

export default function LadderDetailModal({
  member, poolIds, period, firstMonth, onClose,
}: {
  member: Member;
  poolIds: string[];
  period: string;
  firstMonth: string | null;
  onClose: () => void;
}) {
  useLockBodyScroll();
  const memberOf = useAppStore((s) => s.memberOf);

  const months = useMemo(() => {
    const out: string[] = [];
    for (let i = TREND_MONTHS - 1; i >= 0; i -= 1) {
      const m = shiftMonthValue(period, -i);
      if (firstMonth && m < firstMonth) continue;
      out.push(m);
    }
    return out;
  }, [period, firstMonth]);

  const [points, setPoints] = useState<TrendPoint[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    setPoints(null);
    Promise.all(months.map(async (m) => ({
      label: `${Number(m.slice(5))}월`,
      rank: await rankAt(m, poolIds, member.id).catch(() => null),
    })))
      .then((ps) => { if (!cancelled) setPoints(ps); })
      .catch(() => { if (!cancelled) setPoints([]); });
    return () => { cancelled = true; };
  }, [months, member.id, poolIds.join(",")]);

  const known = (points ?? []).filter((p): p is { label: string; rank: number } => p.rank !== null);
  const minRank = known.length ? Math.min(...known.map((p) => p.rank)) : 1;
  const maxRank = known.length ? Math.max(...known.map((p) => p.rank)) : 1;
  const span = Math.max(1, maxRank - minRank);
  const xFor = (i: number) => PAD_X + (i * (W - PAD_X * 2)) / Math.max(1, (points?.length ?? 1) - 1);
  const yFor = (rank: number) => PAD_TOP + ((rank - minRank) / span) * (H - PAD_TOP - PAD_BOTTOM);
  const segments: { rank: number; i: number }[][] = [];
  (points ?? []).forEach((p, i) => {
    if (p.rank === null) return;
    const last = segments[segments.length - 1];
    if (last && last[last.length - 1].i === i - 1) last.push({ rank: p.rank, i });
    else segments.push([{ rank: p.rank, i }]);
  });

  const [historyMonth, setHistoryMonth] = useState(period);
  const monthOptions = useMemo(() => {
    const out: { value: string; label: string }[] = [{ value: "all", label: "전체" }];
    const start = firstMonth ?? shiftMonthValue(currentMonthValue(), -11);
    for (let m = currentMonthValue(); m >= start; m = shiftMonthValue(m, -1)) {
      out.push({ value: m, label: `${m.slice(0, 4)}.${m.slice(5)}` });
    }
    return out;
  }, [firstMonth]);

  const [history, setHistory] = useState<GameResult[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyErr, setHistoryErr] = useState("");
  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryErr("");
    const range = historyMonth === "all" ? { from: "", to: "" } : monthInputToRange(historyMonth);
    api.getGameResultsPage({
      teamMemberIds: [member.id], matchType: LADDER_TYPE, sort: "latest",
      dateFrom: range.from, dateTo: range.to, limit: HISTORY_LIMIT,
    })
      .then((page) => { if (!cancelled) setHistory(page.items); })
      .catch((e) => {
        if (!cancelled) setHistoryErr(e instanceof Error ? e.message : "경기를 불러오지 못했어요.");
      })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [member.id, historyMonth]);

  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash={`ladder-${member.id}`} onClose={onClose} />
      <div className="scr-modal scr-modal-sm scr-modal-rank-detail">
        <div className="scr-modal-head">
          <span>래더 상세</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>
        <div className="scr-modal-body">
          <div className="scr-rank-detail-who">
            <Avatar member={member} size={40} />
            <div className="scr-rank-detail-who-text">
              <span className="scr-rank-detail-name">{member.nickname}</span>
            </div>
          </div>

          <div className="scr-rank-detail-section-head">래더 순위 변동</div>
          <div className="scr-rank-detail-chart-area">
            {points === null ? (
              <Spinner size={18} />
            ) : known.length === 0 ? (
              <div className="scr-empty">기록이 없어요</div>
            ) : (
              <svg className="scr-rank-detail-chart" viewBox={`0 0 ${W} ${H}`}>
                {segments.map((seg, si) => (
                  <polyline
                    key={si}
                    className="scr-rank-detail-line"
                    points={seg.map((p) => `${xFor(p.i)},${yFor(p.rank)}`).join(" ")}
                  />
                ))}
                {points.map((p, i) => (
                  <text key={`label-${i}`} className="scr-rank-detail-axis-label" x={xFor(i)} y={H - 14}>
                    {p.label}
                  </text>
                ))}
                {points.map((p, i) => (
                  p.rank === null ? null : (
                    <g key={`point-${i}`}>
                      <circle className="scr-rank-detail-dot" cx={xFor(i)} cy={yFor(p.rank)} r={3} />
                      <text className="scr-rank-detail-value" x={xFor(i)} y={yFor(p.rank) - 8}>
                        {p.rank}위
                      </text>
                    </g>
                  )
                ))}
              </svg>
            )}
          </div>

          <div className="scr-rank-detail-history">
            <div className="scr-rank-detail-section-head scr-ladder-history-head">
              <span>래더 이력{history.length > 0 && ` (${history.length})`}</span>
              <Select
                className="scr-ladder-history-month" size="sm"
                value={historyMonth}
                options={monthOptions}
                onChange={setHistoryMonth}
                minDropWidth={104}
              />
            </div>
            {historyErr && <div className="scr-err">{historyErr}</div>}
            <PointDetailHistory
              gameResults={history} members={[member]} memberOf={memberOf}
              loading={historyLoading} deltaByMatchNo={EMPTY_DELTAS} noRating
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
