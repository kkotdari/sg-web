import { Fragment, createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowDownWideNarrow, ArrowUpDown } from "lucide-react";
import { StatTrendPop, exOf, statMetric, type StatMetric, type StatRace, type StatTrendData, type TrendAnchor, type TrendFact } from "./StatTrend";
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
export type StatSortKey = "tier" | "rate" | "plays" | "exr" | "ex" | "apm" | "eapm" | `${StatRace}:${"rate" | "plays" | "exr" | "apm" | "eapm"}`;
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
  /** 주종족 판을 합친 줄 · 주종족(2026-11-04 · sg-api main · mainRaces). */
  main?: MemberStats | null;
  mainRaces?: BaseRace[] | null;
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
  return <span className="scr-sg-dmg" title="보정 교환비 — 준 ÷ 입은 데미지에서 종족 차이 · 센 상대에게 밑진 몫을 뺀 값(1.00 = 보통 · 티어가 쓰는 값)"><b>{x.toFixed(2)}</b></span>;
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

/* (걷음 · 2026-11-03) RaceCells — 종족 두 칸[게임수 | 승률]. PC 는 이제 묶음 다섯 칸(아래 GroupCells) · 폰은 MobileRow 가 제 칸을 쓴다. */
/** PC 묶음(전체 · 종족 셋) — 고르기 체크박스(StatGrid grpOn ★)가 보일 것을 정한다. */
/* ★ 주종족 묶음(2026-11-04, 요청: "표도 전체 컬럼 앞에 주종족 컬럼들 추가 · 모바일은 전체 대신 주종족") — 그 조회 판의 30% 이상을 한 종족(여러 개 가능)의 판을 합친 다섯 칸.
   게임수 칸 앞에 주종족 글자(T · P · Z)를 작게. 티어도 이 판으로만 낸다(sg-api tier MAIN_ONLY). */
type PcGroup = "주종족" | "전체" | BaseRace;
const RACE_LETTER: Record<BaseRace, string> = { 테란: "T", 프로토스: "P", 저그: "Z" };
/** 주종족 글자 — 게임수 칸 앞(위 ★). */
const Mains = ({ rs }: { rs?: BaseRace[] | null }) => (rs && rs.length ? <i className="scr-sg-mains" title={`주종족: ${rs.join(" · ")}`}>{rs.map((r) => RACE_LETTER[r]).join("")}</i> : null);
/* ★ 보기 모드(2026-11-04, 요청: "보는 걸 라디오 버튼으로 — 주종/전체 · 각종족 이 두 개로 나눌게 · 지금 종족 체크박스 대신" · "각종족 보기 모드야 이름이") —
   주종/전체 = [주종족 · 전체] 두 묶음을 폭의 2/3 만 왼쪽부터 · 각종족 = [테란 · 프로토스 · 저그] 세 묶음을 온 폭(칸 폭이 두 모드에서 같아 한 묶음이 덧붙는 느낌). */
type PcView = "main" | "race";
const VIEW_STORE = "sg-stat-view";
const VIEW_GROUPS: Record<PcView, readonly PcGroup[]> = { main: ["전체", "주종족"], race: RACES };   // 전체 → 주종족 차례(같은 날 "전체/주종족으로 순서 변경(칸도)")
/** ★ PC 묶음 다섯 칸(2026-11-03, 요청: "통계 피시버전만 — 경기수/승률/교환비/APM/EAPM 다섯 컬럼을 똑같이 전체/테란/프로토스/저그 반복 · 칸 모양도 똑같이 · 폭 넓히고") —
 *  [게임수 | 승률 | 교환비(날 값) | APM | EAPM] 을 전체 · 종족마다 같은 꼴로. 보정교환비 칸은 PC 에서 걷었다(티어 팝업 근거값에 남는다). 묶음 첫 칸은 왼 선(scr-sg-gstart).
 *  평균 줄: 전체 게임수 = 경기 수 · 전체 승률 "-" · 종족 승률은 쓴다(그 종족으로 뛴 클랜원 판).
 *  교환비도 쓴다(2026-11-04, 요청: "평균 로우의 교환비가 다 비어 있잖아 거기 채워줘") — 클랜원 판을 다 더한 준 ÷ 입은 데미지(전체는 내전이라 1 근처 · 종족은 그 종족의 주고받기). */
function GroupCells({ s, race, member, clan, games, mains }: { s?: MemberStats | null; race: StatRace | null; member?: Member; clan?: boolean; games?: number; mains?: BaseRace[] | null }) {
  const has = !!s && s.plays > 0;
  const mOf = (k: "plays" | "rate" | "exr" | "apm" | "eapm") => (clan && k === "rate" && !race ? undefined : member);
  const playsV = clan && !race ? (games ?? 0).toLocaleString() : has ? s!.plays.toLocaleString() : null;
  return (
    <>
      <TCell member={mOf("plays")} metric={statMetric(clan && !race ? "games" : "plays", race)} className="scr-sg-gstart">{race === "주종족" && has && <Mains rs={mains} />}<Num v={playsV} /></TCell>
      <TCell member={mOf("rate")} metric={statMetric("rate", race)}>{(clan && !race) || !has ? <Dash /> : <Rate s={s} />}</TCell>
      <TCell member={mOf("exr")} metric={statMetric("exr", race)}>{!has ? <Dash /> : <ExRaw s={s!} />}</TCell>
      <TCell member={member} metric={statMetric("apm", race)}><Num v={has ? s!.avgApm : null} /></TCell>
      <TCell member={member} metric={statMetric("eapm", race)}><Num v={has ? s!.avgEapm : null} /></TCell>
    </>
  );
}

function PcRow({ row, clan, games, tier, groups }: { row: StatGridRow; clan?: boolean; games?: number; tier?: boolean; groups: readonly PcGroup[] }) {
  /* 평균 줄도 변화 그래프(2026-10-25, 요청: "통계의 평균행에도 상세 팝업 붙여야지") — 평균 줄의 회원은 빈 id(StatTrend CLAN_MEMBER_ID). */
  const who = row.member;
  return (
      <div className={cx("scr-sg-row", clan && "is-clan")}>
        <span className="scr-sg-c scr-sg-who">
          {clan ? <span className="scr-sg-name scr-sg-name-plain">{CLAN_LABEL}</span> : <Who member={row.member} />}
        </span>
        {tier && <TierCell t={clan ? null : row.tier} member={clan ? undefined : who} />}
        {groups.map((g) => (g === "전체"
          ? <GroupCells key={g} s={row.stats} race={null} member={who} clan={clan} games={games} />
          : g === "주종족"
            ? <GroupCells key={g} s={row.main} race={g} member={who} clan={clan} mains={clan ? null : row.mainRaces} />
            : <GroupCells key={g} s={row.byRace?.[g]} race={g} member={who} clan={clan} />))}
      </div>
  );
}

function MobileRow({ row, clan, games, tier }: { row: StatGridRow; clan?: boolean; games?: number; tier?: boolean }) {
  /* 폰은 전체 대신 **주종족** 판(2026-11-04 · 위 PC_GROUPS ★) — 주종족 줄이 없으면(옛 응답) 전체. 평균 줄도 사람마다 제 주종족 판을 합친 줄. */
  const MR: StatRace | null = row.main ? "주종족" : null;
  const s = row.main ?? row.stats;
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
      {/* ★ 좁은 폰(600px 이하 · scr-sg-mnarrow)만: 보정교환비 · EAPM(APM 을 겹친 그래프) 이 앞. 넓은 폰은 **PC 와 같은 칸 · 같은 차례**(2026-10-29, 요청: "피시와 넓은 폭
          폰의 컬럼을 PC 기준으로 똑같이 통일") — 게임수 · 승률 뒤에 교환비 · 보정교환비 · APM · EAPM(scr-sg-mwide). 칸을 두 벌 두고 CSS 가 폭으로 고른다(격자 차례는 못 바꾼다). */}
      <TCell member={clan ? undefined : who} metric={statMetric("ex")} className="scr-sg-mnum scr-sg-mnarrow">{clan ? <Dash /> : <Ex t={row.tier} />}</TCell>
      {/* 폰은 APM 대신 EAPM(2026-10-28, 요청: "모바일은 EAPM 컬럼만" — 옛: APM). */}
      <TCell member={who} metric={MR ? statMetric("eapm", MR) : statMetric("eapmApm")} className="scr-sg-mnum scr-sg-mnarrow">{s.avgEapm ?? <Dash />}</TCell>
      {/* ★ 전적은 게임수 · 승률 **두 칸**(2026-10-28, 요청: "좁은 폰의 경우 게임수와 승률 두 칸으로 나눠서 표시 · 팝업도" → "넓은 폰도 게임수 승률 나누기") — 팝업도
          칸마다(PC 게임수 · 승률 칸과 같은 그래프). 평균 줄은 게임수 = 경기 수 · 승률은 "-"(PC 평균 줄과 같게). 넓은 폰(600px 넘게)은 종족마다 [게임수 | 승률]도
          (PC RaceCells 와 같게 · scr-sg-mwide) — 좁은 폰은 종족 칸이 숨는다(CSS). 옛: 한 칸에 위 판수 · 아래 승률(MCell). */}
      <TCell member={who} metric={statMetric(clan && !MR ? "games" : "plays", MR)} className="scr-sg-mnum">
        {clan && !MR ? (games ?? 0).toLocaleString() : s.plays > 0 ? <>{!clan && <Mains rs={row.mainRaces} />}{s.plays.toLocaleString()}</> : <Dash />}
      </TCell>
      <TCell member={clan && !MR ? undefined : who} metric={statMetric("rate", MR)} className="scr-sg-mnum">
        {(clan && !MR) || s.plays === 0 ? <Dash /> : `${s.winRate}%`}
      </TCell>
      <TCell member={who} metric={statMetric("exr", MR)} className="scr-sg-mnum scr-sg-mwide"><ExRaw s={s} /></TCell>
      <TCell member={clan ? undefined : who} metric={statMetric("ex")} className="scr-sg-mnum scr-sg-mwide">{clan ? <Dash /> : <Ex t={row.tier} />}</TCell>
      <TCell member={who} metric={statMetric("apm", MR)} className="scr-sg-mnum scr-sg-mwide">{s.avgApm ?? <Dash />}</TCell>
      <TCell member={who} metric={statMetric("eapm", MR)} className="scr-sg-mnum scr-sg-mwide">{s.avgEapm ?? <Dash />}</TCell>
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
            <span className="scr-sg-help-h">유저</span><span className="scr-sg-help-h">보정교환비</span><span className="scr-sg-help-h">EAPM</span><span className="scr-sg-help-h">주종족</span>
            <span className="scr-sg-help-who"><b>닉네임</b></span>
            <span className="scr-sg-help-rec"><b>1.25</b></span>
            <span className="scr-sg-help-rec"><b>230</b></span>
            <span className="scr-sg-help-rec"><b>68</b><i>54%</i></span>
          </span>
          <span className="scr-sg-help-list">
            <span>보정교환비 — <b>1.25</b> 준 ÷ 입은 데미지에서 종족 차이 · 센 상대에게 밑진 몫을 뺀 값(1보다 크면 주고받기에서 이김 · 티어가 쓰는 값) · 누르면 변화</span>
            <span>EAPM — 분당 유효 행동 수 평균(같은 명령 연타 · 헛클릭을 뺀 APM)</span>
            <span>티어(팀전) — 이 사람이 보통 몇 인분을 하나로 매기는 1~4 등급 · 인분 = EAPM ÷ 120 × 교환비 보정(센 상대에게 밑진 몫은 덜 깎고 · 종족 차이는 빼고) × 승패 보정(같은 편·상대 편으로 예상한 것보다 더/덜 이긴 만큼 · 그 기간 판으로) · 편의 힘은 센 사람에게 무게를 더 줘서 1티어 한 명이 크게 쳐요 · 1.6인분 이상 1티어 · 1.00 이상 2티어 · 0.80 이상 3티어 · 그 아래 4티어(절대 기준이라 빈 등급도 있어요) · 팀전 전체 · 맵 전체 조회에서만 보여요 · 그 기간 판만 써서 지난 달 티어는 뒤 판에 안 바뀌어요 · 얹거나 누르면 달별 변화와 근거값 · 열 판 미만은 -</span>
            <span><b>68</b> 게임수 · <i>54%</i> 승률 — 주종족(그 기간 판의 30% 이상을 한 종족 · 여러 개일 수 있어요 · 게임수 앞 글자 T · P · Z) 판만</span>
            <span>넓은 화면(가로 · 태블릿)은 PC 와 같은 칸 — 게임수 · 승률 · 교환비(보정 전 · 누르면 딜 · 피해 변화도) · 보정교환비 · APM · EAPM · 종족별 게임수 · 승률</span>
            <span>머리를 누르면 그 기준으로 정렬 — 전체 · 종족 머리는 승률 → 게임수 → 끔. 정렬 줄의 '복수 기준'을 켜면 누른 차례대로 여러 기준이 쌓여요</span>
            <span>값을 누르면 다섯 달 변화 그래프(여러 달 조회는 그 기간 · 전체 기간은 최근 다섯 달)</span>
          </span>
        </>
      ) : (
        <span className="scr-sg-help-list">
          <span>교환비 — 준 데미지 ÷ 입은 데미지(보정 전 · 1.00 보다 크면 주고받기에서 이김) · 얹으면 교환비와 <b className="is-dealt">딜</b> · <b className="is-taken">피해</b>(그 경기 참가자 평균의 몇 배) 변화</span>
          <span>보정교환비 — 준 데미지 ÷ 입은 데미지에서 종족 차이 · 센 상대에게 밑진 몫을 뺀 값(1.00 보다 크면 주고받기에서 이김 · 티어가 쓰는 값)</span>
          <span>APM — 분당 행동 수 평균 · EAPM — 그중 유효 행동(같은 명령 연타 · 헛클릭을 뺌)</span>
          <span>티어 — 이 사람이 보통 몇 인분을 하나로 매기는 1~4 등급 · 인분 = EAPM ÷ 120 × 교환비 보정(센 상대에게 밑진 몫은 덜 깎고 · 종족 차이는 빼고) × 승패 보정(같은 편·상대 편으로 예상한 것보다 더/덜 이긴 만큼 · 그 기간 판으로) · 편의 힘은 센 사람에게 무게를 더 줘서 1티어 한 명이 크게 쳐요 · 1.6인분 이상 1티어 · 1.00 이상 2티어 · 0.80 이상 3티어 · 그 아래 4티어(절대 기준이라 빈 등급도 있어요) · 팀전 전체 · 맵 전체 조회에서만 보여요 · 그 기간 판만 써서 지난 달 티어는 뒤 판에 안 바뀌어요 · 얹거나 누르면 달별 변화와 근거값 · 열 판 미만은 -</span>
          <span>종족 칸 — 그 종족으로 뛴 게임수 · 승률</span>
          <span>주종족 — 그 기간 판의 30% 이상을 한 종족(여러 개일 수 있어요 · 게임수 앞 글자 T · P · Z)의 판을 합친 값</span>
          <span>전체 · 주종족 · 테란 · 프로토스 · 저그마다 같은 다섯 칸(게임수 · 승률 · 교환비 · APM · EAPM) · 머리를 누르면 그 기준으로 정렬 — 정렬 줄의 '복수 기준'을 켜면 누른 차례대로 여러 기준이 쌓여요</span>
          <span>값에 마우스를 얹으면 다섯 달 변화 그래프(여러 달 조회는 그 기간 · 전체 기간은 최근 다섯 달)</span>
        </span>
      )}
    />
  );
}

export default function StatGrid({ clan, clanGames, rows, mobile, sortKeys, onSortKeys, multi, trend, tier = false }: SortProps & {
  /** 클랜원 전체(맨 위 줄) — 없으면 안 선다. */
  clan: { stats: MemberStats; byRace?: Partial<Record<BaseRace, MemberStats>>; main?: MemberStats | null } | null;
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
  /** 폰 머리의 자 — 전체 대신 주종족 판(MobileRow ★ · 응답에 주종족 줄이 있으면). */
  const hasMain = rows.some((r) => !!r.main);
  const mk = (k: "plays" | "rate" | "exr" | "apm" | "eapm"): StatSortKey => (hasMain ? `주종족:${k}` : k);
  const clanRow: StatGridRow | null = clan ? { member: { id: "", nickname: CLAN_LABEL } as Member, stats: clan.stats, byRace: clan.byRace, main: clan.main } : null;
  /* PC 보기(위 VIEW_GROUPS ★) — 라디오 둘 · 브라우저에 기억(localStorage · 실패하면 주종족·전체). 옛 묶음 체크박스(2026-11-03)는 걷었다. */
  const [view, setView] = useState<PcView>(() => {
    try { const v = localStorage.getItem(VIEW_STORE); if (v === "main" || v === "race") return v; } catch { /* 기억 없음 */ }
    return "main";
  });
  const pickView = (v: PcView): void => { setView(v); try { localStorage.setItem(VIEW_STORE, v); } catch { /* 기억 못 함 */ } };
  const groups = VIEW_GROUPS[view];
  /** 주종/전체 표 폭 — 각종족(값 칸 15 + 유저 1.6fr)에서 값 칸 다섯을 뺀 비: (1.6 + 10) ÷ (1.6 + 15) · 티어 칸(56px)은 그대로. */
  const mainW = tier ? "calc(56px + (100% - 56px) * 11.6 / 16.6)" : "calc(100% * 11.6 / 16.6)";
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
  const valBase = 1 + (tier ? 1 : 0);
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
  useEffect(() => { setHPin(null); setHHover(null); }, [view, mobile, tier]);
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
  if (mobile) {
    return (
      <TrendCtx.Provider value={ctx}>
      {hcolCss && <style>{hcolCss}</style>}
      <div className={cx("scr-sg is-m", tier && "has-tier", hcell !== null && "is-hcol")} role="table" aria-label="통계" {...hcolProps}>
        {/* 머리 두 줄 — 유저 칸은 두 줄을 내리 쓰고 · 전적은 전체·종족 넷을 덮는다. 뜻 풀이는 정렬 줄의 도움말 단추(StatHelp)로 옮겼다(2026-10-22, 요청: "헤더 설명 다 제거 · 도움말 아이콘 툴팁에 표 모양과 설명"). */}
        <div className="scr-sg-row scr-sg-head" role="row">
          <span className="scr-sg-c scr-sg-who scr-sg-h2">유저</span>
          {tier && <span className="scr-sg-c scr-sg-h2 scr-sg-hnarrow"><SortHead {...mToggle("tier")}>티어</SortHead></span>}
          {/* 교환비 칸(MobileRow ★) — 머리도 "교환비" · 교환비로 정렬(2026-10-28 · 옛: "데미지" · 교환비 → 데미지 → 끔). */}
          <span className="scr-sg-c scr-sg-h2 scr-sg-hnarrow scr-sg-mnarrow"><SortHead {...mToggle("ex")}><span>보정<br />교환비</span></SortHead></span>
          <span className="scr-sg-c scr-sg-h2 scr-sg-hnarrow scr-sg-mnarrow"><SortHead {...mToggle(mk("eapm"))}>EAPM</SortHead></span>
          {/* 게임수 · 승률 두 머리(MobileRow ★) · 넓은 폰은 종족 이름이 [게임수 | 승률] 두 칸을 덮는다(PC 머리와 같게 · 좁은 폰은 숨음). */}
          <span className="scr-sg-c scr-sg-h2 scr-sg-hnarrow"><SortHead {...mToggle(mk("plays"))}>게임수</SortHead></span>
          <span className="scr-sg-c scr-sg-h2 scr-sg-hnarrow"><SortHead {...mToggle(mk("rate"))}>승률</SortHead></span>
          {/* 넓은 폰 — PC 와 같은 차례(MobileRow ★). */}
          <span className="scr-sg-c scr-sg-h2 scr-sg-hnarrow scr-sg-mwide"><SortHead {...mToggle(mk("exr"))}>교환비</SortHead></span>
          <span className="scr-sg-c scr-sg-h2 scr-sg-hnarrow scr-sg-mwide"><SortHead {...mToggle("ex")}><span>보정<br />교환비</span></SortHead></span>
          <span className="scr-sg-c scr-sg-h2 scr-sg-hnarrow scr-sg-mwide"><SortHead {...mToggle(mk("apm"))}>APM</SortHead></span>
          <span className="scr-sg-c scr-sg-h2 scr-sg-hnarrow scr-sg-mwide"><SortHead {...mToggle(mk("eapm"))}>EAPM</SortHead></span>
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
    <div className="scr-sg-groups" role="radiogroup" aria-label="보기">
      {([["main", "전체/주종족"], ["race", "각종족"]] as const).map(([v, label]) => (
        <label key={v} className={cx("scr-sg-group-chk", view === v && "is-on")}>
          <input type="radio" name="scr-sg-view" checked={view === v} onChange={() => pickView(v)} />{label}
        </label>
      ))}
    </div>
    {hcolCss && <style>{hcolCss}</style>}
    <div className={cx("scr-sg", tier && "has-tier", hcell !== null && "is-hcol")} role="table" aria-label="통계" {...hcolProps}
      /* 주종/전체는 값 칸만 2/3(2026-11-04, 요청: "주종/전체라고 해서 폭을 다 쓰지 말고 2/3 만 왼쪽부터" → "각종족은 세 개고 주종족/전체는 두 개라 2/3 만 · 공통 부분 제외하고는") —
         유저(1.6fr) · 티어(56px) 칸은 각종족 보기와 같은 폭 · 값 칸 하나도 같은 폭이 되게 표 폭을 줄인다(아래 mainW). 각종족(세 묶음)은 온 폭. */
      style={{ gridTemplateColumns: `minmax(150px, 1.6fr)${tier ? " 56px" : ""} repeat(${groups.length * 5}, minmax(50px, 1fr))`, ...(view === "main" ? { width: mainW, marginRight: "auto" } : {}) }}>
      {/* 머리는 두 줄 — 종족 이름이 [게임수 | 승률] 두 칸을 덮고(PC 머리 "경기"·"전적" → "게임수" · 2026-10-22), 나머지 머리는 두 줄을 내리 쓴다(2026-10-20). 색 네모는 걷었다. */}
      <div className="scr-sg-row scr-sg-head" role="row">
        <span className="scr-sg-c scr-sg-h2 scr-sg-who">유저</span>
        {tier && <span className="scr-sg-c scr-sg-h2"><SortHead {...pcToggle("tier")}>티어</SortHead></span>}
        {/* 묶음 머리(전체 · 종족) — 다섯 칸을 덮는다 · 아랫줄은 묶음마다 같은 다섯 머리(위 GroupCells ★). */}
        {groups.map((g) => <span key={g} className="scr-sg-c scr-sg-hgroup scr-sg-hgroup5 scr-sg-gstart">{g}</span>)}
        {groups.map((g) => (g === "전체" ? null : g)).map((r) => (
          <Fragment key={r ?? "all"}>
            {([["게임수", "plays"], ["승률", "rate"], ["교환비", "exr"], ["APM", "apm"], ["EAPM", "eapm"]] as const).map(([h, k], i) => (
              <span key={k} className={cx("scr-sg-c scr-sg-hsub", i === 0 && "scr-sg-gstart")}><SortHead {...pcToggle(r ? (`${r}:${k}` as StatSortKey) : k)}>{h}</SortHead></span>
            ))}
          </Fragment>
        ))}
      </div>
      {clanRow && <PcRow row={clanRow} clan games={clanGames} tier={tier} groups={groups} />}
      {rows.map((r) => <PcRow key={r.member.id} row={r} tier={tier} groups={groups} />)}
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
