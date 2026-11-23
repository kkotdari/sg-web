import InfoTip, { closeInfoTips } from "../../components/common/InfoTip";
import { Fragment, createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { StatTrendPop, calcRowOf, combinedTier, gainOf, partOf, pctFmt, prodOf, statMetric, wpaFmt, wpaOf, type CalcKey, type StatMetric, type StatRace, type StatTrendData, type TrendAnchor, type TrendFact } from "./StatTrend";
import Avatar from "../../components/common/Avatar";
import PhotoViewer from "../../components/common/PhotoViewer";
import { useAppStore } from "../../store/appStore";
import { cx } from "../../utils/format";
import { ChevronDown, ChevronUp } from "lucide-react";
import WpaRulesModal, { WPA_RULES } from "../../components/stats/WpaRules";
import type { BaseRace, Member, MemberStats, TierCalcRow, TierEntry } from "../../types";
import RaceBadge from "../../components/common/RaceBadge";

/* ★★ 통계 = **표**(2026-10-20, 요청: "통계 PC 도 그리드로 · 클랜원 전체가 맨 위 로우 · 그 아래 개인별 한 로우씩" → 시안 A(한 줄 표)에
   C 의 승률 막대를 얹어(요청: "A에 C의 그래프를 시각적으로 도입")).
   PC: [유저 | 게임수 | 승률 | 데미지 | APM | 테란·프로토스·저그 (게임수 | 승률)] · 폰: [유저 | 데미지 | APM | 전적: 전체·종족 판수(승률)].
   ★ 펼침(PC ▾ · 폰 줄 누름 → 분당 곡선 두 판 · 2026-10-20)은 걷었다(2026-10-22, 요청: "통계 그래프 제거 — 화면과 API 응답에서만"). 승률 막대(시안 C)도 걷었다. */

const RACES: BaseRace[] = ["테란", "프로토스", "저그"];
/** 맨 윗줄 이름 — "평균"(2026-10-22, 요청: "클랜원 전체 → 클랜평균으로 바꾸자" → "클랜평균은 평균으로 변경"). */
const CLAN_LABEL = "평균";
/** 정렬 자 — 표 머리를 눌러 고른다(2026-10-22, 요청: "정렬은 머리 터치로 변경 · 헤더에 정렬 단추" → "정렬 조건을 상세히 — 전체와 종족별 플레이 수와 승률 총 8개").
 *  APM · 데미지 · 전체(rate · plays) · 종족별("테란:rate" · "테란:plays" …). */
/** 종족 자 — PC 는 종족마다 다섯(게임수 · 승률 · WPA · APM · EAPM · 2026-11-12 — 옛 교환 이득 · 교전 참여 · 생산 셋이 WPA 하나로) · 폰은 게임수 · 승률. */
/** "주종족:…"(2026-11-04) — 그 사람 주종족 판을 합친 줄(MemberStatsEntry.main). */
export type StatSortKey = "tier" | "rate" | "plays" | "wpa" | "apm" | "eapm" | "rp" | `${StatRace}:${"tier" | "rate" | "plays" | "wpa" | "apm" | "eapm"}`;
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
          {/* 아래 삼각형 하나(2026-11-18, 요청: "위아래가 아니라 아래만 되니까 아이콘을 바꿔야 할 거 같기도") — 정렬은 늘 큰 값부터라 내림만 있다 ·
              안 고르면 옅게 · 고르면 진하게. 옛(2026-11-05): 위아래 삼각형(고르면 아래만 진함). */}
          <svg className="scr-sg-sort-tri" width={Math.round(ic * 0.62)} height={Math.round(ic * 0.5)} viewBox="0 0 8 6.5">
            <path d="M4 6 L7.5 1 L0.5 1 Z" className={cx("is-dn", on && "is-act")} />
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
  /** 종합 티어(2026-11-07 · 서버가 주종족 판으로 · 셈 표까지 · sg-api tier) — 없으면 종족 표를 합친다. */
  tier?: TierEntry | null;
  /** 주종 티어(2026-11-23 · sg-api mainTier · 주종족 판만) — 티어 조회의 주종족 묶음(종합 왼쪽 · 늘 보임). */
  mainTier?: TierEntry | null;
  /** 그 기간에 번 랭크포인트(1:1 · sg-api rankScore · ratingScope period — 옛 래더 표의 "이 달에 번 점수" · 2026-11-18). 판이 없으면 null. */
  rankScore?: number | null;
}

/* ★ 팀전 티어 칸(2026-10-27, 요청: "통계에 검색한 조건이 팀전 종류인 경우 팀전 티어 · 컬럼은 유저 옆 · 모바일 유저칸 너비 줄이고") — 셈은 서버(sg-api tier.py · 2026-10-28 처음부터 다시):
   **몇 인분** = 그 기간 EAPM ÷ 120 × 교환비 보정(종족 차이 뺌) × 승패 보정(그 기간 판으로 · 같은 편 · 상대 편으로 예상한 결과와 다를 때 움직인다 · 편의 힘은 센 사람에게
   무게를 더 준 q 제곱 평균 · 기간 뒤 판은 안 써서 지난 달 티어가 고정).
   1.6(2026-10-28 · 옛 1.5) / 1.00 / 0.80 인분 기준선에 바로 댄다(절대 기준 · 빈 등급 있음). 1 이 가장 높다.
   칸은 숫자 배지 하나 · 얹거나 누르면 달별 티어 변화 그래프. 머리로 정렬하면 인분 내림차순. 판이 열 미만이면 "-". */
/* (걷음 2026-11-15 · WpaTierCell 로 합침) 옛 티어 칸 TierCell — 배지 하나 · 티어 없는 사람은 지금 인분(scr-sg-inbun-pend). */

/* ★ 티어 근거값(2026-10-28, 요청: "티어 팝업에 그래프 위에 현재 보는 티어의 근거값 두 개 표시 — eapm 과 상대승률" · 교환비를 넣으며 셋) — 인분 = EAPM ÷ 120 ×
   교환비 보정 × 승패 보정 이라 그 셋: 이 기간 평균 EAPM · 교환비 보정(싸움에서 남기고 밑진 정도 · 센 상대 몫 뺌 · %) · 승패 보정(같은 편·상대 편으로 예상한 것보다
   더/덜 이긴 정도 · 그 기간 판으로 · %). 인분은 안 쓴다(같은 날 요청: "팝업에 인분 표시 안 하고"). */

const Dash = () => <span className="scr-sg-dim">-</span>;
/** 랭크포인트 머리 툴팁(1:1 · 2026-11-18 래더 합침). */
const RP_TIP = "랭크포인트 획득 — 이 기간 1:1 에서 번 점수예요(옛 래더 표의 \"이 달에 번 점수\").\n이길수록 · 센 상대를 이길수록 많이 받아요.";
/** WPA 머리 툴팁(2026-11-13, 요청: "WPA에만 툴팁 · 아주 간단히"). */
/* ★ 인분 풀이(2026-11-13, 요청: "WPA 마우스 오버 설명에 인분에 대한 설명 있어야 할 듯") — 티어 조회의 WPA 칸은 인분(배수)이라 %p 만 적으면 값과 안 맞았다. */
const WPA_TIP = "WPA — 우리 편이 이길 확률을 얼마나 올렸는지예요.\n숫자는 인분이에요. 1.00이면 평균만큼, 1.20이면 평균보다 20% 더 한 거예요.\n티어가 없는 조회에선 판당 점수로 보여요(1점 = 이길 확률 1%).";
/** 주종족 묶음 머리 말풍선(2026-11-23). */
const MRACE_TIP = "주종족 — 그 기간 판의 30% 이상을 한 종족이에요(없으면 가장 많이 한 종족).";
const MTIER_TIP = "주종족 인분/티어 — 주종족 판만 합친 점수예요.\n부종족 판은 안 들어가요. 주종족 판이 10판 이상이어야 티어가 붙어요.\n종합의 WPA/티어는 모든 종족 판을 합친 점수예요.";
/** ★ 10판 미만 기록은 글자를 연하게(2026-11-23, 요청: "통계에서 10판 미만 기록엔 모두 글자 연하게 처리") — 묶음마다 그 묶음의 판 수로 가른다. */
const DIM_UNDER = 10;

/* ★ 값 칸의 변화 그래프 손잡이(2026-10-24, 요청: "통계 컬럼 피시는 호버 폰은 클릭시 → 5개월간의 변화 그래프로" · StatTrend.tsx) — 표가 문맥으로 내려 주고
   TCell 이 칸마다 단다: PC 는 마우스를 얹으면(enter · 떠나면 잠깐 뒤 닫힘 — 팝오버로 건너갈 틈) · 폰은 누르면(tap · 다시 누르거나 밖을 누르면 닫힘). 자료(trend)가
   없으면(아직 안 옴 · 평균 줄) 손잡이가 없는 보통 칸이다. */
interface TrendCtxValue {
  mobile: boolean;
  /** 그래프 없는 팝업(StatTrendData.noChart · '오늘' 조회) — 근거값 · 셈 표가 없는 칸은 아예 안 연다. */
  noChart: boolean;
  activeKey: string | null;
  enter: (member: Member, metric: StatMetric, el: HTMLElement, facts?: TrendFact[], calc?: TierCalcRow[] | null) => void;
  tap: (member: Member, metric: StatMetric, el: HTMLElement, facts?: TrendFact[], calc?: TierCalcRow[] | null) => void;
  leave: () => void;
}
const TrendCtx = createContext<TrendCtxValue | null>(null);
const trendKey = (m: Member, k: StatMetric) => `${m.id}|${k.key}`;

function TCell({ member, metric, facts, calc, className, children }: { member?: Member; metric: StatMetric; facts?: TrendFact[]; calc?: TierCalcRow[] | null; className?: string; children: ReactNode }) {
  const ctx = useContext(TrendCtx);
  /* '오늘' 조회(그래프 없음 · 2026-11-13)는 보여 줄 근거값 · 셈 표가 있는 칸만 연다 — 게임수 · 승률 · APM 칸은 그래프뿐이라 보통 칸. */
  const empty = !!ctx?.noChart && !(facts && facts.length > 0) && !(calc && calc.length > 0);
  if (!ctx || !member || empty) return <span className={cx("scr-sg-c", className)}>{children}</span>;
  const hot = ctx.activeKey === trendKey(member, metric);
  return (
    <span
      className={cx("scr-sg-c scr-sg-tcell", className, hot && "is-hot")}
      /* PC 도 **누르면** 변화 그래프(2026-11-06, 요청: "피시도 통계 팝오버가 아닌 클릭으로 변경" — 옛: 마우스를 얹으면 뜨고 떠나면 닫힘). 다시 누르거나 밖을 누르면 닫힌다. */
      onClick={(e) => ctx.tap(member, metric, e.currentTarget, facts, calc)}
      role="button" tabIndex={0}
      aria-label={`${member.nickname} ${metric.label} 변화 보기`}
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


/** ★ WPA 칸(2026-11-12, 요청: "WPA 적용" · "전투+참전+생산 다 합친게 WPA") — 옛 교환 이득 · 교전 참여 · 생산 세 칸(2026-11-08 밤)을 걷고 한 칸.
 *  티어 조회는 보정 뒤 인분 배수(ScoreCell · 셈 표의 WPA 줄) · 티어 칸이 없는 조회는 판당 WPA 원점수(승리 확률 %p · sg-api TierEntry.wpa). */
function WpaCell({ t }: { t?: TierEntry | null }) {
  const x = wpaOf(t);
  if (x === null) return <Dash />;
  const s = wpaFmt(x);
  return <span className="scr-sg-v"><b>{s.slice(0, -1)}</b><i>점</i></span>;
}
/** ★ 티어 칸 위아래 표(2026-11-16, 요청: "티어 칸에 위아래 버튼 추가해줘 다이얼 · 이 사람은 점수가 좀 더 높아야 한다 · 낮아야 한다를 점수를 주는 거 ·
 *  사람별로 11월 전체 팀전 티어 조회 때만 · +를 많이 받으면 그만큼 많이 + 미세조정") — ClanStatsScreen 이 열린 달 · 팀전 전체 · 맵 전체에서만 넘긴다.
 *  종합 칸(사람마다 하나)에만 · 내 줄은 빈 자리 · 다시 누르면 거둔다 · 누가 줬는지는 서버도 안 내보낸다(sg-api tier_votes). 덤은 서버가 인분에 더해 온다(TierEntry.vote). */
export interface StatVoteCtl {
  mine: Record<string, number>;
  selfId: string | null;
  busy: string | null;
  onVote: (memberId: string, value: -1 | 0 | 1) => void;
}
const VoteCtx = createContext<StatVoteCtl | null>(null);
function VoteDial({ memberId }: { memberId: string }) {
  const v = useContext(VoteCtx);
  if (!v) return null;
  if (memberId === v.selfId) return <i className="scr-sg-vote is-gap" aria-hidden />;
  const mine = v.mine[memberId] ?? 0;
  const press = (e: React.MouseEvent, val: 1 | -1): void => {
    e.stopPropagation(); e.preventDefault();
    v.onVote(memberId, mine === val ? 0 : val);
  };
  return (
    <span className="scr-sg-vote" role="group" aria-label="점수 의견">
      <button type="button" className={cx("scr-sg-vote-b is-up", mine === 1 && "is-on")} aria-pressed={mine === 1} disabled={v.busy === memberId}
        title={mine === 1 ? "올려야 한다 — 다시 누르면 거둬요" : "점수가 더 높아야 해요"} onClick={(e) => press(e, 1)}><ChevronUp size={12} strokeWidth={3} /></button>
      <button type="button" className={cx("scr-sg-vote-b is-dn", mine === -1 && "is-on")} aria-pressed={mine === -1} disabled={v.busy === memberId}
        title={mine === -1 ? "내려야 한다 — 다시 누르면 거둬요" : "점수가 더 낮아야 해요"} onClick={(e) => press(e, -1)}><ChevronDown size={12} strokeWidth={3} /></button>
    </span>
  );
}
/** 티어 배지 — 1 ~ 4(같은 날 저녁의 새싹 그림은 밤에 걷었다 · 요청 "추천대로 0.67 로 새싹 없이"). */
export function TierBadge({ tier }: { tier: number }) {
  return <b className={cx("scr-sg-tier", `is-t${Math.min(Math.max(1, tier), 4)}`)}>{tier}</b>;
}
/** 표로 더한 인분(작게 · 점수 오른쪽 위) — 0 이면 안 단다. */
function VoteMark({ v }: { v?: number | null }) {
  if (!v) return null;
  return <em className={cx("scr-sg-vote-m", v > 0 ? "is-up" : "is-dn")} title="위아래 표로 더한 점수">{v > 0 ? "+" : "−"}{Math.abs(v).toFixed(2)}</em>;
}
/** ★ WPA/티어 한 칸(2026-11-15, 요청: "WPA가 결국 티어기준이네 지금 · wpa랑 티어 하나로 합치고 점수 티어 순으로 표시하는게 나을듯 · 티어 없는애들은 점수만 · 헤더는 WPA/티어") —
 *  티어 조회에서 옛 티어 칸 · WPA 칸 둘을 한 칸으로. 점수 = 티어의 잣대 인분(stdInbun · 서버가 둘째 자리 자름 — 승패 보정 · EAPM · 생산을 끈 뒤로 WPA 배수와 같다) 뒤에 티어 배지.
 *  티어가 없는 사람(판이 문턱 아래)은 점수만(배지 자리는 비워 숫자 줄을 맞춘다). 팝업은 WPA 팝업(방어 · 공격 · 합류 · 정찰)과 셈 표 · 그래프는 보정 뒤 WPA. */
function WpaTierCell({ t, member, race, className, more }: { t?: TierEntry | null; member?: Member; race?: StatRace; className?: string; more?: TrendFact[] }) {
  const metric = statMetric("wpa", race ?? null, true);
  const cl = cx("scr-sg-tier-c", className);
  const ib = t ? (t.stdInbun ?? t.inbun ?? calcRowOf(t, "wpa")?.mult ?? null) : null;
  if (!t || typeof ib !== "number") return <TCell member={member} metric={metric} facts={more} className={cl}><Dash /></TCell>;
  const facts = [...(t.calc ? [] : more ?? []), ...wpaFacts(t)];
  return (
    <TCell member={member} metric={metric} facts={facts} calc={t.calc} className={cl}>
      <span className="scr-sg-wt">
        <b className="scr-sg-wt-v">{ib.toFixed(2)}<VoteMark v={t.vote} /></b>
        {typeof t.tier === "number" ? <TierBadge tier={t.tier} /> : <i className="scr-sg-wt-gap" aria-hidden />}
        {race === undefined && member && <VoteDial memberId={member.id} />}
      </span>
    </TCell>
  );
}
/** 보정 뒤 점수 칸(위 calcRowOf ★) — 인분 배수 둘째 자리(1.00 = 보통). */
function ScoreCell({ r }: { r: TierCalcRow | null }) {
  if (!r) return <Dash />;
  return <span className="scr-sg-v"><b>{r.mult.toFixed(2)}</b></span>;
}
/** ★ WPA 팝업 — 한 줄에 하나씩 **방어 · 공격 · 합류**(인분 · 1인분 = 그 조회 판 평균)와 **총 승리 확률 기여**(판당 %p)(2026-11-13, 요청:
 *  "방어 +N% · 공격 · 헬프 · 총 승리 확률 기여 +N% 약간 이런식으로" → "인분도 괜찮고 · 방어 0.9인분 · 공격 0.8인분 · 헬프 0.5인분" — 옛 득점 · 실점 · 합계 / 공격 · 생존 · 협동 점수).
 *  방어 = 덜 잃은 정도 · 공격 = 상대를 잡아 올린 정도 · 합류 = 몰매 때 비어 있던 내가 와서 함께 싸운 정도(sg-api wpaInbun · tier._wpa_inbun) · 총 = 티어에 드는 WPA 배수(인분).
 *  ★ 헬프 → 합류(같은 날, 요청: "헬프라기보다 협동? 뭐 이런 적당한 이름" — sg-api wpa ★ 합류: 몰매 당한 사람 제 몫은 방어로 옮겨 합류는 '안 와서'만). */
function wpaFacts(t: TierEntry | null | undefined): TrendFact[] {
  const v = wpaOf(t);
  if (v === null) return [];
  const out: TrendFact[] = [];
  const v9 = t?.wpaInbun ?? [];
  const [dfn, atk, jn] = v9;
  /* ★ 정찰(2026-11-13, 지적: "정찰의 효과가 누락" · "WPA 팝업에 장악 정찰도") — 상대 건물을 본 정도(sg-api wpa ★ 정찰).
     ★ 장악은 걷었다(같은 날, 지적: "제어판에서 보니까 장악이 확실히 이상한데 · 약한 사람들이 장악이 높게 나와" → "장악은 그럼 화면과 덤퍼 등에서도 빼야겠네").
     인분은 넷짜리 [방어 · 공격 · 합류 · 정찰]와 옛 다섯짜리 [… · 장악 · 정찰] 둘 다 읽는다(sg-api 와 배포 때가 어긋나도 정찰 자리가 맞게). */
  const sct = v9.length >= 5 ? v9[4] : v9[3];
  const ib = (x: number) => `${x.toFixed(2)}인분`;
  if (typeof dfn === "number") out.push({ label: "방어", value: ib(dfn) });
  if (typeof atk === "number") out.push({ label: "공격", value: ib(atk) });
  if (typeof jn === "number") out.push({ label: "합류", value: ib(jn) });
  if (typeof sct === "number") out.push({ label: "정찰", value: ib(sct) });
  /* 총은 인분(같은 날 "총 몇인분") — 티어에 드는 WPA 배수(sg-api cbt · 셈 표 WPA 줄 배수 = 티어 조회 칸 값) · 없으면 판당 승리 확률 기여(%p). */
  if (typeof t?.cbt === "number") out.push({ label: "총", value: ib(t.cbt) });
  else out.push({ label: "총 승리 확률 기여", value: `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%` });
  return out;
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
/** 종족 판 근거값(티어 칸 팝업 · 위 TierCell more · 셈 표가 없는 옛 응답일 때만 보인다) — 게임수 · 승률 · WPA · 교환 이득 · 교전 참여 · 생산 · APM · EAPM. */
function raceFacts(s: MemberStats, t?: TierEntry | null): TrendFact[] {
  const out: TrendFact[] = [{ label: "게임수", value: s.plays.toLocaleString() }, { label: "승률", value: `${s.winRate}%` }];
  const w = wpaOf(t);
  if (w !== null) out.push({ label: "WPA", value: `판당 ${wpaFmt(w)}` });
  const g = gainOf(s);
  if (g !== null) out.push({ label: "교환 이득", value: pctFmt(g) });
  const p = partOf(s);
  if (p !== null) out.push({ label: "교전 참여", value: pctFmt(p) });
  const pv = prodOf(s);
  if (pv !== null) out.push({ label: "생산", value: `${Math.round(pv).toLocaleString()}/분` });
  if (typeof s.avgApm === "number") out.push({ label: "APM", value: String(s.avgApm) });
  if (typeof s.avgEapm === "number") out.push({ label: "EAPM", value: String(s.avgEapm) });
  return out;
}
/** 종족 묶음 칸 — PC 는 다 · 폰은 넓을 때(scr-sg-mwide)와 좁을 때를 CSS 가 고른다(mobile). */
/** 묶음 칸 — race 가 null 이면 종합 묶음(전체 판 · 종합 티어 = 종족 티어 가중 평균 · 2026-11-04). */
function RaceCells({ s, t, race, member, clan, tier, noWpa, mobile, main, rp, dim }: { s?: MemberStats | null; t?: TierEntry | null;
  race: BaseRace | null; member?: Member; clan?: boolean; tier?: boolean; noWpa?: boolean; mobile?: boolean; main?: boolean;
  /** 그 묶음 판이 DIM_UNDER 미만 — 칸 글자를 연하게(위 ★). */
  dim?: boolean;
  /** 랭크포인트 칸(1:1 종합 묶음만 · undefined 면 칸이 없다) — 값(null = 판 없음). */
  rp?: number | null }) {
  const has = !!s && s.plays > 0;
  /* 주종족 묶음은 늘 옅은 배경(같은 날 "주종족에 배경 포인트 깔기 · 호버랑 무관하게" · sg-api mainRaces = 그 조회 판의 30% 이상 종족). */
  const mc = cx(main && "is-main", dim && "is-dim");
  const m = cx(mobile && "scr-sg-mnum", mc);
  const wide = cx(mobile && "scr-sg-mnum scr-sg-mwide", mc);
  /* 티어 조회의 사람 줄은 보정 뒤 점수(calcRowOf ★) · 팝업에 원점수와 그 줄의 보정 과정 · 평균 줄은 보정이 없어 "-". 티어 없는 조회는 원점수 칸 그대로. */
  const scored = !!tier;
  const sc = (k: CalcKey) => (scored && !clan ? calcRowOf(t, k) : null);
  const cell = (k: CalcKey, raw: ReactNode) => {
    const r = sc(k);
    return (
      <TCell member={member} metric={statMetric(k, race, scored && !clan)} className={wide}
        facts={has && !clan ? wpaFacts(t) : undefined}>
        {!has ? <Dash /> : scored ? (clan ? <Dash /> : <ScoreCell r={r} />) : raw}
      </TCell>
    );
  };
  return (
    <>
      {/* 티어 조회 — WPA/티어 한 칸(위 WpaTierCell ★) · 평균 줄은 "-" */}
      {tier && <WpaTierCell t={clan ? null : t} member={clan ? undefined : member} race={race ?? undefined} className={cx("scr-sg-gstart", m)} more={has ? raceFacts(s!, t) : undefined} />}
      <TCell member={member} metric={statMetric("plays", race)} className={cx(!tier && "scr-sg-gstart", tier ? wide : m)}><Num v={has ? s!.plays.toLocaleString() : null} /></TCell>
      <TCell member={member} metric={statMetric("rate", race)} className={wide}>{!has ? <Dash /> : <Rate s={s!} />}</TCell>
      {/* WPA(2026-11-12 ★ WpaCell) — 옛 교환 이득 · 교전 참여 · 생산(2026-11-08 밤) 세 칸 자리. 평균 줄은 사람 몫이라 없다(-). */}
      {/* 1:1 은 WPA 칸이 없다(2026-11-17, 요청: "1:1 선택시 WPA 컬럼은 제거" · noWpa) */}
      {!tier && !noWpa && cell("wpa", has && !clan ? <WpaCell t={t} /> : <Dash />)}
      {/* ★ 1:1 은 그 자리에 랭크포인트 획득(2026-11-18, 요청: "래더를 통계의 1:1 필터 적용으로 통합 · WPA 있던 자리에 랭크포인트 획득") — 종합 묶음만(점수는 사람마다 하나) ·
          옛 래더 표처럼 "+1,234" · 평균 줄 · 판 없는 사람은 "-". */}
      {rp !== undefined && <span className={cx("scr-sg-c scr-sg-rp", wide, dim && "is-dim")}>{clan || rp === null ? <Dash /> : <Num v={`${rp > 0 ? "+" : ""}${Math.round(rp).toLocaleString()}`} />}</span>}
      <TCell member={member} metric={statMetric("apm", race)} className={wide}><Num v={has ? s!.avgApm : null} /></TCell>
      <TCell member={member} metric={statMetric("eapm", race)} className={wide}><Num v={has ? s!.avgEapm : null} /></TCell>
    </>
  );
}

/** 주종족 묶음 두 칸 — 주종족 배지(게임 목록과 같은 글자 배지 · RaceBadge circleLetter · 테 · 프 · 저 세 자리를 늘 잡고 해당 종족만 왼쪽부터) · 인분/티어(sg-api mainTier · 주종족 판만). 평균 줄은 "-". */
const MAIN_ORDER: readonly BaseRace[] = ["테란", "프로토스", "저그"];
function MainCells({ row, clan, mobile }: { row: StatGridRow; clan?: boolean; mobile?: boolean }) {
  const mains = clan ? [] : MAIN_ORDER.filter((r) => row.mainRaces?.includes(r));
  const mt = clan ? null : row.mainTier ?? null;
  const dim = !clan && (mt?.plays ?? 0) < DIM_UNDER;
  const m = cx(mobile && "scr-sg-mnum", dim && "is-dim");
  return (
    <>
      <span className={cx("scr-sg-c scr-sg-gstart scr-sg-mrace", m)}>
        {clan ? <Dash /> : [0, 1, 2].map((i) => <span key={i} className="scr-sg-mrace-slot">{mains[i] ? <RaceBadge race={mains[i]} size={13} circleLetter className="scr-sg-mrace-b" /> : null}</span>)}
      </span>
      <WpaTierCell t={mt} member={clan ? undefined : row.member} race="주종족" className={m} />
    </>
  );
}

function PcRow({ row, clan, tier, noWpa, mobile, races, rankPts }: { row: StatGridRow; clan?: boolean; tier?: boolean; noWpa?: boolean; mobile?: boolean; races: readonly BaseRace[]; rankPts?: boolean }) {
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
        {/* (걷음 · 2026-11-09, 요청: "좁은 폰도 피시랑 똑같이 표시하고 스크롤") 좁은 폰만의 전체 게임수 칸(scr-sg-mnarrow) — 이제 모든 폰이 PC 칸을 다 쓰고 가로로 민다. */}
        {/* 종합(2026-11-04, 요청: "통계에 기본은 종합(전체 종족 평균)") — 전체 판 · 종합 티어(평균 줄은 티어 없음). */}
        {/* 종합 티어 — 서버가 주종족 판으로 낸 것(row.tier · 셈 표까지 · 2026-11-07) 먼저 · 없으면(옛 응답) 종족 표를 합친다. */}
        {/* ★ 주종족 묶음(2026-11-23, 요청: "주종족 칸을 종합과 구분해서 새로 · 기본으로 보이게 · 주종족 · 인분/티어 · 주종족 칸엔 배지(테프저 세 자리 · 해당되는 것만 왼쪽부터)") — 티어 조회만 */}
        {tier && <MainCells row={row} clan={clan} mobile={mobile} />}
        <RaceCells s={row.stats} t={clan ? null : row.tier ?? combinedTier(row.tierByRace)} race={null} member={who} clan={clan} tier={tier} noWpa={noWpa} mobile={mobile} rp={rankPts ? row.rankScore ?? null : undefined}
          dim={!clan && (row.stats?.plays ?? 0) < DIM_UNDER} />
        {races.map((r) => <RaceCells key={r} s={row.byRace?.[r]} t={row.tierByRace?.[r]} race={r} member={who} clan={clan} tier={tier} noWpa={noWpa} mobile={mobile} main={!clan && !!row.mainRaces?.includes(r)}
          dim={!clan && (row.byRace?.[r]?.plays ?? 0) < DIM_UNDER} />)}
      </div>
  );
}

/* (걷음 2026-11-13, 요청: "통계 전체 툴팁은 제거하고 WPA에만 툴팁 넣기 · 아주 간단히") 통계 표 도움말 단추(StatHelp · 티어 풀이) — WPA 머리 툴팁 한 줄만 남긴다(아래 head). */
/** ★ "WPA란?" 글 단추(2026-11-13, 요청: "예전 통계 툴팁 아이콘 자리에 텍스트 버튼 WPA란? 추가 · 툴팁 뜨고 WPA 뜻과 항목별로 어떻게 하면 점수를 얻고 잃는지") —
 *  정렬 줄 오른끝(옛 StatHelp 자리) · PC 는 얹으면 · 폰은 누르면. 항목은 WPA 팝업과 같은 차례(방어 · 공격 · 합류 · 정찰 · sg-api wpa.py · tier._wpa_inbun · 장악은 2026-11-13 걷음).
 *  ★ 공통 풀이는 모두 구분선 위(같은 날, 요청: "wpa툴팁에서 상세항목들 위의 공통해당 내용은 모두 구분선 위로 넣기") — 아래는 항목만. */
/** ★ 계산 조건은 말풍선 아래로(2026-11-16, 요청: "헬프 아이콘 제거 · 내용은 WPA란? 툴팁에 아래 붙여넣기") — 옛 통계 머리 WPA/티어 칸의 '?'(WpaRulesModal)를 걷고
 *  그 번호 붙은 조건(WPA_RULES)을 항목 풀이 아래에 잇는다. 길어서 말풍선이 굴러가고(interactive) · 맨 아래 '건의하기'는 건의 칸만 든 창(WpaRulesModal askOnly). */
/* ★ PC 도 눌러서만 연다(2026-11-17, 지적: "피시에서 마우스오버만해도 헬프가 뜸" · 옛 2026-11-16: hover — 얹기만 해도 열렸다). */
export function WpaHelp() {
  const [ask, setAsk] = useState(false);
  let no = 0;
  return (
    <>
    <InfoTip
      interactive trigger="WPA란?" triggerClassName="scr-infotip scr-infotip-text scr-sg-help-btn scr-sg-wpa-help" bubbleClassName="scr-sg-help scr-sg-help-long"
      text={(
        <span className="scr-sg-help-list">
          {/* ★ 머리(2026-11-13, 요청: "WPA(Win P... 이렇게 풀어쓴거부터 시작하고 아랫줄에 간단 설명 하고 구분선 넣고 그 아랫줄부터 상세 설명") */}
          {/* 한글 이름까지(2026-11-13, 요청: "WPA(Win Probability Added, 승리 확률 기여도) · 한글 이름도 정확히 명시하기 툴팁에") */}
          <b className="scr-sg-help-title">WPA(Win Probability Added, 승리 확률 기여도)</b>
          <span>내 플레이로 우리 편이 이길 확률이 얼마나 올랐는지예요.</span>
          <span>팽팽할 때 한 플레이일수록 크게 쳐요.</span>
          <span><b>인분</b> — 1.00이면 평균만큼 한 거예요. 1.20이면 20% 더, 0.80이면 20% 덜이에요. 판이 적으면 1에 가깝게 나와요.</span>
          <span>항목 인분을 다 곱하면 WPA 인분이 돼요.</span>
          {/* ★ 경기 수준(2026-11-16 · 옛 이름 판 수준 · sg-api quality.py) — 그 기간 판들의 운영 수준이 모두에게 같은 배수 */}
          <span><b>경기 수준</b> — 그 기간 판들의 초반 운영(채취 · 자원 쓰기)과 EAPM이 7월보다 좋으면 모두의 인분이 같이 올라요(20% 좋으면 ×1.2).</span>
          <span className="scr-sg-help-sep" aria-hidden="true" />
          <span><b>공격</b> 상대 병력 · 일꾼 · 건물을 잡으면 올라요.</span>
          <span><b>방어</b> 싸운 만큼에 비해 덜 잃을수록 올라요. 안 싸워서 덜 잃은 건 안 쳐요.</span>
          <span><b>합류</b> 우리 편이 머릿수에서 밀려 싸울 때, 비어 있던 내가 안 가면 내려가요.</span>
          <span><b>정찰</b> 상대 건물을 보고 있으면 올라요.</span>
          <span className="scr-sg-help-sep" aria-hidden="true" />
          <b className="scr-sg-help-title">계산 조건</b>
          <span className="scr-sg-help-lead">지금 점수에 들어가는 규칙이에요. 빠졌거나 이상한 조건은 건의해 주세요(번호로 가리켜도 돼요).</span>
          {WPA_RULES.map((sec) => (
            <Fragment key={sec.title}>
              <b className="scr-sg-help-sec">{sec.title}</b>
              {sec.items.map((it) => { no += 1; return <span key={no} className="scr-sg-help-rule"><i>{no}</i><span>{it}</span></span>; })}
            </Fragment>
          ))}
          <button type="button" className="scr-pill-btn scr-sg-help-ask" onClick={() => { closeInfoTips(); setAsk(true); }}>건의하기</button>
        </span>
      )}
    />
    {ask && <WpaRulesModal askOnly onClose={() => setAsk(false)} />}
    </>
  );
}


export default function StatGrid({ clan, rows, mobile, sortKeys, onSortKeys, multi, trend, tier = false, noWpa = false, rankPts = false, showRaces = false, onVisW, vote = null }: SortProps & {
  /** 티어 칸 위아래 표(위 StatVoteCtl ★) — 열린 달 · 팀전 전체 · 맵 전체 · 로그인한 사람에게만. */
  vote?: StatVoteCtl | null;
  /** 클랜원 전체(맨 위 줄) — 없으면 안 선다. */
  clan: { stats: MemberStats; byRace?: Partial<Record<BaseRace, MemberStats>>; main?: MemberStats | null } | null;
  rows: StatGridRow[];
  mobile: boolean;
  /** 다섯 달 변화 자료(StatTrend) — 없으면 칸에 손잡이가 없다. */
  trend: StatTrendData | null;
  /** 팀전 티어 칸(유저 옆 · 팀전 조회에서만 — 위 TierCell ★). */
  tier?: boolean;
  /** WPA 칸을 안 세운다 — 1:1 조회(2026-11-17, 요청: "1:1 선택시 WPA 컬럼은 제거") · 티어 조회(tier)는 WPA/티어 칸이라 안 탄다. */
  noWpa?: boolean;
  /** 종합 묶음의 그 자리(승률 뒤)에 랭크포인트 획득 칸(1:1 · 2026-11-18 래더 합침) — 종족 묶음은 넷 그대로. */
  rankPts?: boolean;
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
    noChart: !!trend.noChart,
    activeKey: pop ? trendKey(pop.member, pop.metric) : null,
    enter: (member, metric, el, facts, calc) => { popCancel(); setPop((cur) => (cur && trendKey(cur.member, cur.metric) === trendKey(member, metric) ? cur : { member, metric, rect: rectOf(el), facts, calc })); },
    tap: (member, metric, el, facts, calc) => { setPop((cur) => (cur && trendKey(cur.member, cur.metric) === trendKey(member, metric) ? null : { member, metric, rect: rectOf(el), facts, calc })); },
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
    <StatTrendPop anchor={pop} data={trend} mobile={mobile} />,
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
  /** 묶음마다 칸 수 — [티어] 게임수 · 승률 · WPA · APM · EAPM(위 RaceCells ★ · CSS .is-race9 --rspan 과 같이 간다). */
  const per = !tier && noWpa ? 4 : 5;
  /** 묶음마다 칸 수 — 랭크포인트 칸은 종합 묶음에만 하나 더(2026-11-18). */
  const perOf = (gi: number): number => per + (rankPts && gi === 0 ? 1 : 0);   // 2026-11-17 1:1 은 WPA 칸 없이 넷(noWpa) · 2026-11-15 티어 조회는 WPA/티어 한 칸(옛 6 : 5) · 2026-11-12 WPA 한 칸(옛 8 : 7 — 교환 이득 · 교전 참여 · 생산 · 그 전 6 : 5)
  /* 칸 틀 — WPA/티어 칸(묶음 첫 칸)은 숫자 + 배지라 넓게(PC 84px · 폰 76px · 2026-11-15 "wpa 티어 칸 늘리고" · 옛 70 · 62) · 나머지는 옛 최소 폭.
     폰 유저 칸 110 → 92px · 2fr → 1.3fr(같은 날 "폰 유저 폭 줄이고"). */
  /* 종합 묶음의 WPA/티어 칸만 넓힌다(first0) — 위아래 표 다이얼(위 StatVoteCtl ★) 몫(PC 18 · 폰 16px) · 다이얼이 없으면 다른 묶음과 같은 폭.
     ★ 티어 칸 좁힘(2026-11-16, 요청: "티어칸 폭 줄이고 나머지 칸에 나눠줘도 될 듯" · 머리 '?' 걷음과 함께) — 폰 76px · 1.5fr(종합 92px · 1.6fr) → 70px · 1.2fr ·
     PC 84px · 1.5fr(종합 102px · 1.6fr) → 76px · 1.2fr. 남는 폭은 fr 로 나머지 칸이 나눠 갖는다(폰 360px 화면에서 표가 가로로 넘치던 8px 도 걷힌다). */
  /* ★ 주종족 묶음(티어 조회 · 2026-11-23) — 유저 다음 · 종합 앞: 배지 칸(세 자리) · 인분/티어 칸(묶음 첫 칸과 같은 폭). */
  const mainCols = tier ? `${mobile ? "minmax(60px, .8fr)" : "minmax(68px, .8fr)"} ` : "";
  const colsOf = (who: string, first: string, rest: string, first0 = first): string => `${who} ${tier ? `${mainCols}${first} ` : ""}${groups.map((_g, gi) => [tier ? (gi === 0 && vote ? first0 : first) : rest, ...Array(perOf(gi) - 1).fill(rest)].join(" ")).join(" ")}`;
  /** 머리 윗줄 묶음 칸 수(주종족 묶음이 있으면 하나 더) — 열 강조의 머리 자리 셈. */
  const nHg = groups.length + (tier ? 1 : 0);
  const gridRef = useRef<HTMLDivElement>(null);
  const [clipW, setClipW] = useState<number | null>(null);
  useLayoutEffect(() => {
    const g = gridRef.current;
    if (showRaces || !g) return undefined;
    const meas = (): void => {
      const h = g.querySelector(".scr-sg-head > .scr-sg-hgroup[data-g=\"종합\"]") as HTMLElement | null;   // 접힘은 종합 오른변에서 자른다(주종족 묶음은 그 왼쪽 · 늘 보임)
      if (h) setClipW(Math.ceil(h.getBoundingClientRect().right - g.getBoundingClientRect().left));
    };
    meas();
    const ro = new ResizeObserver(meas);
    ro.observe(g);
    return () => ro.disconnect();
  }, [showRaces, mobile, tier]);
  const foldStyle = showRaces || clipW === null ? {} : { "--sgclip": `${clipW}px` } as React.CSSProperties;
  /* ★ 접힌 표도 가로로 민다(2026-11-09, 요청: "모바일 좁은 폰도 통계에서 피시랑 똑같이 표시하고 스크롤 사용 · 기본은 종족별 접힌 상태로") — 옛: 접으면 감싸개가 가로 넘침을 숨겨(overflow hidden)
     좁은 폰에선 종합 칸도 다 못 봤다. 이제 크기 상자(.scr-sg-sizer)가 종합 오른변(clipW)에서 자르고 감싸개는 그 폭까지만 민다 — 표 자체는 감싸개 폭(--sgw) 그대로라 칸 너비가 펼침 · 접힘에 안 흔들린다. */
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sgw, setSgw] = useState<number | null>(null);
  useLayoutEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return undefined;
    const meas = (): void => setSgw(sc.clientWidth);
    meas();
    const ro = new ResizeObserver(meas);
    ro.observe(sc);
    return () => ro.disconnect();
  }, [mobile]);
  const scrollStyle = sgw === null ? undefined : ({ "--sgw": `${sgw}px` } as React.CSSProperties);
  const sizerStyle = showRaces || clipW === null ? undefined : { width: clipW };
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
      return { r: null, c: ix - nHg };
    }
    const r = Array.prototype.indexOf.call(row.parentElement.children, row) as number;
    return { r, c: ix >= valBase ? ix : null };
  };
  const sameCell = (a: HCell | null, b: HCell | null): boolean => !!a && !!b && a.r === b.r && a.c === b.c;
  useEffect(() => { setHPin(null); setHHover(null); }, [mobile, tier, showRaces]);
  const hcolCss = hcell === null ? null : [
    hcol === null ? "" : `.scr-sg.is-hcol > .scr-sg-row:not(.scr-sg-head) > :nth-child(${hcol + 1})${mobile ? "" : `, .scr-sg.is-hcol > .scr-sg-head > :nth-child(${hcol + nHg + 1})`} { background: var(--lighting-hover-bg); }`,
    hrow === null ? "" : `.scr-sg.is-hcol > .scr-sg-row:nth-child(${hrow + 1}) > .scr-sg-c { background: var(--lighting-hover-bg); }`,
    hrow === null || hcol === null ? "" : `.scr-sg.is-hcol > .scr-sg-row:nth-child(${hrow + 1}) > :nth-child(${hcol + 1}) { background: linear-gradient(var(--lighting-hover-bg), var(--lighting-hover-bg)), var(--lighting-hover-bg); }`,
    /* ★ 폰 붙박이 유저 칸은 강조돼도 **불투명**(2026-11-13, 실기: "하이라이트된 셀이 유저 틀고정 행까지 넘어가는 오류") — 강조 칠(반투명)이 유저 칸의 페이지 바탕을 덮어
       가로로 밀린 칸(강조된 티어 칸)이 그 밑에서 비쳐 보였다. 강조를 페이지 바탕 위에 겹친다. */
    !mobile || hcell === null ? "" : `.scr-sg.is-m.is-hcol > .scr-sg-row:not(.scr-sg-head)${hcol === 0 ? "" : `:nth-child(${(hrow ?? -2) + 1})`} > .scr-sg-c.scr-sg-who { background: linear-gradient(var(--lighting-hover-bg), var(--lighting-hover-bg)), var(--void); }`,
  ].join("\n");
  const hcolProps = {
    onPointerOver: (e: React.PointerEvent) => { if (e.pointerType === "mouse") { const c = cellOf(e.target); setHHover((p) => (sameCell(p, c) ? p : c)); } },
    onPointerLeave: () => setHHover(null),
    onClickCapture: (e: React.MouseEvent) => { const c = cellOf(e.target); if (c) setHPin((p) => (sameCell(p, c) ? null : c)); },
  };
  /** 종족 묶음 머리 두 줄 — 윗줄 종족 이름(묶음 칸 수만큼 덮음) · 아랫줄 칸 머리. 폰은 좁을 때 칸이 줄어 덮는 수가 CSS 변수(--rspan)다. */
  const SUBS: readonly (readonly ["WPA/티어" | "게임수" | "승률" | "WPA" | "APM" | "EAPM" | "랭크P", "tier" | "plays" | "rate" | "wpa" | "apm" | "eapm" | "rp"])[] =
    tier ? [["WPA/티어", "tier"], ["게임수", "plays"], ["승률", "rate"], ["APM", "apm"], ["EAPM", "eapm"]]
      : noWpa ? [["게임수", "plays"], ["승률", "rate"], ["APM", "apm"], ["EAPM", "eapm"]]
      : [["게임수", "plays"], ["승률", "rate"], ["WPA", "wpa"], ["APM", "apm"], ["EAPM", "eapm"]];
  const head = (m: boolean) => (
    <div className="scr-sg-row scr-sg-head" role="row">
      <span className="scr-sg-c scr-sg-who scr-sg-h2">유저</span>
      {tier && <span className="scr-sg-c scr-sg-hgroup scr-sg-gstart" data-g="주종족" style={{ gridColumn: "span 2" }}>주종족</span>}
      {groups.map((r, gi) => (
        <span key={r ?? "종합"} data-g={r ?? "종합"} className="scr-sg-c scr-sg-hgroup scr-sg-gstart" style={{ gridColumn: m && perOf(gi) === per ? "span var(--rspan)" : `span ${perOf(gi)}` }}>
          {r ?? "종합"}
          {/* 종족별 펼치기/접기 단추는 표 밖 정렬 줄로 옮겼다(2026-11-05, 요청: "저 펴고 접는 버튼은 표 외부로 이동" · ClanStatsScreen). */}
        </span>
      ))}
      {tier && (
        <>
          <span className={cx("scr-sg-c scr-sg-hsub scr-sg-gstart", m && "scr-sg-race-head")} title={MRACE_TIP}>주종족</span>
          <span className={cx("scr-sg-c scr-sg-hsub", m && "scr-sg-race-head")} title={MTIER_TIP}>
            <SortHead {...(m ? mToggle : pcToggle)("주종족:tier")}>인분/티어</SortHead>
          </span>
        </>
      )}
      {groups.map((r) => (
        <Fragment key={r ?? "종합"}>
          {(rankPts && !r ? [...SUBS.slice(0, 2), ["랭크P", "rp"] as const, ...SUBS.slice(2)] : SUBS).map(([h, k], i) => {
            /* 폰: 좁을 때는 종족마다 첫 칸(티어 · 티어 없는 조회는 게임수) 만 · 넓을 때 다(RaceCells 와 같은 가름). */
            const wideOnly = m && i >= 1;
            return (
              <span key={k} className={cx("scr-sg-c scr-sg-hsub", i === 0 && "scr-sg-gstart", m && "scr-sg-race-head", wideOnly && "scr-sg-mwide")}
                title={k === "wpa" || k === "tier" ? WPA_TIP : k === "rp" ? RP_TIP : undefined}>
                <SortHead {...(m ? mToggle : pcToggle)((r ? `${r}:${k}` : k) as StatSortKey)}>{h}</SortHead>
                {/* (걷음 2026-11-16, 요청: "헬프 아이콘 제거 · 내용은 WPA란? 툴팁에 아래") 종합 WPA 칸 머리 '?'(WPA 계산 조건 창) → WpaHelp 말풍선 아래 */}
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
      <VoteCtx.Provider value={vote}>
      {hcolCss && <style>{hcolCss}</style>}
      {/* 넓은 폰 · 태블릿도 가로 스크롤(2026-11-06, 지적: "모바일 레이아웃인데 PC 로 나오는 구간에서 너무 비좁네") — 칸 최소 폭을 키우고 넘치면 감싸개가 민다(PC 와 같은 .scr-sg-scroll). */}
      <div className={cx("scr-sg-scroll", !showRaces && "is-fold")} ref={scrollRef} style={scrollStyle}>
      <div className="scr-sg-sizer" style={sizerStyle}>
      <div className={cx("scr-sg is-m is-race9", tier && "has-tier", !showRaces && "is-fold", hcell !== null && "is-hcol")} role="table" aria-label="통계" {...hcolProps} ref={gridRef}
        style={{ "--ncw": groups.length * per + (rankPts ? 1 : 0) + (tier ? 2 : 0), "--rspan": per, gridTemplateColumns: colsOf("minmax(92px, 1.3fr)", "minmax(70px, 1.2fr)", "minmax(46px, 1fr)", "minmax(86px, 1.4fr)"), ...foldStyle } as React.CSSProperties}>
        {head(true)}
        {clanRow && <PcRow row={clanRow} clan tier={tier} noWpa={noWpa} mobile races={races} rankPts={rankPts} />}
        {rows.map((r) => <PcRow key={r.member.id} row={r} tier={tier} noWpa={noWpa} mobile races={races} rankPts={rankPts} />)}
      </div>
      </div>
      </div>
      {popEl}
      </VoteCtx.Provider>
      </TrendCtx.Provider>
    );
  }
  return (
    <TrendCtx.Provider value={ctx}>
    <VoteCtx.Provider value={vote}>
    {hcolCss && <style>{hcolCss}</style>}
    {/* ★ 가로 스크롤(2026-11-06, 요청: "폭 최소 폭 늘리고 화면 좁으면 스크롤 생기게") — 칸 최소 폭 유저 150 → 170 · 값 50 → 60px. 그 합이 화면보다 넓으면 표 감싸개가 가로로 민다.
        종족별을 접은 표(is-fold · 종합만 보임)는 감춘 칸까지 밀리지 않게 가로 넘침을 숨긴다. */}
    {/* 칸 최소 폭 60 → 52 · 유저 170 → 150(2026-11-08 밤, 지적: "1920 을 꼭 못 채움" — 묶음 여덟 칸 × 넷 = 32 칸이라 60px 이면 2090 으로 1920 화면(본문 1863)을 넘어 늘 가로로 밀렸다 · 150 + 32 × 52 = 1814). */}
    {/* ★ 칸 조금 타이트하게(2026-11-17, 요청: "통계 화면 폭 1600으로 · 컬럼폭도 조금 타이트해져야") — 화면 폭 1800 → 1600 과 함께 최소 폭 유저 150 → 140(1.6fr → 1.4fr) ·
        WPA/티어 76 → 72 · 값 칸 52 → 50(승률 "76.5 %" 가 여백 5 · 5 안에 들게) · 종합 첫 칸(다이얼) 94 → 90 — 펼친 표 최소 1286 → 1228px(좁은 노트북에서도 덜 민다). */}
    <div className={cx("scr-sg-scroll", !showRaces && "is-fold")} ref={scrollRef} style={scrollStyle}>
    <div className="scr-sg-sizer" style={sizerStyle}>
    <div className={cx("scr-sg is-race9", tier && "has-tier", !showRaces && "is-fold", hcell !== null && "is-hcol")} role="table" aria-label="통계" {...hcolProps} ref={gridRef}
      style={{ gridTemplateColumns: colsOf("minmax(140px, 1.4fr)", "minmax(72px, 1.2fr)", "minmax(50px, 1fr)", "minmax(90px, 1.4fr)"), ...foldStyle }}>
      {head(false)}
      {clanRow && <PcRow row={clanRow} clan tier={tier} noWpa={noWpa} races={races} rankPts={rankPts} />}
      {rows.map((r) => <PcRow key={r.member.id} row={r} tier={tier} noWpa={noWpa} races={races} rankPts={rankPts} />)}
    </div>
    </div>
    </div>
    {popEl}
    </VoteCtx.Provider>
    </TrendCtx.Provider>
  );
}

/** 종족구성별 전적 — 위 표와 같은 꼴(머리 줄 · 칸 선 · 2026-10-20, 요청: "종족구성별 전적 부분도 예쁘게 테마에 맞춰"). */
/** 판이 이만큼 이하인 구성은 줄째 연하게(2026-11-18 · 아래 CompGrid ★). */
const COMP_FEW = 5;
/* ★ 종족구성별 전적 = 동일구성 제외만(2026-11-18, 요청: "동일구성 포함은 보여줄 의미가 없어 보임 · 그냥 동일구성 제외로 보여주고 머리 헤더 제거") — [구성 | 경기 | 승률] 한 줄 머리.
   경기 · 승률 = 같은 구성끼리 맞붙은 판(3프 vs 3프 …)을 뺀 것(ClanStatsScreen CompRecords ★ — 차례도 그 승률로). 판이 다섯 이하인 구성은 줄째 연하게.
   옛(같은 날): 묶음 머리 두 줄 [동일구성 제외 · 포함] × [경기 · 승률] → 그 전 [경기 | 승률 | 동일구성 제외 승률]. */
export function CompGrid({ rows }: { rows: { label: string; plays: number; winRate: number | null }[] }) {
  return (
    <section className="scr-sg-comp-wrap" aria-label="종족구성별 전적">
      <h3 className="scr-sg-title">종족구성별 전적<span className="scr-sg-title-note">같은 구성끼리 붙은 판은 빼고 셌어요</span></h3>
      {rows.length === 0 ? <p className="scr-clan-panel-empty">기록이 없어요</p> : (
        <div className="scr-sg scr-sg-comp" role="table">
          <div className="scr-sg-row scr-sg-head" role="row">
            <span className="scr-sg-c scr-sg-who">종족 구성</span>
            <span className="scr-sg-c">경기</span>
            <span className="scr-sg-c">승률</span>
          </div>
          {rows.map((c) => (
            <div key={c.label} className={cx("scr-sg-row", c.plays <= COMP_FEW && "is-few")}>
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
