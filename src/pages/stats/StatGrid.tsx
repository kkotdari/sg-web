import { Fragment, createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { StatTrendPop, combinedTier, exOf, statMetric, type StatMetric, type StatRace, type StatTrendData, type TrendAnchor, type TrendFact } from "./StatTrend";
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
/** 종족 자 — PC 는 종족마다 다섯(게임수 · 승률 · 교환비 · APM · EAPM · 2026-11-03) · 폰은 게임수 · 승률. */
/** "주종족:…"(2026-11-04) — 그 사람 주종족 판을 합친 줄(MemberStatsEntry.main). */
export type StatSortKey = "tier" | "rate" | "plays" | "exr" | "apm" | "eapm" | `${StatRace}:${"tier" | "rate" | "plays" | "exr" | "apm" | "eapm"}`;
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
          {/* 위아래 삼각형(2026-11-05, 요청: "정렬 아이콘을 단순하게 위아래 삼각형으로 · 미선택 시 위아래 둘 다 연하게") — 정렬은 늘 큰 값부터라 고르면 아래 삼각형만 진하다. */}
          <svg className="scr-sg-sort-tri" width={Math.round(ic * 0.62)} height={ic} viewBox="0 0 8 13">
            <path d="M4 0.5 L7.5 5 L0.5 5 Z" className="is-up" />
            <path d="M4 12.5 L7.5 8 L0.5 8 Z" className={cx("is-dn", on && "is-act")} />
          </svg>
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
  /** 주종족 판을 합친 줄 · 주종족(2026-11-04 · sg-api main · mainRaces). */
  main?: MemberStats | null;
  mainRaces?: BaseRace[] | null;
  /** 종족별 티어(2026-11-04 · 표의 티어 칸은 이것만 · sg-api tierByRace). */
  tierByRace?: Record<string, TierEntry> | null;
}

/* ★ 팀전 티어 칸(2026-10-27, 요청: "통계에 검색한 조건이 팀전 종류인 경우 팀전 티어 · 컬럼은 유저 옆 · 모바일 유저칸 너비 줄이고") — 셈은 서버(sg-api tier.py · 2026-10-28 처음부터 다시):
   **몇 인분** = 그 기간 EAPM ÷ 120 × 교환비 보정(종족 차이 뺌) × 승패 보정(그 기간 판으로 · 같은 편 · 상대 편으로 예상한 결과와 다를 때 움직인다 · 편의 힘은 센 사람에게
   무게를 더 준 q 제곱 평균 · 기간 뒤 판은 안 써서 지난 달 티어가 고정).
   1.6(2026-10-28 · 옛 1.5) / 1.00 / 0.80 인분 기준선에 바로 댄다(절대 기준 · 빈 등급 있음). 1 이 가장 높다.
   칸은 숫자 배지 하나 · 얹거나 누르면 달별 티어 변화 그래프. 머리로 정렬하면 인분 내림차순. 판이 열 미만이면 "-". */
function TierCell({ t, member, race, className, more }: { t?: TierEntry | null; member?: Member; race?: BaseRace; className?: string; more?: TrendFact[] }) {
  /* 근거 말풍선 → 달별 변화 그래프(2026-10-28, 요청: "티어 팝업을 다른 항목처럼 변화 그래프 팝업으로") — 다른 칸과 같은 손잡이(TCell). 칸은 배지 그대로.
     종족 티어(2026-11-04 · race) — 그 종족 판으로 잰 티어(tierByRace)와 그 달별 변화. */
  const metric = statMetric("tier", race ?? null);
  const cl = cx("scr-sg-tier-c", className);
  if (!t) return <TCell member={member} metric={metric} facts={more} className={cl}><Dash /></TCell>;
  /* 그 종족의 게임수 · 승률 · 교환비 · APM · EAPM 을 앞에(같은 날 "좁은 폰 — 터치 시 판수 · 교환비 · 승률 · APM 등등 나오고") — 좁은 폰은 이 칸 하나뿐이라. */
  const facts = [...(more ?? []), ...tierFacts(t).filter((f) => f.label !== "EAPM" || !more?.some((x) => x.label === "EAPM"))];
  if (t.tier === null) return <TCell member={member} metric={metric} facts={facts} className={cl}><Dash /></TCell>;
  return (
    <TCell member={member} metric={metric} facts={facts} className={cl}>
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


/** 교환비 칸(날 값 · 2026-10-29, 요청: "PC 데미지 컬럼 제거하고 교환비 추가 — 팝업엔 교환비, 딜+피해 그래프 2개") — 준 ÷ 입은 데미지(보정 전).
 *  옛 데미지 칸(초록 딜 / 빨강 피해 · 평균 대비 배수)은 걷었다 — 딜 · 피해는 이 칸의 팝업 둘째 그래프. */
function ExRaw({ s }: { s: MemberStats }) {
  const x = exOf(s);
  if (x === null) return <Dash />;
  return <span className="scr-sg-dmg" title="준 데미지 ÷ 입은 데미지(1.00 = 주고받은 양이 같음 · 보정 전)"><b>{x.toFixed(2)}</b></span>;
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

/* ★★ 종족별 티어 표(2026-11-04, 요청: "종족별 티어로 변경 · 전체 티어는 이제 없음 · 통계에도 전체 칸 자체를 지우고 주종족 칸도 지움") — 묶음은 테란 · 프로토스 · 저그 셋뿐이고
   묶음마다 [티어 | 게임수 | 승률 | 교환비 | APM | EAPM](티어는 팀전 · 맵 전체 조회에서만 · sg-api tierByRace — 그 종족으로 한 판만으로 잰 인분). 옛 [전체 · 주종족] 묶음 ·
   보기 모드 라디오 · 유저 옆 전체 티어 칸은 걷었다. 폰: 넓은 폰은 PC 와 같은 칸 · 좁은 폰은 종족마다 [티어 | 게임수](티어 칸이 없는 조회는 [게임수 | 승률]).
   평균 줄: 티어는 "-" · 나머지는 그 종족으로 뛴 클랜원 판. */
/** 종족 판 근거값(티어 칸 팝업 · 위 TierCell more) — 게임수 · 승률 · 교환비 · APM · EAPM. */
function raceFacts(s: MemberStats): TrendFact[] {
  const out: TrendFact[] = [{ label: "게임수", value: s.plays.toLocaleString() }, { label: "승률", value: `${s.winRate}%` }];
  const x = exOf(s);
  if (x !== null) out.push({ label: "교환비", value: x.toFixed(2) });
  if (typeof s.avgApm === "number") out.push({ label: "APM", value: String(s.avgApm) });
  if (typeof s.avgEapm === "number") out.push({ label: "EAPM", value: String(s.avgEapm) });
  return out;
}
/** 종족 묶음 칸 — PC 는 다 · 폰은 넓을 때(scr-sg-mwide)와 좁을 때를 CSS 가 고른다(mobile). */
/** 묶음 칸 — race 가 null 이면 종합 묶음(전체 판 · 종합 티어 = 종족 티어 가중 평균 · 2026-11-04). */
function RaceCells({ s, t, race, member, clan, tier, mobile, main }: { s?: MemberStats | null; t?: TierEntry | null; race: BaseRace | null; member?: Member; clan?: boolean; tier?: boolean; mobile?: boolean; main?: boolean }) {
  const has = !!s && s.plays > 0;
  /* 주종족 묶음은 늘 옅은 배경(같은 날 "주종족에 배경 포인트 깔기 · 호버랑 무관하게" · sg-api mainRaces = 그 조회 판의 30% 이상 종족). */
  const mc = main ? "is-main" : "";
  const m = cx(mobile && "scr-sg-mnum", mc);
  const wide = cx(mobile && "scr-sg-mnum scr-sg-mwide", mc);
  return (
    <>
      {tier && <TierCell t={clan ? null : t} member={clan ? undefined : member} race={race ?? undefined} className={cx("scr-sg-gstart", m)} more={has ? raceFacts(s!) : undefined} />}
      <TCell member={member} metric={statMetric("plays", race)} className={cx(!tier && "scr-sg-gstart", tier ? wide : m)}><Num v={has ? s!.plays.toLocaleString() : null} /></TCell>
      <TCell member={member} metric={statMetric("rate", race)} className={wide}>{!has ? <Dash /> : <Rate s={s!} />}</TCell>
      <TCell member={member} metric={statMetric("exr", race)} className={wide}>{!has ? <Dash /> : <ExRaw s={s!} />}</TCell>
      <TCell member={member} metric={statMetric("apm", race)} className={wide}><Num v={has ? s!.avgApm : null} /></TCell>
      <TCell member={member} metric={statMetric("eapm", race)} className={wide}><Num v={has ? s!.avgEapm : null} /></TCell>
    </>
  );
}

function PcRow({ row, clan, tier, mobile, races }: { row: StatGridRow; clan?: boolean; tier?: boolean; mobile?: boolean; races: readonly BaseRace[] }) {
  /* 평균 줄도 변화 그래프(2026-10-25, 요청: "통계의 평균행에도 상세 팝업 붙여야지") — 평균 줄의 회원은 빈 id(StatTrend CLAN_MEMBER_ID). */
  const who = row.member;
  return (
      <div className={cx("scr-sg-row", clan && "is-clan")}>
        <span className="scr-sg-c scr-sg-who">
          {clan ? <span className="scr-sg-name scr-sg-name-plain">{CLAN_LABEL}</span> : mobile ? <WhoPlain member={row.member} /> : <Who member={row.member} />}
        </span>
        {/* 좁은 폰만 전체 게임수(같은 날 "좁은 폰은 전체 게임수 · 종족별 티어") — 넓은 폰 · PC 는 종족 칸이 게임수를 든다.
            평균 줄도 참여 합(2026-11-05, 요청: "폰도 전체 참여한 사람 수의 합으로 · 대신 명수 옆에 몇 게임인지" — 옛: 경기 수 · 경기 수는 ClanStatsScreen 명수 옆). */}
        {/* 티어 없는 조회는 종합 묶음 첫 칸이 게임수라 이 칸을 안 세운다. */}
        {mobile && tier && (
          <TCell member={who} metric={statMetric("plays")} className="scr-sg-mnum scr-sg-mnarrow">
            <Num v={row.stats.plays > 0 ? row.stats.plays.toLocaleString() : null} />
          </TCell>
        )}
        {/* 종합(2026-11-04, 요청: "통계에 기본은 종합(전체 종족 평균)") — 전체 판 · 종합 티어(평균 줄은 티어 없음). */}
        <RaceCells s={row.stats} t={clan ? null : combinedTier(row.tierByRace)} race={null} member={who} clan={clan} tier={tier} mobile={mobile} />
        {races.map((r) => <RaceCells key={r} s={row.byRace?.[r]} t={row.tierByRace?.[r]} race={r} member={who} clan={clan} tier={tier} mobile={mobile} main={!clan && !!row.mainRaces?.includes(r)} />)}
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
            <span className="scr-sg-help-h">유저</span><span className="scr-sg-help-h">게임수</span><span className="scr-sg-help-h">테란</span><span className="scr-sg-help-h">저그</span>
            <span className="scr-sg-help-who"><b>닉네임</b></span>
            <span className="scr-sg-help-rec"><b>68</b></span>
            <span className="scr-sg-help-rec"><b>2</b></span>
            <span className="scr-sg-help-rec"><b>3</b></span>
          </span>
          <span className="scr-sg-help-list">
            <span><b>68</b> 게임수 — 전체 판 · 종족 칸은 그 종족 티어(그 종족으로 한 판만으로 잼 · 열 판 미만은 -) · 누르면 그 종족의 게임수 · 승률 · 교환비 · APM · EAPM 과 달별 티어</span>
            <span>티어(팀전) — 이 사람이 보통 몇 인분을 하나로 매기는 1~4 등급 · 인분 = EAPM ÷ 120 × 교환비 보정(센 상대에게 밑진 몫은 덜 깎고 · 종족 차이는 빼고) × 승패 보정(같은 편·상대 편으로 예상한 것보다 더/덜 이긴 만큼 · 그 기간 판으로) · 편의 힘은 센 사람에게 무게를 더 줘서 1티어 한 명이 크게 쳐요 · 1.6인분 이상 1티어 · 1.00 이상 2티어 · 0.80 이상 3티어 · 그 아래 4티어(절대 기준이라 빈 등급도 있어요) · 팀전 전체 · 맵 전체 조회에서만 보여요 · 그 기간 판만 써서 지난 달 티어는 뒤 판에 안 바뀌어요 · 얹거나 누르면 달별 변화와 근거값 · 열 판 미만은 -</span>
            <span>옅은 배경 — 주종족(그 기간 판의 30% 이상을 한 종족 · 여러 개일 수 있어요)</span>
            <span>넓은 화면(가로 · 태블릿)은 PC 와 같은 칸 — 종족마다 티어 · 게임수 · 승률 · 교환비 · APM · EAPM</span>
            <span>머리를 누르면 그 기준으로 정렬 — 전체 · 종족 머리는 승률 → 게임수 → 끔. 정렬 줄의 '복수 기준'을 켜면 누른 차례대로 여러 기준이 쌓여요</span>
            <span>값을 누르면 다섯 달 변화 그래프(여러 달 조회는 그 기간 · 전체 기간은 최근 다섯 달)</span>
          </span>
        </>
      ) : (
        <span className="scr-sg-help-list">
          <span>교환비 — 준 데미지 ÷ 입은 데미지(보정 전 · 1.00 보다 크면 주고받기에서 이김) · 얹으면 교환비와 <b className="is-dealt">딜</b> · <b className="is-taken">피해</b>(그 경기 참가자 평균의 몇 배) 변화</span>
          <span>APM — 분당 행동 수 평균 · EAPM — 그중 유효 행동(같은 명령 연타 · 헛클릭을 뺌)</span>
          <span>티어 — 이 사람이 보통 몇 인분을 하나로 매기는 1~4 등급 · 인분 = EAPM ÷ 120 × 교환비 보정(센 상대에게 밑진 몫은 덜 깎고 · 종족 차이는 빼고) × 승패 보정(같은 편·상대 편으로 예상한 것보다 더/덜 이긴 만큼 · 그 기간 판으로) · 편의 힘은 센 사람에게 무게를 더 줘서 1티어 한 명이 크게 쳐요 · 1.6인분 이상 1티어 · 1.00 이상 2티어 · 0.80 이상 3티어 · 그 아래 4티어(절대 기준이라 빈 등급도 있어요) · 팀전 전체 · 맵 전체 조회에서만 보여요 · 그 기간 판만 써서 지난 달 티어는 뒤 판에 안 바뀌어요 · 얹거나 누르면 달별 변화와 근거값 · 열 판 미만은 -</span>
          <span>종족마다 같은 여섯 칸(티어 · 게임수 · 승률 · 교환비 · APM · EAPM) — 티어는 그 종족으로 한 판만으로 잰 등급(팀전 · 맵 전체 조회에서만)</span>
          <span>옅은 배경 — 주종족(그 기간 판의 30% 이상을 한 종족 · 여러 개일 수 있어요)</span>
          <span>머리를 누르면 그 기준으로 정렬 — 정렬 줄의 '복수 기준'을 켜면 누른 차례대로 여러 기준이 쌓여요</span>
          <span>값에 마우스를 얹으면 다섯 달 변화 그래프(여러 달 조회는 그 기간 · 전체 기간은 최근 다섯 달)</span>
        </span>
      )}
    />
  );
}

export default function StatGrid({ clan, rows, mobile, sortKeys, onSortKeys, multi, trend, tier = false, showRaces = false, onVisW }: SortProps & {
  /** 클랜원 전체(맨 위 줄) — 없으면 안 선다. */
  clan: { stats: MemberStats; byRace?: Partial<Record<BaseRace, MemberStats>>; main?: MemberStats | null } | null;
  rows: StatGridRow[];
  mobile: boolean;
  /** 다섯 달 변화 자료(StatTrend) — 없으면 칸에 손잡이가 없다. */
  trend: StatTrendData | null;
  /** 팀전 티어 칸(유저 옆 · 팀전 조회에서만 — 위 TierCell ★). */
  tier?: boolean;
  /** 종족 묶음(테란 · 프로토스 · 저그)을 종합 뒤에 펼치나 — 기본 접힘(ClanStatsScreen 토글). */
  showRaces?: boolean;
  /** 보이는 표 폭(접혀 종합만이면 그 오른변까지 px · 펼치면 null) — 표 위 정렬 줄이 오른끝(도움말 · 종족별 단추)을 표 오른변에 맞춘다(2026-11-05). */
  onVisW?: (w: number | null) => void;
  /** 종합 머리 오른끝 펼치기/접기 단추 — 없으면 단추가 안 선다. */
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
  /* ★ 종족 묶음은 **늘 깔고**, 접힘은 종합 오른끝에서 잘라 감춘다(2026-11-04, 요청: "종족별 펼침 · 접음 여부와 관계없이 종합 컬럼 너비는 일정해야 해") —
     칸 틀이 펼친 표 그대로라 유저 · 종합 칸 너비가 한 치도 안 바뀐다. 자르는 자리는 종합 머리의 오른변(아래 clipW · 그려진 뒤 잼).
     clip-path 는 밖을 누름 · 얹음에서도 뺀다(감춘 칸이 강조 · 정렬을 안 받는다). 옛(같은 날): 접으면 종족 칸을 안 그리고 표 폭을 fr 몫으로 줄였다 —
     칸 최소 폭 · 내용 폭 때문에 종합 칸이 펼칠 때와 달랐다. */
  const races: readonly BaseRace[] = RACES;
  /** 머리 묶음 — 종합 + 종족 셋. */
  const groups: readonly (BaseRace | null)[] = [null, ...races];
  /** 묶음마다 칸 수 — [티어] 게임수 · 승률 · 교환비 · APM · EAPM(위 RaceCells ★). */
  const per = tier ? 6 : 5;
  const gridRef = useRef<HTMLDivElement>(null);
  const [clipW, setClipW] = useState<number | null>(null);
  useLayoutEffect(() => {
    const g = gridRef.current;
    if (showRaces || !g) return undefined;
    const meas = (): void => {
      const h = g.querySelector(".scr-sg-head > .scr-sg-hgroup") as HTMLElement | null;
      if (h) setClipW(Math.ceil(h.getBoundingClientRect().right - g.getBoundingClientRect().left));
    };
    meas();
    const ro = new ResizeObserver(meas);
    ro.observe(g);
    return () => ro.disconnect();
  }, [showRaces, mobile, tier]);
  const foldStyle = showRaces || clipW === null ? {} : { "--sgclip": `${clipW}px` } as React.CSSProperties;
  useEffect(() => { onVisW?.(showRaces ? null : clipW); }, [onVisW, showRaces, clipW]);
  /* ★ 열 강조(2026-11-04, 요청: "마우스 오버나 클릭 시 해당 열 전체에 포인트 효과 — 다크 흰색 톤 · 라이트 푸른 톤 · 버튼 채우기 색") — 얹은 칸(hover)이나 누른 칸(pin · 다시 누르면 끔)의
     열(줄 안 자리)을 모든 줄에서 칠한다(→ --lighting-hover-bg · 아래 <style>). 유저 · 티어 칸은 안 친다. PC 머리 줄은 그 아랫머리도 함께. */
  /* (같은 날 "열 강조가 아니라 행 강조를 말한 건데 · 둘 다 강조해도 될 듯 · 라이트의 강조색은 다른 목록 참고해서") — 칸의 **줄과 열** 둘 다 · 색은 다른 목록의 얹은 줄과 같은
     --lighting-hover-bg(다크 흰 톤 · 라이트 푸른 톤). 머리 칸을 얹으면 열만 · 유저 · 티어 칸을 얹으면 줄만. */
  type HCell = { r: number | null; c: number | null };
  const [hHover, setHHover] = useState<HCell | null>(null);
  const [hPin, setHPin] = useState<HCell | null>(null);
  const hcell = hHover ?? hPin;
  const hcol = hcell?.c ?? null;
  const hrow = hcell?.r ?? null;
  const valBase = 1;
  const cellOf = (t: EventTarget | null): HCell | null => {
    const el = (t as HTMLElement | null)?.closest?.(".scr-sg-c") as HTMLElement | null;
    const row = el?.parentElement;
    if (!el || !row || !row.classList.contains("scr-sg-row") || !row.parentElement) return null;
    const ix = Array.prototype.indexOf.call(row.children, el) as number;
    if (row.classList.contains("scr-sg-head")) {
      if (mobile || !el.classList.contains("scr-sg-hsub")) return null;
      return { r: null, c: ix - groups.length };
    }
    const r = Array.prototype.indexOf.call(row.parentElement.children, row) as number;
    return { r, c: ix >= valBase ? ix : null };
  };
  const sameCell = (a: HCell | null, b: HCell | null): boolean => !!a && !!b && a.r === b.r && a.c === b.c;
  useEffect(() => { setHPin(null); setHHover(null); }, [mobile, tier, showRaces]);
  const hcolCss = hcell === null ? null : [
    hcol === null ? "" : `.scr-sg.is-hcol > .scr-sg-row:not(.scr-sg-head) > :nth-child(${hcol + 1})${mobile ? "" : `, .scr-sg.is-hcol > .scr-sg-head > :nth-child(${hcol + groups.length + 1})`} { background: var(--lighting-hover-bg); }`,
    hrow === null ? "" : `.scr-sg.is-hcol > .scr-sg-row:nth-child(${hrow + 1}) > .scr-sg-c { background: var(--lighting-hover-bg); }`,
    hrow === null || hcol === null ? "" : `.scr-sg.is-hcol > .scr-sg-row:nth-child(${hrow + 1}) > :nth-child(${hcol + 1}) { background: linear-gradient(var(--lighting-hover-bg), var(--lighting-hover-bg)), var(--lighting-hover-bg); }`,
  ].join("\n");
  const hcolProps = {
    onPointerOver: (e: React.PointerEvent) => { if (e.pointerType === "mouse") { const c = cellOf(e.target); setHHover((p) => (sameCell(p, c) ? p : c)); } },
    onPointerLeave: () => setHHover(null),
    onClickCapture: (e: React.MouseEvent) => { const c = cellOf(e.target); if (c) setHPin((p) => (sameCell(p, c) ? null : c)); },
  };
  /** 종족 묶음 머리 두 줄 — 윗줄 종족 이름(묶음 칸 수만큼 덮음) · 아랫줄 칸 머리. 폰은 좁을 때 칸이 줄어 덮는 수가 CSS 변수(--rspan)다. */
  const SUBS: readonly (readonly ["티어" | "게임수" | "승률" | "교환비" | "APM" | "EAPM", "tier" | "plays" | "rate" | "exr" | "apm" | "eapm"])[] =
    [...(tier ? [["티어", "tier"] as const] : []), ["게임수", "plays"], ["승률", "rate"], ["교환비", "exr"], ["APM", "apm"], ["EAPM", "eapm"]];
  const head = (m: boolean) => (
    <div className="scr-sg-row scr-sg-head" role="row">
      <span className="scr-sg-c scr-sg-who scr-sg-h2">유저</span>
      {m && tier && <span className="scr-sg-c scr-sg-h2 scr-sg-hnarrow scr-sg-mnarrow"><SortHead {...mToggle("plays")}>게임수</SortHead></span>}
      {groups.map((r) => (
        <span key={r ?? "종합"} className="scr-sg-c scr-sg-hgroup scr-sg-gstart" style={{ gridColumn: m ? "span var(--rspan)" : `span ${per}` }}>
          {r ?? "종합"}
          {/* 종족별 펼치기/접기 단추는 표 밖 정렬 줄로 옮겼다(2026-11-05, 요청: "저 펴고 접는 버튼은 표 외부로 이동" · ClanStatsScreen). */}
        </span>
      ))}
      {groups.map((r) => (
        <Fragment key={r ?? "종합"}>
          {SUBS.map(([h, k], i) => {
            /* 폰: 좁을 때는 종족마다 첫 칸(티어 · 티어 없는 조회는 게임수) 만 · 넓을 때 다(RaceCells 와 같은 가름). */
            const wideOnly = m && i >= 1;
            return (
              <span key={k} className={cx("scr-sg-c scr-sg-hsub", i === 0 && "scr-sg-gstart", m && "scr-sg-race-head", wideOnly && "scr-sg-mwide")}>
                <SortHead {...(m ? mToggle : pcToggle)((r ? `${r}:${k}` : k) as StatSortKey)}>{h}</SortHead>
              </span>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
  if (mobile) {
    return (
      <TrendCtx.Provider value={ctx}>
      {hcolCss && <style>{hcolCss}</style>}
      <div className={cx("scr-sg is-m is-race9", tier && "has-tier", !showRaces && "is-fold", hcell !== null && "is-hcol")} role="table" aria-label="통계" {...hcolProps} ref={gridRef}
        style={{ "--ncw": groups.length * per, "--ncn": groups.length + (tier ? 1 : 0), ...foldStyle } as React.CSSProperties}>
        {head(true)}
        {clanRow && <PcRow row={clanRow} clan tier={tier} mobile races={races} />}
        {rows.map((r) => <PcRow key={r.member.id} row={r} tier={tier} mobile races={races} />)}
      </div>
      {popEl}
      </TrendCtx.Provider>
    );
  }
  return (
    <TrendCtx.Provider value={ctx}>
    {hcolCss && <style>{hcolCss}</style>}
    <div className={cx("scr-sg is-race9", tier && "has-tier", !showRaces && "is-fold", hcell !== null && "is-hcol")} role="table" aria-label="통계" {...hcolProps} ref={gridRef}
      style={{ gridTemplateColumns: `minmax(150px, 1.6fr) repeat(${groups.length * per}, minmax(50px, 1fr))`, ...foldStyle }}>
      {head(false)}
      {clanRow && <PcRow row={clanRow} clan tier={tier} races={races} />}
      {rows.map((r) => <PcRow key={r.member.id} row={r} tier={tier} races={races} />)}
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
