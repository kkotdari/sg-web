import { useEffect, useMemo, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, Users } from "lucide-react";
import { LoadingMark } from "../../components/common/Feedback";
import ChipInput, { type ChipOpt } from "../../components/common/ChipInput";
import { useUrlState } from "../../hooks/useUrlState";
import MonthCalendar from "../../components/common/MonthCalendar";
import TeamBuilderModal from "../../modals/TeamBuilderModal";
import { currentMonthValue, fmt, monthInputToRange, todayStr } from "../../utils/date";
import StatGrid, { CompGrid } from "../stats/StatGrid";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useAppStore } from "../../store/appStore";
import { api } from "../../api/client";
import { memberMatchesTerm, normalizeSearchText } from "../../utils/memberSearch";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { cx } from "../../utils/format";
import type { ClanBreakdownEntry, ClanCompEntry, GameResultStatsResponse, GameType, Member, MemberStats, MemberStatsEntry } from "../../types";

const CLAN_TYPE: GameType = "0102";
const SOLO_TYPE: GameType = "0101";

/* ★ 화면 전체 탭(2026-10-20, 요청: "종족구성별 전적의 4:4 · 3:3 · 2:2 를 전체 페이지에 영향을 주는 탭으로 맨 위로 · 그에 따라 모든 데이터가 달라지게 ·
   맨 왼쪽 팀전 전체와 맨 오른쪽 1:1 추가") — 고른 규모의 판만 센다(서버 teamSize: 두 편 다 그 머릿수). 1:1 은 일대일 판(0101)의 한 명 대 한 명. */
const SIZE_TABS = [
  { value: "team", label: "팀전 전체" },
  { value: "4", label: "4:4" },
  { value: "3", label: "3:3" },
  { value: "2", label: "2:2" },
  { value: "1", label: "1:1" },
] as const;
type SizeTab = (typeof SIZE_TABS)[number]["value"];
const sizeTabOf = (v: string): SizeTab => (SIZE_TABS.some((t) => t.value === v) ? v as SizeTab : "team");
/* 맵 탭(2026-10-20, 요청: "팀전 필터 밑에 맵 필터" → "기본은 빨무 · 빨무 헌터 투혼 전체 순 · 대표맵 빨무 헌터 투혼은 이미 만들어져 있음 · 그 외는 없애기")
   — 서버 mapGroup: 그 대표맵(map_canon)에 묶인 맵의 판(sg-api repository MAP_GROUP_LIKES). 전체 = 맵을 안 가림. */
const MAP_TABS = [
  { value: "fastest", label: "빨무" },
  { value: "hunter", label: "헌터" },
  { value: "spirit", label: "투혼" },
  { value: "all", label: "전체" },
] as const;
type MapTab = (typeof MAP_TABS)[number]["value"];
const MAP_DEFAULT: MapTab = "fastest";
const mapTabOf = (v: string): MapTab => (MAP_TABS.some((t) => t.value === v) ? v as MapTab : MAP_DEFAULT);
const PERIOD_ALL = "all";
/* 하루 고르기 — 달력의 [전체 기간] 옆 [어제] [오늘](2026-10-21 요청). 값은 주소 period= 에 그대로 남는다. */
const PERIOD_DAYS = [{ value: "yesterday", label: "어제" }, { value: "today", label: "오늘" }];
const dayOfPeriod = (p: string): string | null => {
  if (p === "today") return todayStr();
  if (p !== "yesterday") return null;
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return fmt(d);
};

/** 정렬 순서 — 검색창 밑의 작은 밑줄 탭(2026-10, 요청). 기본은 승률순 · 차례 승률·딜·APM·참여 · 앞 "정렬" 글은 걷었다
 *  (2026-10-20, 요청: "정렬 문구 제거 · 승률순 딜순 APM순 참여순 · 기본 승률순"). */
const SORT_OPTS = [
  { value: "rate", label: "승률순" },
  { value: "dmg", label: "딜순" },
  { value: "apm", label: "APM순" },
  { value: "plays", label: "참여순" },
] as const;
type SortKey = (typeof SORT_OPTS)[number]["value"];

const EMPTY_STATS: MemberStats = {
  plays: 0, wins: 0, losses: 0, draws: 0, winRate: 0, bests: 0,
  avgApm: null, avgEapm: null, avgCmd: null, avgEcmd: null, avgBuild: null, truthMix: null, avgWorker5: null, mixPlays: null, mixSeconds: null, upPlays: null,
};

/** 종족구성별 전적 — 화면 탭이 고른 규모(4:4 · 3:3 · 2:2) 한 가지만(2026-10-20). 받아 둔 줄을 그 규모로 **걸러서** 그린다 —
 *  탭을 바꾼 순간 새 자료가 오기 전까지 옛 자료(다른 규모 · 팀전 전체의 모든 구성)가 비치던 것을 막는다(요청: "4:4 탭 등 선택시 전체 구성이 떴다가
 *  4:4만 나오는 문제 · 전체 구성은 이제 쓸 일 없어"). */
function CompRecords({ rows, format }: { rows: ClanCompEntry[]; format: string }) {
  return <CompGrid rows={rows.filter((c) => c.format === format)} />;
}

/** 주소 u= → 칩. 칩 배열(JSON)이 아니면 옛 한 줄 검색어 — 띄어쓰기·쉼표로 끊는다. */
function chipsOfUrl(raw: string): string[] {
  if (raw.startsWith("[")) {
    try {
      const v: unknown = JSON.parse(raw);
      if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
    } catch { /* 옛 글로 읽는다 */ }
  }
  return raw.split(/[\s,]+/).filter(Boolean);
}

export default function ClanStatsScreen() {
  const members = useAppStore((s) => s.members);
  const isMobile = useIsMobile();
  /* 유저 검색 = 칩 입력(2026-10-21, 요청: "통계 검색창 칩형태로 변경(게임목록처럼)") — 칩을 담거나 빼는 순간 걸린다 · 주소 u= 는 칩 배열(JSON).
     옛 한 줄 검색어(띄어쓰기로 이은 글)로 들어오면 낱말마다 칩 하나로 읽는다. */
  const [userRaw, setUserRaw] = useUrlState("u");
  const users = useMemo(() => chipsOfUrl(userRaw), [userRaw]);
  const setUsers = (next: string[]): void => setUserRaw(next.length ? JSON.stringify(next) : "");
  const activeMembers = useMemo(() => members.filter((m) => m.status !== "withdrawn" && m.status !== "suspended"), [members]);
  const userOpts = useMemo<ChipOpt[]>(() => activeMembers.map((m) => ({ value: m.nickname, member: m })), [activeMembers]);
  const [teamBuilder, setTeamBuilder] = useState(false);
  /** "전부 펼치기" — 클랜 전체·개인 줄의 종족 덱을 한꺼번에 여닫는다(요청). 한 번 누른 뒤에도 줄마다 꺽쇠로 따로 여닫힌다. */
  const [expandAll, setExpandAll] = useState(false);
  /* 정렬은 여러 자를 **누른 차례대로**(2026-10-22, 요청: "통계 그리드 정렬 순서 여러 개(순서 O) 적용") — 안 고른 탭을 누르면 끝에 붙고, 고른 탭을 누르면 빠진다(하나는 남는다).
     둘 이상이면 탭 앞에 작고 옅은 차례 숫자(PC·폰 같게 · 되요청 — 한때 탭 옆 "승률순 × > 참여순 × 적용중" 줄이 있었다). 고른 자들로 가린 뒤에도 같으면 늘 쓰던 차례(참여 → 승률 → APM → 커맨드). */
  const [sortKeys, setSortKeys] = useState<SortKey[]>(["rate"]);
  const toggleSort = (k: SortKey): void => setSortKeys((prev) => (prev.includes(k)
    ? (prev.length > 1 ? prev.filter((x) => x !== k) : prev)
    : [...prev, k]));
  const matchedMembers = useMemo(() => {
    const terms = users.map((u) => normalizeSearchText(u).trim()).filter(Boolean);
    return activeMembers.filter((m) => terms.length === 0 || terms.some((t) => memberMatchesTerm(m, t)));
  }, [activeMembers, users]);

  const [period, setPeriod] = useUrlState("period", currentMonthValue());
  const [sizeRaw, setSize] = useUrlState("size", "team");
  const size = sizeTabOf(sizeRaw);
  const [mapRaw, setMap] = useUrlState("map", MAP_DEFAULT);
  const mapTab = mapTabOf(mapRaw);
  useEffect(() => () => {
    const q = new URLSearchParams(window.location.search);
    if (!q.has("period") && !q.has("size") && !q.has("map")) return;
    q.delete("period");
    q.delete("size");
    q.delete("map");
    const qs = q.toString();
    window.history.replaceState(
      window.history.state, "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`,
    );
  }, []);
  const queryKey = useMemo(
    () => ({
      /* 서버엔 늘 클랜원 전부 — 클랜원 전체 줄·종족구성별 전적이 유저 검색에 안 흔들리게(2026-10-21, 요청: "유저 필터가 들어가도 클랜원 전체 데이터는
         그거에 무관해야"). 검색은 아래 줄만 거른다(viewMembers) · 그래서 칩을 바꿔도 다시 안 불러온다. */
      memberIds: activeMembers.map((m) => m.id).sort().join(","),
      period,
      size,
      map: mapTab,
    }),
    [activeMembers, period, size, mapTab],
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
    const oneDay = dayOfPeriod(debouncedQuery.period);
    const qRange = debouncedQuery.period === PERIOD_ALL
      ? { from: "", to: "" }
      : oneDay ? { from: oneDay, to: oneDay } : monthInputToRange(debouncedQuery.period);
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
      dateFrom: qRange.from, dateTo: qRange.to, race: "all",
      matchType: debouncedQuery.size === "1" ? SOLO_TYPE : CLAN_TYPE,
      teamSize: debouncedQuery.size === "team" ? undefined : Number(debouncedQuery.size),
      mapGroup: debouncedQuery.map === "all" ? undefined : debouncedQuery.map,
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
    const shown = new Set(matchedMembers.map((m) => m.id));
    return view.memberIds.filter((id) => shown.has(id)).map((id) => byId.get(id)).filter((m): m is Member => m !== undefined);
  }, [view, members, matchedMembers]);

  /** 실제 경기 수 — 편성별 판수(4:4·3:3·2:2 …)의 합이다. 편성은 가짓수가 적어 서버의 상위 5 에 잘릴 일이 없다. */
  /* 1:1 은 편성 셈에 안 든다(서버가 한 명 대 한 명은 편성에서 뺀다) — 내전이라 판마다 두 사람이 다 회원이니 사람 판수의 절반이 경기 수.
     팀전은 n:m 편성만 더한다(개인전 묶음은 팀전 통계 밖이다). */
  const clanGames = useMemo(() => {
    if (!view) return 0;
    if (size === "1") return Math.round((view.clan?.overall.plays ?? 0) / 2);
    return view.clanFormats.filter((f) => f.label.includes(":")).reduce((n, f) => n + f.plays, 0);
  }, [view, size]);

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
    /** 고른 자들(누른 차례)을 맨 앞에 두고, 같으면 늘 쓰던 차례(참여 → 승률 → APM → 커맨드)로 가린다. */
    const BASE_ORDER: DataKey[] = ["plays", "rate", "apm", "cmd"];
    const DATA_ORDER: DataKey[] = [...sortKeys, ...BASE_ORDER.filter((k) => !(sortKeys as DataKey[]).includes(k))];
    sorted.sort((a, b) => {
      for (const key of DATA_ORDER) {
        const c = compareData(key, a, b);
        if (c) return c;
      }
      return nicknameTiebreak(a, b);
    });
    return sorted;
  }, [viewMembers, view, sortKeys]);


  return (
    <div className="scr-screen scr-stats-screen-v2">
      <div className="scr-v2-toolbar">
        <div className="scr-v2-toolbar-title-row">
          <h1 className="scr-title scr-v2-toolbar-title">통계</h1>
          <MonthCalendar
            value={period} onChange={setPeriod}
            maxMonth={currentMonthValue()}
            allValue={PERIOD_ALL}
            days={PERIOD_DAYS}
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

      <div className="scr-line-tabs scr-stats-size-tabs" role="tablist" aria-label="팀 규모">
        {SIZE_TABS.map((t) => (
          <button
            key={t.value} type="button" role="tab"
            aria-selected={t.value === size}
            className={cx("scr-line-tab-btn", t.value === size && "is-on")}
            onClick={() => setSize(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="scr-line-tabs scr-stats-size-tabs scr-stats-map-tabs" role="tablist" aria-label="맵">
        {MAP_TABS.map((t) => (
          <button
            key={t.value} type="button" role="tab"
            aria-selected={t.value === mapTab}
            className={cx("scr-line-tab-btn", t.value === mapTab && "is-on")}
            onClick={() => setMap(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 검색창과 명수 자리 바꿈(2026-10-20, 요청: "통계의 명수와 검색창 위치 바꾸기") — 검색창이 맵 탭 바로 아래(옛 명수 자리) · 명수와 "전부 펼치기"는
          정렬 줄 바로 위(옛 검색창 자리)로. 종족구성별 전적은 그대로 검색창 아래다. */}
      <div className="scr-stats-search">
        <ChipInput values={users} onChange={setUsers} options={userOpts} placeholder="조회할 유저 닉네임" />
      </div>
      {/* 종족구성별 전적은 한 규모(4:4 · 3:3 · 2:2)를 골랐을 때만(2026-10-20, 요청: "팀전 전체에서 종족구성별 전적 숨기기") — 1:1 엔 구성이 없다.
          클랜원 전체는 아래 표(StatGrid)의 맨 윗줄로 옮겼다(2026-10-20). */}
      {view?.clan && size !== "1" && size !== "team" && (
        <section className="scr-clan-dash" aria-label="클랜 전체">
          <CompRecords rows={view.clanComps} format={`${size}:${size}`} />
        </section>
      )}

      {view?.clan && (
        <header className="scr-clan-dash-head scr-stats-count-row">
          {/* 머리는 **명수뿐**이다(2026-10, 요청: "클랜전체 N 명 → 그냥 N명으로") — 아래 카드 제목이 이미 클랜 전체라고 말한다. */}
          <span className="scr-clan-dash-sub">{viewMembers.length}명</span>
          {/* 전부 펼치기·접기는 폰에도(2026-10-21, 요청: "통계 폰화면에도 전부 펼치기 접기 추가") — 폰 줄(MobileRow)도 openAll 을 탄다. */}
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
      )}

      <div className="scr-stats-sort">
        <span className="scr-stats-sort-label">정렬 (복수선택)</span>
        <div className="scr-line-tabs scr-stats-sort-tabs" role="tablist" aria-label="정렬 순서">
          {SORT_OPTS.map((o) => {
            const at = sortKeys.indexOf(o.value);
            return (
              <button
                key={o.value} type="button" role="tab"
                aria-selected={at >= 0}
                className={cx("scr-line-tab-btn", at >= 0 && "is-on")}
                onClick={() => toggleSort(o.value)}
              >
                {sortKeys.length > 1 && at >= 0 && <span className="scr-stats-sort-no">{at + 1}</span>}
                {o.label}
              </button>
            );
          })}
        </div>
        {/* 폰 줄 누름 힌트 — 표 밖, 정렬 탭 줄 오른끝(2026-10-20, 요청: "힌트 위치 그리드 외부 위"). */}
        {isMobile && <span className="scr-sg-hint">행을 눌러서 그래프 보기</span>}
      </div>

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
          /* ★★ 표(StatGrid · 2026-10-20) — 맨 윗줄 클랜원 전체 · 그 아래 사람마다 한 줄. */
          <StatGrid
            clan={view?.clan ? { stats: view.clan.overall, byRace: view.clan.byRace } : null}
            clanGames={clanGames}
            rows={cards.map((c) => ({ member: c.member, stats: c.stats, byRace: c.entry?.byRace }))}
            openAll={expandAll}
            mobile={isMobile}
          />
        )}
      </div>

      {teamBuilder && <TeamBuilderModal onClose={() => setTeamBuilder(false)} />}
    </div>
  );
}
