import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import Avatar from "../../components/common/Avatar";
import PhotoViewer from "../../components/common/PhotoViewer";
import { useAppStore } from "../../store/appStore";
import { cx } from "../../utils/format";
import { RACE_TONE, SKILL_LIST_EXCLUDE, UP_TABLE } from "./MemberStatRow";
import { topEntries, type TruthMix } from "../../utils/statsMix";
import { TECH_KO, UNIT_KO } from "../../utils/replayNames";
import type { BaseRace, Member, MemberStats } from "../../types";

/* ★★ 통계 = **표**(2026-10-20, 요청: "통계 PC 도 그리드로 · 클랜원 전체가 맨 위 로우 · 그 아래 개인별 한 로우씩" → 시안 A(한 줄 표)에
   C 의 승률 막대를 얹어(요청: "A에 C의 그래프를 시각적으로 도입")).
   PC: [유저 | 경기 | 승률 | APM | 데미지 | 테란 | 프로토스 | 저그 | ▾] · ▾ 는 그 줄 아래에 종족별 유닛·스킬·공방업을 편다 —
   종족마다 세 줄 글(MixLines · 2026-10-20, 요청: "펼침 부분을 시안처럼 · 지금 너무 복잡": 순위 번호·공/방 칸 표 대신
   "유닛 마린 · 메딕 · 탱크" · "스킬 …" · "공방업 보병 2.1/1.8 · 차량 1.2/0.9"). 순위·평균 셈은 옛 칸(RaceMixCell)과 같다.
   폰: 종족 펼치기 없이(요청: "모바일은 각 종족 펼치기 제거하고 깔끔하게 그리드로") [유저(아래 APM·데미지) | 전체 | 테 | 프 | 저] —
   칸마다 회수 위 · 승률(+막대) 아래 두 줄. */

const RACES: BaseRace[] = ["테란", "프로토스", "저그"];
const RACE_SHORT: Record<BaseRace, string> = { 테란: "테", 프로토스: "프", 저그: "저" };

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

/** 승률 + 막대(시안 C) — 막대 색은 종족 색, 전체 승률은 강조색. */
function Rate({ s, tone }: { s?: MemberStats; tone: string }) {
  if (!s || s.plays === 0) return <Dash />;
  return (
    <span className="scr-sg-rate">
      <Num v={s.winRate} unit="%" />
      <span className="scr-sg-bar" aria-hidden><span style={{ width: `${Math.max(0, Math.min(100, s.winRate))}%`, background: tone }} /></span>
    </span>
  );
}

function Dmg({ s, compact }: { s: MemberStats; compact?: boolean }) {
  const d = s.dmgDealtRel, t = s.dmgTakenRel;
  if (typeof d !== "number" || typeof t !== "number") return compact ? null : <Dash />;
  /* 폰은 칸이 좁아 "딜 1.4 · 피해 0.8"(배수만) — "평균의 · 배"는 뜻이 같아 줄인다. */
  if (compact) {
    return (
      <span className="scr-sg-dmg" title="준·입은 데미지가 그 경기 참가자 평균의 몇 배인가(1.0배 = 평균)">
        <i>딜</i><b className="is-dealt">{(d / 100).toFixed(1)}</b>
        <span className="scr-sg-dim">·</span>
        <i>피해</i><b className="is-taken">{(t / 100).toFixed(1)}</b>
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

/** 종족 칸 — "30회 66.7%" + 막대. 클랜원 전체 줄은 회수만(내전이라 승률은 늘 반반). */
function RaceCell({ s, race, clan }: { s?: MemberStats; race: BaseRace; clan?: boolean }) {
  if (!s || s.plays === 0) return <span className="scr-sg-c"><Dash /></span>;
  return (
    <span className="scr-sg-c scr-sg-race">
      <Num v={s.plays.toLocaleString()} unit="회" />
      {!clan && <Rate s={s} tone={RACE_TONE[race]} />}
    </span>
  );
}

function PcRow({ row, clan, games, openAll }: { row: StatGridRow; clan?: boolean; games?: number; openAll: boolean }) {
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
            ? <span className="scr-sg-v"><b>{(games ?? 0).toLocaleString()}</b><i>판</i><i className="scr-sg-paren">({s.plays.toLocaleString()}회)</i></span>
            : <Num v={s.plays > 0 ? s.plays.toLocaleString() : null} unit="회" />}
        </span>
        <span className="scr-sg-c">{clan ? <Dash /> : <Rate s={s} tone="var(--lighting-accent, #3b82f6)" />}</span>
        <span className="scr-sg-c"><Num v={s.avgApm} /></span>
        <span className="scr-sg-c">{clan ? <Dash /> : <Dmg s={s} />}</span>
        {RACES.map((r) => <RaceCell key={r} s={row.byRace?.[r]} race={r} clan={clan} />)}
        <span className="scr-sg-c">
          <button type="button" className="scr-text-btn scr-sg-toggle" aria-expanded={open} aria-label={open ? "접기" : "펼치기"} onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
          </button>
        </span>
      </div>
      {open && (
        <div className="scr-sg-mix">
          {RACES.map((r) => (
            <div key={r} className="scr-sg-mix-race">
              <span className="scr-sg-mix-head"><i className="scr-clan-band-dot" style={{ backgroundColor: RACE_TONE[r] }} />{r}</span>
              <MixLines race={r} stats={row.byRace?.[r]} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

const MIX_TOP = 3;

/** 공방업 한 줄 글 — 경기당 평균 단계. 공·방 둘 다 있는 갈래는 "보병 2.1/1.8", 하나뿐이면 "근접 1.9", 공통 방어는 "실드 0.8". */
function upText(mix: TruthMix, race: BaseRace): string | null {
  const avg = (key?: string): string | null => {
    const n = key ? mix.upCounts?.[key] ?? 0 : 0;
    return key && n > 0 ? ((mix.ups?.[key] ?? 0) / n).toFixed(1) : null;
  };
  const table = UP_TABLE[race];
  const parts: string[] = [];
  for (const r of table.rows) {
    const a = avg(r.atk);
    const d = avg(r.def);
    if (a === null && d === null) continue;
    parts.push(r.def ? `${r.label} ${a ?? "-"}/${d ?? "-"}` : `${r.label} ${a}`);
  }
  const solo = table.solo ? avg(table.solo.key) : null;
  if (table.solo && solo !== null) parts.push(`${table.solo.label} ${solo}`);
  return parts.length ? parts.join(" · ") : null;
}

/** 펼친 줄의 한 종족 — 유닛·스킬은 많이 쓴 셋, 공방업은 평균 단계. */
function MixLines({ race, stats }: { race: BaseRace; stats?: MemberStats }) {
  const mix = stats && stats.plays > 0 ? stats.truthMix ?? stats.buildMix ?? null : null;
  if (!mix) return <span className="scr-sg-mix-none">{stats && stats.plays > 0 ? "기록 없음" : "경기 없음"}</span>;
  const names = (items: { name: string }[]) => items.length ? items.map((it) => it.name).join(" · ") : null;
  const lines: [string, string | null][] = [
    ["유닛", names(topEntries(mix.units, UNIT_KO, MIX_TOP, mix.unitSecs))],
    ["스킬", names(topEntries(mix.skills, TECH_KO, MIX_TOP, mix.skillSecs, SKILL_LIST_EXCLUDE))],
    ["공방업", upText(mix, race)],
  ];
  return (
    <dl className="scr-sg-mix-lines">
      {lines.map(([k, v]) => (
        <Fragment key={k}><dt>{k}</dt><dd>{v ?? <Dash />}</dd></Fragment>
      ))}
    </dl>
  );
}

/** 폰 칸 — 회수 위, 승률(+막대) 아래. */
function MCell({ s, tone, clan }: { s?: MemberStats; tone: string; clan?: boolean }) {
  if (!s || s.plays === 0) return <span className="scr-sg-c"><Dash /></span>;
  return (
    <span className="scr-sg-c scr-sg-race">
      <Num v={s.plays.toLocaleString()} unit="회" />
      {!clan && <Rate s={s} tone={tone} />}
    </span>
  );
}

function MobileRow({ row, clan, games }: { row: StatGridRow; clan?: boolean; games?: number }) {
  const s = row.stats;
  return (
    <div className={cx("scr-sg-row", clan && "is-clan")}>
      <span className="scr-sg-c scr-sg-who">
        <span className="scr-sg-who-top">
          {clan ? <span className="scr-sg-name scr-sg-name-plain">클랜원 전체</span> : <Who member={row.member} />}
        </span>
        <span className="scr-sg-who-sub">
          {/* "APM 231" — 라벨이 앞(2026-10-20, 요청: "N APM → APM N 으로 순서 변경"). 딜 · 피해도 라벨이 앞이다. */}
          {s.avgApm !== null && <span className="scr-sg-v scr-sg-lab"><i>APM</i><b>{s.avgApm}</b></span>}
          {!clan && <Dmg s={s} compact />}
        </span>
      </span>
      {clan ? (
        <span className="scr-sg-c scr-sg-race">
          <span className="scr-sg-v"><b>{(games ?? 0).toLocaleString()}</b><i>판</i></span>
          <span className="scr-sg-v scr-sg-small"><b>{s.plays.toLocaleString()}</b><i>회</i></span>
        </span>
      ) : <MCell s={s} tone="var(--lighting-accent, #3b82f6)" />}
      {RACES.map((r) => <MCell key={r} s={row.byRace?.[r]} tone={RACE_TONE[r]} clan={clan} />)}
    </div>
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
  if (mobile) {
    return (
      <div className="scr-sg is-m" role="table" aria-label="통계">
        <div className="scr-sg-row scr-sg-head" role="row">
          <span className="scr-sg-c scr-sg-who">유저</span>
          <span className="scr-sg-c">전체</span>
          {RACES.map((r) => <span key={r} className="scr-sg-c"><i className="scr-clan-band-dot" style={{ backgroundColor: RACE_TONE[r] }} />{RACE_SHORT[r]}</span>)}
        </div>
        {clanRow && <MobileRow row={clanRow} clan games={clanGames} />}
        {rows.map((r) => <MobileRow key={r.member.id} row={r} />)}
      </div>
    );
  }
  return (
    <div className="scr-sg" role="table" aria-label="통계">
      <div className="scr-sg-row scr-sg-head" role="row">
        {["유저", "경기", "승률", "APM", "데미지"].map((h, i) => <span key={h} className={cx("scr-sg-c", i === 0 && "scr-sg-who")}>{h}</span>)}
        {RACES.map((r) => <span key={r} className="scr-sg-c"><i className="scr-clan-band-dot" style={{ backgroundColor: RACE_TONE[r] }} />{r}</span>)}
        <span className="scr-sg-c" />
      </div>
      {clanRow && <PcRow row={clanRow} clan games={clanGames} openAll={openAll} />}
      {rows.map((r) => (
        <Fragment key={r.member.id}><PcRow row={r} openAll={openAll} /></Fragment>
      ))}
    </div>
  );
}

/** 종족구성별 전적 — 위 표와 같은 꼴(머리 줄 · 칸 선 · 승률 막대 · 2026-10-20, 요청: "종족구성별 전적 부분도 예쁘게 테마에 맞춰"). */
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
                <span className="scr-sg-bar" aria-hidden><span style={{ width: `${Math.max(0, Math.min(100, c.winRate))}%`, background: "var(--lighting-accent, #3b82f6)" }} /></span>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
