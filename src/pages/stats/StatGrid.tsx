import { Fragment, createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowDownWideNarrow, ArrowUpDown } from "lucide-react";
import { StatTrendPop, statMetric, type StatMetric, type StatTrendData, type TrendAnchor, type TrendFact } from "./StatTrend";
import Avatar from "../../components/common/Avatar";
import PhotoViewer from "../../components/common/PhotoViewer";
import InfoTip from "../../components/common/InfoTip";
import { useAppStore } from "../../store/appStore";
import { cx } from "../../utils/format";
import type { BaseRace, Member, MemberStats, TierEntry } from "../../types";

/* ★★ 통계 = **표**(2026-10-20, 요청: "통계 PC 도 그리드로 · 클랜원 전체가 맨 위 로우 · 그 아래 개인별 한 로우씩" → 시안 A(한 줄 표)에
   C 의 승률 막대를 얹어(요청: "A에 C의 그래프를 시각적으로 도입")).
   PC: [유저 | 게임수 | 승률 | 데미지 | APM | 테란·프로토스·저그 (게임수 | 승률)] · 폰: [유저 | 데미지 | APM | 전적: 전체·종족 판수(승률)].
   ★ 펼침(PC ▾ · 폰 줄 누름 → 분당 곡선 두 판 · 2026-10-20)은 걷었다(2026-10-22, 요청: "통계 그래프 제거 — 화면과 API 응답에서만"). 승률 막대(시안 C)도 걷었다. */

const RACES: BaseRace[] = ["테란", "프로토스", "저그"];
/** 맨 윗줄 이름 — "평균"(2026-10-22, 요청: "클랜원 전체 → 클랜평균으로 바꾸자" → "클랜평균은 평균으로 변경"). */
const CLAN_LABEL = "평균";
/** 정렬 자 — 표 머리를 눌러 고른다(2026-10-22, 요청: "정렬은 머리 터치로 변경 · 헤더에 정렬 단추" → "정렬 조건을 상세히 — 전체와 종족별 플레이 수와 승률 총 8개").
 *  APM · 데미지 · 전체(rate · plays) · 종족별("테란:rate" · "테란:plays" …). */
export type StatSortKey = "tier" | "rate" | "plays" | "dmg" | "ex" | "apm" | `${BaseRace}:rate` | `${BaseRace}:plays`;
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
/** 머리 정렬 단추 — 고른 자는 머리 글자가 본문색으로 진해진다(폰 전적 머리 아래 "승률" · "게임수" 작은 글은 걷었다 · 2026-10-22, 요청: "굳이 헤더에 승률 전적 표시는 안 해도 돼").
 *  ★ PC 는 **정렬 아이콘**(2026-10-24, 요청: "통계 정렬 아이콘으로 변경하고 초기화 버튼 필요 · 피시") — 글자 옆에 표 정렬 아이콘: 안 고른 머리는 옅은 ↕(ArrowUpDown),
 *  고른 머리는 본문색 ↓(ArrowDownWideNarrow) 에 여럿이면 차례 숫자. 옛 '고른 머리를 칠하기'(.is-on 바탕색)는 걷었다.
 *  ★ 폰도 아이콘(2026-10-28, 요청: "모바일 통계에서 정렬 적용된건지 잘 안보여서 아이콘 추가 · 헤더 글자 크기 줄여야 할 수도") — 같은 아이콘을 작게(10px) 글자 뒤에. */
function SortHead({ on, order, onClick, children, ic = 13 }: { on: boolean; order?: number; onClick: () => void; children: React.ReactNode; ic?: number }) {
  return (
    <button type="button" className={cx("scr-sg-sort", on && "is-on")} aria-pressed={on} onClick={onClick}>
      {children}
      {order !== undefined && (
        <span className="scr-sg-sort-ic" aria-hidden>
          {on ? <ArrowDownWideNarrow size={ic} /> : <ArrowUpDown size={ic} />}
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
  /** 팀전 티어(팀전 조회에서만 · 아래 TierCell). */
  tier?: TierEntry | null;
}

/* ★ 팀전 티어 칸(2026-10-27, 요청: "통계에 검색한 조건이 팀전 종류인 경우 팀전 티어 · 컬럼은 유저 옆 · 모바일 유저칸 너비 줄이고") — 셈은 서버(sg-api tier.py · 2026-10-28 처음부터 다시):
   **몇 인분** = 그 기간 EAPM ÷ 120 × 교환비 보정(종족 차이 뺌) × 승패 보정(그 기간 판으로 · 같은 편 · 상대 편으로 예상한 결과와 다를 때 움직인다 · 편의 힘은 센 사람에게
   무게를 더 준 q 제곱 평균 · 기간 뒤 판은 안 써서 지난 달 티어가 고정).
   1.6(2026-10-28 · 옛 1.5) / 1.00 / 0.80 인분 기준선에 바로 댄다(절대 기준 · 빈 등급 있음). 1 이 가장 높다.
   칸은 숫자 배지 하나 · 얹거나 누르면 달별 티어 변화 그래프. 머리로 정렬하면 인분 내림차순. 판이 열 미만이면 "-". */
function TierCell({ t, member }: { t?: TierEntry | null; member?: Member }) {
  /* 근거 말풍선 → 달별 변화 그래프(2026-10-28, 요청: "티어 팝업을 다른 항목처럼 변화 그래프 팝업으로") — 다른 칸과 같은 손잡이(TCell). 칸은 배지 그대로. */
  const metric = statMetric("tier");
  if (!t) return <TCell member={member} metric={metric} className="scr-sg-tier-c"><Dash /></TCell>;
  const facts = tierFacts(t);
  if (t.tier === null) return <TCell member={member} metric={metric} facts={facts} className="scr-sg-tier-c"><Dash /></TCell>;
  return (
    <TCell member={member} metric={metric} facts={facts} className="scr-sg-tier-c">
      <b className={cx("scr-sg-tier", `is-t${Math.min(t.tier, 4)}`)}>{t.tier}</b>
    </TCell>
  );
}

/* ★ 티어 근거값(2026-10-28, 요청: "티어 팝업에 그래프 위에 현재 보는 티어의 근거값 두 개 표시 — eapm 과 상대승률" · 교환비를 넣으며 셋) — 인분 = EAPM ÷ 120 ×
   교환비 보정 × 승패 보정 이라 그 셋: 이 기간 평균 EAPM · 교환비 보정(싸움에서 남기고 밑진 정도 · 센 상대 몫 뺌 · %) · 승패 보정(같은 편·상대 편으로 예상한 것보다
   더/덜 이긴 정도 · 그 기간 판으로 · %). 인분은 안 쓴다(같은 날 요청: "팝업에 인분 표시 안 하고"). */
const pctOf = (x: number): string => { const p = Math.round((x - 1) * 100); return p > 0 ? `+${p}%` : p < 0 ? `−${-p}%` : "±0%"; };
function tierFacts(t: TierEntry): TrendFact[] {
  const out: TrendFact[] = [];
  if (typeof t.eapm === "number") out.push({ label: "EAPM", value: String(Math.round(t.eapm)) });
  if (typeof t.cbt === "number") out.push({ label: "교환비 보정", value: pctOf(t.cbt) });
  if (typeof t.adj === "number") out.push({ label: "승패 보정", value: pctOf(t.adj) });
  return out;
}

const Dash = () => <span className="scr-sg-dim">-</span>;

/* ★ 값 칸의 변화 그래프 손잡이(2026-10-24, 요청: "통계 컬럼 피시는 호버 폰은 클릭시 → 5개월간의 변화 그래프로" · StatTrend.tsx) — 표가 문맥으로 내려 주고
   TCell 이 칸마다 단다: PC 는 마우스를 얹으면(enter · 떠나면 잠깐 뒤 닫힘 — 팝오버로 건너갈 틈) · 폰은 누르면(tap · 다시 누르거나 밖을 누르면 닫힘). 자료(trend)가
   없으면(아직 안 옴 · 평균 줄) 손잡이가 없는 보통 칸이다. */
interface TrendCtxValue {
  mobile: boolean;
  activeKey: string | null;
  enter: (member: Member, metric: StatMetric, el: HTMLElement, facts?: TrendFact[]) => void;
  tap: (member: Member, metric: StatMetric, el: HTMLElement, facts?: TrendFact[]) => void;
  leave: () => void;
}
const TrendCtx = createContext<TrendCtxValue | null>(null);
const trendKey = (m: Member, k: StatMetric) => `${m.id}|${k.key}`;

function TCell({ member, metric, facts, className, children }: { member?: Member; metric: StatMetric; facts?: TrendFact[]; className?: string; children: ReactNode }) {
  const ctx = useContext(TrendCtx);
  if (!ctx || !member) return <span className={cx("scr-sg-c", className)}>{children}</span>;
  const hot = ctx.activeKey === trendKey(member, metric);
  return (
    <span
      className={cx("scr-sg-c scr-sg-tcell", className, hot && "is-hot")}
      onPointerEnter={ctx.mobile ? undefined : (e) => { if (e.pointerType === "mouse") ctx.enter(member, metric, e.currentTarget, facts); }}
      onPointerLeave={ctx.mobile ? undefined : ctx.leave}
      onClick={ctx.mobile ? (e) => ctx.tap(member, metric, e.currentTarget, facts) : undefined}
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

/** 교환비 칸(PC · 2026-10-28, 요청: "통계에 교환비 컬럼을 추가") — 1 보다 크면 초록 · 작으면 빨강. 어느 조회든 **보정 교환비**(같은 날, 요청: "그리드 교환비
 *  표시가 보정 전이라 헷갈림 — 라벨을 보정교환비로 바꾸고 보정값 표시" → 지적: "전체 탭에서만 보정교환비고 나머지는 교환비") — 준 ÷ 입은 데미지에서 종족 몫 ·
 *  센 상대에게 밑진 몫을 뺀 값(sg-api tier.ex · 그 조회의 판 · 모형은 맵 탭과 상관없이 그 규모의 전체 맵 판으로 맞춘다). */
function Ex({ t }: { t?: TierEntry | null }) {
  const x = typeof t?.ex === "number" ? t.ex : null;
  if (x === null) return <Dash />;
  return <span className="scr-sg-dmg" title="보정 교환비 — 준 ÷ 입은 데미지에서 종족 차이 · 센 상대에게 밑진 몫을 뺀 값(1.00 = 보통 · 티어가 쓰는 값)"><b className={x >= 1 ? "is-dealt" : "is-taken"}>{x.toFixed(2)}</b></span>;
}

function Dmg({ s }: { s: MemberStats }) {
  const d = s.dmgDealtRel, t = s.dmgTakenRel;
  if (typeof d !== "number" || typeof t !== "number") return <Dash />;
  /* 폰 칸(옛 compact — 교환비 위 · 딜 · 피해 아래)은 걷었다(2026-10-28, 요청: "모바일 데미지 → 이름 바꾸고 교환비만" — 폰은 Ex 칸 · 딜 · 피해는 팝업). */
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

function PcRow({ row, clan, games, tier }: { row: StatGridRow; clan?: boolean; games?: number; tier?: boolean }) {
  const s = row.stats;
  /* ★ 평균 줄도 변화 그래프(2026-10-25, 요청: "통계의 평균행에도 상세 팝업 붙여야지") — 값이 있는 칸(게임수 = 경기 수 · APM · 종족 게임수·승률)만. 승률·데미지 칸은 "-" 라 손잡이 없음.
     평균 줄의 회원은 빈 id(StatTrend CLAN_MEMBER_ID) — 그래프가 clanByMonth 에서 줄을 찾는다. 자료(trend.clanByMonth)가 없으면 TCell 이 보통 칸. */
  const who = row.member;
  return (
      <div className={cx("scr-sg-row", clan && "is-clan")}>
        <span className="scr-sg-c scr-sg-who">
          {clan ? <span className="scr-sg-name scr-sg-name-plain">{CLAN_LABEL}</span> : <Who member={row.member} />}
        </span>
        {tier && <TierCell t={clan ? null : row.tier} member={clan ? undefined : who} />}
        <TCell member={who} metric={statMetric(clan ? "games" : "plays")}>
          {clan
            /* 평균 줄 = **경기 수만**(2026-10-22, 요청: "평균 게임수 괄호 없애고 게임수만 표시" · 옛 "1,180 (212경기)" — 사람 몫을 다 더한 전적 + 괄호 경기 수). */
            ? <Num v={(games ?? 0).toLocaleString()} />
            : <Num v={s.plays > 0 ? s.plays.toLocaleString() : null} />}
        </TCell>
        <TCell member={clan ? undefined : who} metric={statMetric("rate")}>{clan ? <Dash /> : <Rate s={s} />}</TCell>
        {/* 데미지 · APM 차례(2026-10-22, 요청: "APM 데미지 위치 교환" — 옛: APM · 데미지) */}
        <TCell member={clan ? undefined : who} metric={statMetric("dmg")}>{clan ? <Dash /> : <Dmg s={s} />}</TCell>
        {/* 교환비는 데미지 바로 뒤(2026-10-28) · 평균 줄은 늘 1 근처라 "-". */}
        <TCell member={clan ? undefined : who} metric={statMetric("ex")}>{clan ? <Dash /> : <Ex t={row.tier} />}</TCell>
        <TCell member={who} metric={statMetric("apm")}><Num v={s.avgApm} /></TCell>
        {RACES.map((r) => <RaceCells key={r} s={row.byRace?.[r]} race={r} member={who} />)}
      </div>
  );
}

function MobileRow({ row, clan, games, tier }: { row: StatGridRow; clan?: boolean; games?: number; tier?: boolean }) {
  const s = row.stats;
  const who = row.member;   // 평균 줄도 변화 그래프(위 PcRow ★ · 데미지 칸만 손잡이 없음)
  return (
    <div className={cx("scr-sg-row", clan && "is-clan")}>
      <span className="scr-sg-c scr-sg-who">
        {clan ? <span className="scr-sg-name scr-sg-name-plain">{CLAN_LABEL}</span> : <WhoPlain member={row.member} />}
      </span>
      {tier && <TierCell t={clan ? null : row.tier} member={clan ? undefined : who} />}
      {/* APM · 데미지(초록 딜 위 · 빨강 피해 아래)는 제 칸(2026-10-22, 요청: "모바일도 APM · 데미지 컬럼으로 · 닉네임 최소 폭 줄여") — 옛: 닉네임 아래 한 줄 "APM 230 1.4 0.8".
          클랜원 전체는 데미지가 없다. */}
      {/* 교환비 칸(2026-10-28, 요청: "모바일 데미지 → 이름 바꾸고 교환비만 표시" → "팝업에서 딜 피해 제거") — 칸도 팝업도 교환비만(PC 교환비 칸과 같은 색 · 같은 그래프). */}
      <TCell member={clan ? undefined : who} metric={statMetric("ex")} className="scr-sg-mnum">{clan ? <Dash /> : <Ex t={row.tier} />}</TCell>
      <TCell member={who} metric={statMetric("apm")} className="scr-sg-mnum">{s.avgApm ?? <Dash />}</TCell>
      {/* ★ 전적은 게임수 · 승률 **두 칸**(2026-10-28, 요청: "좁은 폰의 경우 게임수와 승률 두 칸으로 나눠서 표시 · 팝업도" → "넓은 폰도 게임수 승률 나누기") — 팝업도
          칸마다(PC 게임수 · 승률 칸과 같은 그래프). 평균 줄은 게임수 = 경기 수 · 승률은 "-"(PC 평균 줄과 같게). 넓은 폰(600px 넘게)은 종족마다 [게임수 | 승률]도
          (PC RaceCells 와 같게 · scr-sg-mwide) — 좁은 폰은 종족 칸이 숨는다(CSS). 옛: 한 칸에 위 판수 · 아래 승률(MCell). */}
      <TCell member={who} metric={statMetric(clan ? "games" : "plays")} className="scr-sg-mnum">
        {clan ? (games ?? 0).toLocaleString() : s.plays > 0 ? s.plays.toLocaleString() : <Dash />}
      </TCell>
      <TCell member={clan ? undefined : who} metric={statMetric("rate")} className="scr-sg-mnum">
        {clan || s.plays === 0 ? <Dash /> : `${s.winRate}%`}
      </TCell>
      {RACES.map((r) => {
        const rs = row.byRace?.[r];
        if (!rs || rs.plays === 0) return <Fragment key={r}><span className="scr-sg-c scr-sg-mnum scr-sg-mwide"><Dash /></span><span className="scr-sg-c scr-sg-mnum scr-sg-mwide"><Dash /></span></Fragment>;
        return (
          <Fragment key={r}>
            <TCell member={who} metric={statMetric("plays", r)} className="scr-sg-mnum scr-sg-mwide">{rs.plays.toLocaleString()}</TCell>
            <TCell member={who} metric={statMetric("rate", r)} className="scr-sg-mnum scr-sg-mwide">{`${rs.winRate}%`}</TCell>
          </Fragment>
        );
      })}
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
            <span className="scr-sg-help-h">유저</span><span className="scr-sg-help-h">보정교환비</span><span className="scr-sg-help-h">APM</span><span className="scr-sg-help-h">전체</span>
            <span className="scr-sg-help-who"><b>닉네임</b></span>
            <span className="scr-sg-help-rec"><b>1.25</b></span>
            <span className="scr-sg-help-rec"><b>230</b></span>
            <span className="scr-sg-help-rec"><b>68</b><i>54%</i></span>
          </span>
          <span className="scr-sg-help-list">
            <span>보정교환비 — <b>1.25</b> 준 ÷ 입은 데미지에서 종족 차이 · 센 상대에게 밑진 몫을 뺀 값(1보다 크면 주고받기에서 이김 · 티어가 쓰는 값) · 누르면 변화</span>
            <span>APM — 분당 행동 수 평균</span>
            <span>티어(팀전) — 이 사람이 보통 몇 인분을 하나로 매기는 1~4 등급 · 인분 = EAPM ÷ 120 × 교환비 보정(센 상대에게 밑진 몫은 덜 깎고 · 종족 차이는 빼고) × 승패 보정(같은 편·상대 편으로 예상한 것보다 더/덜 이긴 만큼 · 그 기간 판으로) · 편의 힘은 센 사람에게 무게를 더 줘서 1티어 한 명이 크게 쳐요 · 1.6인분 이상 1티어 · 1.00 이상 2티어 · 0.80 이상 3티어 · 그 아래 4티어(절대 기준이라 빈 등급도 있어요) · 팀전 전체 · 맵 전체 조회에서만 보여요 · 그 기간 판만 써서 지난 달 티어는 뒤 판에 안 바뀌어요 · 얹거나 누르면 달별 변화와 근거값 · 열 판 미만은 -</span>
            <span><b>68</b> 게임수 · <i>54%</i> 승률 — 전체(넓은 화면은 종족별 게임수 · 승률도)</span>
            <span>머리를 누르면 그 기준으로 정렬 — 전체 · 종족 머리는 승률 → 게임수 → 끔. 정렬 줄의 '복수 기준'을 켜면 누른 차례대로 여러 기준이 쌓여요</span>
            <span>값을 누르면 다섯 달 변화 그래프(여러 달 조회는 그 기간 · 전체 기간은 최근 다섯 달)</span>
          </span>
        </>
      ) : (
        <span className="scr-sg-help-list">
          <span>데미지 — 준 데미지(<b className="is-dealt">딜</b>) · 받은 데미지(<b className="is-taken">피해</b>)가 그 경기 참가자 평균의 몇 배인가(1.0배 = 평균)</span>
          <span>보정교환비 — 준 데미지 ÷ 입은 데미지에서 종족 차이 · 센 상대에게 밑진 몫을 뺀 값(1.00 보다 크면 주고받기에서 이김 · 티어가 쓰는 값)</span>
          <span>APM — 분당 행동 수 평균</span>
          <span>티어 — 이 사람이 보통 몇 인분을 하나로 매기는 1~4 등급 · 인분 = EAPM ÷ 120 × 교환비 보정(센 상대에게 밑진 몫은 덜 깎고 · 종족 차이는 빼고) × 승패 보정(같은 편·상대 편으로 예상한 것보다 더/덜 이긴 만큼 · 그 기간 판으로) · 편의 힘은 센 사람에게 무게를 더 줘서 1티어 한 명이 크게 쳐요 · 1.6인분 이상 1티어 · 1.00 이상 2티어 · 0.80 이상 3티어 · 그 아래 4티어(절대 기준이라 빈 등급도 있어요) · 팀전 전체 · 맵 전체 조회에서만 보여요 · 그 기간 판만 써서 지난 달 티어는 뒤 판에 안 바뀌어요 · 얹거나 누르면 달별 변화와 근거값 · 열 판 미만은 -</span>
          <span>종족 칸 — 그 종족으로 뛴 게임수 · 승률</span>
          <span>머리(게임수 · 승률 · 데미지 · 보정교환비 · APM · 종족별 게임수 · 승률)를 누르면 그 기준으로 정렬 — 정렬 줄의 '복수 기준'을 켜면 누른 차례대로 여러 기준이 쌓여요</span>
          <span>값에 마우스를 얹으면 다섯 달 변화 그래프(여러 달 조회는 그 기간 · 전체 기간은 최근 다섯 달)</span>
        </span>
      )}
    />
  );
}

export default function StatGrid({ clan, clanGames, rows, mobile, sortKeys, onSortKeys, multi, trend, tier = false }: SortProps & {
  /** 클랜원 전체(맨 위 줄) — 없으면 안 선다. */
  clan: { stats: MemberStats; byRace?: Partial<Record<BaseRace, MemberStats>> } | null;
  clanGames: number;
  rows: StatGridRow[];
  mobile: boolean;
  /** 다섯 달 변화 자료(StatTrend) — 없으면 칸에 손잡이가 없다. */
  trend: StatTrendData | null;
  /** 팀전 티어 칸(유저 옆 · 팀전 조회에서만 — 위 TierCell ★). */
  tier?: boolean;
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
    enter: (member, metric, el, facts) => { popCancel(); setPop((cur) => (cur && trendKey(cur.member, cur.metric) === trendKey(member, metric) ? cur : { member, metric, rect: rectOf(el), facts })); },
    tap: (member, metric, el, facts) => { setPop((cur) => (cur && trendKey(cur.member, cur.metric) === trendKey(member, metric) ? null : { member, metric, rect: rectOf(el), facts })); },
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
  /** 폰 단일 머리(티어 · 데미지 · APM) — 아이콘 10px. */
  const mToggle = (k: StatSortKey) => ({ ...pcToggle(k), ic: 10 });
  const clanRow: StatGridRow | null = clan ? { member: { id: "", nickname: CLAN_LABEL } as Member, stats: clan.stats, byRace: clan.byRace } : null;
  if (mobile) {
    return (
      <TrendCtx.Provider value={ctx}>
      <div className={cx("scr-sg is-m", tier && "has-tier")} role="table" aria-label="통계">
        {/* 머리 두 줄 — 유저 칸은 두 줄을 내리 쓰고 · 전적은 전체·종족 넷을 덮는다. 뜻 풀이는 정렬 줄의 도움말 단추(StatHelp)로 옮겼다(2026-10-22, 요청: "헤더 설명 다 제거 · 도움말 아이콘 툴팁에 표 모양과 설명"). */}
        <div className="scr-sg-row scr-sg-head" role="row">
          <span className="scr-sg-c scr-sg-who scr-sg-h2">유저</span>
          {tier && <span className="scr-sg-c scr-sg-h2 scr-sg-hnarrow"><SortHead {...mToggle("tier")}>티어</SortHead></span>}
          {/* 교환비 칸(MobileRow ★) — 머리도 "교환비" · 교환비로 정렬(2026-10-28 · 옛: "데미지" · 교환비 → 데미지 → 끔). */}
          <span className="scr-sg-c scr-sg-h2 scr-sg-hnarrow"><SortHead {...mToggle("ex")}><span>보정<br />교환비</span></SortHead></span>
          <span className="scr-sg-c scr-sg-h2 scr-sg-hnarrow"><SortHead {...mToggle("apm")}>APM</SortHead></span>
          {/* 게임수 · 승률 두 머리(MobileRow ★) · 넓은 폰은 종족 이름이 [게임수 | 승률] 두 칸을 덮는다(PC 머리와 같게 · 좁은 폰은 숨음). */}
          <span className="scr-sg-c scr-sg-h2 scr-sg-hnarrow"><SortHead {...mToggle("plays")}>게임수</SortHead></span>
          <span className="scr-sg-c scr-sg-h2 scr-sg-hnarrow"><SortHead {...mToggle("rate")}>승률</SortHead></span>
          {RACES.map((r) => <span key={r} className="scr-sg-c scr-sg-hgroup scr-sg-mwide">{r}</span>)}
          {RACES.map((r) => (
            <Fragment key={r}>
              <span className="scr-sg-c scr-sg-hsub scr-sg-race-head scr-sg-mwide"><SortHead {...mToggle(`${r}:plays`)}>게임수</SortHead></span>
              <span className="scr-sg-c scr-sg-hsub scr-sg-race-head scr-sg-mwide"><SortHead {...mToggle(`${r}:rate`)}>승률</SortHead></span>
            </Fragment>
          ))}
        </div>
        {clanRow && <MobileRow row={clanRow} clan games={clanGames} tier={tier} />}
        {rows.map((r) => <MobileRow key={r.member.id} row={r} tier={tier} />)}
      </div>
      {popEl}
      </TrendCtx.Provider>
    );
  }
  return (
    <TrendCtx.Provider value={ctx}>
    <div className={cx("scr-sg", tier && "has-tier")} role="table" aria-label="통계">
      {/* 머리는 두 줄 — 종족 이름이 [게임수 | 승률] 두 칸을 덮고(PC 머리 "경기"·"전적" → "게임수" · 2026-10-22), 나머지 머리는 두 줄을 내리 쓴다(2026-10-20). 색 네모는 걷었다. */}
      <div className="scr-sg-row scr-sg-head" role="row">
        <span className="scr-sg-c scr-sg-h2 scr-sg-who">유저</span>
        {tier && <span className="scr-sg-c scr-sg-h2"><SortHead {...pcToggle("tier")}>티어</SortHead></span>}
        {([["게임수", "plays"], ["승률", "rate"], ["데미지", "dmg"], ["보정교환비", "ex"], ["APM", "apm"]] as const).map(([h, k]) => (
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
      {clanRow && <PcRow row={clanRow} clan games={clanGames} tier={tier} />}
      {rows.map((r) => <PcRow key={r.member.id} row={r} tier={tier} />)}
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
