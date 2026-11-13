import InfoTip from "../../components/common/InfoTip";
import { Fragment, createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { StatTrendPop, calcRowOf, combinedTier, gainOf, partOf, pctFmt, prodOf, statMetric, wpaFmt, wpaOf, type CalcKey, type StatMetric, type StatRace, type StatTrendData, type TrendAnchor, type TrendFact } from "./StatTrend";
import Avatar from "../../components/common/Avatar";
import PhotoViewer from "../../components/common/PhotoViewer";
import { useAppStore } from "../../store/appStore";
import { cx } from "../../utils/format";
import type { BaseRace, Member, MemberStats, TierCalcRow, TierEntry } from "../../types";

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
export type StatSortKey = "tier" | "rate" | "plays" | "wpa" | "apm" | "eapm" | `${StatRace}:${"tier" | "rate" | "plays" | "wpa" | "apm" | "eapm"}`;
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
  /** 종합 티어(2026-11-07 · 서버가 주종족 판으로 · 셈 표까지 · sg-api tier) — 없으면 종족 표를 합친다. */
  tier?: TierEntry | null;
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
  /* 그 종족의 게임수 · 승률 · 전투 · APM · EAPM 을 앞에(같은 날 "좁은 폰 — 터치 시 판수 · 교환비 · 승률 · APM 등등 나오고") — 좁은 폰은 이 칸 하나뿐이라. */
  /* 셈 표(calc · 2026-11-06 저녁)가 있으면 근거값 줄은 아예 안 보인다(2026-11-07, 요청: "이 부분은 딱히 안 보여줘도 될 듯" — 표에 다 있다). 표가 없는 옛 응답이면 종전대로. */
  const facts = t.calc ? [] : [...(more ?? []), ...tierFacts(t).filter((f) => f.label !== "EAPM" || !more?.some((x) => x.label === "EAPM"))];
  if (t.tier === null) {
    /* ★ 등급 없는 사람(판이 문턱 아래)은 지금 인분(2026-11-13, 요청: "티어 없는 사람은 현재 인분 점수 표시") — 옛: "-". 서버 인분은 이미 둘째 자리 자름(shown_inbun). */
    const ib = t.stdInbun ?? t.inbun;
    return (
      <TCell member={member} metric={metric} facts={facts} calc={t.calc} className={cl}>
        {typeof ib === "number" ? <span className="scr-sg-inbun-pend">{ib.toFixed(2)}</span> : <Dash />}
      </TCell>
    );
  }
  return (
    <TCell member={member} metric={metric} facts={facts} calc={t.calc} className={cl}>
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
  if (typeof t.cbt === "number") out.push({ label: "전투 보정", value: pctOf(t.cbt) });   // 교환이익(준 − 입은 · 팀 싸움 양으로 나눔 · 2026-11-06 저녁 "이름도 전투로")
  // 생산 보정은 걷었다(2026-11-07 "뽑기만 많이 뽑고 전투를 못한 건 의미 없어" · 칸도 뺌).   // 같은 편보다 병력을 더 · 덜 뽑은 정도(2026-11-06 · sg-api tier W_PROD)
  if (typeof t.adj === "number") out.push({ label: "승패 보정", value: pctOf(t.adj) });
  return out;
}

const Dash = () => <span className="scr-sg-dim">-</span>;
/** WPA 머리 툴팁(2026-11-13, 요청: "WPA에만 툴팁 · 아주 간단히"). */
/* ★ 인분 풀이(2026-11-13, 요청: "WPA 마우스 오버 설명에 인분에 대한 설명 있어야 할 듯") — 티어 조회의 WPA 칸은 인분(배수)이라 %p 만 적으면 값과 안 맞았다. */
const WPA_TIP = "WPA — 우리 편이 이길 확률을 얼마나 올렸는지예요.\n숫자는 인분이에요. 1.00이면 평균만큼, 1.20이면 평균보다 20% 더 한 거예요.\n티어가 없는 조회에선 판당 점수로 보여요(1점 = 이길 확률 1%).";

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
  const [dfn, atk, jn, ctl, sct] = t?.wpaInbun ?? [];
  const ib = (x: number) => `${x.toFixed(2)}인분`;
  if (typeof dfn === "number") out.push({ label: "방어", value: ib(dfn) });
  if (typeof atk === "number") out.push({ label: "공격", value: ib(atk) });
  if (typeof jn === "number") out.push({ label: "합류", value: ib(jn) });
  /* ★ 장악 · 정찰(2026-11-13, 지적: "비전투성 병력 운용 · 정찰의 효과가 누락" · "WPA 팝업에 장악 정찰도") — 한 자리를 지켜 막은 정도 · 상대 건물을 본 정도(sg-api wpa ★ · 덤퍼 ##ZONE##).
     ★ 장악은 상대 쪽 절반에서 지킨 것만(같은 날 "무조건 상대 본진 앞에 둔다고 좋은 게 아닌 게 그사이 내 기지는 비어서 견제나 드랍에 취약해" — sg-api wpa ★ 공격 · 수비 장악:
     이기는 데 도움이 됐는지를 그 달 데이터로 재 오르거나 내린다 · 우리 쪽 수비는 승리 확률 모형에만). 공격 장악을 가르는 새 덤퍼로 다시 분석한 달만 값이 움직인다(옛 판뿐이면 1.00 언저리). */
  if (typeof ctl === "number") out.push({ label: "장악", value: ib(ctl) });
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
function RaceCells({ s, t, race, member, clan, tier, mobile, main }: { s?: MemberStats | null; t?: TierEntry | null; race: BaseRace | null; member?: Member; clan?: boolean; tier?: boolean; mobile?: boolean; main?: boolean }) {
  const has = !!s && s.plays > 0;
  /* 주종족 묶음은 늘 옅은 배경(같은 날 "주종족에 배경 포인트 깔기 · 호버랑 무관하게" · sg-api mainRaces = 그 조회 판의 30% 이상 종족). */
  const mc = main ? "is-main" : "";
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
      {tier && <TierCell t={clan ? null : t} member={clan ? undefined : member} race={race ?? undefined} className={cx("scr-sg-gstart", m)} more={has ? raceFacts(s!, t) : undefined} />}
      <TCell member={member} metric={statMetric("plays", race)} className={cx(!tier && "scr-sg-gstart", tier ? wide : m)}><Num v={has ? s!.plays.toLocaleString() : null} /></TCell>
      <TCell member={member} metric={statMetric("rate", race)} className={wide}>{!has ? <Dash /> : <Rate s={s!} />}</TCell>
      {/* WPA(2026-11-12 ★ WpaCell) — 옛 교환 이득 · 교전 참여 · 생산(2026-11-08 밤) 세 칸 자리. 평균 줄은 사람 몫이라 없다(-). */}
      {cell("wpa", has && !clan ? <WpaCell t={t} /> : <Dash />)}
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
        {/* (걷음 · 2026-11-09, 요청: "좁은 폰도 피시랑 똑같이 표시하고 스크롤") 좁은 폰만의 전체 게임수 칸(scr-sg-mnarrow) — 이제 모든 폰이 PC 칸을 다 쓰고 가로로 민다. */}
        {/* 종합(2026-11-04, 요청: "통계에 기본은 종합(전체 종족 평균)") — 전체 판 · 종합 티어(평균 줄은 티어 없음). */}
        {/* 종합 티어 — 서버가 주종족 판으로 낸 것(row.tier · 셈 표까지 · 2026-11-07) 먼저 · 없으면(옛 응답) 종족 표를 합친다. */}
        <RaceCells s={row.stats} t={clan ? null : row.tier ?? combinedTier(row.tierByRace)} race={null} member={who} clan={clan} tier={tier} mobile={mobile} />
        {races.map((r) => <RaceCells key={r} s={row.byRace?.[r]} t={row.tierByRace?.[r]} race={r} member={who} clan={clan} tier={tier} mobile={mobile} main={!clan && !!row.mainRaces?.includes(r)} />)}
      </div>
  );
}

/* (걷음 2026-11-13, 요청: "통계 전체 툴팁은 제거하고 WPA에만 툴팁 넣기 · 아주 간단히") 통계 표 도움말 단추(StatHelp · 티어 풀이) — WPA 머리 툴팁 한 줄만 남긴다(아래 head). */
/** ★ "WPA란?" 글 단추(2026-11-13, 요청: "예전 통계 툴팁 아이콘 자리에 텍스트 버튼 WPA란? 추가 · 툴팁 뜨고 WPA 뜻과 항목별로 어떻게 하면 점수를 얻고 잃는지") —
 *  정렬 줄 오른끝(옛 StatHelp 자리) · PC 는 얹으면 · 폰은 누르면. 항목은 WPA 팝업과 같은 차례(방어 · 공격 · 합류 · 장악 · 정찰 · sg-api wpa.py · tier._wpa_inbun).
 *  ★ 공통 풀이는 모두 구분선 위(같은 날, 요청: "wpa툴팁에서 상세항목들 위의 공통해당 내용은 모두 구분선 위로 넣기") — 아래는 항목만. */
export function WpaHelp() {
  return (
    <InfoTip
      hover trigger="WPA란?" triggerClassName="scr-infotip scr-infotip-text scr-sg-help-btn scr-sg-wpa-help" bubbleClassName="scr-sg-help"
      text={(
        <span className="scr-sg-help-list">
          {/* ★ 머리(2026-11-13, 요청: "WPA(Win P... 이렇게 풀어쓴거부터 시작하고 아랫줄에 간단 설명 하고 구분선 넣고 그 아랫줄부터 상세 설명") */}
          <b className="scr-sg-help-title">WPA(Win Probability Added)</b>
          <span>내 플레이로 우리 편이 이길 확률이 얼마나 올랐는지예요.</span>
          <span>팽팽할 때 한 플레이일수록 크게 쳐요.</span>
          <span><b>인분</b> — 1.00이면 평균만큼 한 거예요. 1.20이면 20% 더, 0.80이면 20% 덜이에요. 판이 적으면 1에 가깝게 나와요.</span>
          <span>항목 인분을 다 곱하면 WPA 인분이 돼요.</span>
          <span className="scr-sg-help-sep" aria-hidden="true" />
          <span><b>공격</b> 상대 병력 · 일꾼 · 건물을 잡으면 올라요.</span>
          <span><b>방어</b> 내 걸 잃으면 내려가요. 덜 잃을수록 좋아요.</span>
          <span><b>합류</b> 우리 편이 머릿수에서 밀려 싸울 때, 비어 있던 내가 안 가면 내려가요.</span>
          <span><b>장악</b> 상대 쪽에서 한 자리를 1분 넘게 지키면, 그게 이기는 데 도움이 됐는지에 따라 오르거나 내려가요. 우리 쪽에서 지킨 건 안 쳐요.</span>
          <span><b>정찰</b> 상대 건물을 보고 있으면 올라요.</span>
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
  const per = tier ? 6 : 5;   // 2026-11-12 WPA 한 칸(옛 8 : 7 — 교환 이득 · 교전 참여 · 생산 · 그 전 6 : 5)
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
  const SUBS: readonly (readonly ["티어" | "게임수" | "승률" | "WPA" | "APM" | "EAPM", "tier" | "plays" | "rate" | "wpa" | "apm" | "eapm"])[] =
    [...(tier ? [["티어", "tier"] as const] : []), ["게임수", "plays"], ["승률", "rate"], ["WPA", "wpa"], ["APM", "apm"], ["EAPM", "eapm"]];
  const head = (m: boolean) => (
    <div className="scr-sg-row scr-sg-head" role="row">
      <span className="scr-sg-c scr-sg-who scr-sg-h2">유저</span>
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
              <span key={k} className={cx("scr-sg-c scr-sg-hsub", i === 0 && "scr-sg-gstart", m && "scr-sg-race-head", wideOnly && "scr-sg-mwide")}
                title={k === "wpa" ? WPA_TIP : undefined}>
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
      {/* 넓은 폰 · 태블릿도 가로 스크롤(2026-11-06, 지적: "모바일 레이아웃인데 PC 로 나오는 구간에서 너무 비좁네") — 칸 최소 폭을 키우고 넘치면 감싸개가 민다(PC 와 같은 .scr-sg-scroll). */}
      <div className={cx("scr-sg-scroll", !showRaces && "is-fold")} ref={scrollRef} style={scrollStyle}>
      <div className="scr-sg-sizer" style={sizerStyle}>
      <div className={cx("scr-sg is-m is-race9", tier && "has-tier", !showRaces && "is-fold", hcell !== null && "is-hcol")} role="table" aria-label="통계" {...hcolProps} ref={gridRef}
        style={{ "--ncw": groups.length * per, ...foldStyle } as React.CSSProperties}>
        {head(true)}
        {clanRow && <PcRow row={clanRow} clan tier={tier} mobile races={races} />}
        {rows.map((r) => <PcRow key={r.member.id} row={r} tier={tier} mobile races={races} />)}
      </div>
      </div>
      </div>
      {popEl}
      </TrendCtx.Provider>
    );
  }
  return (
    <TrendCtx.Provider value={ctx}>
    {hcolCss && <style>{hcolCss}</style>}
    {/* ★ 가로 스크롤(2026-11-06, 요청: "폭 최소 폭 늘리고 화면 좁으면 스크롤 생기게") — 칸 최소 폭 유저 150 → 170 · 값 50 → 60px. 그 합이 화면보다 넓으면 표 감싸개가 가로로 민다.
        종족별을 접은 표(is-fold · 종합만 보임)는 감춘 칸까지 밀리지 않게 가로 넘침을 숨긴다. */}
    {/* 칸 최소 폭 60 → 52 · 유저 170 → 150(2026-11-08 밤, 지적: "1920 을 꼭 못 채움" — 묶음 여덟 칸 × 넷 = 32 칸이라 60px 이면 2090 으로 1920 화면(본문 1863)을 넘어 늘 가로로 밀렸다 · 150 + 32 × 52 = 1814). */}
    <div className={cx("scr-sg-scroll", !showRaces && "is-fold")} ref={scrollRef} style={scrollStyle}>
    <div className="scr-sg-sizer" style={sizerStyle}>
    <div className={cx("scr-sg is-race9", tier && "has-tier", !showRaces && "is-fold", hcell !== null && "is-hcol")} role="table" aria-label="통계" {...hcolProps} ref={gridRef}
      style={{ gridTemplateColumns: `minmax(150px, 1.6fr) repeat(${groups.length * per}, minmax(52px, 1fr))`, ...foldStyle }}>
      {head(false)}
      {clanRow && <PcRow row={clanRow} clan tier={tier} races={races} />}
      {rows.map((r) => <PcRow key={r.member.id} row={r} tier={tier} races={races} />)}
    </div>
    </div>
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
