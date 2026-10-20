import { useEffect, useMemo, useState } from "react";
import { LADDER_GAME_TYPES } from "../../constants/gameTypes";
import { LoadingMark } from "../../components/common/Feedback";
import SearchFilterBar from "../../components/common/SearchFilterBar";
import { useUrlState } from "../../hooks/useUrlState";
import MonthCalendar from "../../components/common/MonthCalendar";
import Avatar from "../../components/common/Avatar";
import RivalryOverlay from "../rivalry/RivalryOverlay";
import { rankOf } from "./rankOrder";
import LadderDetailModal from "./LadderDetailModal";
import QueenHistoryModal from "./QueenHistoryModal";
import RatingBoardModal from "./RatingBoardModal";
import { useAppStore } from "../../store/appStore";
import { api } from "../../api/client";
import { monthInputToRange, shiftMonthValue, currentMonthValue } from "../../utils/date";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { usePageBackground } from "../../hooks/usePageBackground";
import { cx } from "../../utils/format";
import type { GameResultStatsResponse, GameType, Member, MemberStatsEntry } from "../../types";

const LADDER_TYPE: GameType = LADDER_GAME_TYPES[0];
const MEDALS = ["🥇", "🥈", "🥉"];

interface LadderRow {
  member: Member;
  rank: number | null;
  move: number | "new" | null;
  points: number | null;
  prevPoints: number | null;
  plays: number;
  prevPlays: number | null;
  winRate: number | null;
  prevWinRate: number | null;
}

export default function LadderScreen() {
  usePageBackground("/images/bg/stats_bg.jpg", "/images/bg/stats_bg_mobile.png");
  const members = useAppStore((s) => s.members);
  const user = useAppStore((s) => s.user);

  const [period, setPeriod] = useUrlState("period", currentMonthValue());
  const [rivalryOpen, setRivalryOpen] = useState(false);
  const [queensOpen, setQueensOpen] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [detailMember, setDetailMember] = useState<Member | null>(null);

  const [firstMonth, setFirstMonth] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.getGameResultsPage({ sort: "oldest", limit: 1 })
      .then((page) => { if (!cancelled) setFirstMonth(page.items[0]?.date.slice(0, 7) ?? null); })
      .catch(() => { });
    return () => { cancelled = true; };
  }, []);

  const { from, to } = useMemo(() => monthInputToRange(period), [period]);
  const prevRange = useMemo(
    () => monthInputToRange(shiftMonthValue(period, -1)), [period],
  );

  const asOf = useMemo(() => {
    const today = new Date();
    const end = new Date(`${to}T00:00:00`);
    const at = end > today ? today : end;
    return `${at.getMonth() + 1}.${at.getDate()}`;
  }, [to]);

  const poolIds = useMemo(
    () => members
      .filter((m) => m.status !== "withdrawn" && m.status !== "suspended")
      .map((m) => m.id).sort(),
    [members],
  );

  const queryKey = useMemo(
    () => ({ from, to, prevFrom: prevRange.from, prevTo: prevRange.to, period, ids: poolIds.join(",") }),
    [from, to, prevRange, period, poolIds],
  );
  const signature = useMemo(() => JSON.stringify(queryKey), [queryKey]);
  const debouncedSignature = useDebouncedValue(signature, 300);
  const q = useMemo(() => JSON.parse(debouncedSignature) as typeof queryKey, [debouncedSignature]);

  interface LadderView {
    key: string;
    period: string;
    ids: string[];
    stats: Record<string, MemberStatsEntry>;
    prev: Record<string, MemberStatsEntry>;
  }
  const [view, setView] = useState<LadderView | null>(null);
  const [error, setError] = useState("");
  const firstLoad = view === null;
  const refreshing = view !== null && view.key !== debouncedSignature;

  useEffect(() => {
    const ids = q.ids ? q.ids.split(",") : [];
    const blank = {
      key: debouncedSignature,
      period: q.period,
      ids,
    };
    if (ids.length === 0) { setView({ ...blank, stats: {}, prev: {} }); return; }
    let cancelled = false;
    setError("");
    const byId = (res: GameResultStatsResponse) => {
      const map: Record<string, MemberStatsEntry> = {};
      res.members.forEach((e) => { map[e.memberId] = e; });
      return map;
    };
    const mine = api.getGameResultStats({
      memberIds: ids, dateFrom: q.from, dateTo: q.to,
      matchType: LADDER_TYPE, race: "all", ratingScope: "period",
    });
    /* 이전 달 비교는 화면에서 걷었다(아래 ★ · 2026-10-20) — 더는 묻지 않는다. */
    const before = Promise.resolve(null);
    Promise.all([mine, before]).then(([res, prevRes]) => {
      if (cancelled) return;
      setView({ ...blank, stats: byId(res), prev: prevRes ? byId(prevRes) : {} });
    }).catch((e) => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : "래더를 불러오지 못했어요.");
      setView({ ...blank, stats: {}, prev: {} });
    });
    return () => { cancelled = true; };
  }, [q, debouncedSignature]);

  const rows = useMemo((): LadderRow[] => {
    if (!view) return [];
    const byId = new Map(members.map((m) => [m.id, m]));
    const rank = rankOf(view.stats, view.ids);
    const prevRank = rankOf(view.prev, view.ids);
    const list = view.ids
      .map((id) => byId.get(id))
      .filter((m): m is Member => m !== undefined)
      .map((m): LadderRow => {
        const e = view.stats[m.id];
        const p = view.prev[m.id];
        const now = rank.get(m.id) ?? null;
        const before = prevRank.get(m.id);
        const move: number | "new" | null =
          now === null ? null
            : before === undefined ? "new"
              : before === now ? null : before - now;
        return {
          member: m,
          rank: now,
          move,
          points: e?.rankScore != null ? Math.round(e.rankScore) : null,
          prevPoints: p?.rankScore != null ? Math.round(p.rankScore) : null,
          plays: e?.overall.plays ?? 0,
          prevPlays: p ? p.overall.plays : null,
          winRate: e && e.overall.plays > 0 ? e.overall.winRate : null,
          prevWinRate: p && p.overall.plays > 0 ? p.overall.winRate : null,
        };
      });
    return list.sort((a, b) => {
      if (a.rank === null && b.rank === null) return a.member.nickname.localeCompare(b.member.nickname);
      if (a.rank === null) return 1;
      if (b.rank === null) return -1;
      return a.rank - b.rank || a.member.nickname.localeCompare(b.member.nickname);
    });
  }, [view, members]);

  const medalOn = view !== null && view.period < currentMonthValue();

  return (
    <div className="scr-screen scr-ladder-screen">
      <div className="scr-v2-toolbar">
        <div className="scr-v2-toolbar-title-row">
          <h1 className="scr-title scr-v2-toolbar-title">래더</h1>
          {/* 실력순위 — 처음부터 쌓인 실제 레이팅 순위(RatingBoardModal ★ · 2026-10-20 · 옛 이름 '레이팅'). */}
          <button
            type="button"
            className="scr-compact-rect-btn"
            onClick={() => setRatingOpen(true)}
          >
            실력순위
          </button>
          <button
            type="button"
            className="scr-compact-rect-btn"
            onClick={() => setRivalryOpen(true)}
          >
            상성 보기
          </button>
          {/* 역대 퀸 — 제목 줄 **오른끝**(QueenHistoryModal ★ · 2026-10-20, 요청: "역대퀸 버튼 우측끝 정렬"). */}
          <button
            type="button"
            className="scr-compact-rect-btn scr-ladder-queens-btn"
            onClick={() => setQueensOpen(true)}
          >
            역대 퀸
          </button>
        </div>
      </div>

      <SearchFilterBar
        count={rows.length}
        countLabel="명"
        showCount={false}
        showSearch={false}
        searchValue=""
        onSearchChange={() => { }}
        heading={<div className="scr-stat-filters">
          <div className="scr-stat-filter-row">
            <div className="scr-stat-filter-group">
              <MonthCalendar
                value={period} onChange={setPeriod}
                minMonth={firstMonth} maxMonth={currentMonthValue()}
              />
            </div>
            {/* 이전 달 대비 변동(▲▼ · 작은 차이 숫자)은 걷었다(2026-10-20, 요청: "기본화면의 이전달 대비 변동 데이터 제거 · 설명도 이 달에 번 점수 순위로"). */}
            <span className="scr-stat-plain-head-sub scr-ladder-legend">
              이 달에 번 점수 순위
            </span>
            <span className="scr-stat-plain-head-sub scr-ladder-asof">{asOf}까지</span>
          </div>
        </div>}
      />

      {error && <div className="scr-err">{error}</div>}

      <div className={cx("scr-stats-list-panel-v2", refreshing && "scr-stats-list-panel-busy")}>
        {refreshing && <div className="scr-stats-list-busy-mark" aria-hidden><LoadingMark /></div>}
        {firstLoad ? (
          <LoadingMark />
        ) : rows.length === 0 ? (
          error ? null : <div className="scr-empty">회원이 없어요</div>
        ) : (
          <div className="scr-stat-table-clip">
            <div className="scr-ladder-table scr-scroll">
              <div className="scr-ladder-row scr-ladder-row-head">
                <span className="scr-ladder-rank-head">랭크</span>
                <span className="scr-ladder-name-head">유저</span>
                <span>레이팅</span>
                <span>경기수</span>
                <span>승률</span>
              </div>
              {rows.map((r) => (
                <div
                  key={r.member.id}
                  className={cx("scr-ladder-row", "scr-ladder-row-click", r.member.id === user?.id && "scr-stat-row-me")}
                  onClick={() => setDetailMember(r.member)}
                >
                  <span className="scr-ladder-rank">
                    {r.rank === null ? (
                      <span className="scr-stat-points-empty">-</span>
                    ) : (
                      <>
                        <span className="scr-ladder-rank-val">
                          {medalOn && r.rank <= MEDALS.length && (
                            <span className="scr-ladder-medal">{MEDALS[r.rank - 1]}</span>
                          )}
                          <span className="scr-ladder-rank-n">{r.rank}</span>
                        </span>
                      </>
                    )}
                  </span>
                  <span className="scr-ladder-name">
                    <Avatar member={r.member} size={32} />
                    <span className="scr-stat-name-btn">{r.member.nickname}</span>
                  </span>
                  <span className="scr-ladder-num">
                    <b>{r.points === null ? "-" : `${r.points > 0 ? "+" : ""}${r.points.toLocaleString()}`}</b>
                  </span>
                  <span className="scr-ladder-num">
                    <b>{r.plays > 0 ? r.plays : "-"}</b>
                  </span>
                  <span className="scr-ladder-num">
                    <b>{r.winRate === null ? "-" : `${r.winRate.toFixed(1)}%`}</b>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {ratingOpen && (
        <RatingBoardModal poolIds={poolIds} members={members} onClose={() => setRatingOpen(false)} />
      )}
      {queensOpen && (
        <QueenHistoryModal poolIds={poolIds} members={members} firstMonth={firstMonth} onClose={() => setQueensOpen(false)} />
      )}
      {rivalryOpen && (
        <RivalryOverlay from={from} to={to} onClose={() => setRivalryOpen(false)} />
      )}
      {detailMember && (
        <LadderDetailModal
          member={detailMember}
          poolIds={poolIds}
          period={period}
          firstMonth={firstMonth}
          onClose={() => setDetailMember(null)}
        />
      )}
    </div>
  );
}
