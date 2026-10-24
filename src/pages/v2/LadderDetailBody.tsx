import { useMemo } from "react";
import Avatar from "../../components/common/Avatar";
import { Spinner } from "../../components/common/Feedback";
import PointDetailHistory from "./PointDetailHistory";
import { useAppStore } from "../../store/appStore";
import { shiftMonthValue } from "../../utils/date";
import type { GameResult, Member } from "../../types";

/** 래더 상세 재료 — 래더 화면이 순위표와 **같이** 받아 둔다(2026-10-24, 요청: "팝오버를 위해 래더 조회시 상세도 같이 조회로 변경").
 *  ranks: 달(YYYY-MM) → 회원 → 그 달 순위 · games: 조회한 달의 래더 경기 전부(최신순). loading 이면 아직 받는 중. */
export interface LadderDetailData {
  period: string;
  ranks: Record<string, Map<string, number>>;
  games: GameResult[];
  loading: boolean;
}

/* 그래프는 조회한 달이 **가운데**(앞 3 · 뒤 3 = 7칸 · 2026-10-24, 요청: "조회한달이 가운데로 오게 해서 7개월간의 변화 (없는 곳은 비움)").
   없는 달(기록 전 · 다음 달들)은 칸만 두고 점을 찍지 않는다. */
export const TREND_BEFORE = 3;
export const TREND_AFTER = 3;
export function trendMonths(period: string): string[] {
  const out: string[] = [];
  for (let i = -TREND_BEFORE; i <= TREND_AFTER; i += 1) out.push(shiftMonthValue(period, i));
  return out;
}

const EMPTY_DELTAS = new Map<string, number>();
const H = 140;
const PAD_X = 32;
const PAD_TOP = 38;
const PAD_BOTTOM = 30;

export default function LadderDetailBody({
  member, data, chartW = 300, tight = false,
}: {
  member: Member;
  data: LadderDetailData;
  /** 그래프 viewBox 폭 — 창 300 · PC 팝오버는 칸 폭에 맞춰 넓게(글자가 같이 커지지 않게). */
  chartW?: number;
  /** 이력 줄 간격을 줄여 타이트하게(PC 팝오버 · 2026-10-24). */
  tight?: boolean;
}) {
  const memberOf = useAppStore((s) => s.memberOf);
  const months = useMemo(() => trendMonths(data.period), [data.period]);
  const points = months.map((m) => ({
    month: m,
    label: `${Number(m.slice(5))}월`,
    rank: data.ranks[m]?.get(member.id) ?? null,
  }));
  const known = points.filter((p): p is { month: string; label: string; rank: number } => p.rank !== null);
  const minRank = known.length ? Math.min(...known.map((p) => p.rank)) : 1;
  const maxRank = known.length ? Math.max(...known.map((p) => p.rank)) : 1;
  const span = Math.max(1, maxRank - minRank);
  const xFor = (i: number) => PAD_X + (i * (chartW - PAD_X * 2)) / Math.max(1, points.length - 1);
  const yFor = (rank: number) => PAD_TOP + ((rank - minRank) / span) * (H - PAD_TOP - PAD_BOTTOM);
  const segments: { rank: number; i: number }[][] = [];
  points.forEach((p, i) => {
    if (p.rank === null) return;
    const last = segments[segments.length - 1];
    if (last && last[last.length - 1].i === i - 1) last.push({ rank: p.rank, i });
    else segments.push([{ rank: p.rank, i }]);
  });

  /* 이력은 **조회한 달**의 기록만(달 고르기 없음 · 2026-10-24, 요청: "이력은 조회한 달의 기록만"). */
  const history = useMemo(
    () => data.games.filter((g) => g.team1.some((s) => s.memberId === member.id) || g.team2.some((s) => s.memberId === member.id)),
    [data.games, member.id],
  );
  const centerI = TREND_BEFORE;

  return (
    <>
      <div className="scr-rank-detail-who">
        <Avatar member={member} size={40} />
        <div className="scr-rank-detail-who-text">
          <span className="scr-rank-detail-name">{member.nickname}</span>
        </div>
      </div>

      <div className="scr-rank-detail-section-head">래더 순위 변동</div>
      <div className="scr-rank-detail-chart-area">
        {data.loading && known.length === 0 ? (
          <Spinner size={18} />
        ) : known.length === 0 ? (
          <div className="scr-empty">기록이 없어요</div>
        ) : (
          <svg className="scr-rank-detail-chart" viewBox={`0 0 ${chartW} ${H}`}>
            {segments.map((seg, si) => (
              <polyline
                key={si}
                className="scr-rank-detail-line"
                points={seg.map((p) => `${xFor(p.i)},${yFor(p.rank)}`).join(" ")}
              />
            ))}
            {points.map((p, i) => (
              <text
                key={`label-${i}`}
                className={i === centerI ? "scr-rank-detail-axis-label is-center" : "scr-rank-detail-axis-label"}
                x={xFor(i)} y={H - 14}
              >
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

      <div className={tight ? "scr-rank-detail-history scr-ladder-hist-tight" : "scr-rank-detail-history"}>
        <div className="scr-rank-detail-section-head scr-ladder-history-head">
          <span>{`${Number(data.period.slice(5))}월 래더 이력`}{history.length > 0 && ` (${history.length})`}</span>
        </div>
        <PointDetailHistory
          gameResults={history} members={[member]} memberOf={memberOf}
          loading={data.loading} deltaByMatchNo={EMPTY_DELTAS} noRating
        />
      </div>
    </>
  );
}
