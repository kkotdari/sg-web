import { Fragment, createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowDownWideNarrow, ArrowUpDown } from "lucide-react";
import { StatTrendPop, statMetric, type StatMetric, type StatTrendData, type TrendAnchor } from "./StatTrend";
import Avatar from "../../components/common/Avatar";
import PhotoViewer from "../../components/common/PhotoViewer";
import InfoTip from "../../components/common/InfoTip";
import { useAppStore } from "../../store/appStore";
import { cx } from "../../utils/format";
import type { BaseRace, Member, MemberStats } from "../../types";

/* ★★ 통계 = **표**(2026-10-20, 요청: "통계 PC 도 그리드로 · 클랜원 전체가 맨 위 로우 · 그 아래 개인별 한 로우씩" → 시안 A(한 줄 표)에
   C 의 승률 막대를 얹어(요청: "A에 C의 그래프를 시각적으로 도입")).
   PC: [유저 | 게임수 | 승률 | 데미지 | APM | 테란·프로토스·저그 (게임수 | 승률)] · 폰: [유저 | 데미지 | APM | 전적: 전체·종족 판수(승률)].
   ★ 펼침(PC ▾ · 폰 줄 누름 → 분당 곡선 두 판 · 2026-10-20)은 걷었다(2026-10-22, 요청: "통계 그래프 제거 — 화면과 API 응답에서만"). 승률 막대(시안 C)도 걷었다. */

const RACES: BaseRace[] = ["테란", "프로토스", "저그"];
/** 맨 윗줄 이름 — "평균"(2026-10-22, 요청: "클랜원 전체 → 클랜평균으로 바꾸자" → "클랜평균은 평균으로 변경"). */
const CLAN_LABEL = "평균";
/** 정렬 자 — 표 머리를 눌러 고른다(2026-10-22, 요청: "정렬은 머리 터치로 변경 · 헤더에 정렬 단추" → "정렬 조건을 상세히 — 전체와 종족별 플레이 수와 승률 총 8개").
 *  APM · 데미지 · 전체(rate · plays) · 종족별("테란:rate" · "테란:plays" …). */
export type StatSortKey = "rate" | "plays" | "dmg" | "apm" | `${BaseRace}:rate` | `${BaseRace}:plays`;
type SortProps = {
  sortKeys: readonly StatSortKey[]; onSortKeys: (next: StatSortKey[]) => void;
  /** 복수 기준 정렬(2026-10-24, 요청: "통계 기준 1개로 하고 복수 기준하고 싶으면 맨 위에 복수 기준 정렬 토글 켜기") — 꺼져 있으면(기본) 머리를 누른 자 **하나**로 갈아탄다. */
  multi: boolean;
};
/** 켜고 끄기 — 복수: 없으면 끝에 붙이고 있으면 뺀다 · 하나: 그 자 하나로(같은 자를 다시 누르면 끔 = 기본 차례). */
const toggled = (keys: readonly StatSortKey[], k: StatSortKey, multi: boolean): StatSortKey[] => {
  if (!multi) return keys.includes(k) && keys.length === 1 ? [] : [k];
  return keys.includes(k) ? keys.filter((x) => x !== k) : [...keys, k];
};
/** 폰 전적 머리 — 누를 때마다 승률 → 게임수 → 끔(요청: "모바일은 한 번 누르면 승률 다음 플레이 수 다음 없앰") · 승률이 게임수로 바뀔 땐 제 차례 자리를 지킨다(복수) · 하나면 그 자만. */
const cycled = (keys: readonly StatSortKey[], rate: StatSortKey, plays: StatSortKey, multi: boolean): StatSortKey[] => {
  if (!multi) return keys.includes(rate) ? [plays] : keys.includes(plays) ? [] : [rate];
  if (keys.includes(rate)) return keys.map((x) => (x === rate ? plays : x));
  if (keys.includes(plays)) return keys.filter((x) => x !== plays);
  return [...keys, rate];
};
/** 머리 정렬 단추 — 고른 자는 머리 글자가 본문색으로 진해진다(폰 전적 머리 아래 "승률" · "게임수" 작은 글은 걷었다 · 2026-10-22, 요청: "굳이 헤더에 승률 전적 표시는 안 해도 돼").
 *  ★ PC 는 **정렬 아이콘**(2026-10-24, 요청: "통계 정렬 아이콘으로 변경하고 초기화 버튼 필요 · 피시") — 글자 옆에 표 정렬 아이콘: 안 고른 머리는 옅은 ↕(ArrowUpDown),
 *  고른 머리는 본문색 ↓(ArrowDownWideNarrow) 에 여럿이면 차례 숫자. 옛 '고른 머리를 칠하기'(.is-on 바탕색)는 걷었다. 폰은 글자색만(그대로 · 아이콘 없음). */
function SortHead({ on, order, onClick, children }: { on: boolean; order?: number; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={cx("scr-sg-sort", on && "is-on")} aria-pressed={on} onClick={onClick}>
      {children}
      {order !== undefined && (
        <span className="scr-sg-sort-ic" aria-hidden>
          {on ? <ArrowDownWideNarrow size={13} /> : <ArrowUpDown size={13} />}
          {on && order > 0 && <i>{order}</i>}
        </span>
      )}
    </button>
  );
}

export interface StatGridRow {
  member: Member;
  stats: MemberStats;
  byRace?: Partial<Record<BaseRace, MemberStats>>;
}

const Dash = () => <span className="scr-sg-dim">-</span>;

/* ★ 값 칸의 변화 그래프 손잡이(2026-10-24, 요청: "통계 컬럼 피시는 호버 폰은 클릭시 → 5개월간의 변화 그래프로" · StatTrend.tsx) — 표가 문맥으로 내려 주고
   TCell 이 칸마다 단다: PC 는 마우스를 얹으면(enter · 떠나면 잠깐 뒤 닫힘 — 팝오버로 건너갈 틈) · 폰은 누르면(tap · 다시 누르거나 밖을 누르면 닫힘). 자료(trend)가
   없으면(아직 안 옴 · 평균 줄) 손잡이가 없는 보통 칸이다. */
interface TrendCtxValue {
  mobile: boolean;
  activeKey: string | null;
  enter: (member: Member, metric: StatMetric, el: HTMLElement) => void;
  tap: (member: Member, metric: StatMetric, el: HTMLElement) => void;
  leave: () => void;
}
const TrendCtx = createContext<TrendCtxValue | null>(null);
const trendKey = (m: Member, k: StatMetric) => `${m.id}|${k.key}`;

function TCell({ member, metric, className, children }: { member?: Member; metric: StatMetric; className?: string; children: ReactNode }) {
  const ctx = useContext(TrendCtx);
  if (!ctx || !member) return <span className={cx("scr-sg-c", className)}>{children}</span>;
  const hot = ctx.activeKey === trendKey(member, metric);
  return (
    <span
      className={cx("scr-sg-c scr-sg-tcell", className, hot && "is-hot")}
      onPointerEnter={ctx.mobile ? undefined : (e) => { if (e.pointerType === "mouse") ctx.enter(member, metric, e.currentTarget); }}
      onPointerLeave={ctx.mobile ? undefined : ctx.leave}
      onClick={ctx.mobile ? (e) => ctx.tap(member, metric, e.currentTarget) : undefined}
      role={ctx.mobile ? "button" : undefined} tabIndex={ctx.mobile ? 0 : undefined}
      aria-label={ctx.mobile ? `${member.nickname} ${metric.label} 변화 보기` : undefined}
    >
      {children}
    </span>
  );
}

function Num({ v, unit }: { v: string | number | null | undefined; unit?: string }) {
  if (v === null || v === undefined || v === "") return <Dash />;
  return <span className="scr-sg-v"><b>{v}</b>{unit && <i>{unit}</i>}</span>;
}

/** 승률 — 옛 막대(시안 C)는 걷었다(2026-10-20, 요청: "통계 그래프 제거"). 칸 머리가 '승률'이라 값만 쓴다. */
function Rate({ s }: { s?: MemberStats }) {
  if (!s || s.plays === 0) return <Dash />;
  return (
    <span className="scr-sg-rate">
      <Num v={s.winRate} unit="%" />
    </span>
  );
}

function Dmg({ s, compact }: { s: MemberStats; compact?: boolean }) {
  const d = s.dmgDealtRel, t = s.dmgTakenRel;
  if (typeof d !== "number" || typeof t !== "number") return <Dash />; // 폰도 "데미지 -"(이름표만 덩그러니 남지 않게)
  /* 폰은 칸이 좁아 배수만 — 이름표("딜" · "피해")도 없이 초록 딜 · 빨강 피해 숫자 둘(2026-10-22, 요청: "딜 피해 라벨 제거" — 뜻은 도움말 StatHelp 가 같은 색으로 말한다).
     옛: "딜 1.4 피해 0.8"(2026-10-20). */
  if (compact) {
    return (
      <span className="scr-sg-dmg" title="준·입은 데미지가 그 경기 참가자 평균의 몇 배인가(1.0배 = 평균)">
        <b className="is-dealt">{(d / 100).toFixed(1)}</b>
        <b className="is-taken">{(t / 100).toFixed(1)}</b>
      </span>
    );
  }
  /* PC 도 숫자만 — 초록 딜 / 빨강 피해(2026-10-22, 요청: "데미지도 간단히 숫자만 표시" · 옛: "평균의 1.4배 딜 / 0.8배 피해"). */
  return (
    <span className="scr-sg-dmg" title="준·입은 데미지가 그 경기 참가자 평균의 몇 배인가(1.0배 = 평균)">
      <b className="is-dealt">{(d / 100).toFixed(1)}</b>
      <span className="scr-sg-dim">/</span>
      <b className="is-taken">{(t / 100).toFixed(1)}</b>
    </span>
  );
}

function Who({ member }: { member: Member }) {
  const openMemberProfile = useAppStore((st) => st.openMemberProfile);
  const [photoOpen, setPhotoOpen] = useState(false);
  return (
    <>
      <button type="button" className="scr-sg-avatar" onClick={() => setPhotoOpen(true)} aria-label={`${member.nickname} 사진 보기`}>
        <Avatar member={member} size={28} />
      </button>
      <button type="button" className="scr-sg-name" title={member.nickname} onClick={() => openMemberProfile(member.id)}>
        {member.nickname}
      </button>
      {photoOpen && member.avatar && <PhotoViewer src={member.avatar} alt={member.nickname} onClose={() => setPhotoOpen(false)} />}
    </>
  );
}

/** 폰 줄의 아바타·이름 — 단추가 아니다(사진·프로필은 안 연다 · 옛 줄 펼치기 시절 그대로). */
function WhoPlain({ member }: { member: Member }) {
  return (
    <>
      <span className="scr-sg-avatar"><Avatar member={member} size={28} /></span>
      <span className="scr-sg-name" title={member.nickname}>{member.nickname}</span>
    </>
  );
}

/** 종족 두 칸 — [게임수 "30"(단위 걷음 · 2026-10-22) | 승률] (2026-10-20, 요청: "각 종족 컬럼을 두 컬럼으로 나눠 전적/승률" → "전적 몇 회로 단순화").
 *  클랜원 전체 줄도 종족 승률은 쓴다(요청: "클랜원 전체 종족별 승률 넣기" — 그 종족으로 뛴 클랜원 판의 승률). 전체 승률만 안 쓴다(내전이라 늘 반반). */
function RaceCells({ s, race, member }: { s?: MemberStats; race: BaseRace; member?: Member }) {
  if (!s || s.plays === 0) return <><span className="scr-sg-c"><Dash /></span><span className="scr-sg-c"><Dash /></span></>;
  return (
    <>
      <TCell member={member} metric={statMetric("plays", race)} className="scr-sg-race"><Num v={s.plays.toLocaleString()} /></TCell>
      <TCell member={member} metric={statMetric("rate", race)}><Rate s={s} /></TCell>
    </>
  );
}

function PcRow({ row, clan, games }: { row: StatGridRow; clan?: boolean; games?: number }) {
  const s = row.stats;
  const who = clan ? undefined : row.member;   // 평균 줄은 변화 그래프가 없다(TCell 이 보통 칸으로)
  return (
      <div className={cx("scr-sg-row", clan && "is-clan")}>
        <span className="scr-sg-c scr-sg-who">
          {clan ? <span className="scr-sg-name scr-sg-name-plain">{CLAN_LABEL}</span> : <Who member={row.member} />}
        </span>
        <TCell member={who} metric={statMetric("plays")}>
          {clan
            /* 평균 줄 = **경기 수만**(2026-10-22, 요청: "평균 게임수 괄호 없애고 게임수만 표시" · 옛 "1,180 (212경기)" — 사람 몫을 다 더한 전적 + 괄호 경기 수). */
            ? <Num v={(games ?? 0).toLocaleString()} />
            : <Num v={s.plays > 0 ? s.plays.toLocaleString() : null} />}
        </TCell>
        <TCell member={who} metric={statMetric("rate")}>{clan ? <Dash /> : <Rate s={s} />}</TCell>
        {/* 데미지 · APM 차례(2026-10-22, 요청: "APM 데미지 위치 교환" — 옛: APM · 데미지) */}
        <TCell member={who} metric={statMetric("dmg")}>{clan ? <Dash /> : <Dmg s={s} />}</TCell>
        <TCell member={who} metric={statMetric("apm")}><Num v={s.avgApm} /></TCell>
        {RACES.map((r) => <RaceCells key={r} s={row.byRace?.[r]} race={r} member={who} />)}
      </div>
  );
}

/** 폰 전적 칸 — 위 판수 "N" · 아래 작고 옅은 승률 "N"(2026-10-22, 요청: "모바일 통계 단위 제거하고 전적은 N / (N%) 승률이 좀 작게" → "%도 제거" → "괄호 제거하고 연하게" — 머리에 "전적 게임수(승률)" 설명이 선다).
 *  그 종족 판이 없으면 "-". 클랜원 전체의 전체 칸은 아래가 경기 수(내전이라 승률은 늘 반반). 옛: "N전" · 이름표 "승률" · "N%". */
function MCell({ s, games, noRate, member, race = null }: { s?: MemberStats; games?: number; noRate?: boolean; member?: Member; race?: BaseRace | null }) {
  if (!s || s.plays === 0) return <span className="scr-sg-c scr-sg-mrec"><Dash /></span>;
  return (
    <TCell member={member} metric={statMetric("rec", race)} className="scr-sg-mrec">
      <span className="scr-sg-v"><b>{s.plays.toLocaleString()}</b></span>
      {games !== undefined
        ? <span className="scr-sg-mrate">{games.toLocaleString()}</span>
        : noRate ? <Dash /> : <span className="scr-sg-mrate">{s.winRate}</span>}
    </TCell>
  );
}

function MobileRow({ row, clan, games }: { row: StatGridRow; clan?: boolean; games?: number }) {
  const s = row.stats;
  const who = clan ? undefined : row.member;
  return (
    <div className={cx("scr-sg-row", clan && "is-clan")}>
      <span className="scr-sg-c scr-sg-who">
        {clan ? <span className="scr-sg-name scr-sg-name-plain">{CLAN_LABEL}</span> : <WhoPlain member={row.member} />}
      </span>
      {/* APM · 데미지(초록 딜 위 · 빨강 피해 아래)는 제 칸(2026-10-22, 요청: "모바일도 APM · 데미지 컬럼으로 · 닉네임 최소 폭 줄여") — 옛: 닉네임 아래 한 줄 "APM 230 1.4 0.8".
          클랜원 전체는 데미지가 없다. */}
      <TCell member={who} metric={statMetric("dmg")} className="scr-sg-mnum">{clan ? <Dash /> : <Dmg s={s} compact />}</TCell>
      <TCell member={who} metric={statMetric("apm")} className="scr-sg-mnum">{s.avgApm ?? <Dash />}</TCell>
      <MCell s={s} games={clan ? (games ?? 0) : undefined} noRate={clan} member={who} />
      {RACES.map((r) => <MCell key={r} s={row.byRace?.[r]} member={who} race={r} />)}
    </div>
  );
}

/** 통계 표 도움말(2026-10-22, 요청: "도움말 · 헤더 설명 다 제거하고 '행 누르면…' 자리에 도움말 아이콘 단추 · 툴팁에 표 모양과 설명" → "PC 에도 알아서") —
 *  폰은 말풍선에 한 줄짜리 표 그림(숫자에 단위가 없어서)과 풀이 · PC 는 칸 머리 · 단위가 다 적혀 있어 그림 없이 데미지 뜻과 펼치기만 푼다. */
export function StatHelp({ mobile }: { mobile: boolean }) {
  return (
    <InfoTip
      label="통계 표" size={16} triggerClassName="scr-infotip scr-sg-help-btn" bubbleClassName="scr-sg-help"
      text={mobile ? (
        <>
          <span className="scr-sg-help-mock" aria-hidden>
            <span className="scr-sg-help-h">유저</span><span className="scr-sg-help-h">데미지</span><span className="scr-sg-help-h">APM</span><span className="scr-sg-help-h">전체</span>
            <span className="scr-sg-help-who"><b>닉네임</b></span>
            <span className="scr-sg-help-rec"><b className="is-dealt">1.4</b><b className="is-taken">0.8</b></span>
            <span className="scr-sg-help-rec"><b>230</b></span>
            <span className="scr-sg-help-rec"><b>68</b><i>54</i></span>
          </span>
          <span className="scr-sg-help-list">
            <span>데미지 — <b className="is-dealt">1.4</b> 딜 · <b className="is-taken">0.8</b> 피해: 그 경기 참가자 평균 데미지 대비 비율(1.0 = 평균)</span>
            <span>APM — 분당 행동 수 평균</span>
            <span><b>68</b> 게임수 · <i>54</i> 승률(%) — 전체 · 종족별</span>
            <span>머리를 누르면 그 기준으로 정렬 — 전체 · 종족 머리는 승률 → 게임수 → 끔. 정렬 줄의 '복수 기준'을 켜면 누른 차례대로 여러 기준이 쌓여요</span>
            <span>값을 누르면 일곱 달 변화 그래프(여러 달 조회는 그 기간 · 전체 기간은 최근 일곱 달)</span>
          </span>
        </>
      ) : (
        <span className="scr-sg-help-list">
          <span>데미지 — 준 데미지(<b className="is-dealt">딜</b>) · 받은 데미지(<b className="is-taken">피해</b>)가 그 경기 참가자 평균의 몇 배인가(1.0배 = 평균)</span>
          <span>APM — 분당 행동 수 평균</span>
          <span>종족 칸 — 그 종족으로 뛴 게임수 · 승률</span>
          <span>머리(게임수 · 승률 · 데미지 · APM · 종족별 게임수 · 승률)를 누르면 그 기준으로 정렬 — 정렬 줄의 '복수 기준'을 켜면 누른 차례대로 여러 기준이 쌓여요</span>
          <span>값에 마우스를 얹으면 일곱 달 변화 그래프(여러 달 조회는 그 기간 · 전체 기간은 최근 일곱 달)</span>
        </span>
      )}
    />
  );
}

export default function StatGrid({ clan, clanGames, rows, mobile, sortKeys, onSortKeys, multi, trend }: SortProps & {
  /** 클랜원 전체(맨 위 줄) — 없으면 안 선다. */
  clan: { stats: MemberStats; byRace?: Partial<Record<BaseRace, MemberStats>> } | null;
  clanGames: number;
  rows: StatGridRow[];
  mobile: boolean;
  /** 일곱 달 변화 자료(StatTrend) — 없으면 칸에 손잡이가 없다. */
  trend: StatTrendData | null;
}) {
  /* 변화 그래프 팝오버(위 TrendCtx ★) — PC 는 떠난 뒤 POP_LINGER 뒤 닫힘 · 폰은 밖 누름·스크롤에 닫힘. */
  const [pop, setPop] = useState<TrendAnchor | null>(null);
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popCancel = (): void => { if (popTimer.current) { clearTimeout(popTimer.current); popTimer.current = null; } };
  const popLeave = (): void => { popCancel(); popTimer.current = setTimeout(() => { popTimer.current = null; setPop(null); }, 160); };
  const rectOf = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };
  const ctx: TrendCtxValue | null = trend ? {
    mobile,
    activeKey: pop ? trendKey(pop.member, pop.metric) : null,
    enter: (member, metric, el) => { popCancel(); setPop((cur) => (cur && trendKey(cur.member, cur.metric) === trendKey(member, metric) ? cur : { member, metric, rect: rectOf(el) })); },
    tap: (member, metric, el) => { setPop((cur) => (cur && trendKey(cur.member, cur.metric) === trendKey(member, metric) ? null : { member, metric, rect: rectOf(el) })); },
    leave: popLeave,
  } : null;
  useEffect(() => () => popCancel(), []);
  useEffect(() => {
    if (!pop) return undefined;
    const off = (): void => setPop(null);
    const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") setPop(null); };
    const onDown = (e: PointerEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest(".scr-sg-trend-pop") || t.closest(".scr-sg-tcell"))) return;
      setPop(null);
    };
    window.addEventListener("scroll", off, { passive: true, capture: true });
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => { window.removeEventListener("scroll", off, { capture: true }); window.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown, true); };
  }, [pop]);
  useEffect(() => { if (!trend) setPop(null); }, [trend]);
  const popEl = pop && trend ? createPortal(
    <StatTrendPop anchor={pop} data={trend} mobile={mobile} onEnter={mobile ? undefined : popCancel} onLeave={mobile ? undefined : popLeave} />,
    document.body,
  ) : null;
  const toggle = (k: StatSortKey) => ({ on: sortKeys.includes(k), onClick: () => onSortKeys(toggled(sortKeys, k, multi)) });
  /** PC 머리 — 아이콘 차례(여럿일 때만 숫자 · 하나면 0 = 숫자 없음). 폰은 order 를 안 줘 아이콘이 없다. */
  const pcToggle = (k: StatSortKey) => ({ ...toggle(k), order: sortKeys.length > 1 ? sortKeys.indexOf(k) + 1 : 0 });
  /** 폰 전적 머리(전체 · 종족) — 승률 → 게임수 → 끔. */
  const cycle = (rate: StatSortKey, plays: StatSortKey) => ({
    on: sortKeys.includes(rate) || sortKeys.includes(plays), onClick: () => onSortKeys(cycled(sortKeys, rate, plays, multi)),
  });
  const clanRow: StatGridRow | null = clan ? { member: { id: "", nickname: CLAN_LABEL } as Member, stats: clan.stats, byRace: clan.byRace } : null;
  if (mobile) {
    return (
      <TrendCtx.Provider value={ctx}>
      <div className="scr-sg is-m" role="table" aria-label="통계">
        {/* 머리 두 줄 — 유저 칸은 두 줄을 내리 쓰고 · 전적은 전체·종족 넷을 덮는다. 뜻 풀이는 정렬 줄의 도움말 단추(StatHelp)로 옮겼다(2026-10-22, 요청: "헤더 설명 다 제거 · 도움말 아이콘 툴팁에 표 모양과 설명"). */}
        <div className="scr-sg-row scr-sg-head" role="row">
          <span className="scr-sg-c scr-sg-who scr-sg-h2">유저</span>
          <span className="scr-sg-c scr-sg-h2 scr-sg-hnarrow"><SortHead {...toggle("dmg")}>데미지</SortHead></span>
          <span className="scr-sg-c scr-sg-h2 scr-sg-hnarrow"><SortHead {...toggle("apm")}>APM</SortHead></span>
          <span className="scr-sg-c scr-sg-hgroup scr-sg-hgroup4">전적</span>
          <span className="scr-sg-c scr-sg-hsub scr-sg-race-head"><SortHead {...cycle("rate", "plays")}>전체</SortHead></span>
          {RACES.map((r) => <span key={r} className="scr-sg-c scr-sg-hsub scr-sg-race-head"><SortHead {...cycle(`${r}:rate`, `${r}:plays`)}>{r}</SortHead></span>)}
        </div>
        {clanRow && <MobileRow row={clanRow} clan games={clanGames} />}
        {rows.map((r) => <MobileRow key={r.member.id} row={r} />)}
      </div>
      {popEl}
      </TrendCtx.Provider>
    );
  }
  return (
    <TrendCtx.Provider value={ctx}>
    <div className="scr-sg" role="table" aria-label="통계">
      {/* 머리는 두 줄 — 종족 이름이 [게임수 | 승률] 두 칸을 덮고(PC 머리 "경기"·"전적" → "게임수" · 2026-10-22), 나머지 머리는 두 줄을 내리 쓴다(2026-10-20). 색 네모는 걷었다. */}
      <div className="scr-sg-row scr-sg-head" role="row">
        <span className="scr-sg-c scr-sg-h2 scr-sg-who">유저</span>
        {([["게임수", "plays"], ["승률", "rate"], ["데미지", "dmg"], ["APM", "apm"]] as const).map(([h, k]) => (
          <span key={h} className="scr-sg-c scr-sg-h2"><SortHead {...pcToggle(k)}>{h}</SortHead></span>
        ))}
        {RACES.map((r) => <span key={r} className="scr-sg-c scr-sg-hgroup">{r}</span>)}
        {RACES.map((r) => (
          <Fragment key={r}>
            <span className="scr-sg-c scr-sg-hsub"><SortHead {...pcToggle(`${r}:plays`)}>게임수</SortHead></span>
            <span className="scr-sg-c scr-sg-hsub"><SortHead {...pcToggle(`${r}:rate`)}>승률</SortHead></span>
          </Fragment>
        ))}
      </div>
      {clanRow && <PcRow row={clanRow} clan games={clanGames} />}
      {rows.map((r) => <PcRow key={r.member.id} row={r} />)}
    </div>
    {popEl}
    </TrendCtx.Provider>
  );
}

/** 종족구성별 전적 — 위 표와 같은 꼴(머리 줄 · 칸 선 · 2026-10-20, 요청: "종족구성별 전적 부분도 예쁘게 테마에 맞춰"). */
export function CompGrid({ rows }: { rows: { label: string; plays: number; winRate: number }[] }) {
  return (
    <section className="scr-sg-comp-wrap" aria-label="종족구성별 전적">
      <h3 className="scr-sg-title">종족구성별 전적</h3>
      {rows.length === 0 ? <p className="scr-clan-panel-empty">기록이 없어요</p> : (
        <div className="scr-sg scr-sg-comp" role="table">
          <div className="scr-sg-row scr-sg-head" role="row">
            <span className="scr-sg-c scr-sg-who">종족 구성</span>
            <span className="scr-sg-c">경기</span>
            <span className="scr-sg-c">승률</span>
          </div>
          {rows.map((c) => (
            <div key={c.label} className="scr-sg-row">
              <span className="scr-sg-c scr-sg-who"><span className="scr-sg-comp-label">{c.label}</span></span>
              <span className="scr-sg-c"><Num v={c.plays.toLocaleString()} unit="판" /></span>
              <span className="scr-sg-c scr-sg-comp-rate">
                <Num v={c.winRate} unit="%" />
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
