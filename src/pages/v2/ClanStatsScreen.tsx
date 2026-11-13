import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronsLeft, ChevronsRight, RotateCcw, Users, Wrench } from "lucide-react";
import TeamBuilderModal from "../../modals/TeamBuilderModal";
import { LoadingMark } from "../../components/common/Feedback";
import ChipInput, { type ChipOpt } from "../../components/common/ChipInput";
import { useUrlState } from "../../hooks/useUrlState";
import MonthCalendar from "../../components/common/MonthCalendar";
import DayRangePicker from "../../components/common/DayRangePicker";
import { currentMonthValue, MONTH_PERIOD_RE } from "../../utils/date";
import {
  CLAN_TYPE, DAY_PERIOD_RE, dayPeriodLabel, MAP_DEFAULT, MAP_TABS, mapTabOf, PERIOD_ALL, PERIOD_TODAY, SIZE_TABS, sizeTabOf, SOLO_TYPE, statRange, todayDay, useTodayFrom,
} from "../stats/statQuery";
import StatGrid, { CompGrid, WpaHelp, type StatSortKey } from "../stats/StatGrid";
import { calcRowOf, combinedTier, statTrendMonths, wpaOf, type StatTrendData, type TrendEntry } from "../stats/StatTrend";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useAppStore } from "../../store/appStore";
import { api } from "../../api/client";
import { memberMatchesTerm, normalizeSearchText } from "../../utils/memberSearch";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { cx } from "../../utils/format";
import { showToast } from "../../components/common/Toast";
import type { BaseRace, ClanBreakdownEntry, ClanCompEntry, GameResultStatsResponse, Member, MemberStats, MemberStatsEntry } from "../../types";

/** 정렬 자 이름 — 정렬 줄("정렬: 전체 승률 › APM")에 쓴다. 고르기는 표 머리를 눌러서(StatGrid · 2026-10-22, 요청: "정렬은 머리 터치로 변경" →
 *  "정렬 조건을 상세히 — 전체와 종족별 플레이 수와 승률 총 8개") — 옛 정렬 탭(승률순 · 딜순 · APM순 · 참여순)은 걷었다. */
const sortLabel = (k: StatSortKey): string => {
  if (k === "apm") return "APM";
  if (k === "eapm") return "EAPM";
  if (k === "tier") return "종합 티어";
  if (k === "wpa") return "WPA";   // 2026-11-12(옛 교환 이득 · 교전 참여 · 생산)
  const [who, what] = k.includes(":") ? k.split(":") : ["종합", k];
  return `${who} ${what === "tier" ? "티어" : what === "rate" ? "승률" : what === "wpa" ? "WPA" : what === "apm" ? "APM" : what === "eapm" ? "EAPM" : "게임수"}`;
};

/** 변화 그래프의 기준 — last: 마지막 달(한 달이면 그 달 · 여러 달 a~b 면 b · 날짜 지정이면 그 날들이 걸친 달 · 그 밖은 이번 달 — 서버도 dateTo 가 든 달을 마지막으로 센다) ·
 *  period: 달 셈에 넣을 기간 글자. */
const trendBase = (period: string): { last: string; period: string } => {
  if (DAY_PERIOD_RE.test(period)) {
    const [a, b] = period.split("~").map((d) => d.slice(0, 7));
    return { last: b, period: a === b ? b : `${a}~${b}` };
  }
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

/* ★ 통계 잠시 닫음(2026-11-12, 요청: "통계 페이지 임시 작업중이라고 팝업띄우고 비활성화" → "뒤는 보이게") — 화면은 그대로 그려 뒤가 보이고, 누르기 · 포커스만 막는다(inert).
   가운데에 닫기 없는 작업 중 팝업(배경 막 없이 · .scr-modal-overlay 는 display contents). 머리줄 · 아래 탭은 막지 않아 다른 화면으로 갈 수 있다. 다시 닫으려면 true.
   (2026-11-13 다시 엶 — 요청: "통계 열고") */
const STATS_PAUSED = false;
/* ★ 정확도 작업 알림(2026-11-13, 요청: "통계화면 반투명한 토스트 10초간 띄우기 · 현재 정확도 높이는 작업중이라 변경될 수 있다고") — 들어올 때마다 10초 · 반투명(뒤 표가 비친다) ·
   누르면 바로 닫힌다. 작업이 끝나면 false. */
const ACCURACY_NOTICE = true;

function StatsPausedNotice() {
  return createPortal(
    <div className="scr-modal-overlay">
      <div className="scr-modal scr-modal-sm scr-modal-confirm scr-stats-paused" role="alertdialog" aria-label="통계 작업 중">
        <div className="scr-confirm-head">
          <Wrench size={18} className="scr-confirm-icon" />
          <span>통계 작업 중</span>
        </div>
        <p className="scr-confirm-msg">통계 페이지는 임시로 작업 중이에요. 작업이 끝나면 다시 열게요.</p>
      </div>
    </div>,
    document.body,
  );
}

export default function ClanStatsScreen() {
  const members = useAppStore((s) => s.members);
  const isMobile = useIsMobile();
  useEffect(() => {
    if (ACCURACY_NOTICE) showToast("지금 정확도를 높이는 작업 중이라 수치가 바뀔 수 있어요.", { kind: "info", ms: 10_000, faint: true });
  }, []);
  /* 유저 검색 = 칩 입력(2026-10-21, 요청: "통계 검색창 칩형태로 변경(게임목록처럼)") — 칩을 담거나 빼는 순간 걸린다 · 주소 u= 는 칩 배열(JSON).
     옛 한 줄 검색어(띄어쓰기로 이은 글)로 들어오면 낱말마다 칩 하나로 읽는다. */
  const [userRaw, setUserRaw] = useUrlState("u");
  const users = useMemo(() => chipsOfUrl(userRaw), [userRaw]);
  const setUsers = (next: string[]): void => setUserRaw(next.length ? JSON.stringify(next) : "");
  const activeMembers = useMemo(() => members.filter((m) => m.status !== "withdrawn" && m.status !== "suspended"), [members]);
  const userOpts = useMemo<ChipOpt[]>(() => activeMembers.map((m) => ({ value: m.nickname, member: m })), [activeMembers]);
  /* 팀 구성하기(2026-10-31, 요청: "팀구성하기를 다시 통계화면으로 옮기고 · 로직을 티어 계산 로직을 재사용" — 2026-10-24 배치 화면으로 갔던 것을 되돌림) —
     인분은 최신 달(이번 달)부터 거슬러 판이 넉넉한 달 것(TeamBuilderModal · 보는 기간과 무관). */
  const [teamBuilder, setTeamBuilder] = useState(false);
  /* 정렬은 여러 자를 **누른 차례대로**(2026-10-22, 요청: "통계 그리드 정렬 순서 여러 개(순서 O) 적용") — 안 고른 머리를 누르면 끝에 붙고, 고른 머리를 누르면 빠진다(하나는 남는다).
     머리를 눌러 고르고(요청: "정렬은 머리 터치로 변경 · 헤더에 정렬 단추") 고른 차례는 정렬 줄 "정렬: 전체 승률 › APM" 에 하나씩 붙고 빠진다(요청: "누르면 '정렬:' 옆에 하나씩 나오고 없어짐").
     다 빼면 기본 차례만(줄에 "기본"). 머리를 누르는 셈(켜고 끄기 · 폰 전적 머리의 승률 → 게임수 → 끔)은 StatGrid 가 한다.
     한때(같은 날): 정렬 탭 · 탭 옆 "승률순 × > 참여순 × 적용중" 줄 · 탭 앞/위 차례 숫자. 고른 자들로 가린 뒤에도 같으면 늘 쓰던 차례(참여 → 승률 → APM → 커맨드). */
  /* 기본 정렬 = 티어(2026-10-28, 요청: "기본정렬 티어순" · 옛: 전체 승률) — 티어 칸이 없는 1:1 조회에선 티어를 빼고 본다(아래 shownSort). */
  const [sortKeys, setSortKeys] = useState<StatSortKey[]>(["tier"]);
  /* 복수 기준 토글(2026-10-24, 요청: "통계 기준 1개로 하고 복수 기준하고 싶으면 맨 위에 복수 기준 정렬 토글 켜기") — 기본은 하나(머리를 누르면 그 자로 갈아탐).
     끄는 순간 여럿이 쌓여 있었으면 첫 자(맨 먼저 누른 것)만 남긴다. */
  const [multiSort, setMultiSort] = useState(false);
  const toggleMulti = (): void => {
    setMultiSort((on) => { if (on && sortKeys.length > 1) setSortKeys([sortKeys[0]]); return !on; });
  };
  /* 종족별 펼치기/접기(2026-11-04, 요청: "통계에 기본은 종합(전체 종족 평균) · 테란 프로토스 저그 접혀 있다가 …" → 같은 날 "펼치기 접기 개념이라 종합도 원래부터
     폭을 좁게 · 종족별 펼치기는 종합 위쪽 오른끝에" — 단추는 표 안 종합 머리 오른끝(StatGrid) · 옛 자리: 정렬 줄 복수 기준 옆) —
     기본은 접힘(종합 묶음만) · 기기마다 기억. 숨길 때 종족 칸으로 고른 정렬은 뺀다(안 보이는 칸으로 줄 세우지 않게 · 다 빠지면 처음 값). */
  /* 폰은 **늘 펼친 채로 시작**(같은 날, 요청: "모바일 통계는 각 종족 전체 펼친 상태로 시작") — 기억은 PC 만 읽는다(폰에서 접어도 다음엔 펼침). */
  /** 보이는 표 폭(StatGrid onVisW · 접혀 종합만일 때) — 정렬 줄을 그만큼으로 죈다. */
  const [sortW, setSortW] = useState<number | null>(null);
  /* 폰도 기본은 접힘(2026-11-09, 요청: "좁은 폰도 피시랑 똑같이 · 기본은 종족별 접힌 상태로" — 옛: 폰은 늘 펼침) · 폰은 기억하지 않는다(늘 접힌 채 연다). */
  const [showRaces, setShowRacesRaw] = useState(() => { if (isMobile) return false; try { return localStorage.getItem("stats.showRaces") === "1"; } catch { return false; } });
  const toggleRaces = (): void => {
    const next = !showRaces;
    setShowRacesRaw(next);
    if (!isMobile) try { localStorage.setItem("stats.showRaces", next ? "1" : "0"); } catch { /* 저장 못 해도 이번 화면은 된다 */ }
    if (!next) { const rest = sortKeys.filter((k) => !k.includes(":")); setSortKeys(rest.length > 0 ? rest : ["tier"]); }
  };
  const matchedMembers = useMemo(() => {
    const terms = users.map((u) => normalizeSearchText(u).trim()).filter(Boolean);
    return activeMembers.filter((m) => terms.length === 0 || terms.some((t) => memberMatchesTerm(m, t)));
  }, [activeMembers, users]);

  /* 기간 기본값 = 이번 달(2026-10-28, 요청: "조회 최근달로 변경" · 같은 날 "최근 3개월로" → "최근 2개월로"를 거쳐 돌아옴). */
  const [period, setPeriod] = useUrlState("period", currentMonthValue());
  const [sizeRaw, setSize] = useUrlState("size", "team");
  const size = sizeTabOf(sizeRaw);
  const [mapRaw, setMap] = useUrlState("map", MAP_DEFAULT);
  const mapTab = mapTabOf(mapRaw);
  /* ★ 티어(와 보정교환비)는 **팀전 전체 · 맵 전체**일 때만(2026-10-28, 요청: "티어는 맵 전체일 때만 표시 · 팀전 전체 맵 전체일 때만") — 티어는 전체 맵 팀전 판으로
     매기므로 그 조회에서만 칸의 게임수 · 승률과 같은 판을 본다. 옛: 1:1 이 아니면 늘. */
  /* (2026-11-10, 요청: "통계에 맵 필터 있잖아 · 그거별로 조회 시 티어 나오게") — 맵 탭에서도 보인다: 서버가 그 맵 판으로 티어를 낸다(tier_rows map_group). 팀전만은 그대로. */
  const showTier = size === "team";
  /** 실제로 쓰는 정렬 — 티어 칸이 없는 조회엔 티어를 빼고, 남는 게 없으면 전체 승률. */
  const shownSort = useMemo<StatSortKey[]>(() => {
    if (showTier) return sortKeys;
    const rest = sortKeys.filter((k) => k !== "tier");
    return rest.length > 0 ? rest : ["rate"];
  }, [sortKeys, showTier]);
  const sortDefault: StatSortKey = showTier ? "tier" : "rate";
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
  /* ★ 날짜 지정(2026-11-13 · statQuery DAY_PERIOD_RE ★) — 누르면 오늘([오늘] 단추는 걷었다 · 요청: "오늘 보기 버튼은 제거" → "날짜 지정의 기본값이 오늘").
     오늘은 옛 PERIOD_TODAY 그대로라 정오를 넘으면 저절로 다음 날로 간다(useTodayFrom) · 날을 고르면 "YYYY-MM-DD~YYYY-MM-DD" · 오늘 하루를 다시 고르면 PERIOD_TODAY 로. */
  const dayOn = period === PERIOD_TODAY || DAY_PERIOD_RE.test(period);
  const [dayA, dayB] = DAY_PERIOD_RE.test(period) ? period.split("~") : [todayFrom.slice(0, 10), todayFrom.slice(0, 10)];
  const pickDays = (a: string, b: string): void => setPeriod(a === b && a === todayDay() ? PERIOD_TODAY : `${a}~${b}`);
  /* ★ 폰은 거르기를 접은 채로 연다(2026-11-13, 요청: "모바일에선 처음에 접은 상태로 노출(최상단은 현재의 기간 필터 한줄만 보이기)") — 접히면 기간 줄만 ·
     팀 구성하기 · 규모 탭 · 맵 탭 · 유저 칩은 [필터]를 눌러 편다. 기억하지 않는다(늘 접힌 채 연다). 기본이 아닌 거르기(규모 · 맵 · 유저)가 걸려 있으면 [필터]에 점. */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const folded = isMobile && !filtersOpen;
  const filterOn = size !== "team" || mapTab !== MAP_DEFAULT || users.length > 0;
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
    const qRange = statRange(debouncedQuery.period, debouncedQuery.day);
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
         달 수는 한 달 조회 5(2026-10-28 · 옛 7) · 여러 달 조회면 그 기간(statTrendMonths · 요청: "여러달 기준이면 그 기간동안의 그래프") · 전체 기간은 **이번 달까지 최근 다섯 달**
         (요청: "전체 기간은 최근으로 보여주면 되지" — 서버는 dateTo 가 없으면 한국 시각 이번 달을 마지막으로 센다 · 화면도 currentMonthValue). */
      trendMonths: statTrendMonths(trendBase(debouncedQuery.period).period).length,
      /* 종족별 티어(2026-11-04, 요청: "종족별 티어로 변경 · 전체 티어는 이제 없음") — 표의 티어 칸은 종족마다(StatGrid RaceCells ★) · 달별 변화도. */
      tierByRace: debouncedQuery.size === "team",   // 맵 탭에서도(2026-11-10 · 서버가 그 맵 판으로)
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

  /* ★ 다섯 달 변화 자료(2026-10-28 다섯 · 2026-10-24, 요청: "통계 컬럼 피시는 호버 폰은 클릭시 → 5개월간의 변화 그래프로" → "7개월로 통일하자" → "통계 요청 자체를 바꿔서 7달치를 한 응답에") —
     표 요청(trendMonths) 한 번에 응답 trend 로 같이 온다(옛 '앞 달들을 뒤따라 받기'는 걷었다). 여러 달(YYYY-MM~YYYY-MM)을 조회했으면 **마지막 달**이 기준(요청: "복수달 선택시
     마지막달 기준으로") — 서버가 dateTo 가 든 달을 마지막으로 센다. 전체 기간 조회는 이번 달까지 최근 다섯 달. */
  const trend: StatTrendData | null = useMemo(() => {
    if (!view || view.key !== debouncedSignature || !view.trend) return null;   // 전체 기간도 최근 다섯 달(위 trendMonths ★)
    const { last, period } = trendBase(debouncedQuery.period);
    /* ★ '오늘' 조회는 팝업에 그래프 없이(2026-11-13, 요청: "오늘로 조회시 팝업에 그래프 제거") — 달별 그래프가 오늘과 무관하다. 근거값 · 셈 표만.
       날짜 지정(같은 날 · DAY_PERIOD_RE)도 — 달별 막대가 고른 날들과 안 맞는다. */
    return { period: last, months: statTrendMonths(period), byMonth: view.trend, clanByMonth: view.trendClan ?? undefined, loading: false,
      noChart: debouncedQuery.period === PERIOD_TODAY || DAY_PERIOD_RE.test(debouncedQuery.period) };
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
      /* 팀전 티어 — **인분 내림차순**(2026-10-28, 요청: "티어로 정렬시 인분 내림차순") · 티어 없는 사람(스무 판 미만)은 뒤로 몰고 그 안에서도 인분 순 ·
         인분도 없는 사람(1:1 조회 · 팀전 판 없음)은 맨 뒤. 인분은 **기준 인분**(티어의 잣대 · 같은 날 "개인 능력치 기반 현재 장의 실력") — 한 조회 안에서는
         판 수준이 모두 같아 그 판의 인분 순과 같다. */
      /* 종족 티어("테란:tier" …) — 그 종족 판으로 잰 인분 내림차순 · "tier" 는 종합 티어(종족 티어 인분을 판 수로 가중 평균 · StatTrend combinedTier · 2026-11-04). */
      if (key === "tier" || key.endsWith(":tier")) {
        const rc = key === "tier" ? null : (key.split(":")[0] as BaseRace);
        const pick = (c: Card) => (rc ? c.entry?.tierByRace?.[rc] : c.entry?.tier ?? combinedTier(c.entry?.tierByRace)) ?? undefined;
        const at = pick(a); const bt = pick(b);
        const ai = at?.stdInbun ?? at?.inbun; const bi = bt?.stdInbun ?? bt?.inbun;
        /* 인분이 같으면 티어 안에서 승패 보정(adj) → 전투 보정(cbt) 높은 쪽(2026-11-07, 요청: "티어로 정렬 시엔 티어 안에서 인분 → 승패 보정 → 전투 보정") — 그래도 같으면 바깥 차례(게임수 …). */
        const num = (v: number | null | undefined) => (typeof v === "number" ? v : null);
        const by = (av: number | null, bv: number | null) => missingLast(av === null, bv === null) || dirSign * ((av ?? 0) - (bv ?? 0));
        return missingLast(typeof at?.tier !== "number", typeof bt?.tier !== "number")
          || missingLast(typeof ai !== "number", typeof bi !== "number")
          || dirSign * ((ai ?? 0) - (bi ?? 0))
          || by(num(at?.adj), num(bt?.adj))
          || by(num(at?.cbt), num(bt?.cbt));
      }
      /* ★ WPA(2026-11-12 · 옛 교환 이득 · 교전 참여 · 생산) — 티어 조회는 칸에 보이는 보정 뒤 점수(calcRowOf ★)로 · 티어 칸이 없는 조회는 판당 WPA 원점수(TierEntry.wpa)로.
         race 는 종족 묶음(없으면 종합). */
      const tierOfCard = (c: Card, rc: BaseRace | null) => (rc ? c.entry?.tierByRace?.[rc] : c.entry?.tier ?? combinedTier(c.entry?.tierByRace));
      const wpaKey = (c: Card, rc: BaseRace | null): number | null => (showTier ? calcRowOf(tierOfCard(c, rc), "wpa")?.mult ?? null : wpaOf(tierOfCard(c, rc)));
      if (key === "wpa") {
        const ax = wpaKey(a, null); const bx = wpaKey(b, null);
        return missingLast(ax === null, bx === null) || dirSign * ((ax ?? 0) - (bx ?? 0));
      }
      if (key === "apm" || key === "eapm" || key === "cmd") {
        const f = key === "apm" ? "avgApm" : key === "eapm" ? "avgEapm" : "avgCmd";
        return missingLast(a.stats[f] === null, b.stats[f] === null) || dirSign * ((a.stats[f] ?? 0) - (b.stats[f] ?? 0));
      }
      /* 전적 — 전체(plays · rate) 또는 종족별("테란:plays" …)의 판 수 · 승률. 판이 없으면 뒤로. */
      const [race, what] = key.includes(":") ? (key.split(":") as [BaseRace | "주종족", "rate" | "plays" | "wpa" | "apm" | "eapm"]) : [null, key as "rate" | "plays"];
      /* "주종족:…"(2026-11-04) — 그 사람 주종족 판을 합친 줄(entry.main). */
      const as = race === "주종족" ? a.entry?.main ?? undefined : race ? a.entry?.byRace?.[race] : a.stats;
      const bs = race === "주종족" ? b.entry?.main ?? undefined : race ? b.entry?.byRace?.[race] : b.stats;
      /* 종족 교환비 · APM · EAPM(2026-11-03 · PC 묶음 다섯 칸) — 그 종족 판이 없거나 값이 없으면 뒤로. */
      if (race && race !== "주종족" && what === "wpa") {
        const av = wpaKey(a, race); const bv = wpaKey(b, race);
        return missingLast(av === null, bv === null) || dirSign * ((av ?? 0) - (bv ?? 0));
      }
      if (what === "apm" || what === "eapm") {
        const vOf = (x: typeof as) => (!x || x.plays === 0 ? null : what === "apm" ? x.avgApm : x.avgEapm);
        const av = vOf(as); const bv = vOf(bs);
        return missingLast(av === null, bv === null) || dirSign * ((av ?? 0) - (bv ?? 0));
      }
      const ap = as?.plays ?? 0; const bp = bs?.plays ?? 0;
      return missingLast(ap === 0, bp === 0)
        || dirSign * (what === "plays" ? ap - bp : (as?.winRate ?? 0) - (bs?.winRate ?? 0));
    };
    /** 고른 자들(누른 차례)을 맨 앞에 두고, 같으면 늘 쓰던 차례(참여 → 승률 → APM → 커맨드)로 가린다. */
    const BASE_ORDER: DataKey[] = ["plays", "rate", "apm", "cmd"];
    const DATA_ORDER: DataKey[] = [...shownSort, ...BASE_ORDER.filter((k) => !(shownSort as DataKey[]).includes(k))];
    sorted.sort((a, b) => {
      for (const key of DATA_ORDER) {
        const c = compareData(key, a, b);
        if (c) return c;
      }
      return nicknameTiebreak(a, b);
    });
    return sorted;
  }, [viewMembers, view, shownSort, showTier]);



  const teamBuilderBtn = (
    <button type="button" className="scr-compact-rect-btn scr-stats-tb-btn" onClick={() => setTeamBuilder(true)}>
      <Users size={13} aria-hidden /> 팀 구성하기
      <span className="scr-tb-beta">beta</span>
    </button>
  );

  return (
    <>
    {STATS_PAUSED && <StatsPausedNotice />}
    <div className={cx("scr-screen scr-stats-screen-v2", STATS_PAUSED && "is-paused")} inert={STATS_PAUSED}>
      <div className="scr-v2-toolbar">
        {/* ★ 팀 구성하기는 제목 줄 오른끝 · 기간 · 필터는 제목 한 줄 아래(2026-11-13, 요청: "팀 구성하기 버튼이 필터 안에 들어가 버림 · 밖으로 빼서 통계 타이틀 옆 오른쪽 ·
            필터는 타이틀에서 한 줄 아래로") — 옛: 폰은 [필터]를 펴야 팀 구성하기가 보였고 · PC 는 기간 줄이 제목 옆이었다. */}
        <div className="scr-v2-toolbar-title-row">
          <h1 className="scr-title scr-v2-toolbar-title">통계</h1>
          {teamBuilderBtn}
        </div>
        <div className="scr-v2-toolbar-title-row scr-stats-filter-row">
          {/* 기간 셋은 배타(2026-10-26 · 위 PERIOD_TODAY ★) — 켜진 것만 채움 단추 · 나머지는 테두리. 달 고르기 창 안의 '전체 기간'은 밖 단추로 옮겼다.
              [오늘]은 걷고 [날짜 지정](기본 오늘)으로(2026-11-13 · 위 dayOn ★). */}
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
            <DayRangePicker
              from={dayA} to={dayB} active={dayOn} label={dayPeriodLabel(dayA, dayB)} max={todayDay()}
              onChange={pickDays} onActivate={() => setPeriod(PERIOD_TODAY)}
            />
          </div>
          {/* 폰: 기간 줄 오른끝에 [필터](위 folded ★). */}
          {isMobile && (
            <button type="button" className={cx("scr-sg-fold scr-stats-fold-btn", filtersOpen && "is-on")} aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((v) => !v)} title={filtersOpen ? "거르기 접기 — 기간만" : "거르기 펴기 — 규모 · 맵 · 유저"}>
              필터{filterOn && !filtersOpen && <i className="scr-stats-fold-dot" aria-label="걸린 거르기 있음" />}
              <ChevronDown size={13} aria-hidden className="scr-stats-fold-chev" />
            </button>
          )}
        </div>
      </div>
      {teamBuilder && <TeamBuilderModal onClose={() => setTeamBuilder(false)} />}

      {!folded && (<>
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
      </>)}
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
          {/* 명수 옆 경기 수(2026-11-05, 요청: "명수 옆에 몇 게임인지 · 폰 피시 모두" — 표 평균 줄의 게임수는 참여 합이라 경기 수는 여기서). */}
          <span className="scr-clan-dash-sub">{viewMembers.length}명 · {clanGames.toLocaleString()}게임</span>
          {/* (걷음 2026-10-22, 요청: "통계 그래프 제거") 전부 펼치기·접기 — 펼칠 그래프가 없다. */}
        </header>
      )}

      {/* 정렬 줄 오른끝(도움말 · 종족별 단추)을 보이는 표 오른변에 맞춘다(2026-11-05, 지적: "위치가 이상 버튼" — 접힌 표는 종합 칸만 보여 줄 끝이 표 밖 멀리 떴다). PC 만. */}
      <div className="scr-stats-sort" style={!isMobile && sortW ? { maxWidth: sortW } : undefined}>
        <span className="scr-stats-sort-label">정렬</span>
        {/* 여러 기준(위 multiSort ★ · 2026-11-04, 요청: "복수 기준 단추를 정렬 옆으로 옮기고 여러 기준 체크박스로" — 옛: 기준 줄 뒤 알약 단추 "복수 기준") —
            켜면 머리를 누른 차례대로 기준이 쌓인다. PC·폰 둘 다. */}
        <label className={cx("scr-stats-sort-multi", multiSort && "is-on")}
          title={multiSort ? "여러 기준 끄기 — 머리를 누르면 그 기준 하나로" : "여러 기준 켜기 — 머리를 누른 차례대로 기준이 쌓여요"}>
          <input type="checkbox" checked={multiSort} onChange={toggleMulti} />
          여러 기준
        </label>
        <span className="scr-stats-sort-chain">{shownSort.length > 0 ? shownSort.map((k: StatSortKey) => sortLabel(k)).join(" › ") : "기본"}</span>
        {/* 초기화(2026-10-24, 요청: "통계 정렬 아이콘으로 변경하고 초기화 버튼 필요 · 피시") — 고른 자가 처음 값(티어 · 1:1 은 전체 승률 하나)과 다를 때만 선다 · PC 만. */}
        {!isMobile && !(shownSort.length === 1 && shownSort[0] === sortDefault) && (
          <button type="button" className="scr-text-btn scr-stats-sort-reset" onClick={() => setSortKeys(["tier"])} title={`정렬을 처음 값(${sortLabel(sortDefault)})으로`}>
            <RotateCcw size={12} aria-hidden /> 초기화
          </button>
        )}
        {/* (걷음 2026-11-13, 요청: "통계 전체 툴팁은 제거") 표 도움말 단추(StatHelp) → 같은 자리에 "WPA란?" 글 단추(같은 날 · WpaHelp). */}
        <WpaHelp />
        {/* 종족별 펼치기/접기 — 표 밖 정렬 줄 오른끝(2026-11-05, 요청: "저 펴고 접는 버튼은 표 외부로 이동" · 옛: 표 종합 머리 오른끝 · 2026-11-04). */}
        <button type="button" className={cx("scr-sg-fold", showRaces && "is-on")} aria-expanded={showRaces} onClick={toggleRaces}
          title={showRaces ? "종족별 접기 — 종합만" : "종족별 펼치기 — 테란 · 프로토스 · 저그"}>
          종족별{showRaces ? <ChevronsLeft size={12} aria-hidden /> : <ChevronsRight size={12} aria-hidden />}
        </button>
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
            clan={view?.clan ? { stats: view.clan.overall, byRace: view.clan.byRace, main: view.clan.main } : null}
            rows={cards.map((c) => ({ member: c.member, stats: c.stats, byRace: c.entry?.byRace, mainRaces: c.entry?.mainRaces, tierByRace: c.entry?.tierByRace, tier: c.entry?.tier }))}
            tier={showTier}   /* 팀전 티어 정식(2026-10-28, 요청: "이제 통계에 티어 정식으로 추가" — 옛 `?tier=1` 문을 걷었다) · 팀전 전체 · 맵 전체에서만(위 showTier ★) */
            mobile={isMobile}
            sortKeys={shownSort}
            onSortKeys={setSortKeys}
            multi={multiSort}
            showRaces={showRaces}
            onVisW={setSortW}
            trend={trend}
          />
        )}
      </div>

    </div>
    </>
  );
}
