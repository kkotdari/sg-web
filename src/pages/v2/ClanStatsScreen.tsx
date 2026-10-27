import { Fragment, useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { LoadingMark } from "../../components/common/Feedback";
import ChipInput, { type ChipOpt } from "../../components/common/ChipInput";
import { useUrlState } from "../../hooks/useUrlState";
import MonthCalendar from "../../components/common/MonthCalendar";
import { currentMonthValue, MONTH_PERIOD_RE, monthPeriodToRange } from "../../utils/date";
import StatGrid, { CompGrid, StatHelp, type StatSortKey } from "../stats/StatGrid";
import { statTrendMonths, type StatTrendData, type TrendEntry } from "../stats/StatTrend";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useAppStore } from "../../store/appStore";
import { api } from "../../api/client";
import { memberMatchesTerm, normalizeSearchText } from "../../utils/memberSearch";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { cx } from "../../utils/format";
import type { BaseRace, ClanBreakdownEntry, ClanCompEntry, GameResultStatsResponse, GameType, Member, MemberStats, MemberStatsEntry } from "../../types";

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
/* 기간은 달 단위뿐이다 — [어제] [오늘] 하루 고르기는 걷었다(2026-10-22, 요청: "아예 달 단위로 통일 · 오늘 어제 일자 조회 다 제거" — 마감한 달은
   달별 합계만 남는다). 옛 주소의 period=yesterday 는 달 범위로 못 읽어 이번 달로 떨어진다(아래 qRange).
   ★ [오늘]은 되살렸다(2026-10-26, 요청: "기간에 전체기간 과 오늘 버튼을 외부에 추가(월선택, 전체기간, 오늘은 배타적으로 활성됨)" → "기준을 오후 4시로 변경 ·
   게임번호가 아닌 실제 시작시간으로") → "정오 기준으로 변경") — 한국 시각 정오가 하루의 경계다(정오 전이면 어제 정오부터). 서버는 dateFrom/dateTo 의 THH:MM 을 판의 실제 시작 시각으로
   자른다(sg-api DayAt · 시작 시각을 모르는 판은 안 든다). */
const PERIOD_TODAY = "today";
/** 하루의 경계(한국 시각 · 시) — 오늘은 이 시각부터 다음 날 이 시각 앞까지. */
const TODAY_CUT_H = 12;   // 8 → 16 → 12(2026-10-26, 요청: "정오 기준으로 변경")
/** 오늘(한국 시각 · 정오 경계)의 [시작, 끝) — "YYYY-MM-DDT12:00" 둘. 정오 전이면 어제 정오부터다. */
function todayRange(): { from: string; to: string } {
  const kst = new Date(Date.now() + (9 - TODAY_CUT_H) * 3600_000);   // 경계 시각을 0시로 당긴 한국 시각 — 그 날짜가 '오늘'
  const d = (t: Date): string => t.toISOString().slice(0, 10);
  const next = new Date(kst.getTime() + 24 * 3600_000);
  const hm = `${String(TODAY_CUT_H).padStart(2, "0")}:00`;
  return { from: `${d(kst)}T${hm}`, to: `${d(next)}T${hm}` };
}
/** 열쇠에 든 '오늘' 시작에서 [시작, 끝) — 불러오는 범위가 열쇠와 어긋나지 않게(경계 바로 앞에 누른 질의가 디바운스 뒤 경계를 넘어도 같은 하루). */
function todayRangeFrom(from: string): { from: string; to: string } {
  const [day, hm] = from.split("T");
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + 24 * 3600_000).toISOString().slice(0, 10);
  return { from, to: `${next}T${hm}` };
}
/** 지금의 '오늘' 시작(todayRange().from) — 경계(정오)를 넘으면 저절로 바뀐다(2026-10-27, 요청: "현재 시간 기준으로 정오가 지나면 오늘 정오~내일 정오로 바뀌어야해").
 *  옛: 범위를 [오늘]을 누른 때 한 번만 셌다 — 화면을 연 채 정오를 넘기면 어제 정오~오늘 정오가 그대로 남았다. 이제 다음 경계에 맞춘 타이머와
 *  탭이 다시 보일 때(폰은 잠자는 동안 타이머가 늦는다) 다시 센다 · 값이 바뀌면 질의 열쇠가 바뀌어 다시 불러온다. */
function useTodayFrom(on: boolean): string {
  const [from, setFrom] = useState(() => todayRange().from);
  useEffect(() => {
    if (!on) return undefined;
    let timer = 0;
    const sync = (): void => {
      const r = todayRange();
      setFrom(r.from);
      window.clearTimeout(timer);
      const ms = Date.parse(`${r.to}:00+09:00`) - Date.now();
      timer = window.setTimeout(sync, Math.max(1000, Math.min(ms + 1000, 6 * 3600_000)));
    };
    const onVis = (): void => { if (document.visibilityState === "visible") sync(); };
    sync();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); };
  }, [on]);
  return from;
}

/** 정렬 자 이름 — 정렬 줄("정렬: 전체 승률 › APM")에 쓴다. 고르기는 표 머리를 눌러서(StatGrid · 2026-10-22, 요청: "정렬은 머리 터치로 변경" →
 *  "정렬 조건을 상세히 — 전체와 종족별 플레이 수와 승률 총 8개") — 옛 정렬 탭(승률순 · 딜순 · APM순 · 참여순)은 걷었다. */
const sortLabel = (k: StatSortKey): string => {
  if (k === "apm") return "APM";
  if (k === "tier") return "티어";
  if (k === "dmg") return "데미지";
  const [who, what] = k.includes(":") ? k.split(":") : ["전체", k];
  return `${who} ${what === "rate" ? "승률" : "게임수"}`;
};

/** 변화 그래프의 기준 — last: 마지막 달(한 달이면 그 달 · 여러 달 a~b 면 b · 달이 아니면 이번 달 — 서버도 dateTo 가 든 달을 마지막으로 센다) · period: 달 셈에 넣을 기간 글자. */
const trendBase = (period: string): { last: string; period: string } => {
  if (!MONTH_PERIOD_RE.test(period)) { const m = currentMonthValue(); return { last: m, period: m }; }
  const [a, b] = period.split("~");
  return { last: b || a, period };
};

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
  /* (옮김 2026-10-24) 팀 구성하기 단추·창은 배치 화면 상단으로(PlacementScreen · 요청: "팀 구성하기 위치: 배치 메뉴 상단으로 이동"). */
  /* 정렬은 여러 자를 **누른 차례대로**(2026-10-22, 요청: "통계 그리드 정렬 순서 여러 개(순서 O) 적용") — 안 고른 머리를 누르면 끝에 붙고, 고른 머리를 누르면 빠진다(하나는 남는다).
     머리를 눌러 고르고(요청: "정렬은 머리 터치로 변경 · 헤더에 정렬 단추") 고른 차례는 정렬 줄 "정렬: 전체 승률 › APM" 에 하나씩 붙고 빠진다(요청: "누르면 '정렬:' 옆에 하나씩 나오고 없어짐").
     다 빼면 기본 차례만(줄에 "기본"). 머리를 누르는 셈(켜고 끄기 · 폰 전적 머리의 승률 → 게임수 → 끔)은 StatGrid 가 한다.
     한때(같은 날): 정렬 탭 · 탭 옆 "승률순 × > 참여순 × 적용중" 줄 · 탭 앞/위 차례 숫자. 고른 자들로 가린 뒤에도 같으면 늘 쓰던 차례(참여 → 승률 → APM → 커맨드). */
  const [sortKeys, setSortKeys] = useState<StatSortKey[]>(["rate"]);
  /* 복수 기준 토글(2026-10-24, 요청: "통계 기준 1개로 하고 복수 기준하고 싶으면 맨 위에 복수 기준 정렬 토글 켜기") — 기본은 하나(머리를 누르면 그 자로 갈아탐).
     끄는 순간 여럿이 쌓여 있었으면 첫 자(맨 먼저 누른 것)만 남긴다. */
  const [multiSort, setMultiSort] = useState(false);
  const toggleMulti = (): void => {
    setMultiSort((on) => { if (on && sortKeys.length > 1) setSortKeys([sortKeys[0]]); return !on; });
  };
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
  const todayFrom = useTodayFrom(period === PERIOD_TODAY);
  const queryKey = useMemo(
    () => ({
      /* 서버엔 늘 클랜원 전부 — 클랜원 전체 줄·종족구성별 전적이 유저 검색에 안 흔들리게(2026-10-21, 요청: "유저 필터가 들어가도 클랜원 전체 데이터는
         그거에 무관해야"). 검색은 아래 줄만 거른다(viewMembers) · 그래서 칩을 바꿔도 다시 안 불러온다. */
      memberIds: activeMembers.map((m) => m.id).sort().join(","),
      period,
      /* [오늘]이면 그 '오늘'의 시작도 열쇠에 — 정오를 넘으면 다시 불러온다(위 useTodayFrom ★). */
      day: period === PERIOD_TODAY ? todayFrom : "",
      size,
      map: mapTab,
    }),
    [activeMembers, period, todayFrom, size, mapTab],
  );
  const queryKeySignature = useMemo(() => JSON.stringify(queryKey), [queryKey]);
  const debouncedSignature = useDebouncedValue(queryKeySignature, 300);
  const debouncedQuery = useMemo(() => JSON.parse(debouncedSignature) as typeof queryKey, [debouncedSignature]);

  interface StatsView {
    key: string;
    memberIds: string[];
    stats: Record<string, MemberStatsEntry>;
    /** 달별 변화("YYYY-MM" → 회원 → 줄) — 응답 trend 를 회원별로 펼친 것 · 달로 조회할 때만. */
    trend: Record<string, Record<string, MemberStatsEntry>> | null;
    /** 달별 평균 줄(응답 trendClan 에 trendGames 의 경기 수를 얹은 것 · 2026-10-25 평균 행 팝오버). */
    trendClan: Record<string, TrendEntry> | null;
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
      : debouncedQuery.period === PERIOD_TODAY ? todayRangeFrom(debouncedQuery.day || todayRange().from)
      : monthPeriodToRange(MONTH_PERIOD_RE.test(debouncedQuery.period) ? debouncedQuery.period : currentMonthValue());
    if (memberIds.length === 0) { setView({ ...blank, stats: {}, clan: null, clanComps: [], clanFormats: [], trend: null, trendClan: null }); return; }
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
      /* 변화 그래프 재료를 **같은 요청에**(2026-10-24, 요청: "통계 요청 자체를 바꿔서 7달치를 한 응답에") — dateTo 가 든 달이 마지막 ·
         달 수는 한 달 조회 7 · 여러 달 조회면 그 기간(statTrendMonths · 요청: "여러달 기준이면 그 기간동안의 그래프") · 전체 기간은 **이번 달까지 최근 일곱 달**
         (요청: "전체 기간은 최근으로 보여주면 되지" — 서버는 dateTo 가 없으면 한국 시각 이번 달을 마지막으로 센다 · 화면도 currentMonthValue). */
      trendMonths: statTrendMonths(trendBase(debouncedQuery.period).period).length,
    }).then((res) => {
      if (cancelled) return;
      const trendBy: Record<string, Record<string, MemberStatsEntry>> = {};
      for (const [month, list] of Object.entries(res.trend ?? {})) {
        const map: Record<string, MemberStatsEntry> = {};
        list.forEach((entry) => { map[entry.memberId] = entry; });
        trendBy[month] = map;
      }
      const trendClan: Record<string, TrendEntry> = {};
      for (const [month, entry] of Object.entries(res.trendClan ?? {})) trendClan[month] = { ...entry, games: res.trendGames?.[month] ?? 0 };
      setView({
        ...blank, stats: byId(res), clan: res.clan ?? null,
        clanComps: res.clanComps ?? [], clanFormats: res.clanFormats ?? [],
        trend: res.trend ? trendBy : null, trendClan: res.trendClan ? trendClan : null,
      });
    }).catch((e) => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : "통계를 불러오지 못했어요.");
      setView({ ...blank, stats: {}, clan: null, clanComps: [], clanFormats: [], trend: null, trendClan: null });
    });
    return () => { cancelled = true; };
  }, [debouncedQuery, debouncedSignature]);

  /* ★ 일곱 달 변화 자료(2026-10-24, 요청: "통계 컬럼 피시는 호버 폰은 클릭시 → 5개월간의 변화 그래프로" → "7개월로 통일하자" → "통계 요청 자체를 바꿔서 7달치를 한 응답에") —
     표 요청(trendMonths) 한 번에 응답 trend 로 같이 온다(옛 '앞 달들을 뒤따라 받기'는 걷었다). 여러 달(YYYY-MM~YYYY-MM)을 조회했으면 **마지막 달**이 기준(요청: "복수달 선택시
     마지막달 기준으로") — 서버가 dateTo 가 든 달을 마지막으로 센다. 전체 기간 조회는 이번 달까지 최근 일곱 달. */
  const trend: StatTrendData | null = useMemo(() => {
    if (!view || view.key !== debouncedSignature || !view.trend) return null;   // 전체 기간도 최근 일곱 달(위 trendMonths ★)
    const { last, period } = trendBase(debouncedQuery.period);
    return { period: last, months: statTrendMonths(period), byMonth: view.trend, clanByMonth: view.trendClan ?? undefined, loading: false };
  }, [view, debouncedSignature, debouncedQuery.period]);

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
    type Card = (typeof list)[number];
    const nicknameTiebreak = (a: Card, b: Card) => a.member.nickname.localeCompare(b.member.nickname);
    /** 값이 없는 사람(그 판이 없음 · 옛 경기라 딜이 없음)은 뒤로 — 둘 다 없으면 다음 자로 넘긴다. */
    const missingLast = (am: boolean, bm: boolean) => (am === bm ? 0 : am ? 1 : -1);
    const dirSign = -1;
    type DataKey = StatSortKey | "cmd";
    const compareData = (key: DataKey, a: Card, b: Card): number => {
      /* 팀전 티어(2026-10-27) — 1 이 위 · 같은 티어는 점수 높은 쪽 · 티어 없는 사람(다섯 판 미만 · 1:1 조회)은 뒤로. */
      if (key === "tier") {
        const at = a.entry?.tier; const bt = b.entry?.tier;
        const am = typeof at?.tier !== "number"; const bm = typeof bt?.tier !== "number";
        return missingLast(am, bm) || (am ? 0 : (at!.tier! - bt!.tier!) || ((bt!.score ?? 0) - (at!.score ?? 0)));
      }
      if (key === "dmg") {
        const ad = a.stats.dmgDealtRel; const bd = b.stats.dmgDealtRel;
        return missingLast(typeof ad !== "number", typeof bd !== "number") || dirSign * ((ad ?? 0) - (bd ?? 0));
      }
      if (key === "apm" || key === "cmd") {
        const f = key === "apm" ? "avgApm" : "avgCmd";
        return missingLast(a.stats[f] === null, b.stats[f] === null) || dirSign * ((a.stats[f] ?? 0) - (b.stats[f] ?? 0));
      }
      /* 전적 — 전체(plays · rate) 또는 종족별("테란:plays" …)의 판 수 · 승률. 판이 없으면 뒤로. */
      const [race, what] = key.includes(":") ? (key.split(":") as [BaseRace, "rate" | "plays"]) : [null, key as "rate" | "plays"];
      const as = race ? a.entry?.byRace?.[race] : a.stats;
      const bs = race ? b.entry?.byRace?.[race] : b.stats;
      const ap = as?.plays ?? 0; const bp = bs?.plays ?? 0;
      return missingLast(ap === 0, bp === 0)
        || dirSign * (what === "plays" ? ap - bp : (as?.winRate ?? 0) - (bs?.winRate ?? 0));
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
          {/* 기간 셋은 배타(2026-10-26 · 위 PERIOD_TODAY ★) — 켜진 것만 채움 단추 · 나머지는 테두리. 달 고르기 창 안의 '전체 기간'은 밖 단추로 옮겼다. */}
          <div className="scr-stats-period">
            <MonthCalendar
              value={MONTH_PERIOD_RE.test(period) ? period : currentMonthValue()} onChange={setPeriod}
              maxMonth={currentMonthValue()}
              idle={!MONTH_PERIOD_RE.test(period)}
              range
              className="scr-v2-toolbar-month"
            />
            <button type="button" className={cx("scr-compact-rect-btn", period !== PERIOD_ALL && "is-secondary")}
              aria-pressed={period === PERIOD_ALL} onClick={() => setPeriod(PERIOD_ALL)}>전체기간</button>
            <button type="button" className={cx("scr-compact-rect-btn", period !== PERIOD_TODAY && "is-secondary")}
              aria-pressed={period === PERIOD_TODAY} onClick={() => setPeriod(PERIOD_TODAY)} title="정오부터 다음 날 정오 전까지">오늘</button>
          </div>
        </div>
      </div>

      <div className="scr-line-tabs scr-stats-size-tabs" role="tablist" aria-label="팀 규모">
        {SIZE_TABS.map((t) => (
          <Fragment key={t.value}>
            {/* 팀전과 1:1 사이 구분선(2026-10-26, 요청: "통계 게임 유형에서 팀전과 1:1 사이에 | 구분선 넣기") */}
            {t.value === "1" && <span className="scr-line-tab-sep" aria-hidden>|</span>}
            <button
              type="button" role="tab"
              aria-selected={t.value === size}
              className={cx("scr-line-tab-btn", t.value === size && "is-on")}
              onClick={() => setSize(t.value)}
            >
              {t.label}
            </button>
          </Fragment>
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
        <ChipInput values={users} onChange={setUsers} options={userOpts} placeholder="유저 닉네임" />
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
          {/* (걷음 2026-10-22, 요청: "통계 그래프 제거") 전부 펼치기·접기 — 펼칠 그래프가 없다. */}
        </header>
      )}

      <div className="scr-stats-sort">
        <span className="scr-stats-sort-label">정렬:</span>
        <span className="scr-stats-sort-chain">{sortKeys.length > 0 ? sortKeys.map(sortLabel).join(" › ") : "기본"}</span>
        {/* 복수 기준 토글(위 multiSort ★) — 켜지면 머리를 누른 차례대로 기준이 쌓인다. PC·폰 둘 다. */}
        <button type="button" role="switch" aria-checked={multiSort} className={cx("scr-stats-sort-multi", multiSort && "is-on")} onClick={toggleMulti}
          title={multiSort ? "복수 기준 정렬 끄기 — 머리를 누르면 그 기준 하나로" : "복수 기준 정렬 켜기 — 머리를 누른 차례대로 기준이 쌓여요"}>
          복수 기준
        </button>
        {/* 초기화(2026-10-24, 요청: "통계 정렬 아이콘으로 변경하고 초기화 버튼 필요 · 피시") — 고른 자가 처음 값(전체 승률 하나)과 다를 때만 선다 · PC 만. */}
        {!isMobile && !(sortKeys.length === 1 && sortKeys[0] === "rate") && (
          <button type="button" className="scr-text-btn scr-stats-sort-reset" onClick={() => setSortKeys(["rate"])} title="정렬을 처음 값(전체 승률)으로">
            <RotateCcw size={12} aria-hidden /> 초기화
          </button>
        )}
        {/* 표 도움말 단추 — 정렬 줄 오른끝(옛 폰 "행을 눌러서 그래프 보기" 글 자리 · 2026-10-22, 요청: "도움말과 헤더 설명 다 제거하고 그 자리에 도움말 아이콘 단추" → "PC 에도 알아서"). */}
        <StatHelp mobile={isMobile} />
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
            rows={cards.map((c) => ({ member: c.member, stats: c.stats, byRace: c.entry?.byRace, tier: c.entry?.tier }))}
            tier={size !== "1"}
            mobile={isMobile}
            sortKeys={sortKeys}
            onSortKeys={setSortKeys}
            multi={multiSort}
            trend={trend}
          />
        )}
      </div>

    </div>
  );
}
