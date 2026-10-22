import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import Avatar from "../../components/common/Avatar";
import PhotoViewer from "../../components/common/PhotoViewer";
import InfoTip from "../../components/common/InfoTip";
import { useAppStore } from "../../store/appStore";
import { cx } from "../../utils/format";
import RaceCurves, { curveScale, GRAPH_FS, type CurveScale } from "./RaceCurves";
import type { BaseRace, Member, MemberStats } from "../../types";

/* ★★ 통계 = **표**(2026-10-20, 요청: "통계 PC 도 그리드로 · 클랜원 전체가 맨 위 로우 · 그 아래 개인별 한 로우씩" → 시안 A(한 줄 표)에
   C 의 승률 막대를 얹어(요청: "A에 C의 그래프를 시각적으로 도입")).
   PC: [유저 | 경기 | 승률 | APM | 데미지 | 테란·프로토스·저그 (전적 | 승률) | ▾] · 폰: [유저 | APM | 데미지 | 전적: 전체·종족 판수(승률)] · 폰은 줄을 눌러 편다(▾ 없음).
   PC 의 ▾ · 폰의 줄 누름은 모두 그 줄 아래에 **분당 곡선 두 판**(인구 · 일꾼 수, 세 종족 겹침 — RaceCurves)을 편다(2026-10-20, 요청: "펼친 부분 내용 변경 ·
   폰 피시 공통"). 옛 펼침(종족마다 유닛·스킬·공방업 글 · MixLines)과 폰의 '펼치기 없음'은 걷었다. 승률 막대(시안 C)도 걷었다. */

const RACES: BaseRace[] = ["테란", "프로토스", "저그"];

export interface StatGridRow {
  member: Member;
  stats: MemberStats;
  byRace?: Partial<Record<BaseRace, MemberStats>>;
}

const Dash = () => <span className="scr-sg-dim">-</span>;

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
  return (
    <span className="scr-sg-dmg" title="준·입은 데미지가 그 경기 참가자 평균의 몇 배인가(1.0배 = 평균)">
      <i>평균의</i><b className="is-dealt">{(d / 100).toFixed(1)}</b><i>배 딜</i>
      <span className="scr-sg-dim">/</span>
      <b className="is-taken">{(t / 100).toFixed(1)}</b><i>배 피해</i>
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

/** 폰 줄의 아바타·이름 — 단추가 아니다(2026-10-20, 요청: "폰 아바타·닉네임도 접기·펴기로 동작") · 누르면 줄이 펴지고 접힌다(사진·프로필은 안 연다). */
function WhoPlain({ member }: { member: Member }) {
  return (
    <>
      <span className="scr-sg-avatar"><Avatar member={member} size={28} /></span>
      <span className="scr-sg-name" title={member.nickname}>{member.nickname}</span>
    </>
  );
}

/** 종족 두 칸 — [전적 "30회" | 승률] (2026-10-20, 요청: "각 종족 컬럼을 두 컬럼으로 나눠 전적/승률" → "전적 몇 회로 단순화").
 *  클랜원 전체 줄도 종족 승률은 쓴다(요청: "클랜원 전체 종족별 승률 넣기" — 그 종족으로 뛴 클랜원 판의 승률). 전체 승률만 안 쓴다(내전이라 늘 반반). */
function RaceCells({ s }: { s?: MemberStats }) {
  if (!s || s.plays === 0) return <><span className="scr-sg-c"><Dash /></span><span className="scr-sg-c"><Dash /></span></>;
  return (
    <>
      <span className="scr-sg-c scr-sg-race"><Num v={s.plays.toLocaleString()} unit="전" /></span>
      <span className="scr-sg-c"><Rate s={s} /></span>
    </>
  );
}

function PcRow({ row, clan, games, openAll, scale }: { row: StatGridRow; clan?: boolean; games?: number; openAll: boolean; scale: CurveScale }) {
  const [open, setOpen] = useState(openAll);
  useEffect(() => { setOpen(openAll); }, [openAll]);
  const s = row.stats;
  return (
    <>
      <div className={cx("scr-sg-row", clan && "is-clan", open && "is-open")}>
        <span className="scr-sg-c scr-sg-who">
          {clan ? <span className="scr-sg-name scr-sg-name-plain">클랜원 전체</span> : <Who member={row.member} />}
        </span>
        <span className="scr-sg-c">
          {clan
            /* 클랜원 전체 = "1,180전 (212경기)" — 사람 몫을 다 더한 전적 + 경기 수(2026-10-20, 요청: "PC 전체 전적을 n전(n경기)로"). */
            ? <span className="scr-sg-v"><b>{s.plays.toLocaleString()}</b><i>전</i><i className="scr-sg-paren">({(games ?? 0).toLocaleString()}경기)</i></span>
            : <Num v={s.plays > 0 ? s.plays.toLocaleString() : null} unit="전" />}
        </span>
        <span className="scr-sg-c">{clan ? <Dash /> : <Rate s={s} />}</span>
        <span className="scr-sg-c"><Num v={s.avgApm} /></span>
        <span className="scr-sg-c">{clan ? <Dash /> : <Dmg s={s} />}</span>
        {RACES.map((r) => <RaceCells key={r} s={row.byRace?.[r]} />)}
        <span className="scr-sg-c">
          <button type="button" className="scr-text-btn scr-sg-toggle" aria-expanded={open} aria-label={open ? "접기" : "펼치기"} onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
          </button>
        </span>
      </div>
      {open && <div className="scr-sg-mix"><RaceCurves byRace={row.byRace} scale={scale} font={GRAPH_FS.pc} /></div>}
    </>
  );
}

/** 폰 전적 칸 — 위 판수 "N" · 아래 작고 옅은 승률 "N"(2026-10-22, 요청: "모바일 통계 단위 제거하고 전적은 N / (N%) 승률이 좀 작게" → "%도 제거" → "괄호 제거하고 연하게" — 머리에 "전적 게임수(승률)" 설명이 선다).
 *  그 종족 판이 없으면 "-". 클랜원 전체의 전체 칸은 아래가 경기 수(내전이라 승률은 늘 반반). 옛: "N전" · 이름표 "승률" · "N%". */
function MCell({ s, games, noRate }: { s?: MemberStats; games?: number; noRate?: boolean }) {
  if (!s || s.plays === 0) return <span className="scr-sg-c scr-sg-mrec"><Dash /></span>;
  return (
    <span className="scr-sg-c scr-sg-mrec">
      <span className="scr-sg-v"><b>{s.plays.toLocaleString()}</b></span>
      {games !== undefined
        ? <span className="scr-sg-mrate">{games.toLocaleString()}</span>
        : noRate ? <Dash /> : <span className="scr-sg-mrate">{s.winRate}</span>}
    </span>
  );
}

function MobileRow({ row, clan, games, openAll, scale }: { row: StatGridRow; clan?: boolean; games?: number; openAll: boolean; scale: CurveScale }) {
  const s = row.stats;
  const [open, setOpen] = useState(openAll);
  useEffect(() => { setOpen(openAll); }, [openAll]);
  /* 줄 어디를 눌러도 펼치기·접기(2026-10-20, 요청: "모바일 열 전체가 펼치기 접기로 작동" → "화살표 제거": ▾ 단추는 걷었다
     → "아바타·닉네임도 접기·펴기로": 폰은 WhoPlain — 줄 안에 단추가 없다).
     React 이벤트는 포털(사진 창)에서도 이 줄로 올라오므로 DOM 으로 줄 안에서 누른 것만 받는다. */
  const onRow = (e: React.MouseEvent<HTMLDivElement>): void => {
    const t = e.target as Element;
    if (!e.currentTarget.contains(t)) return;
    const btn = t.closest("button, a");
    if (btn) return;
    setOpen((v) => !v);
  };
  return (
    <>
    <div className={cx("scr-sg-row scr-sg-tap", clan && "is-clan", open && "is-open")} onClick={onRow}>
      <span className="scr-sg-c scr-sg-who">
        {clan ? <span className="scr-sg-name scr-sg-name-plain">클랜원 전체</span> : <WhoPlain member={row.member} />}
      </span>
      {/* APM · 데미지(초록 딜 위 · 빨강 피해 아래)는 제 칸(2026-10-22, 요청: "모바일도 APM · 데미지 컬럼으로 · 닉네임 최소 폭 줄여") — 옛: 닉네임 아래 한 줄 "APM 230 1.4 0.8".
          클랜원 전체는 데미지가 없다. */}
      <span className="scr-sg-c scr-sg-mnum">{s.avgApm ?? <Dash />}</span>
      <span className="scr-sg-c scr-sg-mnum">{clan ? <Dash /> : <Dmg s={s} compact />}</span>
      <MCell s={s} games={clan ? (games ?? 0) : undefined} noRate={clan} />
      {RACES.map((r) => <MCell key={r} s={row.byRace?.[r]} />)}
    </div>
    {open && <div className="scr-sg-mix"><RaceCurves byRace={row.byRace} scale={scale} font={GRAPH_FS.statsMobile} /></div>}
    </>
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
            <span className="scr-sg-help-h">유저</span><span className="scr-sg-help-h">APM</span><span className="scr-sg-help-h">데미지</span><span className="scr-sg-help-h">전체</span>
            <span className="scr-sg-help-who"><b>닉네임</b></span>
            <span className="scr-sg-help-rec"><b>230</b></span>
            <span className="scr-sg-help-rec"><b className="is-dealt">1.4</b><b className="is-taken">0.8</b></span>
            <span className="scr-sg-help-rec"><b>68</b><i>54</i></span>
          </span>
          <span className="scr-sg-help-list">
            <span>APM — 분당 행동 수 평균</span>
            <span>데미지 — <b className="is-dealt">1.4</b> 딜 · <b className="is-taken">0.8</b> 피해: 그 경기 참가자 평균 데미지 대비 비율(1.0 = 평균)</span>
            <span><b>68</b> 게임수 · <i>54</i> 승률(%) — 전체 · 종족별</span>
            <span>행을 누르면 종족별 인구 · 일꾼 수 그래프가 펼쳐져요</span>
          </span>
        </>
      ) : (
        <span className="scr-sg-help-list">
          <span>데미지 — 준 데미지(<b className="is-dealt">딜</b>) · 받은 데미지(<b className="is-taken">피해</b>)가 그 경기 참가자 평균의 몇 배인가(1.0배 = 평균)</span>
          <span>종족 칸 — 그 종족으로 뛴 전적 · 승률</span>
          <span>APM — 분당 행동 수 평균</span>
          <span>줄 끝 ▾ 를 누르면 종족별 인구 · 일꾼 수 그래프가 펼쳐져요</span>
        </span>
      )}
    />
  );
}

export default function StatGrid({ clan, clanGames, rows, openAll, mobile }: {
  /** 클랜원 전체(맨 위 줄) — 없으면 안 선다. */
  clan: { stats: MemberStats; byRace?: Partial<Record<BaseRace, MemberStats>> } | null;
  clanGames: number;
  rows: StatGridRow[];
  openAll: boolean;
  mobile: boolean;
}) {
  const clanRow: StatGridRow | null = clan ? { member: { id: "", nickname: "클랜원 전체" } as Member, stats: clan.stats, byRace: clan.byRace } : null;
  /* 펼친 곡선은 모든 줄이 한 자(눈금)를 쓴다(2026-10-20, 요청: "일꾼 수 100 · 병력 가치 5K 로 세로 눈금 똑같이 · 가로도 똑같이" → 인구 0~100). */
  const scale = curveScale([clanRow, ...rows].map((r) => r?.byRace));
  if (mobile) {
    return (
      <div className="scr-sg is-m" role="table" aria-label="통계">
        {/* 머리 두 줄 — 유저 칸은 두 줄을 내리 쓰고 · 전적은 전체·종족 넷을 덮는다. 뜻 풀이는 정렬 줄의 도움말 단추(StatHelp)로 옮겼다(2026-10-22, 요청: "헤더 설명 다 제거 · 도움말 아이콘 툴팁에 표 모양과 설명"). */}
        <div className="scr-sg-row scr-sg-head" role="row">
          <span className="scr-sg-c scr-sg-who scr-sg-h2">유저</span>
          <span className="scr-sg-c scr-sg-h2 scr-sg-hnarrow">APM</span>
          <span className="scr-sg-c scr-sg-h2 scr-sg-hnarrow">데미지</span>
          <span className="scr-sg-c scr-sg-hgroup scr-sg-hgroup4">전적</span>
          {["전체", ...RACES].map((r) => <span key={r} className="scr-sg-c scr-sg-hsub scr-sg-race-head">{r}</span>)}
        </div>
        {clanRow && <MobileRow row={clanRow} clan games={clanGames} openAll={openAll} scale={scale} />}
        {rows.map((r) => <MobileRow key={r.member.id} row={r} openAll={openAll} scale={scale} />)}
      </div>
    );
  }
  return (
    <div className="scr-sg" role="table" aria-label="통계">
      {/* 머리는 두 줄 — 종족 이름이 [전적 | 승률] 두 칸을 덮고, 나머지 머리는 두 줄을 내리 쓴다(2026-10-20). 색 네모는 걷었다. */}
      <div className="scr-sg-row scr-sg-head" role="row">
        {["유저", "경기", "승률", "APM", "데미지"].map((h, i) => <span key={h} className={cx("scr-sg-c", "scr-sg-h2", i === 0 && "scr-sg-who")}>{h}</span>)}
        {RACES.map((r) => <span key={r} className="scr-sg-c scr-sg-hgroup">{r}</span>)}
        <span className="scr-sg-c scr-sg-h2" />
        {RACES.map((r) => <Fragment key={r}><span className="scr-sg-c scr-sg-hsub">전적</span><span className="scr-sg-c scr-sg-hsub">승률</span></Fragment>)}
      </div>
      {clanRow && <PcRow row={clanRow} clan games={clanGames} openAll={openAll} scale={scale} />}
      {rows.map((r) => (
        <Fragment key={r.member.id}><PcRow row={r} openAll={openAll} scale={scale} /></Fragment>
      ))}
    </div>
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
