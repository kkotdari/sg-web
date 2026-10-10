import { useEffect, useMemo, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, Users } from "lucide-react";
import { LoadingMark } from "../../components/common/Feedback";
import SearchFilterBar from "../../components/common/SearchFilterBar";
import { useUrlState } from "../../hooks/useUrlState";
import MonthCalendar from "../../components/common/MonthCalendar";
import TeamBuilderModal from "../../modals/TeamBuilderModal";
import { currentMonthValue, monthInputToRange } from "../../utils/date";
import MemberStatRow, { RaceDecks, StatColHead, StatSum } from "../stats/MemberStatRow";
import { useAppStore } from "../../store/appStore";
import { api } from "../../api/client";
import { activeMemberSearchTerms, memberMatchesTerm, normalizeSearchText } from "../../utils/memberSearch";
import { buildLexicon, segmentChunk, splitChunks } from "../../utils/gameSearch";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { cx } from "../../utils/format";
import type { ClanBreakdownEntry, ClanCompEntry, GameResultStatsResponse, GameType, Member, MemberStats, MemberStatsEntry } from "../../types";

const CLAN_TYPE: GameType = "0102";
const PERIOD_ALL = "all";

/** 정렬 순서 — 검색창 밑의 작은 밑줄 탭(2026-10, 요청). 기본은 참여순(판 수 많은 사람부터). */
const SORT_OPTS = [
  { value: "plays", label: "참여" },
  { value: "rate", label: "승률" },
  { value: "dmg", label: "딜량" },
  { value: "apm", label: "APM" },
] as const;
type SortKey = (typeof SORT_OPTS)[number]["value"];

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
              <span className="scr-statcard-sum-item scr-sum-plays">
                <span className="scr-stat-record-num-v">
                  <span className="scr-stat-record-num-n">{c.plays.toLocaleString()}</span>
                  <span className="scr-stat-record-num-unit">회</span>
                </span>
              </span>
              <span className="scr-statcard-sum-item scr-sum-rate">
                <span className="scr-stat-record-num-v">
                  <span className="scr-stat-record-num-n">{c.winRate}</span>
                  <span className="scr-stat-record-num-unit">%</span>
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
  const [sortKey, setSortKey] = useState<SortKey>("plays");
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
    /** 편성(4:4·3:3·2:2 …)별 경기 수 — 이 합이 **실제 경기 수**다(clan.overall.plays 는 사람이 뛴 횟수라 몇 배 크다). */
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
    if (memberIds.length === 0) { setView({ ...blank, stats: {}, clan: null, clanComps: [], clanFormats: [] }); return; }
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
        clanComps: res.clanComps ?? [], clanFormats: res.clanFormats ?? [],
      });
    }).catch((e) => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : "통계를 불러오지 못했어요.");
      setView({ ...blank, stats: {}, clan: null, clanComps: [], clanFormats: [] });
    });
    return () => { cancelled = true; };
  }, [debouncedQuery, debouncedSignature]);

  const viewMembers = useMemo(() => {
    if (!view) return [];
    const byId = new Map(members.map((m) => [m.id, m]));
    return view.memberIds.map((id) => byId.get(id)).filter((m): m is Member => m !== undefined);
  }, [view, members]);

  /** 실제 경기 수 — 편성별 판수(4:4·3:3·2:2 …)의 합이다. 편성은 가짓수가 적어 서버의 상위 5 에 잘릴 일이 없다. */
  const clanGames = useMemo(
    () => (view?.clanFormats ?? []).reduce((n, f) => n + f.plays, 0),
    [view],
  );

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
    type DataKey = "plays" | "rate" | "dmg" | "apm" | "cmd";
    /** 딜량 — 그 경기 참가자 평균의 몇 배인가(dmgDealtRel · 100 = 1.0배). 옛 경기엔 없어 그런 사람은 뒤로 보낸다. */
    const noDmgLast = (a: (typeof list)[number], b: (typeof list)[number]) => {
      const am = typeof a.stats.dmgDealtRel !== "number";
      const bm = typeof b.stats.dmgDealtRel !== "number";
      if (am && bm) return nicknameTiebreak(a, b);
      if (am) return 1;
      if (bm) return -1;
      return 0;
    };
    const compareData = (key: DataKey, a: (typeof list)[number], b: (typeof list)[number]) => {
      switch (key) {
        case "plays": return noPlaysLast(a, b) || dirSign * (a.stats.plays - b.stats.plays);
        case "rate": return noPlaysLast(a, b) || dirSign * (a.stats.winRate - b.stats.winRate);
        case "dmg": return noDmgLast(a, b) || dirSign * ((a.stats.dmgDealtRel ?? 0) - (b.stats.dmgDealtRel ?? 0));
        case "apm": return noAvgLast(a, b, "avgApm") || dirSign * ((a.stats.avgApm ?? 0) - (b.stats.avgApm ?? 0));
        case "cmd": return noAvgLast(a, b, "avgCmd") || dirSign * ((a.stats.avgCmd ?? 0) - (b.stats.avgCmd ?? 0));
      }
    };
    /** 고른 자를 맨 앞에 두고, 같으면 늘 쓰던 차례(참여 → 승률 → APM → 커맨드)로 가린다. */
    const BASE_ORDER: DataKey[] = ["plays", "rate", "apm", "cmd"];
    const DATA_ORDER: DataKey[] = [sortKey, ...BASE_ORDER.filter((k) => k !== sortKey)];
    sorted.sort((a, b) => {
      for (const key of DATA_ORDER) {
        const c = compareData(key, a, b);
        if (c) return c;
      }
      return nicknameTiebreak(a, b);
    });
    return sorted;
  }, [viewMembers, view, sortKey]);


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
            {/* 머리는 **명수뿐**이다(2026-10, 요청: "클랜전체 N 명 → 그냥 N명으로") — 아래 카드 제목이 이미 클랜 전체라고 말한다.
                화면 낭독기에는 감싼 section 의 aria-label 이 남는다. */}
            {/* 총 경기 수는 **머리로 올렸다**(2026-10) — 승률 칸에 세워 두면 그 아래 종족 줄의 승률과 칸 뜻이 어긋나,
                칸 이름 줄(StatColHead) 하나로 덮을 수가 없다. */}
            <span className="scr-clan-dash-sub">
              {view.memberIds.length}명
              {clanGames > 0 && <> · {clanGames.toLocaleString()}게임</>}
            </span>
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

          <StatColHead apm />
          <CompRecords rows={view.clanComps} />
          <section className="scr-statcard scr-clan-statcard">
            <header className="scr-statcard-head">
              <span className="scr-stat-name-btn scr-stat-name-plain">클랜원 전체</span>
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

      <div className="scr-stats-sort">
        <span className="scr-stats-sort-label">정렬</span>
        <div className="scr-line-tabs scr-stats-sort-tabs" role="tablist" aria-label="정렬 순서">
          {SORT_OPTS.map((o) => (
            <button
              key={o.value} type="button" role="tab"
              aria-selected={o.value === sortKey}
              className={cx("scr-line-tab-btn", o.value === sortKey && "is-on")}
              onClick={() => setSortKey(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <StatColHead apm dmg />

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
