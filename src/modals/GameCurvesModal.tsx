import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { TEAM_COLOR } from "scplay";
import ModalHash from "../utils/modalHash";
import { Spinner } from "../components/common/Feedback";
import { CHART_PAD, Chart, chipBox, chipGutter, chipWOf, fitText, GRAPH_FS, inkOn, textW, TitleSwitch, useScrub, useSharedCross, type ChartLine } from "../pages/stats/RaceCurves";
import { api } from "../api/client";
import { useAppStore } from "../store/appStore";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import { useIsMobile } from "../hooks/useIsMobile";
import { cx } from "../utils/format";
import { pad } from "../utils/date";
import type { GameCurve, GameResult } from "../types";

/* ★ 게임 그래프(2026-10-21, 요청: "게임 목록에서 PC에 그래프 보기 버튼 · 참가자 전원의 일꾼 및 병력 가치 그래프(한 그래프에 합쳐서) · 색은 임자색 ·
   범례에 색깔과 종족 닉네임 · 통계랑 똑같이 선택 · 팀컬러 모드로 변경도" → "두 그래프를 세로로 · PC 는 모달 폭 넓게" → "게임목록 폭 거의 다 ·
   그래프를 최대한 크게 · 각 플레이어 테크 건물 건설 시간을 그래프 위에 · 범례도 위로 · 폰에서는 제공되지 않는 기능").
   차례: [보기 셋(팀전만)] → 테크 줄(사람마다 세 단 · 다 지은 때) → 인구(병력 가치 대신 · 2026-10-21) → 일꾼 수. 셋 다 같은 가로 자(잰 폭 · 끝 칩 여백 chipGutter) · 같은 높이
   · 같은 분 눈금(niceTicks). 테크 줄 앞머리엔 그 사람 색 닉네임 칩 · 테크 음영은 무채색(요청: "칸 앞머리에 심플하게 닉네임" → "왼쪽 닉네임을 칩으로 · 테크트리에서는 색 제거").
   곡선·개인색은 서버의 통계용 참값 표(GET /{id}/curves) — 판(Chart)은 통계 펼침(RaceCurves)과 같은 것 · 눈금은 판마다 그 판에 맞춘 둥근 간격(niceTicks · 가로는 그 판 길이).
   범례 대신 줄 끝 닉네임 칩(누르면 그 사람을 끄고 켠다 — 테크 줄도 같이 · 2026-10-21 요청).
   개인색을 못 읽은 판(옛 굽기 · 로스터 색이 한 가지뿐)은 원작 팔레트를 자리 차례로 쓴다(재생기 personalUsable 과 같은 거름). */

const BW_PALETTE = ["#f40404", "#0c48cc", "#2cb494", "#88409c", "#f88c14", "#703014", "#cce0d0", "#fcfc38"];
type ViewMode = "player" | "teamColor" | "teamSum";
type CurveKey = "wk" | "sp" | "sx" | "rm" | "rg";
const VIEW_MODES: [ViewMode, string][] = [["player", "유저별(개인색)"], ["teamColor", "유저별(팀색)"], ["teamSum", "팀별 합산"]];

/** 테크 건물 짧은 이름(서버 series.TECH 와 짝). */
/* 흔히 부르는 약어(2026-10-21, 요청: "사이버 → 코어 · 에볼 → 챔버 · 이거 말고도 범용적인 약어로") — 아둔(시타델) · 트리뷰널 · 마운드 · 캐번 · 코버트 · 피직스 · 베이(서포트 베이).
   로보는 로보틱스로(요청: "로보 → 로보틱스"). */
const TECH_LABEL: Record<number, string> = {
  111: "배럭", 112: "아카데미", 113: "팩토리", 114: "스타포트", 116: "사이언스", 122: "엔베", 123: "아머리",
  107: "컴샛", 108: "핵사일로", 115: "컨트롤타워", 117: "코버트", 118: "피직스", 120: "머신샵",
  142: "스포닝풀", 132: "레어", 133: "하이브", 135: "히드라덴", 139: "챔버", 141: "스파이어", 137: "그레이터",
  138: "퀸즈네스트", 136: "마운드", 140: "캐번", 134: "나이더스",
  160: "게이트", 166: "포지", 164: "코어", 163: "아둔", 165: "아카이브", 155: "로보틱스", 171: "베이",
  159: "옵저버터리", 167: "스타게이트", 169: "플릿비컨", 170: "트리뷰널",
};
const clock = (sec: number): string => `${Math.floor(sec / 60)}:${pad(sec % 60)}`;

/** group — 고르기(focus) 단위: 평소 그 사람(key) · 팀 보기면 그 팀(두 곡선 판의 팀 줄 key). */
type Lane = { key: string; group: string; name: string; color: string; techs: GameCurve["techs"] };
/** 테크 줄 치수(px · 2026-10-21, 요청: "테크트리 글자 굵기 줄이고 크기 한단만 낮춰줘" → "개인당 세 줄씩 확보해서 붙지 않게 · 총 세로 높이는 인원수에 비례" →
    "테크 행의 위아래 여백 살짝 증가" → "배율 대신 직접 값") — fs 테크 글자 · row 한 사람 칸 높이(세 단 + 위아래 숨) · tier 단 사이 · gap 같은 단 칩 사이.
    테크는 글자만 — 글자를 감싼 컴팩트 네모 칩 상자는 평소 보이지 않는 마우스 자리로 남아 겹침 가르기와 팝업 자리를 재고, 같은 종류 강조 때만 칠한다
    (요청: "직사각형 음영" → "테크트리 음영제거" → "칩형태로 강조 · 컴팩트 네모칩"). 테크 판 높이 = 사람 수 × row + 눈금 띠. */
const TL = {
  pc: { fs: 11, row: 64, tier: 1.65, gap: 4.4 },
  mobile: { fs: 9.5, row: 55, tier: 1.4, gap: 3.8 },
} as const;
/** 가로축 눈금 숫자를 가로축에서 더 띄우는 몫(2026-10-21, 요청: "가로축 눈금 숫자를 가로축에서 좀 더 아래로 · 데이터 창만") — 세 판 모두. */
const AXIS_DROP = 6;
/** 닉네임 칩 글 — 폭으로 자른다(칩 글자 6.5 자 폭 · 2026-10-21, 요청: "닉네임 칩 가로폭 봐서 적절히 글자수 제한"). 끝 칩 · 테크 줄 앞머리가 같이 쓴다. */
const shortName = (s: string, fs: number): string => fitText(s, fs, fs * 6.5);

/** 닉네임 칩(그 사람 색 · 컴팩트 네모 칩) — 오른끝을 right 에 맞춘다. */
function NameChip({ name, color, right, cy, fs, big, onPick }: {
  name: string; color: string; right: number; cy: number; fs: number; big?: boolean;
  /** 누르면 그 사람 고르기(끝 칩과 같다 · 2026-10-21, 지적: "테크트리의 닉네임 칩이 작동 안 해"). */
  onPick: () => void;
}) {
  const cb = chipBox(fs);
  const nw = chipWOf(name, fs);
  const mx = right - nw / 2;
  return (
    <g
      className="scr-tl-name" role="button" tabIndex={0} aria-pressed={!!big} aria-label={`${name} 굵게 보기`}
      transform={big ? `translate(${mx} ${cy}) scale(1.15) translate(${-mx} ${-cy})` : undefined}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onPick(); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(); } }}
    >
      <rect x={right - nw} y={cy - cb.h / 2} width={nw} height={cb.h} rx={cb.r} style={{ fill: color }} />
      <text x={right - nw / 2} y={cy} textAnchor="middle" dominantBaseline="central" style={{ fontSize: fs, fill: inkOn(color) }}>{name}</text>
    </g>
  );
}

/** 테크 줄 — 사람마다 한 줄 · 다 지은 때만 칩으로(2026-10-21, 요청: "다지은때만 칩형태로 표시"). 칩의 왼끝 = 다 지은 때 ·
 *  칩은 칸의 세로 가운데 · 겹치는 칩끼리만 위아래로. 마우스를 얹으면 완공 시각 팝업 · 같은 종류 테크(모든 사람)는 강조색. */
function TechLanes({ lanes, maxX, ticksX, w: CW, padL: PL, padR, font, mobile, focus, onFocus, at, onAt }: {
  lanes: Lane[]; maxX: number; ticksX: number[]; w: number; padL: number; padR: number;
  /** 닉네임 칩·눈금 글자(GRAPH_FS.pc · .gameMobile) · 폰이면 테크 치수 TL.mobile. */
  font: { label: number; axis: number };
  mobile: boolean;
  /** 끝 칩으로 고른 사람(줄 key) — 그 줄은 테크 글자 살짝 굵게 · 닉네임 칩 살짝 크게, 나머지 줄은 흐리게(2026-10-21, 요청: "테크트리도 마찬가지"). */
  focus: string | null;
  onFocus: (key: string) => void;
  /** 세로선(분 · 두 곡선 판과 함께 · useSharedCross) — 칩 없는 곳도 누르거나 밀면 따라간다(2026-10-21, 요청: "꼭 테크 칩 없는 곳도 클릭 가능 · 터치에 따라가면서 변화 ·
      세로선을 모든 테크 & 그래프 간 동기화"). 테크 칩에 얹으면 그 완공 때(분 아래 자리까지). */
  at: number | null;
  onAt: (m: number | null) => void;
}) {
  /* 칩에 마우스를 얹으면 그래프와 같은 꼴의 팝업(2026-10-21, 요청: "그래프처럼 팝업으로") — 칩 오른쪽(오른끝 가까이면 왼쪽)에 뜬다. */
  const [hover, setHover] = useState<{ tech: GameCurve["techs"][number] } | null>(null);
  /* 한 사람 칸 = 세 단 높이(TL.row) · 판 높이는 사람 수에 비례. */
  const D = mobile ? TL.mobile : TL.pc;
  const AXIS_H = font.axis + 8 + AXIS_DROP;
  const ROW_H = D.row;
  const H = lanes.length * ROW_H + AXIS_H + 4;
  /* 마우스는 얹으면 · 손가락은 누르면 뜨고(다시 누르거나 딴 데 누르면 닫힌다 — 터치는 떼는 순간 pointerleave 가 와서 얹기가 못 버틴다). */
  const plotRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  /* 손가락은 탭(click)으로만 — 밀어 스크롤하면 click 이 오지 않는다(2026-10-21, 지적: "드래그를 터치로 인식해"). click 의 pointerType 대신 누른 순간의 종류. */
  const lastPtr = useRef("mouse");
  useEffect(() => {
    if (hover === null) return undefined;
    const close = (e: PointerEvent): void => {
      const t = e.target as Element | null;
      if (!t?.closest?.(".scr-tl-hit") || !plotRef.current?.contains(t)) setHover(null);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [hover]);
  /* 테크 상자 = 컴팩트 네모 칩(.scr-compact-rect-chip 의 높이·좌우·모서리 비 · chipBox)을 테크 글자 크기로 — 평소엔 안 보이고, 같은 종류 강조 때 칠한다
     (2026-10-21, 요청: "칩형태로 강조" → "컴팩트 네모칩"). */
  const FS = D.fs;
  const { h: CH, px: PX, r: RX } = chipBox(FS);
  const GAP = D.gap;
  const x = (sec: number): number => PL + Math.min(1, sec / 60 / maxX) * (CW - PL - padR);
  const chipW = (s: string): number => textW(s, FS) + 2 * PX;
  const pick = (clientX: number): void => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * CW;
    setHover(null);
    onAt(Math.max(0, Math.min(maxX, Math.round(((sx - PL) / (CW - PL - padR)) * maxX))));
  };
  const scrub = useScrub(pick, () => { setHover(null); onAt(null); }, (t) => !!(t as Element | null)?.closest?.(".scr-tl-hit, .scr-tl-name"));
  let y0 = 4;
  /* 칩은 사람마다 세 단(가운데 · 위 · 아래)에 — 왼쪽부터 가운데 단이 비면 가운데, 아니면 위 · 아래 순(2026-10-21, 요청: "개인당 세 줄씩 확보해서 붙지 않게").
     세 단이 다 막히면 가장 먼저 비는 단에 그 끝 뒤로 민다. 칩의 왼끝 = 다 지은 때 · 오른끝을 넘는 칩은 칩의 오른끝을 그때에 맞춘다(요청: "테크 칩 화면밖으로 나감"). */
  const RIGHT = CW - padR;
  const SLOTS = [0, -1, 1] as const;
  const rows = lanes.map((l) => {
    const items = l.techs.map((t) => {
      const label = TECH_LABEL[t.t] ?? `#${t.t}`;
      const xe = x(t.e);
      const w = chipW(label);
      const flip = xe + w > RIGHT;
      return { t, x: flip ? xe - w : xe, label, w, slot: 0 as -1 | 0 | 1 };
    }).sort((p, q) => p.x - q.x);
    const ends: Record<-1 | 0 | 1, number> = { [-1]: -Infinity, 0: -Infinity, 1: -Infinity };
    for (const it of items) {
      const slot = SLOTS.find((sl) => it.x >= ends[sl]) ?? SLOTS.reduce((a, b) => (ends[b] < ends[a] ? b : a));
      it.x = Math.min(Math.max(it.x, ends[slot]), RIGHT - it.w);
      ends[slot] = it.x + it.w + GAP;
      it.slot = slot;
    }
    const row = { l, chips: items, top: y0, h: ROW_H };
    y0 += ROW_H;
    return row;
  });
  return (
    <figure className="scr-rc-chart">
      <figcaption className="scr-rc-title">테크 건물</figcaption>
      <div className="scr-rc-plot" ref={plotRef}>
      <svg ref={svgRef} viewBox={`0 0 ${CW} ${H}`} className="scr-rc-svg scr-tl-svg" role="img" aria-label="테크 건물을 다 지은 때" {...scrub}>
        {rows.map(({ l, chips, top, h }) => {
          /* 앞머리 닉네임은 그 사람 색 칩(2026-10-21, 요청: "왼쪽 닉네임을 칩으로 · 테크트리에서는 색 제거") — 끝 칩과 같은 컴팩트 네모 칩(chipBox). */
          return (
          <g key={l.key} className={focus === l.group ? "scr-tl-row is-focus" : focus ? "scr-tl-row is-dim" : "scr-tl-row"}>
            <line className="scr-rc-grid" x1={PL} x2={CW - padR} y1={top + h} y2={top + h} />
            {chips.map(({ t, x: cx0, label, w, slot }) => {
              const mid = top + h / 2;
              const y = mid - CH / 2 + slot * (CH + D.tier);
              /* 얹은 테크와 같은 종류(모든 사람)는 강조색 칩으로(2026-10-21, 요청: "같은 종류의 건물을 모두 하이라이팅" → "칩형태로 강조해줘") —
                 보이지 않던 마우스 상자를 강조색으로 칠한다 · 글자색은 그대로(요청: "폰트색은 그대로"). */
              const hl = hover !== null && hover.tech.t === t.t && (!focus || focus === l.group);   /* 고른 사람이 있으면 그 줄만(요청: "테크도 다른 사람 건 하이라이트 제외") */
              const show = (): void => { setHover({ tech: t }); onAt(t.e / 60); };
              return (
                <g
                  key={t.t} className="scr-tl-hit"
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") show(); }}
                  onPointerLeave={(e) => { if (e.pointerType === "mouse") setHover(null); }}
                  onPointerDown={(e) => { lastPtr.current = e.pointerType; }}
                  onClick={() => { if (lastPtr.current !== "mouse") { if (hover?.tech === t) { setHover(null); onAt(null); } else show(); } }}
                >
                  <rect className={`scr-tl-chip${hl ? " is-hl" : ""}`} x={cx0} y={y} width={w} height={CH} rx={RX} />
                  <text
                    className="scr-tl-label" x={cx0 + w / 2} y={y + CH / 2} textAnchor="middle" dominantBaseline="central"
                    style={{ fontSize: FS }}
                  >{label}</text>
                </g>
              );
            })}
            {/* 닉네임 칩은 테크 글자 위에(폰은 판 안으로 넘칠 수 있어 가리지 않게 맨 위) */}
            <NameChip name={shortName(l.name, font.label)} color={l.color} right={Math.max(PL - 6, chipWOf(shortName(l.name, font.label), font.label))} cy={top + h / 2} fs={font.label} big={focus === l.group} onPick={() => onFocus(l.group)} />
          </g>
          );
        })}
        {ticksX.filter((m) => m !== 0 && (at === null || Math.abs(x(m * 60) - x(at * 60)) > 30)).map((m) => (
          <text key={m} className="scr-rc-axis" x={x(m * 60)} y={H - 5} textAnchor="middle" style={{ fontSize: font.axis }}>{m}분</text>
        ))}
        {/* 세로 점선(모든 사람 칸을 가로질러 · 요청: "세로 점선 표시(전체인원)") · 그 시각은 가로축에 — 테크 칩이면 완공 시각(분:초), 아니면 분. */}
        {at !== null && <line className="scr-rc-cross" x1={x(at * 60)} x2={x(at * 60)} y1={4} y2={H - AXIS_H} />}
        {at !== null && (
          <text className="scr-rc-at" x={x(at * 60)} y={H - 5} textAnchor="middle" style={{ fontSize: font.axis }}>
            {hover ? clock(hover.tech.e) : `${Math.round(at)}분`}
          </text>
        )}
      </svg>
      </div>
    </figure>
  );
}

/** 건물 짧은 이름 — 테크(TECH_LABEL) + 본진·보급·가스·방어(서버 series.BUILDINGS 와 짝). */
const BUILD_LABEL: Record<number, string> = {
  ...TECH_LABEL,
  106: "커맨드", 109: "서플", 110: "리파이너리", 124: "터렛", 125: "벙커",
  130: "감염커맨드", 131: "해처리", 143: "크립", 144: "스포어", 146: "성큰", 149: "익스트랙터",
  154: "넥서스", 156: "파일런", 157: "어시밀레이터", 162: "캐논", 172: "배터리",
};
/** 첫 본진(경기 시작부터 있던 커맨드 · 해처리 · 넥서스) — '테크 건물만'에서도 보인다(2026-10-21, 요청: "첫 스타팅 기지도 표현"). */
const MAIN_HALL = new Set([106, 131, 154]);
/** PC 건설 줄 치수(px) — 종류마다 한 칸: 위에 이름(label 높이) · 아래에 그 종류 건물마다 가는 선 한 줄(step 간격) · 칸 끝 숨(pad). */
const BL = { fs: 10.5, label: 13, step: 3.5, pad: 5 } as const;

type BuildLane = { key: string; group: string; name: string; color: string; blds: GameCurve["blds"] };

/** ★ PC 건설 줄(2026-10-21, 요청: "PC 에서만 테크 건물 → 건설로 바꾸고 모든 건물 건설 및 유지 기간 보여줘(파괴되기 전까지 선으로) · 테크 건물만 토글") —
 *  사람마다 칸 · 그 안에 건물 종류마다 작은 칸(처음 지은 차례) · 건물 한 채가 선 하나: 짓는 동안은 점선 · 다 지은 뒤 사라질 때까지 실선(끝까지 남으면 판 끝까지).
 *  같은 종류 여러 채는 겹치지 않게 줄을 나눈다. 변태(레어 · 성큰 …)는 같은 선에서 이어진다 — 변태하는 동안 점선 · 그 뒤 실선 · 그 줄의 첫 변태 시작 자리에 새 이름
 *  (요청: "레어 성큰같이 변태하는 건 라이프타임 선 중간에 변경되게"). 선에 마우스를 얹으면 세로선이 그 건물의 완공(못 지었으면 착공) 때로 · 가로축에 분:초. */
function BuildLanes({ lanes, maxX, ticksX, w: CW, padL: PL, padR, font, focus, onFocus, at, onAt, techOnly, onTechOnly }: {
  lanes: BuildLane[]; maxX: number; ticksX: number[]; w: number; padL: number; padR: number;
  font: { label: number; axis: number };
  focus: string | null;
  onFocus: (key: string) => void;
  at: number | null;
  onAt: (m: number | null) => void;
  techOnly: boolean;
  onTechOnly: (v: boolean) => void;
}) {
  const [hover, setHover] = useState<GameCurve["blds"][number] | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const AXIS_H = font.axis + 8 + AXIS_DROP;
  const END = maxX * 60;
  const x = (sec: number): number => PL + Math.min(1, sec / END) * (CW - PL - padR);
  const pick = (clientX: number): void => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * CW;
    setHover(null);
    onAt(Math.max(0, Math.min(maxX, Math.round(((sx - PL) / (CW - PL - padR)) * maxX))));
  };
  const scrub = useScrub(pick, () => { setHover(null); onAt(null); }, (t) => !!(t as Element | null)?.closest?.(".scr-bl-hit, .scr-tl-name"));
  let y0 = 4;
  const rows = lanes.map((l) => {
    const shown = l.blds.filter((b) => !techOnly || b.t in TECH_LABEL || b.m.some(([t]) => t in TECH_LABEL) || (b.s === 0 && MAIN_HALL.has(b.t)));
    const order: number[] = [];
    for (const b of shown) if (!order.includes(b.t)) order.push(b.t);
    let yy = y0 + 4;
    const groups = order.map((t) => {
      const ends: number[] = [];
      const items = shown.filter((b) => b.t === t).map((b) => {
        let k = ends.findIndex((e) => e <= b.s);
        if (k < 0) { k = ends.length; ends.push(0); }
        ends[k] = b.e ?? Infinity;
        return { b, k };
      });
      /* 그 줄의 변태 이름 — 종류마다 처음 변태를 시작한 자리에 한 번(성큰 여럿이 줄마다 이름을 달지 않게 · 2026-10-21, 요청: "변태 건물도 변태 시작점에 이름"). */
      const morphs = new Map<number, number>();
      for (const { b } of items) for (const [mt, ms] of b.m) if (!morphs.has(mt) || ms < (morphs.get(mt) ?? Infinity)) morphs.set(mt, ms);
      const g = { t, items, top: yy, morphs: [...morphs] };
      yy += BL.label + ends.length * BL.step + BL.pad;
      return g;
    });
    const h = Math.max(yy - y0 + 2, 36);
    const row = { l, groups, top: y0, h };
    y0 += h;
    return row;
  });
  const H = y0 + AXIS_H;
  return (
    <figure className="scr-rc-chart">
      <figcaption className="scr-rc-title">건설<TitleSwitch label="테크 건물만" on={techOnly} onChange={onTechOnly} /></figcaption>
      <div className="scr-rc-plot">
      <svg ref={svgRef} viewBox={`0 0 ${CW} ${H}`} className="scr-rc-svg scr-tl-svg" role="img" aria-label="건물을 짓고 잃은 때" {...scrub}>
        {rows.map(({ l, groups, top, h }) => (
          <g key={l.key} className={focus === l.group ? "scr-tl-row is-focus" : focus ? "scr-tl-row is-dim" : "scr-tl-row"}>
            <line className="scr-rc-grid" x1={PL} x2={CW - padR} y1={top + h} y2={top + h} />
            {groups.map((g) => (
              <g key={g.t}>
                <text className="scr-tl-label" x={x(g.items[0].b.s)} y={g.top + BL.label - 3} style={{ fontSize: BL.fs }}>{BUILD_LABEL[g.t] ?? `#${g.t}`}</text>
                {g.morphs.map(([mt, at9]) => (
                  <text key={mt} className="scr-tl-label scr-bl-morph" x={x(at9)} y={g.top + BL.label - 3} style={{ fontSize: BL.fs }}>→ {BUILD_LABEL[mt] ?? `#${mt}`}</text>
                ))}
                {g.items.map(({ b, k }) => {
                  const ly = g.top + BL.label + k * BL.step + 1;
                  const end = b.e ?? END;
                  /* 토막 — [시작, 끝, 짓는 중(점선)?] · 짓기 → 살아 있음 → (변태 중 → 살아 있음)… */
                  const segs: [number, number, boolean][] = [];
                  let t9 = b.s;
                  const building = (a: number, z: number | null): void => { if (z === null) { segs.push([a, end, true]); t9 = end; } else { if (z > a) segs.push([a, z, true]); t9 = z; } };
                  building(t9, b.d);
                  for (const [, ms, md] of b.m) {
                    if (ms > t9) segs.push([t9, ms, false]);
                    building(ms, md);
                  }
                  if (end > t9) segs.push([t9, end, false]);
                  const show = (): void => { setHover(b); onAt((b.d ?? b.s) / 60); };
                  return (
                    <g
                      key={`${b.s}:${k}`} className={hover === b ? "scr-bl-hit is-hl" : "scr-bl-hit"}
                      onPointerEnter={(e) => { if (e.pointerType === "mouse") show(); }}
                      onPointerLeave={(e) => { if (e.pointerType === "mouse") setHover(null); }}
                    >
                      {segs.map(([a, z, building], si) => (
                        <line key={si} className={building ? "scr-bl-build" : "scr-bl-live"} x1={x(a)} x2={x(z)} y1={ly} y2={ly} />
                      ))}
                      <line className="scr-bl-pad" x1={x(b.s)} x2={x(end)} y1={ly} y2={ly} />
                    </g>
                  );
                })}
              </g>
            ))}
            <NameChip name={shortName(l.name, font.label)} color={l.color} right={Math.max(PL - 6, chipWOf(shortName(l.name, font.label), font.label))} cy={top + h / 2} fs={font.label} big={focus === l.group} onPick={() => onFocus(l.group)} />
          </g>
        ))}
        {ticksX.filter((m) => m !== 0 && (at === null || Math.abs(x(m * 60) - x(at * 60)) > 30)).map((m) => (
          <text key={m} className="scr-rc-axis" x={x(m * 60)} y={H - 5} textAnchor="middle" style={{ fontSize: font.axis }}>{m}분</text>
        ))}
        {at !== null && <line className="scr-rc-cross" x1={x(at * 60)} x2={x(at * 60)} y1={4} y2={H - AXIS_H} />}
        {at !== null && (
          <text className="scr-rc-at" x={x(at * 60)} y={H - 5} textAnchor="middle" style={{ fontSize: font.axis }}>
            {hover ? clock(hover.d ?? hover.s) : `${Math.round(at)}분`}
          </text>
        )}
      </svg>
      </div>
    </figure>
  );
}

const teamNo = (team: string): 1 | 2 => (team === "team2" ? 2 : 1);

/** 0 부터 v 를 덮는 둥근 눈금(간격 1 · 2 · 2.5 · 5 × 10ⁿ · 칸 수 ≤ n) — 끝 눈금이 판의 세로 끝이다. */
function niceTicks(v: number, n = 5): number[] {
  const top = Math.max(1, v);
  const p = 10 ** Math.floor(Math.log10(top / n));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((st) => st >= 1 && Math.ceil(top / st) <= n) ?? 10 * p;
  return Array.from({ length: Math.ceil(top / step) + 1 }, (_, i) => i * step);
}

export default function GameCurvesModal({ game, onClose }: { game: GameResult; onClose: () => void }) {
  useLockBodyScroll();
  const memberOf = useAppStore((s) => s.memberOf);
  /* 폰(2026-10-21, 요청: "모바일에서도 볼 수 있게" → … → "모바일 기기 화면폭") — 화면 가득 · 세 판은 화면 폭에 맞춰 그린다 · 글자는 통계 폰 눈금 크기(배수 1). */
  const mobile = useIsMobile();
  /* 글자(px) — PC 는 통계 PC 와 같은 GRAPH_FS.pc · 폰은 GRAPH_FS.gameMobile. 테크 글자는 TL. */
  const font = mobile ? GRAPH_FS.gameMobile : GRAPH_FS.pc;
  const [players, setPlayers] = useState<GameCurve[] | null>(null);
  /* 두 곡선 판(인구 · 일꾼)은 같은 높이 — 판 폭은 잰 그대로, 높이는 (화면 높이 − 머리·제목) ÷ 3 · 최소 216. 테크 판은 사람 수에 비례(TL.row).
     잰 크기 그대로(1:1) 그려 글자·선이 늘거나 줄지 않는다. */
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    /* 테크 판 높이는 사람 수에 비례(TechLanes · TL.row) — 여기 높이는 두 곡선 판의 것. */
    const measure = (): void => setBox({
      w: Math.floor(el.clientWidth),
      h: Math.max(216, Math.floor((window.innerHeight - 330) / 3)),
    });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [players]);
  const [error, setError] = useState("");
  /* 보기(팀전만 · 2026-10-21, 요청: "팀 보기 토글 — 켜면 팀색 · 두 그래프는 팀 합산" → "유저별(개인색) / 유저별(팀색) / 팀별 합산 세 개로") —
     팀별 합산이면 두 곡선 판은 팀마다 한 줄이고, 테크 줄은 사람마다 그대로(색만 팀색) · 칩을 누르면 그 사람의 팀을 고른다. */
  const [view, setView] = useState<ViewMode>("player");
  /* 인구 그래프의 '일꾼 제외'(2026-10-21, 요청: "인구 그래프 타이틀 옆에 일꾼 제외 라벨드 토글") — 켜면 일꾼 뺀 인구(sx). */
  const [noWorker, setNoWorker] = useState(false);
  const spKey: CurveKey = noWorker ? "sx" : "sp";
  /* PC 건설 줄의 '테크 건물만'(2026-10-21, 요청: "테크 건물만 토글 넣고"). */
  const [techOnly, setTechOnly] = useState(false);
  /* 끝 칩을 누르면 그 사람 선만 굵게(2026-10-21, 요청: "칩터치 → 그 그래프만 두껍게 보기로 변경" — 옛 끄고 켜기 대신) · 두 판이 같이 쓴다. */
  const [focus, setFocus] = useState<string | null>(null);
  /* 세 판이 한 세로선(분)을 같이 쓴다(요청: "세로선을 모든 테크 & 그래프 간 동기화"). */
  const [at, setAt] = useSharedCross();

  useEffect(() => {
    let alive = true;
    api.getGameCurves(game.id)
      .then((p) => { if (alive) setPlayers(p); })
      .catch((e) => { if (alive) { setError(e instanceof Error ? e.message : "그래프를 불러오지 못했어요."); setPlayers([]); } });
    return () => { alive = false; };
  }, [game.id]);

  const personalOk = useMemo(() => {
    const cs = (players ?? []).map((p) => p.color).filter((c): c is string => !!c);
    return cs.length === (players ?? []).length && new Set(cs).size > 1;
  }, [players]);
  const teamGame = useMemo(() => {
    const ps = players ?? [];
    const n1 = ps.filter((p) => teamNo(p.team) === 1).length;
    return n1 > 0 && n1 < ps.length && Math.max(n1, ps.length - n1) > 1;
  }, [players]);
  const mode: ViewMode = teamGame ? view : "player";
  const teamOn = mode === "teamSum";
  /* 원작 팔레트는 전체 참가자 자리 차례로(볼 사람을 골라도 색이 안 바뀌게). */
  const colorOf = (p: GameCurve): string => (mode !== "player"
    ? TEAM_COLOR[teamNo(p.team)]
    : personalOk && p.color ? p.color : BW_PALETTE[Math.max(0, (players ?? []).indexOf(p)) % BW_PALETTE.length]);
  /* 볼 사람(2026-10-21, 요청: "맨 위에 유저 선택 체크박스 추가해서 볼 유저만 선택 가능하게 하고 팀 구분해서 표시" → "모두 해제 · 모두 선택 단추") —
     뺀 사람은 모든 판에서 빠진다(팀 합산도). */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const shown = useMemo(() => (players ?? []).filter((p) => !hidden.has(p.playerName)), [players, hidden]);
  const toggleShown = (key: string): void => {
    setHidden((h) => { const n = new Set(h); if (n.has(key)) n.delete(key); else n.add(key); return n; });
    setFocus((f) => (f === key ? null : f));
  };
  const userGroups = teamGame
    ? ([1, 2] as const).map((t) => ({ t, ps: (players ?? []).filter((p) => teamNo(p.team) === t) }))
    : [{ t: 0, ps: players ?? [] }];
  const nameOf = (p: GameCurve): string => memberOf(p.memberId)?.nickname ?? p.playerName;
  /* 눈금은 이 판에 맞춘다(2026-10-21, 요청: "게임마다 적절한 눈금") — 통계의 고정 자(일꾼 100 · 인구 100 · 0/반/끝)가 아니라
     이 판 최댓값을 덮는 둥근 간격 눈금(세로 ≤5칸 · 가로 분 ≤7칸). */
  /* 그릴 줄 — 팀 보기면 팀마다 분별 합(그 팀에서 아직 선이 있는 사람만 더한다 · 길이는 그 팀에서 가장 긴 사람). */
  /* 자원 = 그 분에 쥔 미네랄(rm) · 가스(rg) — 판을 나눈다(PC · 2026-10-21, 요청: "자원 그래프 추가" → "미네랄 가스 분리"). */
  const series = useMemo((): ({ key: string; p: GameCurve | null; team: 1 | 2 } & Record<CurveKey, number[]>)[] => {
    const ps = shown.map((p) => ({ p, wk: p.wk, sp: p.sp, sx: p.sx, rm: p.rm, rg: p.rg }));
    if (!teamOn) return ps.map((q) => ({ key: q.p.playerName, team: teamNo(q.p.team), ...q }));
    const sum = (ms: typeof ps, k: CurveKey): number[] =>
      Array.from({ length: Math.max(0, ...ms.map((q) => q[k].length)) }, (_, m) => ms.reduce((a, q) => a + (q[k][m] ?? 0), 0));
    return ([1, 2] as const).map((t) => {
      const ms = ps.filter((q) => teamNo(q.p.team) === t);
      return { key: `team${t}`, p: null, team: t, wk: sum(ms, "wk"), sp: sum(ms, "sp"), sx: sum(ms, "sx"), rm: sum(ms, "rm"), rg: sum(ms, "rg") };
    });
  }, [shown, teamOn]);
  const sc = useMemo(() => {
    const x = Math.max(1, ...series.map((s) => Math.max(s.wk.length, s.sp.length) - 1));
    const ticks = (k: CurveKey): number[] => niceTicks(Math.max(0, ...series.flatMap((s) => s[k])));
    return { x, xt: niceTicks(x, 7), wk: ticks("wk"), sp: ticks("sp"), sx: ticks("sx"), rm: ticks("rm"), rg: ticks("rg") };
  }, [series]);
  const linesOf = (key: CurveKey): ChartLine[] => series.flatMap((s) => (s[key].length < 2 ? [] : [s.p
    ? { key: s.key, label: shortName(nameOf(s.p), font.label), color: colorOf(s.p), ys: s[key] }
    : { key: s.key, label: `${s.team}팀`, color: TEAM_COLOR[s.team], ys: s[key] }]));
  /* 좌우 여백 — PC 는 닉네임 칩·끝 칩이 다 들어가게. 폰은 좁게(2026-10-21, 요청: "모바일 그래프 왼쪽 패딩 줄이고 테크트리의 닉네임칩 자리 모자라면
     그래프 안에 좀 넣기 · 오른쪽도 패딩 줄여") — 왼쪽은 세로 눈금 글자 자리만(닉네임 칩은 왼끝에 붙여 판 안으로 넘친다), 오른쪽은 끝 칩이 판 밖으로 나가면 끝점 왼쪽에. */
  const names = (players ?? []).map((p) => shortName(nameOf(p), font.label));
  const padR = mobile ? 10 : chipGutter(names, font.label);
  const PL = mobile ? 30 : 13 + Math.max(0, ...names.map((n) => chipWOf(n, font.label)));
  const pickFocus = (k: string): void => setFocus((f) => (f === k ? null : k));

  return createPortal(
    <div className="scr-modal-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <ModalHash hash="game-curves" onClose={onClose} />
      <div className="scr-modal scr-modal-graph" onClick={(e) => e.stopPropagation()}>
        <div className="scr-modal-head">
          <span>데이터<i className="scr-gc-sub">게임번호: {game.matchNo}</i></span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>
        <div className="scr-modal-body">
          {players === null ? (
            <div className="scr-rc-empty scr-gc-wait"><Spinner /> 불러오는 중…</div>
          ) : players.length === 0 ? (
            <div className="scr-rc-empty scr-gc-wait">{error || "표시할 데이터가 아직 없어요 — 재분석하면 생겨요"}</div>
          ) : (
            <div className="scr-gc" ref={boxRef}>
              <div className="scr-gc-users" aria-label="볼 사람">
                <div className="scr-gc-uall">
                  <button type="button" className="scr-compact-rect-btn is-secondary" disabled={hidden.size === 0} onClick={() => setHidden(new Set())}>모두 선택</button>
                  <button type="button" className="scr-compact-rect-btn is-secondary" disabled={shown.length === 0} onClick={() => { setHidden(new Set((players ?? []).map((p) => p.playerName))); setFocus(null); }}>모두 해제</button>
                </div>
                {userGroups.map((g) => (
                  <div key={g.t} className="scr-gc-ugroup">
                    {g.t > 0 && <span className="scr-gc-ulabel" style={{ color: TEAM_COLOR[g.t] }}>{g.t}팀</span>}
                    {g.ps.map((p) => (
                      <label key={p.playerName} className="scr-checkbox-field scr-gc-user">
                        <input type="checkbox" checked={!hidden.has(p.playerName)} onChange={() => toggleShown(p.playerName)} />
                        <i className="scr-gc-udot" style={{ background: colorOf(p) }} aria-hidden />
                        {nameOf(p)}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
              {teamGame && (
                <div className="scr-rc-mode" role="radiogroup" aria-label="보기">
                  {VIEW_MODES.map(([m, label]) => (
                    <button
                      key={m} type="button" role="radio" aria-checked={mode === m}
                      className={cx("scr-compact-rect-btn", mode !== m && "is-secondary")}
                      onClick={() => { setView(m); setFocus(null); }}
                    >{label}</button>
                  ))}
                </div>
              )}
              {box.w > 0 && (
                <>
                  {mobile ? (
                    <TechLanes
                      maxX={sc.x} ticksX={sc.xt} w={box.w} padL={PL} padR={padR} font={font} mobile={mobile} focus={focus} onFocus={pickFocus} at={at} onAt={setAt}
                      lanes={shown.map((p) => ({ key: p.playerName, group: teamOn ? `team${teamNo(p.team)}` : p.playerName, name: nameOf(p), color: colorOf(p), techs: p.techs }))}
                    />
                  ) : (
                    <BuildLanes
                      maxX={sc.x} ticksX={sc.xt} w={box.w} padL={PL} padR={padR} font={font} focus={focus} onFocus={pickFocus} at={at} onAt={setAt}
                      techOnly={techOnly} onTechOnly={setTechOnly}
                      lanes={shown.map((p) => ({ key: p.playerName, group: teamOn ? `team${teamNo(p.team)}` : p.playerName, name: nameOf(p), color: colorOf(p), blds: p.blds }))}
                    />
                  )}
                  <Chart
                    title="인구" titleExtra={<TitleSwitch label="일꾼 제외" on={noWorker} onChange={setNoWorker} />}
                    lines={linesOf(spKey)} maxX={sc.x} maxY={sc[spKey][sc[spKey].length - 1]} ticksX={sc.xt} ticksY={sc[spKey]} width={box.w} height={box.h} padL={PL} padR={mobile ? padR : undefined} focus={focus} onFocus={pickFocus} fs={font.label} axisFs={font.axis} padB={CHART_PAD.b + AXIS_DROP} at={at} onAt={setAt} />
                  <Chart title="일꾼 수" lines={linesOf("wk")} maxX={sc.x} maxY={sc.wk[sc.wk.length - 1]} ticksX={sc.xt} ticksY={sc.wk} width={box.w} height={box.h} padL={PL} padR={mobile ? padR : undefined} focus={focus} onFocus={pickFocus} fs={font.label} axisFs={font.axis} padB={CHART_PAD.b + AXIS_DROP} at={at} onAt={setAt} />
                  {!mobile && <Chart title="미네랄" note="그때 쥔 양" lines={linesOf("rm")} maxX={sc.x} maxY={sc.rm[sc.rm.length - 1]} ticksX={sc.xt} ticksY={sc.rm} width={box.w} height={box.h} padL={PL} padR={mobile ? padR : undefined} focus={focus} onFocus={pickFocus} fs={font.label} axisFs={font.axis} padB={CHART_PAD.b + AXIS_DROP} at={at} onAt={setAt} />}
                  {!mobile && <Chart title="가스" note="그때 쥔 양" lines={linesOf("rg")} maxX={sc.x} maxY={sc.rg[sc.rg.length - 1]} ticksX={sc.xt} ticksY={sc.rg} width={box.w} height={box.h} padL={PL} padR={mobile ? padR : undefined} focus={focus} onFocus={pickFocus} fs={font.label} axisFs={font.axis} padB={CHART_PAD.b + AXIS_DROP} at={at} onAt={setAt} />}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
