import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { LoadingMark } from "../../components/common/Feedback";
import SearchFilterBar from "../../components/common/SearchFilterBar";
import { useUrlState } from "../../hooks/useUrlState";
import MonthCalendar from "../../components/common/MonthCalendar";
import TeamBuilderModal from "../../modals/TeamBuilderModal";
import { currentMonthValue, monthInputToRange } from "../../utils/date";
import MemberStatRow, { RaceMixCell, RACE_TONE } from "../stats/MemberStatRow";
import { useAppStore } from "../../store/appStore";
import { api } from "../../api/client";
import { activeMemberSearchTerms, memberMatchesQuery } from "../../utils/memberSearch";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { cx } from "../../utils/format";
import type { BaseRace, ClanBreakdownEntry, GameResultStatsResponse, GameType, Member, MemberStats, MemberStatsEntry } from "../../types";

const RACES: BaseRace[] = ["테란", "프로토스", "저그"];

const CLAN_TYPE: GameType = "0102";
const PERIOD_ALL = "all";

const EMPTY_STATS: MemberStats = {
  plays: 0, wins: 0, losses: 0, draws: 0, winRate: 0, bests: 0,
  avgApm: null, avgEapm: null, avgCmd: null, avgEcmd: null, avgBuild: null, truthMix: null, avgWorker5: null, mixPlays: null, mixSeconds: null, upPlays: null,
};

function KpiTile({
  label, value, unit, sub,
}: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div className="scr-clan-kpi">
      <span className="scr-clan-kpi-label">{label}</span>
      <span className="scr-clan-kpi-value">
        {value}
        {unit && <span className="scr-clan-kpi-unit">{unit}</span>}
      </span>
      {sub && <span className="scr-clan-kpi-sub">{sub}</span>}
    </div>
  );
}

function RaceRecords({ byRace }: { byRace?: Partial<Record<BaseRace, MemberStats>> }) {
  const parts = RACES.map((r) => ({ race: r, s: byRace?.[r] }));
  return (
    <>
      <div className="scr-clan-races">
        {parts.map((p) => (
          <div key={p.race} className="scr-clan-race">
            <span className="scr-clan-race-name">
              <i className="scr-clan-band-dot" style={{ backgroundColor: RACE_TONE[p.race] }} />
              {p.race}
            </span>
            <span className="scr-clan-race-plays">
              {(p.s?.plays ?? 0).toLocaleString()}<span className="scr-clan-race-unit">회</span>
            </span>
            <span className="scr-clan-race-rate">
              <span className="scr-clan-race-label">승률</span>
              {p.s && p.s.plays > 0 ? `${p.s.winRate}%` : "-"}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function BreakdownPanel({
  title, note, rows, empty,
}: { title: string; note: string; rows: ClanBreakdownEntry[]; empty: string }) {
  return (
    <div className="scr-clan-panel">
      <div className="scr-clan-panel-head">
        <span className="scr-clan-panel-title">{title}</span>
        <span className="scr-clan-panel-note">{note}</span>
      </div>
      {rows.length === 0 ? (
        <p className="scr-clan-panel-empty">{empty}</p>
      ) : (
        <ol className="scr-clan-panel-list">
          {rows.map((r, i) => (
            <li key={r.label} className="scr-clan-panel-item">
              <span className="scr-clan-panel-rank">{i + 1}</span>
              <span className="scr-clan-panel-body">
                <span className="scr-clan-panel-line">
                  <span className="scr-clan-panel-name" title={r.label}>{r.label}</span>
                  <span className="scr-clan-panel-num">
                    {r.plays}<span className="scr-clan-panel-unit">판</span>
                    <span className="scr-clan-panel-ratio">{r.ratio}%</span>
                  </span>
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function ClanStatsScreen() {
  const members = useAppStore((s) => s.members);
  const user = useAppStore((s) => s.user);
  const suggestions = useMemo(() => activeMemberSearchTerms(members), [members]);

  const [search, setSearch] = useUrlState("u");
  const [teamBuilder, setTeamBuilder] = useState(false);
  const matchedMembers = useMemo(() => {
    return members.filter((m) =>
      m.status !== "withdrawn" && m.status !== "suspended" && memberMatchesQuery(m, search));
  }, [members, search]);

  const [period, setPeriod] = useUrlState("period", currentMonthValue());
  useEffect(() => () => {
    const q = new URLSearchParams(window.location.search);
    if (!q.has("period")) return;
    q.delete("period");
    const qs = q.toString();
    window.history.replaceState(
      window.history.state, "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`,
    );
  }, []);
  const queryKey = useMemo(
    () => ({
      memberIds: matchedMembers.map((m) => m.id).sort().join(","),
      period,
    }),
    [matchedMembers, period],
  );
  const queryKeySignature = useMemo(() => JSON.stringify(queryKey), [queryKey]);
  const debouncedSignature = useDebouncedValue(queryKeySignature, 300);
  const debouncedQuery = useMemo(() => JSON.parse(debouncedSignature) as typeof queryKey, [debouncedSignature]);

  interface StatsView {
    key: string;
    memberIds: string[];
    stats: Record<string, MemberStatsEntry>;
    clan: MemberStatsEntry | null;
    clanMaps: ClanBreakdownEntry[];
    clanFormats: ClanBreakdownEntry[];
  }
  const [view, setView] = useState<StatsView | null>(null);
  const [error, setError] = useState("");
  const firstLoad = view === null;
  const refreshing = view !== null && view.key !== debouncedSignature;

  useEffect(() => {
    const memberIds = debouncedQuery.memberIds ? debouncedQuery.memberIds.split(",") : [];
    const blank = {
      key: debouncedSignature,
      memberIds,
    };
    const qRange = debouncedQuery.period === PERIOD_ALL
      ? { from: "", to: "" }
      : monthInputToRange(debouncedQuery.period);
    if (memberIds.length === 0) { setView({ ...blank, stats: {}, clan: null, clanMaps: [], clanFormats: [] }); return; }
    let cancelled = false;
    setError("");
    const byId = (res: GameResultStatsResponse) => {
      const map: Record<string, MemberStatsEntry> = {};
      res.members.forEach((entry) => { map[entry.memberId] = entry; });
      return map;
    };
    api.getGameResultStats({
      memberIds,
      dateFrom: qRange.from, dateTo: qRange.to, matchType: CLAN_TYPE, race: "all",
    }).then((res) => {
      if (cancelled) return;
      setView({
        ...blank, stats: byId(res), clan: res.clan ?? null,
        clanMaps: res.clanMaps ?? [], clanFormats: res.clanFormats ?? [],
      });
    }).catch((e) => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : "통계를 불러오지 못했어요.");
      setView({ ...blank, stats: {}, clan: null, clanMaps: [], clanFormats: [] });
    });
    return () => { cancelled = true; };
  }, [debouncedQuery, debouncedSignature]);

  const viewMembers = useMemo(() => {
    if (!view) return [];
    const byId = new Map(members.map((m) => [m.id, m]));
    return view.memberIds.map((id) => byId.get(id)).filter((m): m is Member => m !== undefined);
  }, [view, members]);

  const cards = useMemo(() => {
    const list = viewMembers.map((m) => {
      const entry = view?.stats[m.id];
      return { member: m, stats: entry?.overall ?? EMPTY_STATS, entry };
    });

    const sorted = [...list];
    const nicknameTiebreak = (a: (typeof list)[number], b: (typeof list)[number]) =>
      a.member.nickname.localeCompare(b.member.nickname);
    const noPlaysLast = (a: (typeof list)[number], b: (typeof list)[number]) => {
      if (a.stats.plays === 0 && b.stats.plays === 0) return nicknameTiebreak(a, b);
      if (a.stats.plays === 0) return 1;
      if (b.stats.plays === 0) return -1;
      return 0;
    };
    const noAvgLast = (a: (typeof list)[number], b: (typeof list)[number], key: "avgApm" | "avgCmd") => {
      const aMissing = a.stats[key] === null;
      const bMissing = b.stats[key] === null;
      if (aMissing && bMissing) return nicknameTiebreak(a, b);
      if (aMissing) return 1;
      if (bMissing) return -1;
      return 0;
    };
    const dirSign = -1;
    type DataKey = "plays" | "rate" | "apm" | "cmd";
    const compareData = (key: DataKey, a: (typeof list)[number], b: (typeof list)[number]) => {
      switch (key) {
        case "plays": return noPlaysLast(a, b) || dirSign * (a.stats.plays - b.stats.plays);
        case "rate": return noPlaysLast(a, b) || dirSign * (a.stats.winRate - b.stats.winRate);
        case "apm": return noAvgLast(a, b, "avgApm") || dirSign * ((a.stats.avgApm ?? 0) - (b.stats.avgApm ?? 0));
        case "cmd": return noAvgLast(a, b, "avgCmd") || dirSign * ((a.stats.avgCmd ?? 0) - (b.stats.avgCmd ?? 0));
      }
    };
    const DATA_ORDER: DataKey[] = ["plays", "rate", "apm", "cmd"];
    sorted.sort((a, b) => {
      for (const key of DATA_ORDER) {
        const c = compareData(key, a, b);
        if (c) return c;
      }
      return nicknameTiebreak(a, b);
    });
    return sorted;
  }, [viewMembers, view]);


  return (
    <div className="scr-screen scr-stats-screen-v2">
      <div className="scr-v2-toolbar">
        <div className="scr-v2-toolbar-title-row">
          <h1 className="scr-title scr-v2-toolbar-title">통계</h1>
          <MonthCalendar
            value={period} onChange={setPeriod}
            maxMonth={currentMonthValue()}
            allValue={PERIOD_ALL}
            className="scr-v2-toolbar-month"
          />
          <button
            type="button" className="scr-rect-btn"
            onClick={() => setTeamBuilder(true)}
          >
            <Users size={13} /> 팀 구성하기
            <span className="scr-tb-beta">beta</span>
          </button>
        </div>
      </div>

      {view?.clan && (
        <section className="scr-clan-dash" aria-label="클랜 전체">
          <header className="scr-clan-dash-head">
            <span className="scr-clan-dash-title">클랜 전체</span>
            <span className="scr-clan-dash-sub">
              {view.memberIds.length}명 · {period === PERIOD_ALL ? "전체 기간" : period.replace("-", ".")}
            </span>
          </header>

          <div className="scr-clan-dash-row">
          <div className="scr-clan-cell scr-clan-kpis">
            <KpiTile
              label="총 참가" value={view.clan.overall.plays.toLocaleString()} unit="회"
              sub={`${view.clan.overall.wins}승 ${view.clan.overall.losses}패${
                view.clan.overall.draws ? ` ${view.clan.overall.draws}무` : ""}`}
            />
            <KpiTile label="평균 APM" value={view.clan.overall.avgApm?.toLocaleString() ?? "-"} />
            <KpiTile label="평균 커맨드" value={view.clan.overall.avgCmd?.toLocaleString() ?? "-"} unit="/분" />
          </div>

          <div className="scr-clan-cell scr-clan-dash-panels">
            <BreakdownPanel
              title="맵" note="대표맵 기준 · 상위 5"
              rows={view.clanMaps} empty="기록이 없어요"
            />
            <BreakdownPanel
              title="편성" note="팀전·난투 기준 · 상위 5"
              rows={view.clanFormats} empty="기록이 없어요"
            />
          </div>
          <div className="scr-clan-cell scr-clan-cell-races">
            <span className="scr-clan-panel-title">종족 전적</span>
            <RaceRecords byRace={view.clan.byRace} />
          </div>
          </div>

          <details className="scr-clan-detail">
            <summary className="scr-clan-detail-sum">종족별 생산·업그레이드</summary>
            <div className="scr-statcard-decks scr-clan-decks">
              <div className="scr-statcard-deck-grid">
                {RACES.map((r) => (
                  <div key={r} className="scr-statcard-deck">
                    <span className="scr-statcard-deck-head">
                      <i className="scr-clan-band-dot" style={{ backgroundColor: RACE_TONE[r] }} />
                      {r}
                    </span>
                    <RaceMixCell race={r} stats={view.clan?.byRace?.[r]} />
                  </div>
                ))}
              </div>
            </div>
          </details>
        </section>
      )}

      <SearchFilterBar
        count={cards.length}
        countLabel="명"
        showCount={false}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="유저 입력 또는 @로 목록 띄우기"
        suggestions={suggestions}
      />

      {error && <div className="scr-err">{error}</div>}

      <div className={cx("scr-stats-list-panel-v2", refreshing && "scr-stats-list-panel-busy")}>
        {refreshing && (
          <div className="scr-stats-list-busy-mark" aria-hidden><LoadingMark /></div>
        )}
        {firstLoad ? (
          <LoadingMark />
        ) : cards.length === 0 ? (
          error ? null : <div className="scr-empty">결과가 없어요</div>
        ) : (
          <div className="scr-stat-cards">
            {cards.map((c) => (
              <MemberStatRow
                key={c.member.id}
                member={c.member}
                stats={c.stats}
                me={c.member.id === user?.id}
                byRace={c.entry?.byRace}
              />
            ))}
          </div>
        )}
      </div>

      {teamBuilder && <TeamBuilderModal onClose={() => setTeamBuilder(false)} />}
    </div>
  );
}
