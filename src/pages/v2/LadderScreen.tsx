import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LADDER_GAME_TYPES } from "../../constants/gameTypes";
import { LoadingMark } from "../../components/common/Feedback";
import SearchFilterBar from "../../components/common/SearchFilterBar";
import { useUrlState } from "../../hooks/useUrlState";
import MonthCalendar from "../../components/common/MonthCalendar";
import Avatar from "../../components/common/Avatar";
import { rankOf } from "./rankOrder";
import LadderDetailModal from "./LadderDetailModal";
import LadderDetailBody, { trendMonths, type LadderDetailData } from "./LadderDetailBody";
import { useIsMobile } from "../../hooks/useIsMobile";
import QueenHistoryModal from "./QueenHistoryModal";
import RatingBoardModal from "./RatingBoardModal";
import { useAppStore } from "../../store/appStore";
import { api } from "../../api/client";
import { monthInputToRange, shiftMonthValue, currentMonthValue } from "../../utils/date";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { usePageBackground } from "../../hooks/usePageBackground";
import { cx } from "../../utils/format";
import type { GameResult, GameResultStatsResponse, GameType, Member, MemberStatsEntry } from "../../types";

const LADDER_TYPE: GameType = LADDER_GAME_TYPES[0];
/* PC 상세 팝오버(2026-10-24, 요청: "피시에서는 마우스오버시 자동으로 팝오버로 변경하고 폭도 넓힘") — 줄에 마우스를 얹으면 뜨고, 줄·팝오버를 다 떠나면
   POP_LINGER_MS 뒤 닫힌다(팝오버로 건너갈 틈). 폭은 CSS .scr-ladder-pop(640 · 창 480 보다 넓게) · 그래프 viewBox 도 그 폭. */
const POP_LINGER_MS = 160;
const POP_W = 640;
const POP_CHART_W = 600;
const POP_GAP = 18;
const POP_MARGIN = 16;

interface LadderRow {
  member: Member;
  rank: number | null;
  move: number | "new" | null;
  points: number | null;
  prevPoints: number | null;
  plays: number;
  wins: number;
  draws: number;
  losses: number;
  prevPlays: number | null;
  winRate: number | null;
  prevWinRate: number | null;
}

export default function LadderScreen() {
  usePageBackground("/images/bg/stats_bg.jpg", "/images/bg/stats_bg_mobile.png");
  const members = useAppStore((s) => s.members);

  const [period, setPeriod] = useUrlState("period", currentMonthValue());
  const [queensOpen, setQueensOpen] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [detailMember, setDetailMember] = useState<Member | null>(null);
  const mobile = useIsMobile();
  /* 팝오버(PC) — 어느 줄에 얹었는지 · 가리킨 자리(x · 줄 위 y). */
  const [pop, setPop] = useState<{ member: Member; x: number; y: number } | null>(null);
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popCancel = (): void => { if (popTimer.current) { clearTimeout(popTimer.current); popTimer.current = null; } };
  const popLeave = (): void => { popCancel(); popTimer.current = setTimeout(() => { popTimer.current = null; setPop(null); }, POP_LINGER_MS); };
  const popEnter = (m: Member, e: { currentTarget: HTMLElement; clientX: number }): void => {
    popCancel();
    const top = e.currentTarget.getBoundingClientRect().top;
    setPop((cur) => (cur && cur.member.id === m.id ? cur : { member: m, x: e.clientX, y: top }));
  };
  useEffect(() => () => popCancel(), []);
  useEffect(() => {
    if (!pop) return undefined;
    const off = (): void => setPop(null);
    const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") setPop(null); };
    window.addEventListener("scroll", off, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("scroll", off); window.removeEventListener("keydown", onKey); };
  }, [pop]);
  useEffect(() => { if (mobile) setPop(null); }, [mobile]);

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
  /* 상세 재료(순위 변동 7달 · 그 달 래더 경기 전부)는 순위표와 **같이** 받는다(2026-10-24, 요청: "팝오버를 위해 래더 조회시 상세도 같이 조회로 변경") —
     순위표는 조회한 달 응답이 오는 대로 먼저 그리고, 상세는 일곱 달·경기가 다 오면 채운다(그 전엔 loading). */
  const [detail, setDetail] = useState<LadderDetailData>({ period, ranks: {}, games: [], loading: true });
  const firstLoad = view === null;
  const refreshing = view !== null && view.key !== debouncedSignature;

  useEffect(() => {
    const ids = q.ids ? q.ids.split(",") : [];
    const blank = {
      key: debouncedSignature,
      period: q.period,
      ids,
    };
    if (ids.length === 0) {
      setView({ ...blank, stats: {}, prev: {} });
      setDetail({ period: q.period, ranks: {}, games: [], loading: false });
      return;
    }
    let cancelled = false;
    setError("");
    setDetail({ period: q.period, ranks: {}, games: [], loading: true });
    const byId = (res: GameResultStatsResponse) => {
      const map: Record<string, MemberStatsEntry> = {};
      res.members.forEach((e) => { map[e.memberId] = e; });
      return map;
    };
    const statsOf = (from: string, to: string) => api.getGameResultStats({
      memberIds: ids, dateFrom: from, dateTo: to,
      matchType: LADDER_TYPE, race: "all", ratingScope: "period",
    });
    const mine = statsOf(q.from, q.to);
    /* 앞뒤 세 달 — 다음 달들(아직 없는 달)은 묻지 않고 비워 둔다. 조회한 달은 위 mine 을 같이 쓴다. */
    const nowM = currentMonthValue();
    const rankP = Promise.all(trendMonths(q.period).map(async (m): Promise<[string, Map<string, number>]> => {
      if (m > nowM) return [m, new Map()];
      const { from, to } = monthInputToRange(m);
      const res = m === q.period ? await mine : await statsOf(from, to).catch(() => null);
      return [m, res ? rankOf(byId(res), ids) : new Map()];
    }));
    const gamesP = (async (): Promise<GameResult[]> => {
      const out: GameResult[] = [];
      let cursor: string | undefined;
      do {
        const page = await api.getGameResultsPage({
          matchType: LADDER_TYPE, sort: "latest", dateFrom: q.from, dateTo: q.to, limit: 100, cursor,
          withArchived: true,   // 마감 보존한 판(결과만 남음)도 이력엔 남긴다(2026-10-23, 요청: "래더 상세에만")
        });
        out.push(...page.items);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return out;
    })();
    Promise.all([rankP, gamesP]).then(([rs, games]) => {
      if (cancelled) return;
      setDetail({ period: q.period, ranks: Object.fromEntries(rs), games, loading: false });
    }).catch(() => {
      if (!cancelled) setDetail((d) => ({ ...d, loading: false }));
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
          wins: e?.overall.wins ?? 0,
          draws: e?.overall.draws ?? 0,
          losses: e?.overall.losses ?? 0,
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
            실력순위 보기
          </button>
          {/* 상성 보기는 걷었다(2026-10-20, 요청: "상성보기 제거"). */}
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
          /* ★ 래더 = 실력순위 창과 같은 줄 꼴(2026-10-20, 요청: "래더 기본 페이지를 레이팅 페이지처럼 예쁘게 · 단 메달은 제거") —
             [순위 | 아바타 | 닉네임(아래 전적 · 승률) | 이 달에 번 점수]. 줄을 누르면 그 사람의 래더 자세히(LadderDetailModal). */
          <div className="scr-ladder-board">
            {rows.map((r) => (
              <div
                key={r.member.id}
                className={cx("scr-rating-row", "scr-ladder-board-row", pop?.member.id === r.member.id && "is-pop")}
                onClick={(e) => { if (mobile) setDetailMember(r.member); else popEnter(r.member, e); }}
                onPointerEnter={(e) => { if (!mobile && e.pointerType === "mouse") popEnter(r.member, e); }}
                onPointerLeave={() => { if (!mobile) popLeave(); }}
              >
                <span className="scr-rating-rank">{r.rank === null ? "-" : r.rank}</span>
                <Avatar member={r.member} size={36} className="scr-queen-avatar-img" />
                <span className="scr-rating-who">
                  <span className="scr-rating-name">{r.member.nickname}</span>
                  <span className="scr-rating-rec">
                    {r.plays > 0
                      ? `${r.plays}전 ${r.wins}승 ${r.draws}무 ${r.losses}패 · ${r.winRate === null ? "-" : `${r.winRate.toFixed(1)}%`}`
                      : "이 달 경기 없음"}
                  </span>
                </span>
                <span className="scr-rating-score">
                  {r.points === null ? <span className="scr-stat-points-empty">-</span> : `${r.points > 0 ? "+" : ""}${r.points.toLocaleString()}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {ratingOpen && (
        <RatingBoardModal poolIds={poolIds} members={members} onClose={() => setRatingOpen(false)} />
      )}
      {queensOpen && (
        <QueenHistoryModal poolIds={poolIds} members={members} firstMonth={firstMonth} onClose={() => setQueensOpen(false)} />
      )}
      {detailMember && mobile && (
        <LadderDetailModal
          member={detailMember}
          data={detail}
          onClose={() => setDetailMember(null)}
        />
      )}
      {pop && !mobile && (
        <LadderPop anchor={pop} data={detail} onEnter={popCancel} onLeave={popLeave} />
      )}
    </div>
  );
}

/** PC 상세 팝오버 — 가리킨 x 의 오른쪽(모자라면 왼쪽)에, 줄 위에 맞춰 세우되 화면 안에 들게 자른다(높이는 그린 뒤 잰다). */
function LadderPop({
  anchor, data, onEnter, onLeave,
}: {
  anchor: { member: Member; x: number; y: number };
  data: LadderDetailData;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(anchor.y);
  const vw = window.innerWidth;
  const w = Math.min(POP_W, vw - POP_MARGIN * 2);
  let left = anchor.x + POP_GAP;
  if (left + w > vw - POP_MARGIN) left = anchor.x - POP_GAP - w;
  left = Math.max(POP_MARGIN, Math.min(vw - POP_MARGIN - w, left));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    setTop(Math.max(POP_MARGIN, Math.min(window.innerHeight - POP_MARGIN - h, anchor.y)));
  }, [anchor.y, anchor.member.id, data]);
  return (
    <div
      ref={ref}
      className="scr-ladder-pop"
      style={{ left, top, width: w }}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      <LadderDetailBody member={anchor.member} data={data} chartW={POP_CHART_W} tight />
    </div>
  );
}
