import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CircleHelp, Users, Wrench } from "lucide-react";
import TeamBuilderModal from "../../modals/TeamBuilderModal";
import { LoadingMark } from "../../components/common/Feedback";
import InfoTip from "../../components/common/InfoTip";
import ChipInput, { type ChipOpt } from "../../components/common/ChipInput";
import { useUrlState } from "../../hooks/useUrlState";
import MonthCalendar from "../../components/common/MonthCalendar";
import DayRangePicker from "../../components/common/DayRangePicker";
import { currentMonthValue, fmt, MONTH_PERIOD_RE, monthPeriodLabel, serverMs, shiftMonthValue } from "../../utils/date";
import {
  CLAN_TYPE, DAY_PERIOD_RE, MAP_DEFAULT, MAP_TABS, mapTabOf, monthOfPeriod, PERIOD_ALL, PERIOD_TODAY, SIZE_TABS, sizeTabOf, SOLO_TYPE, statRange, todayDay, useTodayFrom,
} from "../stats/statQuery";
import StatGrid, { CompGrid, WpaHelp, type StatSortKey, type StatVoteCtl } from "../stats/StatGrid";
import { calcRowOf, combinedTier, statTrendMonths, wpaOf, type StatTrendData, type TrendEntry } from "../stats/StatTrend";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useAppStore } from "../../store/appStore";
import { api } from "../../api/client";
import { memberMatchesTerm, normalizeSearchText } from "../../utils/memberSearch";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { cx } from "../../utils/format";
import { showToast } from "../../components/common/Toast";
import StatsPoll from "../../components/stats/StatsPoll";
import type { BaseRace, ClanBreakdownEntry, ClanCompEntry, GameResultStatsResponse, Member, MemberStats, MemberStatsEntry } from "../../types";

/* (걷음 2026-11-17, 요청: 정렬 줄 왼쪽 "정렬 · 여러 기준 · 종합 WPA/티어" 제거) 정렬 자 이름(sortLabel · 정렬 줄 "정렬: 전체 승률 › APM") — 고른 자는 표 머리 화살표가 보인다. */

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
   누르면 바로 닫힌다. 작업이 끝나면 false.
   (2026-11-15 걷음, 요청: "통계 들어가면 지금 토스트 없애고 대신 아래쪽에 poll 뜨게" — components/stats/StatsPoll ★) */
const ACCURACY_NOTICE = false;

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

/** ★ 티어 칸 위아래 표 화면 스위치(2026-11-16, 요청: "기능은 살려두되 화면에 실제 출시는 안 할게") — false 면 다이얼을 안 세우고 내 표도 안 받는다
 *  (서버 sg-api tier_votes · 덤 셈은 그대로 — 표가 없으니 덤도 0). 출시는 이 값만 true 로. */
const TIER_VOTE_ON = false;

/** ISO 때 → 이 기기 날짜(YYYY-MM-DD) · 못 읽으면 null. */
function dayOf(iso: string | null | undefined): string | null {
  const t = serverMs(iso);
  return Number.isFinite(t) ? fmt(new Date(t)) : null;
}
/** ★ 통계에 드는 사람(2026-11-16) — 그 기간에 회원이던 사람만.
 *  · 가입(요청: "통계 목록에 노출되는 사람은 가입일 이후인 사람만" · "클랜 전체 줄도 조회되는 사람 수로") — 조회 기간 끝(to)이 가입일보다 앞이면 뺀다(10월 가입자는 7 · 8 · 9월 조회에 없다).
 *  · 탈퇴(요청: "탈퇴일이 조회 기간 시작보다 앞인 경우도 제외") — 탈퇴한 사람은 탈퇴일이 조회 기간 시작(from) 이후면 넣는다(그 기간에 회원이었다) · 앞이면 뺀다.
 *    전체 기간(시작 · 끝이 없음)은 탈퇴자도 다 넣는다. 탈퇴일을 모르는 옛 응답의 탈퇴자는 옛처럼 뺀다. 정지(suspended)는 옛처럼 늘 뺀다.
 *  서버에 보내는 명단이라 목록 · 명수 · 클랜 전체(평균) 줄 · 편성 집계가 다 이 사람들로만이다. */
function statMembers(members: readonly Member[], range: { from: string; to: string }): Member[] {
  return members.filter((m) => {
    if (m.status === "suspended") return false;
    const joined = dayOf(m.createdAt);
    if (range.to && joined && joined > range.to) return false;
    if (m.status === "withdrawn") {
      const left = dayOf(m.withdrawnAt);
      if (!left) return false;
      if (range.from && left < range.from) return false;
    }
    return true;
  });
}

export default function ClanStatsScreen() {
  const members = useAppStore((s) => s.members);
  const isMobile = useIsMobile();
  useEffect(() => {
    if (ACCURACY_NOTICE) showToast("지금 정확도를 높이는 작업 중이라 수치가 바뀔 수 있어요.", { kind: "info", ms: 10_000, faint: true, bottom: true });
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
  /* (걷음 2026-11-17 · 정렬 줄 왼쪽 제거와 함께) 여러 기준 체크박스 — 머리를 누르면 늘 그 자 하나로 갈아탄다. */
  const multiSort = false;
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
  /* 목록 거르기의 바탕 — 정지만 뺀 사람(탈퇴자도 그 기간에 회원이었으면 서버 명단 · 아래 statMembers ★ 에 들어 줄이 선다 · 유저 검색으로도 찾는다). */
  const matchedMembers = useMemo(() => {
    const terms = users.map((u) => normalizeSearchText(u).trim()).filter(Boolean);
    return members.filter((m) => m.status !== "suspended" && (terms.length === 0 || terms.some((t) => memberMatchesTerm(m, t))));
  }, [members, users]);

  /* 기간 기본값 = 이번 달(2026-10-28, 요청: "조회 최근달로 변경" · 같은 날 "최근 3개월로" → "최근 2개월로"를 거쳐 돌아옴). */
  /* ★ 기간 두 갈래(2026-11-14 · statQuery monthOfPeriod ★) — 주소의 period 는 달 하나("YYYY-MM") 아니면 날짜 지정('오늘' · 날~날). 옛 주소(전체 기간 · 여러 달)는
     달 하나로 읽어(periodRaw → period) 조회 · 열쇠 · 그래프가 다 그 달을 본다. */
  const [periodRaw, setPeriod] = useUrlState("period", currentMonthValue());
  const monthSel = monthOfPeriod(periodRaw);
  const period = monthSel ?? periodRaw;
  const [sizeRaw, setSize] = useUrlState("size", "team");
  const size = sizeTabOf(sizeRaw);
  const [mapRaw, setMap] = useUrlState("map", MAP_DEFAULT);
  const mapTab = mapTabOf(mapRaw);
  /* ★ 티어(와 보정교환비)는 **팀전 전체 · 맵 전체**일 때만(2026-10-28, 요청: "티어는 맵 전체일 때만 표시 · 팀전 전체 맵 전체일 때만") — 티어는 전체 맵 팀전 판으로
     매기므로 그 조회에서만 칸의 게임수 · 승률과 같은 판을 본다. 옛: 1:1 이 아니면 늘. */
  /* (2026-11-10, 요청: "통계에 맵 필터 있잖아 · 그거별로 조회 시 티어 나오게") — 맵 탭에서도 보인다: 서버가 그 맵 판으로 티어를 낸다(tier_rows map_group). 팀전만은 그대로. */
  const showTier = size === "team";
  /* ★ 티어 칸 위아래 표(StatGrid StatVoteCtl ★ · 2026-11-16, 요청: "사람별로 11월 전체 팀전 티어 조회 때만") — 한 달 · 팀전 전체 · 맵 전체 · 로그인한 사람에게,
     서버가 그 달을 열어 둔 때만(sg-api tier_votes VOTE_MONTHS) 다이얼이 선다. 누르면 내 표를 바로 바꾸고(낙관) 서버에 낸 뒤 표를 다시 받는다(덤 · 티어 · 차례가 서버 셈으로). */
  const me = useAppStore((s) => s.user);
  const voteMonth = TIER_VOTE_ON && monthSel !== null && size === "team" && mapTab === "all" && me ? monthSel : null;
  const [voteMine, setVoteMine] = useState<{ month: string; mine: Record<string, number> } | null>(null);
  const [voteBusy, setVoteBusy] = useState<string | null>(null);
  const [statsTick, setStatsTick] = useState(0);
  useEffect(() => {
    if (!voteMonth) { setVoteMine(null); return undefined; }
    let alive = true;
    api.getTierVotes(voteMonth).then((r) => { if (alive) setVoteMine(r.open ? { month: voteMonth, mine: r.mine } : null); })
      .catch(() => { if (alive) setVoteMine(null); });
    return () => { alive = false; };
  }, [voteMonth]);
  const onVote = useCallback((memberId: string, value: -1 | 0 | 1) => {
    if (!voteMine) return;
    const { month: vm } = voteMine;
    const put = (v: number) => setVoteMine((cur) => {
      if (!cur || cur.month !== vm) return cur;
      const mine = { ...cur.mine };
      if (v) mine[memberId] = v; else delete mine[memberId];
      return { ...cur, mine };
    });
    const prev = voteMine.mine[memberId] ?? 0;
    put(value);
    setVoteBusy(memberId);
    api.setTierVote(vm, memberId, value)
      .then(() => setStatsTick((t) => t + 1))
      .catch((e) => { put(prev); showToast(e instanceof Error ? e.message : "표를 내지 못했어요.", { kind: "warn" }); })
      .finally(() => setVoteBusy(null));
  }, [voteMine]);
  const voteCtl = useMemo<StatVoteCtl | null>(
    () => (voteMine ? { mine: voteMine.mine, selfId: me?.id ?? null, busy: voteBusy, onVote } : null),
    [voteMine, me, voteBusy, onVote],
  );
  /** 실제로 쓰는 정렬 — 티어 칸이 없는 조회엔 티어를 빼고, 남는 게 없으면 전체 승률. */
  const shownSort = useMemo<StatSortKey[]>(() => {
    if (showTier) return sortKeys;
    /* 1:1 은 WPA 칸도 없다(2026-11-17 · StatGrid noWpa) — 그 자로는 줄 세우지 않는다. */
    const rest = sortKeys.filter((k) => k !== "tier" && !(size === "1" && (k === "wpa" || k.endsWith(":wpa"))));
    return rest.length > 0 ? rest : ["rate"];
  }, [sortKeys, showTier, size]);
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
  /* ★ 날짜 지정(2026-11-13 · statQuery DAY_PERIOD_RE ★) — 기본은 오늘([오늘] 단추는 걷었다 · 요청: "오늘 보기 버튼은 제거" → "날짜 지정의 기본값이 오늘").
     오늘은 옛 PERIOD_TODAY 그대로라 정오를 넘으면 저절로 다음 날로 간다(useTodayFrom) · 날을 고르면 "YYYY-MM-DD~YYYY-MM-DD" · 오늘 하루를 다시 고르면 PERIOD_TODAY 로. */
  const dayOn = monthSel === null;
  /* ★ 두 줄 · 라디오(2026-11-14, 요청: "기간 필터를 두줄로 나누고 각 앞에 라디오 버튼 추가해서 선택") — 꺼진 줄도 제 값을 기억해 보여 준다: 달 줄은 마지막에 본 달(처음엔 이번 달) ·
     날짜 줄은 마지막에 고른 날(처음엔 오늘). 라디오를 누르면 그 줄의 값으로 켜고, 꺼진 줄의 화살표 · 달력 · 날짜 칸을 만져도 그 값으로 켠다. */
  const [monthKeep, setMonthKeep] = useState(() => monthSel ?? currentMonthValue());
  const [daysKeep, setDaysKeep] = useState(() => (monthSel === null ? periodRaw : PERIOD_TODAY));
  useEffect(() => {
    if (monthSel !== null) setMonthKeep(monthSel);
    else setDaysKeep(periodRaw);
  }, [monthSel, periodRaw]);
  const month = monthSel ?? monthKeep;
  const dayPeriod = dayOn ? period : daysKeep;
  const todayFrom = useTodayFrom(dayPeriod === PERIOD_TODAY);
  const [dayA, dayB] = DAY_PERIOD_RE.test(dayPeriod) ? dayPeriod.split("~") : [todayFrom.slice(0, 10), todayFrom.slice(0, 10)];
  const pickDays = (a: string, b: string): void => setPeriod(a === b && a === todayDay() ? PERIOD_TODAY : `${a}~${b}`);
  /* ★ 폰은 거르기를 접은 채로 연다 — 되살림(2026-11-16, 요청: "팀 구성과 맵에 라벨 붙여주고 기본 숨김상태로 복구" · 처음 2026-11-13 "모바일에선 처음에 접은 상태로 노출
     (최상단은 현재의 기간 필터 한줄만 보이기)" → 2026-11-14 "모바일도 필터 접기 모드 없애기"로 걷었던 것). 접히면 기간 두 줄만 · 유형 · 맵 탭 · 유저 칩은 달 줄 오른끝
     [필터 ⌄]를 눌러 편다. 기억하지 않는다(늘 접힌 채 연다). 기본이 아닌 거르기(유형 · 맵 · 유저)가 걸려 있으면 [필터]에 점. PC 는 늘 편 채. */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const folded = isMobile && !filtersOpen;
  const filterOn = size !== "team" || mapTab !== MAP_DEFAULT || users.length > 0;
  const queryKey = useMemo(
    () => ({
      /* 서버엔 늘 클랜원 전부 — 클랜원 전체 줄·종족구성별 전적이 유저 검색에 안 흔들리게(2026-10-21, 요청: "유저 필터가 들어가도 클랜원 전체 데이터는
         그거에 무관해야"). 검색은 아래 줄만 거른다(viewMembers) · 그래서 칩을 바꿔도 다시 안 불러온다. */
      /* ★ 가입한 뒤의 기간만(2026-11-16 · 아래 viewMembers 옛 거르기를 여기로 — 같은 날 "클랜 전체 줄도 조회되는 사람 수로 계산") — 조회 기간의 끝이 가입일보다
         앞인 사람은 서버에 안 보낸다 → 목록 · 명수 · 클랜 전체(평균) 줄 · 편성 집계가 다 그 사람들로만. 전체 기간(끝이 없음)은 다. */
      memberIds: statMembers(members, statRange(period, period === PERIOD_TODAY ? todayFrom : "")).map((m) => m.id).sort().join(","),
      period,
      /* [오늘]이면 그 '오늘'의 시작도 열쇠에 — 정오를 넘으면 다시 불러온다(위 useTodayFrom ★). */
      day: period === PERIOD_TODAY ? todayFrom : "",
      size,
      map: mapTab,
    }),
    [members, period, todayFrom, size, mapTab],
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
  }, [debouncedQuery, debouncedSignature, statsTick]);   // statsTick — 위아래 표를 낸 뒤 다시 받기(위 voteCtl ★)

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

  /* 가입 · 탈퇴 거르기(2026-11-16 · 위 statMembers ★)는 서버에 보내는 사람(queryKey.memberIds)에서 한다 — view.memberIds 가 이미 그 사람들. */
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

  /* ★ 경기 수준(2026-11-16, 요청: "조회한 기간의 경기수준(판 질) 넣기 · 경기수준: 기준보다 0.2% 높음 이런 식으로 · 높으면 초록 낮으면 빨강톤") —
     sg-api quality.py · TierEntry.levelPct(그 기간 판들의 초반 운영 ½ + EAPM ½ 이 2026년 7월보다 몇 % 좋은가 · 그 기간 모두 같다 · 같은 날 "B 로 · 기준은 7월이 100%"). 티어 조회에서 잰 판이 있을 때만. */
  const levelPct = useMemo((): number | null => {
    if (!showTier || !view) return null;
    for (const e of Object.values(view.stats)) {
      if (typeof e?.tier?.levelPct === "number") return e.tier.levelPct;
      for (const t of Object.values(e?.tierByRace ?? {})) if (typeof t?.levelPct === "number") return t.levelPct;
    }
    return null;
  }, [showTier, view]);
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
        /* ★ 인분이 같으면 **판 수가 많은 쪽이 위**(2026-11-14, 요청: "공동점수인 경우는 경기수가 많은 게 위로") — 그 티어를 낸 판 수(TierEntry.plays) ·
           그래도 같으면 승패 보정(adj · 서버가 끄며 늘 1) → 전투 보정(cbt) 높은 쪽(옛 2026-11-07 "티어 안에서 인분 → 승패 보정 → 전투 보정") — 그래도 같으면 바깥 차례. */
        const num = (v: number | null | undefined) => (typeof v === "number" ? v : null);
        const by = (av: number | null, bv: number | null) => missingLast(av === null, bv === null) || dirSign * ((av ?? 0) - (bv ?? 0));
        return missingLast(typeof at?.tier !== "number", typeof bt?.tier !== "number")
          || missingLast(typeof ai !== "number", typeof bi !== "number")
          || dirSign * ((ai ?? 0) - (bi ?? 0))
          || by(num(at?.plays), num(bt?.plays))
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
    {!STATS_PAUSED && <StatsPoll />}
    <div className={cx("scr-screen scr-stats-screen-v2", STATS_PAUSED && "is-paused")} inert={STATS_PAUSED}>
      <div className="scr-v2-toolbar">
        {/* ★ 팀 구성하기는 제목 줄 오른끝 · 기간 · 필터는 제목 한 줄 아래(2026-11-13, 요청: "팀 구성하기 버튼이 필터 안에 들어가 버림 · 밖으로 빼서 통계 타이틀 옆 오른쪽 ·
            필터는 타이틀에서 한 줄 아래로") — 옛: 폰은 [필터]를 펴야 팀 구성하기가 보였고 · PC 는 기간 줄이 제목 옆이었다. */}
        <div className="scr-v2-toolbar-title-row">
          <h1 className="scr-title scr-v2-toolbar-title">통계</h1>
          {teamBuilderBtn}
        </div>
        <div className="scr-v2-toolbar-title-row scr-stats-filter-row">
          {/* ★ 기간 두 줄 · 라디오(2026-11-14, 요청: "기간 필터를 두줄로 나누고 각 앞에 라디오 버튼 추가해서 선택 · 1번째줄은 월 선택 — 달력이 월 오른쪽으로 · 달력만 버튼 월은 텍스트로 ·
              좌우 화살표로 한달씩 점프 · 옆에 설명 · 2번째 줄은 날짜지정 라벨 옆에 인풋창 두개를 이미 보여주기 · 전체기간은 삭제 · 월 선택 → 기간이 아닌 월 한 개만")
              — 달 줄은 그 달 + 앞 달 기록을 합친 실력(서버가 꼭 한 달 조회에만 섞는다 · statQuery monthOfPeriod ★) · 날짜 줄은 그 기간 판만.
              옛(2026-10-26 ~ 11-13): 한 줄에 배타 단추 셋 — [월 선택 ▾(달 · 연속 달)] [전체기간] [날짜 지정 ▾(눌러 여는 창)] · 켜진 것만 채움 단추. */}
          {/* ★ 조회 기간 라벨 · 두 줄 라벨 "월별" / "지정" · 두 줄 살짝 들임(2026-11-17, 요청: "기간 두개 위에 조회 기간 라벨 추가 · 첫째줄에 '월별' 라벨 · 두번째줄 기간 지정 → 지정 ·
              기간 두줄 들여쓰기 살짝 해주기 위에 라벨과 구분되게") — 라벨은 줄 위 한 줄(.scr-stats-period-title) · 두 줄은 .scr-stats-period-row 왼 여백. */}
          <div className="scr-stats-period" role="radiogroup" aria-label="조회 기간">
            <span className="scr-stats-period-title" aria-hidden>조회 기간</span>
            <div className={cx("scr-stats-period-row", !dayOn && "is-on")}>
              <label className="scr-checkbox-field scr-stats-period-pick">
                <input type="radio" name="scr-stats-period" checked={!dayOn} onChange={() => setPeriod(month)} />
                <span>월별</span>
              </label>
              <div className="scr-stats-month">
                <button type="button" className="scr-month-cal-nav" aria-label="이전 달" onClick={() => setPeriod(shiftMonthValue(month, -1))}>
                  <ChevronLeft size={15} aria-hidden />
                </button>
                <span className="scr-stats-month-text">{monthPeriodLabel(month)}</span>
                <button type="button" className="scr-month-cal-nav" aria-label="다음 달" disabled={month >= currentMonthValue()}
                  onClick={() => setPeriod(shiftMonthValue(month, 1))}>
                  <ChevronRight size={15} aria-hidden />
                </button>
                <MonthCalendar value={month} onChange={setPeriod} maxMonth={currentMonthValue()} iconOnly className="scr-v2-toolbar-month" />
              </div>
              {/* ★ 달 줄 설명은 ? 팝오버로(2026-11-17, 요청: "도움말 제거하고 대신 월별 옆에 ? 버튼으로 팝오버") — 옛: 줄 끝 작은 글(폰은 아랫줄로 내려 두 줄을 먹었다). */}
              <InfoTip
                label="월별" trigger={<CircleHelp size={15} aria-hidden />} triggerClassName="scr-infotip scr-stats-month-help" bubbleClassName="scr-sg-help"
                text={(
                  <span className="scr-sg-help-list">
                    <span>그 달 + 지난 몇 달 기록을 합친 실제 실력을 보여줘요.</span>
                    <span>앞의 넉 달 기록을 한 달 전 ½ · 두 달 전 ¼ … 무게로 같이 세요(판 수 · 승률은 그 달 것 그대로).</span>
                  </span>
                )}
              />
              {/* 폰: 첫 줄(달 줄) 오른끝에 [필터](위 folded ★) — 설명보다 앞에 둬야 설명이 아랫줄로 내려가도 첫 줄에 남는다. */}
              {isMobile && (
                <button type="button" className={cx("scr-sg-fold scr-stats-fold-btn", filtersOpen && "is-on")} aria-expanded={filtersOpen}
                  onClick={() => setFiltersOpen((v) => !v)} title={filtersOpen ? "거르기 접기 — 기간만" : "거르기 펴기 — 유형 · 맵 · 유저"}>
                  필터{filterOn && !filtersOpen && <i className="scr-stats-fold-dot" aria-label="걸린 거르기 있음" />}
                  <ChevronDown size={13} aria-hidden className="scr-stats-fold-chev" />
                </button>
              )}
              {/* (걷음 2026-11-17 · 위 ? 팝오버로) 줄 끝 설명 "그 달 + 지난 몇 달 기록을 합친 실제 실력을 보여줘요"(2026-11-14). */}
            </div>
            <div className={cx("scr-stats-period-row", dayOn && "is-on")}>
              <label className="scr-checkbox-field scr-stats-period-pick">
                <input type="radio" name="scr-stats-period" checked={dayOn} onChange={() => setPeriod(dayPeriod)} />
                <span>지정</span>
              </label>
              {/* ★ 라벨 "날짜 지정" → "기간 지정" · 줄 끝 설명("실제 그 기간만의 실력을 보여줘요")은 걷었다(2026-11-16, 요청: "날짜 지정-> 기간 지정으로 라벨바꾸고 도움말 제거"). */}
              <DayRangePicker from={dayA} to={dayB} max={todayDay()} onChange={pickDays}
                all={dayPeriod === PERIOD_ALL} onAll={() => setPeriod(PERIOD_ALL)} />
            </div>
          </div>
        </div>
      </div>
      {teamBuilder && <TeamBuilderModal onClose={() => setTeamBuilder(false)} />}

      {!folded && (<>
      {/* ★ 줄 앞 라벨 "유형" · "맵"(2026-11-16, 요청: "팀 구성과 맵에 라벨 붙여주고" → "유형으로 바꾸고" — "팀 구성"은 [팀 구성하기] · 종족구성과 헷갈려서) — 두 줄 탭의 첫 칸이 같은 x 에 서게 라벨 폭을 맞춘다(.scr-stats-tab-label). */}
      <div className="scr-stats-tab-line">
      <span className="scr-stats-tab-label" aria-hidden>유형</span>
      <div className="scr-line-tabs scr-stats-size-tabs" role="tablist" aria-label="유형">
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
      </div>
      <div className="scr-stats-tab-line">
      <span className="scr-stats-tab-label" aria-hidden>맵</span>
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

      {/* ★ 명수 줄은 자료가 오기 전에도 자리를 잡아 둔다(2026-11-17, 요청: "미리 자리 확보해놓구 필터랑 저부분 사이 갭 늘리기") — 늦게 끼어들며 아래 표를 밀지 않게
          줄(높이)은 늘 두고 글자만 자료가 오면 채운다. 옛: 자료가 온 뒤에야 줄을 그렸다. 위 틈은 global.css .scr-stats-count-row(폰 접힘 · 기간 줄 바로 아래). */}
      {/* ★ 명수 줄과 정렬 줄을 한 줄로(2026-11-18, 요청: "통계의 인원결과줄과 wpa란? 종족펼치기 버튼 이거를 한줄로 합치기") — 왼쪽 명수 · 게임 · 경기 수준,
          오른끝 WPA란? · 종족별(WPA란? 의 margin-left auto 가 민다). 오른끝은 그대로 보이는 표 오른변에 맞춘다(PC sortW). 좁으면 단추 둘이 다음 줄 오른끝으로 접힌다.
          옛: 명수 줄(header) 아래 따로 정렬 줄(div.scr-stats-sort · 2026-11-17 왼쪽 걷은 뒤 단추 둘만 남았다). */}
      <header className="scr-clan-dash-head scr-stats-count-row" style={!isMobile && sortW ? { maxWidth: sortW } : undefined}>
        {view?.clan && (<>
          {/* 머리는 **명수뿐**이다(2026-10, 요청: "클랜전체 N 명 → 그냥 N명으로") — 아래 카드 제목이 이미 클랜 전체라고 말한다. */}
          {/* 명수 옆 경기 수(2026-11-05, 요청: "명수 옆에 몇 게임인지 · 폰 피시 모두" — 표 평균 줄의 게임수는 참여 합이라 경기 수는 여기서). */}
          <span className="scr-clan-dash-sub">{viewMembers.length}명 · {clanGames.toLocaleString()}게임</span>
          {levelPct !== null && (
            <span className={cx("scr-stats-level", levelPct >= 0.05 ? "is-up" : levelPct <= -0.05 ? "is-dn" : null)}
              title="그 기간 판들의 초반 운영(분당 채취 · 쥔 돈)과 EAPM을 반씩 섞어 2026년 7월(= 100%)과 견준 값 — 모두의 인분에 같은 비율로 곱해져요(20% 좋으면 ×1.2)">
              경기 수준: {Math.abs(levelPct) < 0.05 ? "기준과 같음" : `기준보다 ${Math.abs(levelPct).toFixed(1)}% ${levelPct > 0 ? "높음" : "낮음"}`}
            </span>
          )}
          {/* (걷음 2026-10-22, 요청: "통계 그래프 제거") 전부 펼치기·접기 — 펼칠 그래프가 없다. */}
        </>)}
        {/* 오른끝(도움말 · 종족별 단추)을 보이는 표 오른변에 맞춘다(2026-11-05, 지적: "위치가 이상 버튼" — 접힌 표는 종합 칸만 보여 줄 끝이 표 밖 멀리 떴다). PC 만 — 위 header style. */}
        {/* (걷음 2026-11-17, 요청: 정렬 줄 왼쪽 제거) "정렬" 글 · [여러 기준] 체크박스(2026-11-04) · 고른 기준 줄("종합 WPA/티어 › APM") · PC [초기화](2026-10-24) —
            정렬은 그대로 표 머리를 눌러서 · 고른 자는 머리 화살표로 보인다. 줄에는 오른끝 WPA란? · 종족별만 남는다. */}
        {/* (걷음 2026-11-13, 요청: "통계 전체 툴팁은 제거") 표 도움말 단추(StatHelp) → 같은 자리에 "WPA란?" 글 단추(같은 날 · WpaHelp). */}
        <WpaHelp />
        {/* 종족별 펼치기/접기 — 표 밖 정렬 줄 오른끝(2026-11-05, 요청: "저 펴고 접는 버튼은 표 외부로 이동" · 옛: 표 종합 머리 오른끝 · 2026-11-04). */}
        <button type="button" className={cx("scr-sg-fold", showRaces && "is-on")} aria-expanded={showRaces} onClick={toggleRaces}
          title={showRaces ? "종족별 접기 — 종합만" : "종족별 펼치기 — 테란 · 프로토스 · 저그"}>
          종족별{showRaces ? <ChevronsLeft size={12} aria-hidden /> : <ChevronsRight size={12} aria-hidden />}
        </button>
      </header>

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
            noWpa={size === "1"}
            tier={showTier}   /* 팀전 티어 정식(2026-10-28, 요청: "이제 통계에 티어 정식으로 추가" — 옛 `?tier=1` 문을 걷었다) · 팀전 전체 · 맵 전체에서만(위 showTier ★) */
            mobile={isMobile}
            sortKeys={shownSort}
            onSortKeys={setSortKeys}
            multi={multiSort}
            showRaces={showRaces}
            onVisW={setSortW}
            trend={trend}
            vote={showTier ? voteCtl : null}
          />
        )}
      </div>

    </div>
    </>
  );
}
