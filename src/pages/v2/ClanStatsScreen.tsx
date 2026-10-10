import { useEffect, useMemo, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, Users } from "lucide-react";
import { LoadingMark } from "../../components/common/Feedback";
import SearchFilterBar from "../../components/common/SearchFilterBar";
import { useUrlState } from "../../hooks/useUrlState";
import MonthCalendar from "../../components/common/MonthCalendar";
import TeamBuilderModal from "../../modals/TeamBuilderModal";
import { currentMonthValue, monthInputToRange } from "../../utils/date";
import MemberStatRow, { RaceDecks, StatSum } from "../stats/MemberStatRow";
import { useAppStore } from "../../store/appStore";
import { api } from "../../api/client";
import { activeMemberSearchTerms, memberMatchesTerm, normalizeSearchText } from "../../utils/memberSearch";
import { buildLexicon, segmentChunk, splitChunks } from "../../utils/gameSearch";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { cx } from "../../utils/format";
import type { ClanCompEntry, GameResultStatsResponse, GameType, Member, MemberStats, MemberStatsEntry } from "../../types";

const CLAN_TYPE: GameType = "0102";
const PERIOD_ALL = "all";

const EMPTY_STATS: MemberStats = {
  plays: 0, wins: 0, losses: 0, draws: 0, winRate: 0, bests: 0,
  avgApm: null, avgEapm: null, avgCmd: null, avgEcmd: null, avgBuild: null, truthMix: null, avgWorker5: null, mixPlays: null, mixSeconds: null, upPlays: null,
};

/** 종족 전적 — 줄마다 꺽쇠로 그 종족의 생산·업그레이드 덱을 펼친다(요청: 따로 서던 '종족별 생산·업그레이드'를 접기·펼치기로 통합).
 *  덱은 개인 카드와 같은 RaceMixCell · 처음엔 모두 접힌 채다. */
const COMP_FORMATS = ["4:4", "3:3", "2:2"] as const;
type CompFormat = (typeof COMP_FORMATS)[number];

function CompRecords({ rows }: { rows: ClanCompEntry[] }) {
  const playsOf = (f: CompFormat): number => rows.filter((c) => c.format === f).reduce((n, c) => n + c.plays, 0);
  const [format, setFormat] = useState<CompFormat | null>(null);
  const shown = format ?? COMP_FORMATS.reduce((b, f) => (playsOf(f) > playsOf(b) ? f : b), "2:2" as CompFormat);
  const list = rows.filter((c) => c.format === shown);
  return (
    /* 4:4/3:3/2:2 는 **제목 아래 줄**에 내전·공방과 같은 밑줄 탭(.scr-line-tabs)으로 선다(2026-10, 요청) — 한때 제목 오른쪽 끝의
       알약 탭(PillTabs)이었다. */
    <section className="scr-statcard scr-clan-statcard">
      <header className="scr-statcard-head">
        <span className="scr-stat-name-btn scr-stat-name-plain">종족구성별 전적</span>
      </header>
      <div className="scr-line-tabs scr-clan-comp-tabs" role="tablist" aria-label="팀 규모">
        {COMP_FORMATS.map((f) => (
          <button
            key={f} type="button" role="tab"
            aria-selected={f === shown}
            className={cx("scr-line-tab-btn", f === shown && "is-on")}
            onClick={() => setFormat(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="scr-statcard-decks scr-clan-comp-box">
      {list.length === 0 ? <p className="scr-clan-panel-empty">기록이 없어요</p> : (
        <div className="scr-clan-races">
          {list.map((c) => (
            <div key={c.label} className="scr-clan-race">
              <span className="scr-clan-race-name">{c.label}</span>
              <span className="scr-clan-race-sum">
                <span className="scr-stat-record-num-v">
                  {c.plays.toLocaleString()}<span className="scr-stat-record-num-unit">판</span>
                </span>
              </span>
              <span className="scr-clan-race-sum">
                <span className="scr-statcard-sum-label">승률</span>
                <span className="scr-stat-record-num-v">
                  {c.winRate}<span className="scr-stat-record-num-unit">%</span>
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
      </div>
    </section>
  );
}

export default function ClanStatsScreen() {
  const members = useAppStore((s) => s.members);
  const suggestions = useMemo(() => activeMemberSearchTerms(members), [members]);

  const [searchApplied, setSearchApplied] = useUrlState("u");
  const [search, setSearch] = useState(() => searchApplied);
  useEffect(() => { setSearch(searchApplied); }, [searchApplied]);
  const lexicon = useMemo(
    () => buildLexicon(suggestions.flatMap((s) => s.matchTexts), []),
    [suggestions],
  );
  const [teamBuilder, setTeamBuilder] = useState(false);
  /** "전부 펼치기" — 클랜 전체·개인 줄의 종족 덱을 한꺼번에 여닫는다(요청). 한 번 누른 뒤에도 줄마다 꺽쇠로 따로 여닫힌다. */
  const [expandAll, setExpandAll] = useState(false);
  const matchedMembers = useMemo(() => {
    const terms = splitChunks(searchApplied)
      .flatMap((c) => segmentChunk(c, lexicon).map((p) => normalizeSearchText(p.text).trim()))
      .filter(Boolean);
    return members.filter((m) =>
      m.status !== "withdrawn" && m.status !== "suspended"
      && (terms.length === 0 || terms.some((t) => memberMatchesTerm(m, t))));
  }, [members, searchApplied, lexicon]);

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
    clanComps: ClanCompEntry[];
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
    if (memberIds.length === 0) { setView({ ...blank, stats: {}, clan: null, clanComps: [] }); return; }
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
        clanComps: res.clanComps ?? [],
      });
    }).catch((e) => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : "통계를 불러오지 못했어요.");
      setView({ ...blank, stats: {}, clan: null, clanComps: [] });
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
            type="button" className="scr-compact-rect-btn"
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
            <span className="scr-clan-dash-sub">{view.memberIds.length}명</span>
            <button
              type="button" className="scr-text-btn scr-clan-dash-expand"
              aria-pressed={expandAll}
              onClick={() => setExpandAll((v) => !v)}
            >
              {expandAll
                ? <ChevronsDownUp size={13} aria-hidden />
                : <ChevronsUpDown size={13} aria-hidden />}
              {expandAll ? "전부 접기" : "전부 펼치기"}
            </button>
          </header>

          <CompRecords rows={view.clanComps} />
          <section className="scr-statcard scr-clan-statcard">
            <header className="scr-statcard-head">
              <span className="scr-stat-name-btn scr-stat-name-plain">클랜원 전체</span>
              <span className="scr-statcard-head-sep" aria-hidden>|</span>
              <StatSum stats={view.clan.overall} hideRate hideDmg />
            </header>
            <RaceDecks byRace={view.clan.byRace} openAll={expandAll} />
          </section>
        </section>
      )}

      <SearchFilterBar
        count={cards.length}
        countLabel="명"
        showCount={false}
        searchValue={search}
        onSearchChange={setSearch}
        onSearchEnter={(v) => setSearchApplied(v)}
        searchPlaceholder="유저 입력 (스페이스로 여럿, 엔터로 검색)"
        suggestions={suggestions}
        lexicon={lexicon}
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
                byRace={c.entry?.byRace}
                openAll={expandAll}
              />
            ))}
          </div>
        )}
      </div>

      {teamBuilder && <TeamBuilderModal onClose={() => setTeamBuilder(false)} />}
    </div>
  );
}
