import { Fragment, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import Avatar from "../../components/common/Avatar";
import PhotoViewer from "../../components/common/PhotoViewer";
import { useAppStore } from "../../store/appStore";
import { useIsMobile } from "../../hooks/useIsMobile";
import { cx } from "../../utils/format";
import { topEntries, type TruthMix, type TopEntry } from "../../utils/statsMix";
import { TECH_KO, UNIT_KO } from "../../utils/replayNames";
import type { BaseRace, Member, MemberStats } from "../../types";

const TOP_N = 5;

const SKILL_LIST_EXCLUDE = new Set([
  "Tank Siege Mode", "Stim Packs", "Burrowing", "Personnel Cloaking",
]);

const UPGRADE_MIN_MIN = 20;

type UpRow = { label: string; title: string; atk?: string; def?: string };
const UP_TABLE: Record<BaseRace, { rows: UpRow[]; solo?: { label: string; title: string; key: string } }> = {
  테란: {
    rows: [
      { label: "보병", title: "보병 공격력 / 보병 방어구",
        atk: "Terran Infantry Weapons", def: "Terran Infantry Armor" },
      { label: "차량", title: "차량 공격력 / 차량 장갑",
        atk: "Terran Vehicle Weapons", def: "Terran Vehicle Plating" },
      { label: "함선", title: "함선 공격력 / 함선 장갑",
        atk: "Terran Ship Weapons", def: "Terran Ship Plating" },
    ],
  },
  저그: {
    rows: [
      { label: "근접", title: "근접 공격력", atk: "Zerg Melee Attacks" },
      { label: "원거리", title: "원거리 공격력", atk: "Zerg Missile Attacks" },
      { label: "비행", title: "비행 공격력 / 비행 갑각",
        atk: "Zerg Flyer Attacks", def: "Zerg Flyer Carapace" },
    ],
    solo: { label: "갑각", title: "갑각(지상 유닛 공통 방어)", key: "Zerg Carapace" },
  },
  프로토스: {
    rows: [
      { label: "지상", title: "지상 무기 / 지상 방어구",
        atk: "Protoss Ground Weapons", def: "Protoss Ground Armor" },
      { label: "공중", title: "공중 무기 / 공중 방어구",
        atk: "Protoss Air Weapons", def: "Protoss Air Armor" },
    ],
    solo: { label: "실드", title: "플라즈마 실드(지상·공중 공통)", key: "Protoss Plasma Shields" },
  },
};

function UpgradeGrid({ mix, race }: { mix: TruthMix; race: BaseRace | null | undefined }) {
  if (!race) {
    return (
      <div className="scr-stat-upgrades scr-stat-upgrades-empty">
        <span className="scr-stat-up-note">※ 종족을 골라야 표시</span>
      </div>
    );
  }
  const table = UP_TABLE[race];
  const avgOf = (m: TruthMix | null | undefined, key?: string): number | null => {
    if (!key || !m) return null;
    const n = m.upCounts?.[key] ?? 0;
    if (n <= 0) return null;
    return (m.ups?.[key] ?? 0) / n;
  };
  const avg = (key?: string) => {
    const v = avgOf(mix, key);
    return v === null ? null : v.toFixed(1);
  };
  const cell = (key?: string) => (
    <span className="scr-stat-up-cell">{avg(key) ?? "-"}</span>
  );
  const rows = table.rows.filter((r) => avg(r.atk) !== null || avg(r.def) !== null);
  const solo = table.solo ? avg(table.solo.key) : null;
  if (rows.length === 0 && solo === null) {
    return (
      <div className="scr-stat-upgrades scr-stat-upgrades-empty">
        <span className="scr-stat-up-note">※ {UPGRADE_MIN_MIN}분 이상 경기 없음</span>
      </div>
    );
  }
  return (
    <div className="scr-stat-upgrades" title={`${race} 업그레이드 — 경기당 평균 단계(0~3)`}>
      <span />
      <span className="scr-stat-up-head">공</span>
      <span className="scr-stat-up-head">방</span>
      {rows.map((r) => (
        <Fragment key={r.label}>
          <span className="scr-stat-up-row" title={r.title}>{r.label}</span>
          {cell(r.atk)}
          {cell(r.def)}
        </Fragment>
      ))}
      {table.solo && solo !== null && (
        <>
          <span className="scr-stat-up-row scr-stat-up-solo-label" title={table.solo.title}>
            {table.solo.label}
          </span>
          <span className="scr-stat-up-solo">{cell(table.solo.key)}</span>
        </>
      )}
    </div>
  );
}

const SHOW_TOP_VALUES = false;

function TopList({ items, unit }: { items: TopEntry[]; unit: string }) {
  void unit;
  if (items.length === 0) {
    return (
      <ul className={cx("scr-stat-toplist", !SHOW_TOP_VALUES && "scr-stat-toplist-nameonly")}>
        <li><span className="scr-stat-toplist-name scr-stat-points-empty">-</span></li>
      </ul>
    );
  }
  return (
    <ul className={cx("scr-stat-toplist", !SHOW_TOP_VALUES && "scr-stat-toplist-nameonly")}>
      {items.map((it, i) => (
          <li key={it.name}>
            <span className="scr-stat-toplist-rank">{i + 1}</span>
            <span className="scr-stat-toplist-name">{it.name}</span>
            {SHOW_TOP_VALUES && (
              <span className="scr-stat-toplist-n">
                {it.perMin === null ? "-" : `${it.perMin.toFixed(1)}${unit}`}
              </span>
            )}
          </li>
      ))}
    </ul>
  );
}

const RACES: BaseRace[] = ["테란", "프로토스", "저그"];

export const RACE_TONE: Record<BaseRace, string> = {
  테란: "var(--terran)", 프로토스: "var(--protoss)", 저그: "var(--zerg)",
};

export function RaceMixCell({ race, stats }: { race: BaseRace; stats?: MemberStats }) {
  const mix = stats?.truthMix ?? stats?.buildMix ?? null;
  if (!stats || !mix) {
    return <div className="scr-stat-mix-cell"><span className="scr-stat-points-empty">-</span></div>;
  }
  return (
    <div className="scr-stat-mix-cell">
      <div className="scr-stat-mix-row">
        <div className="scr-stat-mix-list">
          <span className="scr-stat-mix-list-cap">유닛</span>
          <TopList items={topEntries(mix.units, UNIT_KO, TOP_N, mix.unitSecs)} unit="기" />
        </div>
        <div className="scr-stat-mix-list">
          <span className="scr-stat-mix-list-cap">스킬</span>
          <TopList items={topEntries(mix.skills, TECH_KO, TOP_N, mix.skillSecs, SKILL_LIST_EXCLUDE)} unit="회" />
        </div>
        <div className="scr-stat-mix-list">
          <span className="scr-stat-mix-list-cap">공방업</span>
          <UpgradeGrid mix={mix} race={race} />
        </div>
      </div>
    </div>
  );
}

function Num({ value, unit }: { value: number | string | null; unit?: string }) {
  const empty = value === null || value === "-";
  return (
    <span className="scr-stat-record-num-v">
      {empty ? "-" : value}
      {!empty && unit && <span className="scr-stat-record-num-unit">{unit}</span>}
    </span>
  );
}

/** K/D 는 화면에서 걷었다(요청: 마지막에 죽인 사람만 세어 여럿이 함께 잡은 몫을 못 가른다) — 셈은 남겨 둔다. */
const SHOW_KD = false;

/** K/D — 마릿수가 아니라 잡은 인구 ÷ 잃은 인구(저글링 0.5 · 마린 1 · 울트라 4). 서버가 새 덤퍼로 구운 경기만 안다. */
function kdOf(stats?: MemberStats): string | null {
  const k = stats?.killSupply;
  const d = stats?.deathSupply;
  if (typeof k !== "number" || typeof d !== "number") return null;
  return (k / Math.max(1, d)).toFixed(2);
}

/** 1234 → "1.2k" · 980 → "980". 데미지는 한 판에 수천~수만이라 천 단위로 줄인다. */
function fmtK(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`;
}

/** 준·입은 데미지 — **경기당 평균**(유닛+건물 합 · 체력+실드 점수). 여럿이 함께 잡아도 때린 만큼 갈려서 K/D 보다 공정하다.
 *  유닛·건물은 서버가 따로 주지만 화면은 합쳐 보인다(요청 — 나중에 나눌 수 있게). 새 덤퍼로 구운 경기만 더해져 있다. */
function dmgOf(stats?: MemberStats): { dealt: string; taken: string } | null {
  const n = stats?.dmgPlays;
  const parts = [stats?.dmgDealtUnit, stats?.dmgDealtBldg, stats?.dmgTakenUnit, stats?.dmgTakenBldg];
  if (!n || !parts.every((v): v is number => typeof v === "number")) return null;
  const [du, db, tu, tb] = parts as number[];
  return { dealt: fmtK((du + db) / n), taken: fmtK((tu + tb) / n) };
}

function Record({ stats }: { stats?: MemberStats }) {
  const plays = stats?.plays ?? 0;
  if (plays === 0) return null;
  return (
    <>
      <Num value={plays} unit="판" />
      <span className="scr-statcard-deck-label">승률</span>
      <Num value={stats!.winRate} unit="%" />
    </>
  );
}

interface MemberStatRowProps {
  member: Member;
  stats: MemberStats;
  byRace?: Partial<Record<BaseRace, MemberStats>>;
  me?: boolean;
}

export default function MemberStatRow({
  member, stats, byRace, me = false,
}: MemberStatRowProps) {
  const openMemberProfile = useAppStore((s) => s.openMemberProfile);
  const [photoOpen, setPhotoOpen] = useState(false);
  /* 폰은 아바타를 40 으로(옆 두 줄 묶음의 키 · global.css 폰 규칙과 같은 수) — 글자 아바타의 머리글자 크기가 size 를 따르므로 CSS 만으론 안 된다. */
  const isMobile = useIsMobile();
  const kd = kdOf(stats);
  const dmg = dmgOf(stats);
  const [openRaces, setOpenRaces] = useState<ReadonlySet<BaseRace>>(() => new Set());
  const toggleRace = (r: BaseRace): void => {
    setOpenRaces((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r); else next.add(r);
      return next;
    });
  };

  return (
    <section className={cx("scr-statcard", me && "scr-statcard-me")}>
      <header className="scr-statcard-head">
        <button
          type="button" className="scr-stat-avatar-btn"
          onClick={() => setPhotoOpen(true)} aria-label={`${member.nickname} 사진 보기`}
        >
          <Avatar member={member} size={isMobile ? 40 : 32} />
        </button>
        <button
          type="button" className="scr-stat-name-btn"
          onClick={() => openMemberProfile(member.id)}
        >
          {member.nickname}
        </button>
        <div className="scr-statcard-sum">
          <span className="scr-statcard-sum-item">
            <span className="scr-statcard-sum-label">총</span>
            <Num value={stats.plays > 0 ? stats.plays : null} unit="판" />
            {stats.plays > 0 && (
              <span className="scr-statcard-sum-paren">
                (<span className="scr-statcard-sum-label">승률</span>{" "}
                <Num value={stats.winRate} unit="%" />)
              </span>
            )}
          </span>
          <span className="scr-statcard-sum-item">
            <span className="scr-statcard-sum-label">APM</span>
            <Num value={stats.avgApm} />
          </span>
          <span className="scr-statcard-sum-item" title="경기당 평균 준 데미지 — 유닛+건물 · 체력+실드 점수">
            <span className="scr-statcard-sum-label">준 데미지</span>
            <Num value={dmg?.dealt ?? null} />
          </span>
          <span className="scr-statcard-sum-item" title="경기당 평균 입은 데미지 — 유닛+건물 · 체력+실드 점수">
            <span className="scr-statcard-sum-label">입은 데미지</span>
            <Num value={dmg?.taken ?? null} />
          </span>
          {SHOW_KD && (
            <span className="scr-statcard-sum-item">
              <span className="scr-statcard-sum-label" title="잡은 인구 ÷ 잃은 인구">K/D</span>
              <Num value={kd} />
            </span>
          )}
        </div>
      </header>
      <div className="scr-statcard-decks">
        <div className="scr-statcard-deck-grid">
        {RACES.map((r) => {
          const open = openRaces.has(r);
          return (
            <div key={r} className="scr-statcard-deck">
              <span className="scr-statcard-deck-head">
                <i className="scr-clan-band-dot" style={{ backgroundColor: RACE_TONE[r] }} />
                {r}
                <span className="scr-statcard-deck-rec">
                  <Record stats={byRace?.[r]} />
                </span>
                <button
                  type="button" className="scr-text-btn scr-statcard-deck-toggle"
                  aria-expanded={open} aria-label={open ? "접기" : "펼치기"}
                  onClick={() => toggleRace(r)}
                >
                  {open ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
                </button>
              </span>
              {open && <RaceMixCell race={r} stats={byRace?.[r]} />}
            </div>
          );
        })}
        </div>
      </div>
      {photoOpen && member.avatar && (
        <PhotoViewer src={member.avatar} alt={member.nickname} onClose={() => setPhotoOpen(false)} />
      )}
    </section>
  );
}
