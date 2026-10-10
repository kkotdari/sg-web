import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import Avatar from "../../components/common/Avatar";
import PhotoViewer from "../../components/common/PhotoViewer";
import { useAppStore } from "../../store/appStore";
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

/** 숫자 한 칸 — 값과 단위를 **따로** 감싼다. 값 칸에 폭을 주고 오른쪽에 붙이면 단위가 줄마다 같은 자리에 선다
 *  (2026-10, 요청: "라벨도 줄이 맞고 단위도 줄이 맞게 하기 — 그래야 양옆 갭을 통일하기 좋음"). */
function Num({ value, unit }: { value: number | string | null; unit?: string }) {
  const empty = value === null || value === "-";
  return (
    <span className="scr-stat-record-num-v">
      <span className="scr-stat-record-num-n">{empty ? "-" : value}</span>
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

/** 준·입은 데미지 — **그 경기 참가자 평균의 몇 배**인가(유닛+건물 · 체력+실드). API 가 조회 때 내 합 ÷ 그 경기들의 '평균 선수' 합으로
 *  센다(dmgDealtRel·dmgTakenRel · 100 = 1.0배) — 판 수·경기 길이·초반 공백·팀 인원이 다 지워져 많이 한 사람이 유리하지 않다(요청: "좀더
 *  공평하게"). 분당은 초반 공백 탓에 짧은 경기만 한 사람이 불리해 안 쓴다. 새 덤퍼로 구운 경기만 안다.
 *  화면은 **수치 없이 배수 글귀만** "평균의 1.1배 입힘 / 0.8배 입음"(요청: "수치는 빼고 … 이런 식으로") — 한때 "12k(125%)/9.8k(75%)"
 *  (경기당 평균 점수 + 괄호 %)였다. 라벨 "데미지"는 그대로 두고(지적: "데미지 라벨 빠졌옹") 값 앞에 "평균의"를 흐리게 단다.
 *  배수가 없는(데미지 없는 옛 경기뿐) 사람은 null → "데미지 –". */
function dmgOf(stats?: MemberStats): { dealt: string; taken: string } | null {
  const d = stats?.dmgDealtRel;
  const t = stats?.dmgTakenRel;
  if (typeof d !== "number" || typeof t !== "number") return null;
  /* 숫자만 돌려준다 — "평균의 · 배 딜 · 배 피해"는 단위 자(12)로 따로 그린다(2026-10, 요청). */
  return { dealt: (d / 100).toFixed(1), taken: (t / 100).toFixed(1) };
}

/** 종족별 헤더의 전적 — 요약 줄과 **같은 칸(.scr-sum-plays · .scr-sum-rate)**에 담아, 통계의 네 곳(종족구성별 전적 · 클랜원 전체
 *  타이틀과 헤더 · 개인 타이틀과 헤더)이 한 세로줄에 선다(2026-10, 요청). 경기가 없으면 칸만 비운다 — 안 그리면 그 줄의 칸 폭이
 *  0 이 되어 뒤 칸이 밀린다. */
function Record({ stats }: { stats?: MemberStats }) {
  const plays = stats?.plays ?? 0;
  if (plays === 0) {
    return (<>
      <span className="scr-statcard-sum-item scr-sum-plays" aria-hidden />
      <span className="scr-statcard-sum-item scr-sum-rate" aria-hidden />
    </>);
  }
  return (
    <>
      <span className="scr-statcard-sum-item scr-sum-plays">
        <Num value={plays.toLocaleString()} unit="회" />
      </span>
      <span className="scr-statcard-sum-item scr-sum-rate">
        <Num value={stats!.winRate} unit="% 승" />
      </span>
    </>
  );
}

/** 요약 줄 — **앞 덩이**(회 플레이 · 승률)와 **뒤 덩이**(데미지 · APM)로 갈린다(2026-10, 요청). 사이에 끼우던 | 는 모두 걷었다 —
 *  줄을 가르는 것은 머리 줄 아래의 연한 구분선뿐이다(요청: "사이사이 | 제거하고 헤더줄 아래 구분선 연한거 넣기"). 뒤 덩이는
 *  우측 정렬하지 않고 승률 뒤에 쭉 이어 선다(요청) — 칸머리가 고정이라 줄끼리 세로줄은 맞는다.
 *  칸은 제 이름(.scr-sum-*)으로 바깥 글(.scr-statcard-head / -deck-head / .scr-clan-race)의 **같은 세로 칸**에 꽂힌다 — 묶음 두 개는
 *  display:contents 로 풀어 제 자식이 바로 칸에 서게 한다(global.css).
 *  · stats.plays 는 **사람이 뛴 횟수**지 경기 수가 아니다 — 한 경기에 여럿이 들어가므로 클랜 전체로 합치면 경기 수의 몇 배다.
 *    그래서 단위는 "판"이 아니라 **"회 플레이"**다(요청).
 *  · 실제 경기 수(N게임)는 머리("20명 · 212게임")로 올렸다 — 승률 칸에 세우면 그 아래 종족 줄의 승률과 칸 뜻이 어긋나
 *    칸 이름 줄 하나로 덮을 수가 없다. 한때는 맨 앞이었고, 그 뒤 승률 칸 자리였다.
 *  · "클랜원 전체"는 승률·데미지를 뺀다(요청) — 클랜끼리만 둔 내전이라 클랜 전체 승률은 늘 반반이고, 데미지도 그 경기 참가자 평균의
 *    몇 배인지라 모두를 합치면 늘 1.0배다. 종족별 줄(RaceDecks)의 승률은 뜻이 있으니 그대로 둔다. */
export function StatSum({ stats, games = null, hideRate = false, hideDmg = false }: {
  stats: MemberStats;
  /** 실제 경기 수 — 주면 첫 칸이 "N판(N회)"가 된다. "클랜원 전체"만 받는다(2026-10, 요청). */
  games?: number | null;
  hideRate?: boolean;
  hideDmg?: boolean;
}) {
  const kd = kdOf(stats);
  const dmg = dmgOf(stats);
  return (
    <div className="scr-statcard-sum">
      <span className="scr-statcard-sum-lead">
        {/* 라벨은 줄마다 되풀이하지 않는다(2026-10, 요청) — 목록 맨 위의 칸 이름 줄(StatColHead)이 대신한다.
            줄에는 값과 단위만 남아, 라벨과 값 사이에 끼던 빈 폭(실측 5~30px · 칸 사이 간격보다 넓은 줄도 있었다)이 사라진다. */}
        {games !== null ? (
          /* "클랜원 전체"는 **경기 수(판)와 사람이 뛴 횟수(회)를 한 칸에** 담는다(2026-10, 요청: "N판(N회)") —
             승률이 없는 카드라 그 칸까지 넓혀 쓴다(.scr-sum-plays-wide). */
          <span className="scr-statcard-sum-item scr-sum-plays scr-sum-plays-wide">
            <span className="scr-stat-record-num-v">
              <span className="scr-stat-record-num-n">{games > 0 ? games.toLocaleString() : "-"}</span>
              <span className="scr-stat-record-num-unit">판</span>
              {/* 괄호 안 숫자도 **값과 같은 자·색**이다(2026-10, 요청) — 괄호와 "회"만 단위 자로 흐리다. */}
              <span className="scr-sum-paren">
                <span className="scr-stat-record-num-unit">(</span>
                <span className="scr-stat-record-num-n">{stats.plays.toLocaleString()}</span>
                <span className="scr-stat-record-num-unit">회)</span>
              </span>
            </span>
          </span>
        ) : (<>
          <span className="scr-statcard-sum-item scr-sum-plays">
            <Num value={stats.plays > 0 ? stats.plays.toLocaleString() : null} unit="회" />
          </span>
          {!hideRate
            ? (
              <span className="scr-statcard-sum-item scr-sum-rate">
                <Num value={stats.plays > 0 ? stats.winRate : null} unit="% 승" />
              </span>
            )
            : <span className="scr-statcard-sum-item scr-sum-rate" aria-hidden />}
        </>)}
      </span>
      <span className="scr-statcard-sum-rest">
        {/* APM 이 데미지보다 앞이다(2026-10, 요청: "APM 데미지 순서 바꾸기") — 짧은 APM 이 승률 바로 뒤에 붙고, 긴 데미지가 끝에 선다.
            폰처럼 줄이 바뀌어도 APM 은 윗줄에 남고 데미지만 아랫줄로 내려간다(요청). */}
        <span className="scr-statcard-sum-item scr-sum-apm">
          <Num value={stats.avgApm} unit="APM" />
        </span>
        {!hideDmg && (
          <span className="scr-statcard-sum-item scr-sum-dmg" title="딜(녹색) / 피해(붉은색) — 준·입은 데미지가 그 경기 참가자 평균의 몇 배인가(유닛+건물 · 체력+실드 · 합의 비율 · 1.0배 = 평균)">
            {dmg ? (
              <span className="scr-stat-record-num-v scr-stat-dmg">
                <span className="scr-stat-record-num-unit scr-stat-dmg-lead">평균의</span>
                <span className="scr-stat-dmg-dealt">
                  <span className="scr-stat-record-num-n">{dmg.dealt}</span>
                  <span className="scr-stat-record-num-unit">배 딜</span>
                </span>
                <span className="scr-stat-dmg-sep">/</span>
                <span className="scr-stat-dmg-taken">
                  <span className="scr-stat-record-num-n">{dmg.taken}</span>
                  <span className="scr-stat-record-num-unit">배 피해</span>
                </span>
              </span>
            ) : <Num value={null} />}
          </span>
        )}
        {SHOW_KD && (
          <span className="scr-statcard-sum-item scr-sum-kd">
            <span className="scr-statcard-sum-label" title="잡은 인구 ÷ 잃은 인구">K/D</span>
            <Num value={kd} />
          </span>
        )}
      </span>
    </div>
  );
}

export function RaceDecks({ byRace, openAll }: {
  byRace?: Partial<Record<BaseRace, MemberStats>>;
  /** 바깥의 "전부 펼치기"(통계 머리) — 켜지면 세 종족을 다 펼치고 끄면 다 접는다. 그 뒤 줄마다 꺽쇠로 다시 여닫을 수 있다. */
  openAll?: boolean;
}) {
  const [openRaces, setOpenRaces] = useState<ReadonlySet<BaseRace>>(() => new Set());
  useEffect(() => {
    /* 같은 꼴이면 **쥐고 있던 집합을 그대로** 돌려준다 — 새 Set 을 매번 주면 처음 그릴 때(openAll=false)도 한 번 더 그린다(스무 명). */
    setOpenRaces((prev) => {
      if (openAll) return prev.size === RACES.length ? prev : new Set(RACES);
      return prev.size === 0 ? prev : new Set();
    });
  }, [openAll]);
  const toggleRace = (r: BaseRace): void => {
    setOpenRaces((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r); else next.add(r);
      return next;
    });
  };
  return (
    <div className="scr-statcard-decks">
      <div className="scr-statcard-deck-grid">
        {RACES.map((r) => {
          const open = openRaces.has(r);
          return (
            <div key={r} className="scr-statcard-deck">
              <span className="scr-statcard-deck-head" onClick={() => toggleRace(r)}>
                {/* 네모 + 종족명이 **종족 머리의 제목**이다(2026-10, 지적: "네모아이콘 때문에 다 밀리는데 그러지마") — 네모가 제 칸을
                    차지하면 종족명부터 뒤가 통째로 밀린다. 한 덩이로 묶어 이름 칸에 담는다. */}
                <span className="scr-statcard-deck-name">
                  <i className="scr-clan-band-dot" style={{ backgroundColor: RACE_TONE[r] }} />
                  {r}
                </span>
                <span className="scr-statcard-deck-rec">
                  <Record stats={byRace?.[r]} />
                </span>
                <button
                  type="button" className="scr-text-btn scr-statcard-deck-toggle"
                  aria-expanded={open} aria-label={open ? "접기" : "펼치기"}
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
  );
}

interface MemberStatRowProps {
  member: Member;
  stats: MemberStats;
  byRace?: Partial<Record<BaseRace, MemberStats>>;
  openAll?: boolean;
}

export default function MemberStatRow({
  member, stats, byRace, openAll,
}: MemberStatRowProps) {
  const openMemberProfile = useAppStore((s) => s.openMemberProfile);
  const [photoOpen, setPhotoOpen] = useState(false);
  /* 닉네임은 PC·폰 다 **전체**다(2026-10, 요청: "4글자로 하지 말고 다 보여주기" — 한때 폰은 네 글자 고정 칸이었다). 폰은 스탯이 제 줄로
     내려가(global.css 폰 규칙) 이름 옆에 자리를 다툴 것이 없다. 너무 긴 이름만 말줄임(.scr-stat-name-btn). 아바타는 PC 에서 닉네임
     글자 높이와 같고(20 · 요청) 폰은 그대로다 — 자는 CSS 가 !important 로 덮으므로 아래 size={32} 는 바탕값일 뿐이다. */

  /* 개인 줄은 **카드로 감싸지 않는다**(2026-10, 요청: "개인 카드를 scr-statcard로 감싸지 말기 · 본인 강조 효과도 제거") — 클랜 전체의 두 장
     (종족구성별 전적 · 클랜원 전체)만 카드다. 글자 자·여백은 .scr-stat-person 이 .scr-statcard 와 똑같이 들고 있고(global.css), 본인
     바탕 tint(.scr-statcard-me)는 걷었다. */
  return (
    <section className="scr-stat-person">
      <header className="scr-statcard-head">
        {/* 아바타 + 닉네임도 한 덩이 제목이다 — 종족 머리의 네모+종족명과 같은 칸에 선다. */}
        <span className="scr-statcard-head-title">
          <button
            type="button" className="scr-stat-avatar-btn"
            onClick={() => setPhotoOpen(true)} aria-label={`${member.nickname} 사진 보기`}
          >
            <Avatar member={member} size={32} />
          </button>
          <button
            type="button" className="scr-stat-name-btn" title={member.nickname}
            onClick={() => openMemberProfile(member.id)}
          >
            {member.nickname}
          </button>
        </span>
        <StatSum stats={stats} />
      </header>
      <RaceDecks byRace={byRace} openAll={openAll} />
      {photoOpen && member.avatar && (
        <PhotoViewer src={member.avatar} alt={member.nickname} onClose={() => setPhotoOpen(false)} />
      )}
    </section>
  );
}
