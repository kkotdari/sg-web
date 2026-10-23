import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, X } from "lucide-react";
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
type CurveKey = "wk" | "sp" | "sx" | "rm" | "rg" | "cm" | "cg" | "dd" | "dt";
/** 인구 · 데미지 · 자원 판 고르기(2026-10-22, 요청: "데미지와 인구를 탭으로 전환" → "인구 데미지 자원 세 개구나 탭이"). */
type GroupTab = "sp" | "dmg" | "rs";
const GROUP_TABS: [GroupTab, string][] = [["sp", "인구"], ["dmg", "데미지"], ["rs", "자원"]];
const cumsum = (a: readonly number[]): number[] => { let s = 0; return a.map((v) => (s += v)); };
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
/** 종족 글자(볼 사람 고르기의 색 동그라미 안). */
const RACE_LETTER: Record<string, string> = { 테란: "T", 프로토스: "P", 저그: "Z", 랜덤: "R" };
const clock = (sec: number): string => `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
/** 그 초의 인구(계단의 마지막 칸 · 없으면 null — 재분석 전 판). */
function supAt(spt: [number, number][] | undefined, sec: number): number | null {
  if (!spt || spt.length === 0) return null;
  let lo = 0; let hi = spt.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (spt[m][0] <= sec) lo = m + 1; else hi = m; }
  return lo ? spt[lo - 1][1] : 0;
}
/** ★ 칩 팝오버(2026-10-22, 요청: "데이터 창 건물(테크)에서 칩 클릭 시 정확한 시각과 그 시각의 인구수" → "팝오버로") — 누른 칩 위 가운데에 뜬다(판 밖으로는 안 나간다).
 *  x·y·w 는 판 자(판은 잰 폭 1:1 이라 그대로 px) · 줄마다 [무엇 · 분:초 · 그때 인구]. */
/*  ★ 줄은 **착공 시각만**(2026-10-23, 요청: "착공 시간만 표시하고 번호 매기지 않기 · 착공이라는 표현도 필요 없고 시간만 나열") — 옛 [착공 · 완공 · 사라짐] 과 묶음의 "N번" 걷음. */
/*  건물 이름(제목 줄)도 걷었다 — 칩에 이미 적혀 있다(같은 날 "팝오버에 건물명 반복 노노"). */
type ChipPopAt = { key: string; x: number; y: number; w: number; lines: { sec: number; sup: number | null }[] };
function ChipPop({ pop, width }: { pop: ChipPopAt; width: number }) {
  const left = Math.max(70, Math.min(width - 70, pop.x + pop.w / 2));
  return (
    <div className="scr-bl-pop" style={{ left, top: pop.y }} role="status">
      {pop.lines.map((l, i) => (
        <span key={i}>{clock(l.sec)}{l.sup !== null && <> · 인구 {l.sup}</>}</span>
      ))}
    </div>
  );
}
/** 판 밖을 누르면 팝오버를 닫는다(칩을 누른 건 칩이 처리). */
function useCloseOutside(open: boolean, plotRef: React.RefObject<HTMLDivElement | null>, hitSel: string, close: () => void): void {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: PointerEvent): void => {
      const t = e.target as Element | null;
      if (!t?.closest?.(hitSel) || !plotRef.current?.contains(t)) close();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

/** group — 고르기(focus) 단위: 평소 그 사람(key) · 팀 보기면 그 팀(두 곡선 판의 팀 줄 key). */
type Lane = { key: string; group: string; name: string; color: string; techs: GameCurve["techs"]; spt?: GameCurve["spt"] };
/** 테크 줄 치수(px · 2026-10-21, 요청: "테크트리 글자 굵기 줄이고 크기 한단만 낮춰줘" → "개인당 세 줄씩 확보해서 붙지 않게 · 총 세로 높이는 인원수에 비례" →
    "테크 행의 위아래 여백 살짝 증가" → "배율 대신 직접 값") — fs 테크 글자 · row 한 사람 칸 높이(세 단 + 위아래 숨) · tier 단 사이 · gap 같은 단 칩 사이.
    테크는 글자만 — 글자를 감싼 컴팩트 네모 칩 상자는 평소 보이지 않는 마우스 자리로 남아 겹침 가르기와 팝업 자리를 재고, 같은 종류 강조 때만 칠한다
    (요청: "직사각형 음영" → "테크트리 음영제거" → "칩형태로 강조 · 컴팩트 네모칩"). 테크 판 높이 = 사람 수 × row + 눈금 띠. */
const TL = {
  pc: { fs: 11, row: 64, tier: 1.65, gap: 4.4 },
  mobile: { fs: 10.5, row: 59, tier: 1.4, gap: 3.8 },   // 칩 키움(2026-10-23, 요청: "PC·폰에서 칩 크기 살짝 키우기" · 9.5 → 10.5 · 칸 55 → 59)
} as const;
/** 가로축 눈금 숫자를 가로축에서 더 띄우는 몫(2026-10-21, 요청: "가로축 눈금 숫자를 가로축에서 좀 더 아래로 · 데이터 창만") — 세 판 모두. */
const AXIS_DROP = 6;
/** 전체화면 2열 — 판 폭 이만큼이면 탭의 두 판을 나란히(한 판 ≈ 650) · 판 사이. 건설 줄은 온 폭. */
const FULL_TWO_COL = 1340;
const FULL_COL_GAP = 40;
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
  const [pop, setPop] = useState<ChipPopAt | null>(null);
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
  useCloseOutside(pop !== null, plotRef, ".scr-tl-hit", () => setPop(null));
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
      <figcaption className="scr-rc-title">테크</figcaption>
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
              const popKey = `${l.key}:${t.t}`;
              const popAt: ChipPopAt = { key: popKey, x: cx0, y, w, lines: [{ sec: t.s, sup: supAt(l.spt, t.s) }] };
              /* 마우스는 얹으면 팝오버도 뜨고 떼면 걷는다(2026-10-23, 요청: "PC 에서 마우스오버만으로도 팝오버 뜨게" — 좁은 창의 이 판도 PC 판 BuildLanes 와 같게) · 손가락은 탭. */
              return (
                <g
                  key={t.t} className="scr-tl-hit"
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") { show(); setPop(popAt); } }}
                  onPointerLeave={(e) => { if (e.pointerType === "mouse") { setHover(null); setPop((p) => (p?.key === popKey ? null : p)); } }}
                  onPointerDown={(e) => { lastPtr.current = e.pointerType; }}
                  onClick={() => { if (lastPtr.current !== "mouse") { setPop((p) => (p?.key === popKey ? null : popAt)); if (hover?.tech === t) { setHover(null); onAt(null); } else show(); } }}
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
      {pop && <ChipPop pop={pop} width={CW} />}
      </div>
    </figure>
  );
}

/** 건물 짧은 이름 — 테크(TECH_LABEL) + 본진·보급·가스·방어(서버 series.BUILDINGS 와 짝). */
const BUILD_LABEL: Record<number, string> = {
  ...TECH_LABEL,
  106: "커맨드", 109: "서플", 110: "리파이너리", 124: "터렛", 125: "벙커",
  130: "감염커맨드", 131: "해처리", 143: "크립", 144: "스포어", 146: "성큰", 149: "익스트랙터",
  154: "넥서스", 156: "파일런", 157: "어시밀레이터", 162: "포토", 172: "배터리",
};
/** 변태 취소의 이름 — 취소하면 종류가 안 바뀌어 트랙에 무엇으로 변태하던 중이었는지가 없다. 바탕 건물로 어림한다(크립은 성큰 · 스포어 둘 다 될 수 있다). */
const MORPH_TO: Record<number, string> = { 131: "레어", 132: "하이브", 141: "그레이터", 143: "성큰·스포어" };
/** 애드온 → 붙는 본 건물(서버 series.ADDON_HOSTS 와 짝) — 같이 강조. 컴샛·핵사일로 → 커맨드 · 컨트롤타워 → 스타포트 · 코버트·피직스 → 사이언스 · 머신샵 → 팩토리. */
const ADDON_HOST9: Record<number, number> = { 107: 106, 108: 106, 115: 114, 117: 116, 118: 116, 120: 113 };
/** 첫 본진(경기 시작부터 있던 커맨드 · 해처리 · 넥서스) — '테크 건물만'에서도 보인다(2026-10-21, 요청: "첫 스타팅 기지도 표현"). */
const MAIN_HALL = new Set([106, 131, 154]);
/** PC 건설 줄 치수(px) — 건물 한 채마다 컴팩트 칩(fs 글자 · chipBox) · 칩 사이 gap · 단 사이 숨 tier · 사람 칸 위아래 숨 pad ·
 *  단 안에서 선을 비켜 놓는 높이 jig(가운데 · 위 · 아래 · 2026-10-22, 요청: "미묘하게 높이를 다양화해서 선이 최대한 안 겹치게"). */
const BL = { fs: 10.5, gap: 3, tier: 2.5, pad: 6, link: 10 } as const;   // link 8 → 10(2026-10-23 — 선이 화살표가 되어 촉 5px 뒤에도 대가 보이게) · 칩 키움(2026-10-23, 요청: "칩 크기 살짝 키우기" · 9.5 → 10.5) · link = 변태·애드온 칩을 잇는 선의 최소 길이(옛 jig 걷음 — 수명 선이 없다)

type BuildLane = { key: string; group: string; name: string; color: string; blds: GameCurve["blds"]; spt?: GameCurve["spt"] };

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
  /** 얹은 칩의 건물 종류 — 같은 종류 칩을 모두 강조색으로(아래 ★). */
  const [hoverKind, setHoverKind] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const [pop, setPop] = useState<ChipPopAt | null>(null);
  useCloseOutside(pop !== null, plotRef, ".scr-bl-hit", () => setPop(null));
  /** 마우스를 얹은 칩 하나(진짜 주인공) — 같은 종류 강조보다 진하게 · 맨 위(svg 끝)에 한 번 더 그린다(아래 ★). */
  const [me, setMe] = useState<{ key: string; lane: BuildLane; x: number; y: number; w: number; label: string } | null>(null);
  const lastPtr = useRef("mouse");
  const AXIS_H = font.axis + 8 + AXIS_DROP;
  const END = maxX * 60;
  const x = (sec: number): number => PL + Math.min(1, sec / END) * (CW - PL - padR);
  const pick = (clientX: number): void => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * CW;
    onAt(Math.max(0, Math.min(maxX, Math.round(((sx - PL) / (CW - PL - padR)) * maxX))));
  };
  const scrub = useScrub(pick, () => { setHoverKind(null); setMe(null); onAt(null); }, (t) => !!(t as Element | null)?.closest?.(".scr-bl-hit, .scr-tl-name"));
  /* ★ 건물 한 채 = 칩 하나(2026-10-22) · 사람 칸 안에서 **착공 차례**로 늘어놓고 칩끼리만 안 겹치게 위 단부터 빈자리에 넣는다.
     ★★ **선은 걷었다**(2026-10-23, 요청: "선 제거 — 선은 애드온이나 변태에만 연결 · 선은 필요시 꺾을 수 있음") — 수명 선(짓는 중 점선 · 산 동안 실선)은 없고,
     한 채의 칩들(본 칩 → 변태 "레어" · 애드온 "머신샵" · 변태 취소)만 같은 단에서 **잇는 선**으로 엮는다. 뒤 칩이 앞 칩과 겹치면 오른쪽으로 밀고 그 사이를 잇는다.
     ★ 잇는 선이 **화살표**다(2026-10-23, 요청: "애드온 + 없애기 · 변태 화살표 없애고 선을 화살표로") — 칩 글자의 "→ " · "+" 머리는 걷고, 선 끝(뒤 칩 쪽)에 화살촉.
     ★ **자세히 보기에서는 가까운 때의 같은 건물을 묶는다**(같은 날 "근처 시간대에 같은 건물 칩은 ×3 이렇게 묶기 · 팝업엔 각각 다") — 딸린 칩이 없는(변태·애드온·변태 취소 없는)
     같은 종류를 앞 채 착공에서 GROUP_SEC 안이면 한 칩 "서플 ×3" 으로 · 팝업은 채마다 착공 시각(번호 없이).
     (걷어냄) 시간선 처지(짓는 중 연하게 · 사라짐 취소선 · 아직 점선) — 2026-10-23, 요청: "시간축에 따른 효과 제거". 못 지은 것만 딤(is-cut). */
  const { h: CH, px: PX, r: RX } = chipBox(BL.fs);
  const arrowId = `scr-bl-arrow${useId().replace(/:/g, "")}`;   // 잇는 선의 화살촉(svg defs · 판마다 제 id)
  const STEP = CH + 2 * BL.tier;
  const RIGHT = CW - padR;
  const chipW = (label: string): number => textW(label, BL.fs) + 2 * PX;
  type Bld = GameCurve["blds"][number];
  /** kind — 그 칩이 말하는 건물 종류(같은 종류 강조) · at — 그 칩의 때(초) · what — 무엇(본 칩 착공 · 변태 · 붙음 · 변태 시작) · grp — 묶음(×N)의 채들. */
  type Tag = { x: number; w: number; label: string; at: number; what: string; kind?: number; cut?: boolean; grp?: Bld[] };
  const GROUP_SEC = 45;
  let y0 = 4;
  const rows = lanes.map((l) => {
    /* ★ 애드온은 **본 건물의 칩 줄**에(2026-10-22) — 서버가 붙어 있던 구간마다 [본 건물 차례, 붙은 초](b.h)를 준다. 본 건물을 못 찾은 것은 제 칩. */
    const onHost9 = new Map<Bld, { at: number; a: Bld }[]>();
    for (const a of l.blds) for (const [hi9, at9] of a.h ?? []) {
      const host9 = l.blds[hi9];
      if (!host9) continue;
      const got9 = onHost9.get(host9);
      if (got9) got9.push({ at: at9, a }); else onHost9.set(host9, [{ at: at9, a }]);
    }
    const shown = l.blds
      .filter((b) => !(b.h && b.h.length > 0 && b.h.some(([hi9]) => !!l.blds[hi9])))
      .filter((b) => !techOnly || b.t in TECH_LABEL || b.m.some(([t]) => t in TECH_LABEL) || (b.s === 0 && MAIN_HALL.has(b.t)))
      .slice().sort((p, q) => p.s - q.s);
    const tag = (at9: number, label: string, what: string, extra?: Partial<Tag>): Tag => {
      const w = chipW(label);
      return { x: Math.min(x(at9), RIGHT - w), w, label, at: at9, what, ...extra };
    };
    /* 한 채(또는 묶음)의 칩들 — 때 차례 · 뒤 칩은 앞 칩 오른끝 + 잇는 몫 뒤로 민다(잇는 선이 설 자리). */
    const units: { bs: Bld[]; tags: Tag[] }[] = [];
    const open9 = new Map<number, { bs: Bld[]; tags: Tag[] }>();
    for (const b of shown) {
      const plain9 = b.m.length === 0 && !(onHost9.get(b)?.length) && !(b.x?.length);
      const name9 = BUILD_LABEL[b.t] ?? `#${b.t}`;
      if (!techOnly && plain9) {
        const g9 = open9.get(b.t);
        if (g9 && b.s - g9.bs[g9.bs.length - 1].s <= GROUP_SEC) {
          g9.bs.push(b);
          const t0 = g9.tags[0];
          const lab9 = `${name9} ×${g9.bs.length}`;
          g9.tags[0] = { ...t0, label: lab9, w: chipW(lab9), x: Math.min(x(t0.at), RIGHT - chipW(lab9)), grp: g9.bs, cut: g9.bs.every((m) => m.d === null && m.e !== null) };
          continue;
        }
      }
      const tags: Tag[] = [tag(b.s, name9, "착공", { kind: b.t })];
      for (const [mt, ms] of b.m) {
        tags.push(tag(ms, BUILD_LABEL[mt] ?? `#${mt}`, "변태", { kind: mt }));
      }
      for (const { at: at9, a } of onHost9.get(b) ?? []) {
        tags.push(tag(at9, BUILD_LABEL[a.t] ?? `#${a.t}`, "붙음", { kind: a.t, cut: a.d === null && a.e !== null }));
      }
      for (const [xs] of b.x ?? []) {
        const base = b.m.filter(([, , md]) => md !== null && md <= xs).map(([mt]) => mt).pop() ?? b.t;
        tags.push(tag(xs, MORPH_TO[base] ?? "변태", "변태 시작", { cut: true }));
      }
      tags.sort((p, q) => p.at - q.at);
      for (let ti = 1; ti < tags.length; ti += 1) {
        const pv = tags[ti - 1]; const t = tags[ti];
        t.x = Math.min(Math.max(t.x, pv.x + pv.w + BL.link), RIGHT - t.w);
      }
      const u9 = { bs: [b], tags };
      units.push(u9);
      if (!techOnly && plain9) open9.set(b.t, u9); else open9.delete(b.t);
    }
    /* 자리는 칩만이 아니라 **잇는 선이 지나는 폭까지**다(같은 날 지적 — 해처리 → 레어 선이 같은 단의 스포닝풀·크립 밑을 지나갔다) — 딸린 칩이 있는 채는 첫 칩 왼끝부터 끝 칩 오른끝까지 한 덩이로 잡는다. */
    const used: [number, number][][] = [];
    const items = units.map((u) => {
      const spans: [number, number][] = u.tags.length > 1
        ? [[u.tags[0].x, Math.max(...u.tags.map((t) => t.x + t.w))]]
        : u.tags.map((t) => [t.x, t.x + t.w] as [number, number]);
      const free = (k: number): boolean => spans.every(([a0, z0]) => used[k].every(([a9, z9]) => z0 + BL.gap <= a9 || a0 >= z9 + BL.gap));
      let k = 0;
      while (k < used.length && !free(k)) k += 1;
      if (k === used.length) used.push([]);
      for (const sp of spans) used[k].push(sp);
      return { u, k };
    });
    const h = Math.max(used.length * STEP + 2 * BL.pad, 36);
    const row = { l, items, top: y0, h };
    y0 += h + AXIS_H;   // 사람마다 제 가로축 띠(아래 ★)
    return row;
  });
  const H = y0;
  const rowCls = (l: BuildLane): string => (focus === l.group ? "scr-tl-row is-focus" : focus ? "scr-tl-row is-dim" : "scr-tl-row");
  const lyOf = (top: number, k: number): number => top + BL.pad + BL.tier + k * STEP + CH / 2;
  /** 못 지은 것(짓다 사라짐 · 변태 취소 · 못 지은 애드온)만 딤(is-cut). 시간선 처지 표시는 걷었다(2026-10-23, 요청: "시간축에 따른 효과 제거"). */
  const stCls = (t: Tag): string | undefined => (t.cut ? "is-cut" : undefined);
  /* ★ 같은 종류 강조 — 얹은 칩의 종류(본 칩 = 처음 종류 · 변태 칩 = 새 종류)와 같은 칩은 사람과 상관없이 강조색(2026-10-22) · 애드온과 본 건물은 함께(ADDON_HOST9). */
  const tagHlOf = (t: Tag): boolean => hoverKind !== null && t.kind !== undefined
    && (t.kind === hoverKind || ADDON_HOST9[t.kind] === hoverKind || ADDON_HOST9[hoverKind] === t.kind);
  const chipOf = (t: Tag, ly: number, cls?: string): ReactElement => (
    <>
      <rect className={cx("scr-bl-chip", cls)} x={t.x} y={ly - CH / 2} width={t.w} height={CH} rx={RX} />
      <text className="scr-tl-label" x={t.x + PX} y={ly} dominantBaseline="central" style={{ fontSize: BL.fs }}>
        {t.label}
      </text>
    </>
  );
  /** 팝오버 — 그 칩의 시각(본 칩 = 착공 · 변태·애드온 칩 = 그 때) · 묶음이면 채마다 착공 시각을 나열(번호 없이). 줄마다 그때 인구. */
  const popOf = (l: BuildLane, t: Tag, key: string, ly: number): ChipPopAt => ({
    key, x: t.x, y: ly - CH / 2, w: t.w,
    lines: (t.grp ? t.grp.map((m) => m.s) : [t.at]).map((sec) => ({ sec, sup: supAt(l.spt, sec) })),
  });
  return (
    <figure className="scr-rc-chart">
      <figcaption className="scr-rc-title">테크<TitleSwitch label="간단히 보기" on={techOnly} onChange={onTechOnly} /></figcaption>
      <div className="scr-rc-plot" ref={plotRef}>
      <svg ref={svgRef} viewBox={`0 0 ${CW} ${H}`} className="scr-rc-svg scr-tl-svg" role="img" aria-label="건물을 짓고 잃은 때" {...scrub}>
        <defs>
          <marker id={arrowId} viewBox="0 0 6 6" refX="6" refY="3" markerWidth="5" markerHeight="5" markerUnits="userSpaceOnUse" orient="auto">
            <path className="scr-bl-arrowhead" d="M0,0 L6,3 L0,6 z" />
          </marker>
        </defs>
        {rows.map(({ l, items, top, h }) => (
          <g key={l.key} className={rowCls(l)}>
            <line className="scr-rc-grid" x1={PL} x2={CW - padR} y1={top + h} y2={top + h} />
            {/* ★ 가로축은 **사람마다**(2026-10-22) — 칸 아래 띠(AXIS_H)에 분 눈금 · 세로선의 분. */}
            {ticksX.filter((m) => m !== 0 && (at === null || Math.abs(x(m * 60) - x(at * 60)) > 30)).map((m) => (
              <text key={m} className="scr-rc-axis" x={x(m * 60)} y={top + h + AXIS_H - 5} textAnchor="middle" style={{ fontSize: font.axis }}>{m}분</text>
            ))}
            {at !== null && (
              <text className="scr-rc-at" x={x(at * 60)} y={top + h + AXIS_H - 5} textAnchor="middle" style={{ fontSize: font.axis }}>{`${Math.round(at)}분`}</text>
            )}
            {items.map(({ u, k }) => {
              const ly = lyOf(top, k);
              const b = u.bs[0];
              return (
                <g key={`${b.s}:${b.t}:${k}`} className="scr-bl-hit">
                  {/* 잇는 선 — 한 채의 앞 칩 오른끝 → 뒤 칩 왼끝(변태·애드온 · 같은 단이라 곧은 선). */}
                  {u.tags.slice(1).map((t, ti) => {
                    const pv = u.tags[ti];
                    if (t.x <= pv.x + pv.w + 0.5) return null;
                    return <line key={`l${ti}`} className="scr-bl-link" x1={pv.x + pv.w} x2={t.x - 1} y1={ly} y2={ly} markerEnd={`url(#${arrowId})`} />;
                  })}
                  {u.tags.map((t, ti) => {
                    const hl9 = tagHlOf(t);
                    /* 누르면 팝오버 · PC(마우스)는 얹자마자 뜨고 떼면 걷는다(2026-10-23). */
                    const popKey = `${l.key}:${b.s}:${b.t}:${ti}`;
                    return (
                    <g
                      key={ti} className={stCls(t)}
                      onPointerEnter={(e) => {
                        if (e.pointerType !== "mouse") return;
                        setHoverKind(t.kind ?? null);
                        setMe({ key: popKey, lane: l, x: t.x, y: ly - CH / 2, w: t.w, label: t.label });
                        setPop(popOf(l, t, popKey, ly));
                      }}
                      onPointerLeave={(e) => {
                        if (e.pointerType !== "mouse") return;
                        setHoverKind(null);
                        setMe((m) => (m?.key === popKey ? null : m));
                        setPop((p) => (p?.key === popKey ? null : p));
                      }}
                      onPointerDown={(e) => { lastPtr.current = e.pointerType; }}
                      onClick={() => { if (lastPtr.current !== "mouse") setPop((p) => (p?.key === popKey ? null : popOf(l, t, popKey, ly))); }}
                    >
                      {chipOf(t, ly, hl9 ? "is-hl" : undefined)}
                    </g>
                    );
                  })}
                </g>
              );
            })}
            <NameChip name={shortName(l.name, font.label)} color={l.color} right={Math.max(PL - 6, chipWOf(shortName(l.name, font.label), font.label))} cy={top + h / 2} fs={font.label} big={focus === l.group} onPick={() => onFocus(l.group)} />
          </g>
        ))}
        {at !== null && <line className="scr-rc-cross" x1={x(at * 60)} x2={x(at * 60)} y1={4} y2={H - AXIS_H} />}
        {/* ★ 강조는 **겹으로 위에**(2026-10-23) — 일반 줄을 다 그린 뒤 같은 종류의 칩 → 얹은 칩을 한 벌 더 그린다(pointer-events 없음 · 마우스는 밑의 원 칩이 받는다).
            얹은 칩은 같은 종류 강조보다 진하게 · 살짝 키워(1.15배). */}
        {hoverKind !== null && rows.map(({ l, items, top }) => (
          <g key={l.key} className={rowCls(l)} pointerEvents="none">
            {items.flatMap(({ u, k }) => u.tags.map((t, ti) => (tagHlOf(t) ? (
              <g key={`${u.bs[0].s}:${u.bs[0].t}:${k}:${ti}`} className={cx("scr-bl-hit", stCls(t))}>{chipOf(t, lyOf(top, k), "is-hl")}</g>
            ) : null)))}
          </g>
        ))}
        {me && (
          <g className={rowCls(me.lane)} pointerEvents="none">
            <g className="scr-bl-me" transform={`translate(${me.x + me.w / 2} ${me.y + CH / 2}) scale(1.15) translate(${-(me.x + me.w / 2)} ${-(me.y + CH / 2)})`}>
              <rect className="scr-bl-chip is-hl is-me" x={me.x} y={me.y} width={me.w} height={CH} rx={RX} />
              <text className="scr-tl-label" x={me.x + PX} y={me.y + CH / 2} dominantBaseline="central" style={{ fontSize: BL.fs }}>{me.label}</text>
            </g>
          </g>
        )}
      </svg>
      {pop && <ChipPop pop={pop} width={CW} />}
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

/** 오른쪽 칸으로 붙이는 화면 폭(PC) — 이보다 좁으면 늘 떠 있는 창. */
const DOCK_QUERY = "(min-width: 1280px)";
function useDockWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(DOCK_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(DOCK_QUERY);
    const sync = (): void => setWide(mq.matches);
    mq.addEventListener("change", sync);
    sync();
    return () => mq.removeEventListener("change", sync);
  }, []);
  return wide;
}

/** dock — 게임 상세에서 연 창. ★ PC 폭이 DOCK_QUERY 이상이면 **화면 오른쪽 칸**으로 붙는다(2026-10-22, 요청: "상세에서 데이터창 열면 PC 에서는 일정 폭 이상 시
 *  재생기를 줄이고 화면 우측에 나타내기") — 덮개·스크롤 잠금 없이 body.scr-gc-docked 가 상세 본문에 칸 폭만큼 오른쪽 여백을 줘 재생기가 줄어든다(global.css). */
export default function GameCurvesModal({ game, onClose, dock = false }: { game: GameResult; onClose: () => void; dock?: boolean }) {
  const docked = useDockWide() && dock;
  useLockBodyScroll(!docked);
  useEffect(() => {
    if (!docked) return undefined;
    document.body.classList.add("scr-gc-docked");
    return () => document.body.classList.remove("scr-gc-docked");
  }, [docked]);
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
  /* 전체화면(PC · 2026-10-21, 요청: "데이터창 전체화면 확대 버튼(우상단) — 폭이 허락하면 2열, 왼쪽 건설 · 오른쪽 자원 인구") —
     창 자체를 브라우저 전체화면으로 · Esc 로 나오면 원래 창. 막혀도 창은 화면을 채운다. */
  const modalRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  /* ★ 맨 위 고르기는 **내리면 숨고 올리면 나온다**(2026-10-22, 요청: "데이터 창 필터링부를 완전 스티키 말고 아래로 스크롤하면 숨기고 위로 스크롤 좀 하면 나오는 식") —
     창 몸의 스크롤 방향을 본다: 고르기 키(TOP_HIDE_AT)를 지나 아래로 TOP_STEP 넘게 내리면 숨기고, 위로 TOP_STEP 넘게 올리거나 맨 위 근처면 다시 보인다. 숨김은 위로 밀어 올림(.is-hidden). */
  const bodyRef = useRef<HTMLDivElement>(null);
  const [topHidden, setTopHidden] = useState(false);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return undefined;
    let last = el.scrollTop;
    const TOP_HIDE_AT = 140;
    const TOP_STEP = 8;
    const onScroll = (): void => {
      const y = el.scrollTop;
      const d = y - last;
      if (y < TOP_HIDE_AT) { setTopHidden(false); last = y; return; }
      if (Math.abs(d) < TOP_STEP) return;
      setTopHidden(d > 0);
      last = y;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const onChange = (): void => { if (!document.fullscreenElement) setFull(false); };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);
  const toggleFull = (): void => {
    if (full) {
      /* 브라우저 전체화면이면 **풀린 뒤에** 꼴을 걷는다(fullscreenchange · 2026-10-23, 지적: "데이터창 전체에서 줄일 때 잠깐 이상하게 보여") — 먼저 걷으면 풀리기까지 몇 프레임
         창이 전체화면인 채 반투명 바탕(일반 창 꼴)으로 그려져 검은 전체화면 바탕이 비쳐 회색으로 덮였다. 막혀서 창만 채웠던 때는 바로. */
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => setFull(false));
      else setFull(false);
    } else {
      setFull(true);
      void modalRef.current?.requestFullscreen?.().catch(() => {});
    }
  };
  const twoCol = full && box.w >= FULL_TWO_COL;
  const colW = twoCol ? Math.floor((box.w - FULL_COL_GAP) / 2) : box.w;
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    /* 테크 판 높이는 사람 수에 비례(TechLanes · TL.row) — 여기 높이는 두 곡선 판의 것. */
    /* 전체화면 2열이면 오른쪽 네 판이 화면 높이를 나눈다. */
    const measure = (): void => {
      const w = Math.floor(el.clientWidth);
      setBox({
        w,
        h: full && w >= FULL_TWO_COL ? Math.max(240, Math.floor((window.innerHeight - 330) / 2)) : Math.max(216, Math.floor((window.innerHeight - 330) / 3)),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [players, full]);
  const [error, setError] = useState("");
  /* 보기(팀전만 · 2026-10-21, 요청: "팀 보기 토글 — 켜면 팀색 · 두 그래프는 팀 합산" → "유저별(개인색) / 유저별(팀색) / 팀별 합산 세 개로") —
     팀별 합산이면 두 곡선 판은 팀마다 한 줄이고, 테크 줄은 사람마다 그대로(색만 팀색) · 칩을 누르면 그 사람의 팀을 고른다. */
  const [view, setView] = useState<ViewMode>("player");
  /* 인구 그래프의 '일꾼 제외'(2026-10-21, 요청: "인구 그래프 타이틀 옆에 일꾼 제외 라벨드 토글") — 켜면 일꾼 뺀 인구(sx). */
  const [noWorker, setNoWorker] = useState(false);
  const spKey: CurveKey = noWorker ? "sx" : "sp";
  const [tab, setTab] = useState<GroupTab>("sp");
  /* 데미지는 누적이 기본 · '분당'을 켜면 그 앞 1분 동안의 몫(2026-10-22, 요청: "누적을 기본 · 분당으로 전환 가능"). */
  const [dmgMin, setDmgMin] = useState(false);
  /* 자원은 누적(캔 양) 이 기본 · '순간'이면 그때 쥔 양(2026-10-22, 요청: "자원은 누적 · 순간"). */
  const [rsNow, setRsNow] = useState(false);
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
    const dm = (a: number[] | undefined): number[] => (dmgMin ? a ?? [] : cumsum(a ?? []));
    const ps = shown.map((p) => ({ p, wk: p.wk, sp: p.sp, sx: p.sx, rm: p.rm, rg: p.rg, cm: cumsum(p.cm ?? []), cg: cumsum(p.cg ?? []), dd: dm(p.dd), dt: dm(p.dt) }));
    if (!teamOn) return ps.map((q) => ({ key: q.p.playerName, team: teamNo(q.p.team), ...q }));
    const sum = (ms: typeof ps, k: CurveKey): number[] =>
      Array.from({ length: Math.max(0, ...ms.map((q) => q[k].length)) }, (_, m) => ms.reduce((a, q) => a + (q[k][m] ?? 0), 0));
    return ([1, 2] as const).map((t) => {
      const ms = ps.filter((q) => teamNo(q.p.team) === t);
      return { key: `team${t}`, p: null, team: t, wk: sum(ms, "wk"), sp: sum(ms, "sp"), sx: sum(ms, "sx"), rm: sum(ms, "rm"), rg: sum(ms, "rg"), cm: sum(ms, "cm"), cg: sum(ms, "cg"), dd: sum(ms, "dd"), dt: sum(ms, "dt") };
    });
  }, [shown, teamOn, dmgMin]);
  /* 가로 끝 = 곡선 끝과 건물 · 테크 기록 끝 중 늦은 쪽(2026-10-23, 지적: "끝에 줄 맞춰 나오는 거 — 동시에 저렇게 많은 건물을 착공할 리가 없는데") —
     옛 굽기는 분당 곡선을 40분에서 잘랐는데(서버 MAX_MINUTES · 이제 120) 건물 기록은 게임 끝까지라, 40분 뒤 착공이 모두 끝 자리에 눌려 한 세로줄로 섰다. */
  const lastEventMin = useMemo(() => Math.ceil(Math.max(0, ...shown.flatMap((p) => [
    ...p.blds.flatMap((b) => [b.s, b.d ?? 0, b.e ?? 0, ...b.m.map(([, ms]) => ms)]),
    ...p.techs.map((t) => t.e),
  ])) / 60), [shown]);
  const sc = useMemo(() => {
    const x = Math.max(1, lastEventMin, ...series.map((s) => Math.max(s.wk.length, s.sp.length) - 1));
    const ticks = (k: CurveKey): number[] => niceTicks(Math.max(0, ...series.flatMap((s) => s[k])));
    /* 준 · 입은 데미지는 한 자(둘 중 큰 쪽)를 같이 쓴다 — 두 판을 나란히 견준다. */
    const dmg = niceTicks(Math.max(0, ...series.flatMap((s) => [...s.dd, ...s.dt])));
    return { x, xt: niceTicks(x, 7), wk: ticks("wk"), sp: ticks("sp"), sx: ticks("sx"), rm: ticks("rm"), rg: ticks("rg"), cm: ticks("cm"), cg: ticks("cg"), dd: dmg, dt: dmg };
  }, [series, lastEventMin]);
  const linesOf = (key: CurveKey): ChartLine[] => series.flatMap((s) => (s[key].length < 2 ? [] : [s.p
    ? { key: s.key, label: shortName(nameOf(s.p), font.label), color: colorOf(s.p), ys: s[key] }
    : { key: s.key, label: `${s.team}팀`, color: TEAM_COLOR[s.team], ys: s[key] }]));
  /* 좌우 여백 — PC 는 닉네임 칩·끝 칩이 다 들어가게. 폰은 좁게(2026-10-21, 요청: "모바일 그래프 왼쪽 패딩 줄이고 테크트리의 닉네임칩 자리 모자라면
     그래프 안에 좀 넣기 · 오른쪽도 패딩 줄여") — 왼쪽은 세로 눈금 글자 자리만(닉네임 칩은 왼끝에 붙여 판 안으로 넘친다), 오른쪽은 끝 칩이 판 밖으로 나가면 끝점 왼쪽에. */
  const names = (players ?? []).map((p) => shortName(nameOf(p), font.label));
  const padR = mobile ? 10 : chipGutter(names, font.label);
  const PL = mobile ? 30 : 13 + Math.max(0, ...names.map((n) => chipWOf(n, font.label)));
  const pickFocus = (k: string): void => setFocus((f) => (f === k ? null : k));

  const lanesEl = mobile ? (
    <TechLanes
      maxX={sc.x} ticksX={sc.xt} w={box.w} padL={PL} padR={padR} font={font} mobile={mobile} focus={focus} onFocus={pickFocus} at={at} onAt={setAt}
      lanes={shown.map((p) => ({ key: p.playerName, group: teamOn ? `team${teamNo(p.team)}` : p.playerName, name: nameOf(p), color: colorOf(p), techs: p.techs, spt: p.spt }))}
    />
  ) : (
    <BuildLanes
      maxX={sc.x} ticksX={sc.xt} w={box.w} padL={PL} padR={padR} font={font} focus={focus} onFocus={pickFocus} at={at} onAt={setAt}
      techOnly={techOnly} onTechOnly={setTechOnly}
      lanes={shown.map((p) => ({ key: p.playerName, group: teamOn ? `team${teamNo(p.team)}` : p.playerName, name: nameOf(p), color: colorOf(p), blds: p.blds, spt: p.spt }))}
    />
  );
  const chartOf = (k: CurveKey, title: string, extra: { note?: string; titleExtra?: ReactNode } = {}): ReactNode => (
    <Chart
      title={title} {...extra}
      lines={linesOf(k)} maxX={sc.x} maxY={sc[k][sc[k].length - 1]} ticksX={sc.xt} ticksY={sc[k]} width={colW} height={box.h} padL={PL} padR={mobile ? padR : undefined} focus={focus} onFocus={pickFocus} fs={font.label} axisFs={font.axis} padB={CHART_PAD.b + AXIS_DROP} at={at} onAt={setAt} />
  );
  /* 자원 판은 폰도(2026-10-22, 요청: "모바일에도 자원판 추가" · 옛 PC 만). */
  const rgEl = chartOf("rg", "가스");
  /* 인구 탭의 인구 판 제목은 "전체"(2026-10-22, 요청: "인구 탭의 인구 헤더 타이틀을 전체로 변경"). */
  const spEl = chartOf(spKey, "전체", { titleExtra: <TitleSwitch label="일꾼 제외" on={noWorker} onChange={setNoWorker} /> });
  const wkEl = chartOf("wk", "일꾼 수");
  /* 데미지 탭(2026-10-22, 요청: "딜 피해 그래프") — 적에게 준 · 적에게 입은 체력+실드(유닛 + 건물 합). 팀별 합산이어도 두 판 다(같은 날 "팀별 합산이어도 각각").
     옛 판(참값 판 13 아래)은 데이터가 없어 재분석하라는 글. */
  const hasDmg = (players ?? []).some((p) => (p.dd?.length ?? 0) > 1);
  /* 판 제목 옆 작은 탭 — 데미지 누적 · 분당(2026-10-22, 요청: "분당 누적도 작은 탭으로" · 옛 '분당' 스위치) · 자원 누적 · 순간(같은 날). */
  const miniTabs = (on: boolean, set: (v: boolean) => void, off: string, onLabel: string): ReactNode => (
    <span className="scr-line-tabs scr-gc-minitabs" role="tablist" aria-label={`${off} · ${onLabel}`}>
      {([[false, off], [true, onLabel]] as const).map(([v, label]) => (
        <button key={label} type="button" role="tab" aria-selected={on === v} className={cx("scr-line-tab-btn", on === v && "is-on")} onClick={() => set(v)}>{label}</button>
      ))}
    </span>
  );
  /* 캔 자원은 재분석한 판만 있다(series rs.cm · cg). */
  const hasGather = (players ?? []).some((p) => (p.cm?.length ?? 0) > 1);
  const rsModeEl = miniTabs(rsNow, setRsNow, "누적", "순간");
  const pair: [ReactNode, ReactNode] | null = tab === "sp" ? [spEl, wkEl]
    : tab === "rs" ? (rsNow ? [chartOf("rm", "미네랄", { titleExtra: rsModeEl }), rgEl]
      : hasGather ? [chartOf("cm", "미네랄", { titleExtra: rsModeEl }), chartOf("cg", "가스")] : null)
    : hasDmg ? [chartOf("dd", "준 데미지", { titleExtra: miniTabs(dmgMin, setDmgMin, "누적", "분당") }), chartOf("dt", "입은 데미지")] : null;
  const tabsEl = (
    <div className="scr-line-tabs scr-gc-tabs" role="tablist" aria-label="인구 · 데미지 · 자원">
      {GROUP_TABS.map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={tab === k} className={cx("scr-line-tab-btn", tab === k && "is-on")} onClick={() => setTab(k)}>{label}</button>
      ))}
    </div>
  );
  /* ★ PC 전체화면(2열 폭)은 건설 줄이 온 폭 · 그 아래 탭의 두 판이 반씩 나란히(2026-10-22, 요청: "위쪽은 건물 판이 전체 폭 다 쓰고 그 아래 각 탭은 그래프가 반반씩 폭 쓰기 ·
     전체화면만") — 옛 2열(왼쪽 건설 · 오른쪽 판 넷)을 갈았다. 아니면 두 판이 위아래. */
  const groupEls = (
    <>
      {tabsEl}
      {pair === null ? (
        <div className="scr-rc-empty scr-gc-nodmg">
          {tab === "rs" && <>{rsModeEl}<br /></>}
          {tab === "rs" ? "캔 자원" : "데미지"} 데이터가 아직 없어요 — 재분석하면 생겨요
        </div>
      )
        : twoCol ? (
          <div className="scr-gc-cols">
            <div className="scr-gc-col" style={{ width: colW }}>{pair[0]}</div>
            <div className="scr-gc-col" style={{ width: colW }}>{pair[1]}</div>
          </div>
        ) : <>{pair[0]}{pair[1]}</>}
    </>
  );

  /* 맨 위 고르기 — 늘 판 맨 위 온 폭(한때 PC 전체화면 2열의 왼쪽 반 폭 · 2026-10-22 같은 날 건설 줄이 온 폭이 되며 되돌림). */
  const topEl = (
    <>
      {/* 맨 위 고르기(볼 사람 · 보기)는 창 위에 붙어 있는다(2026-10-22, 요청: "맨 위 필터는 고정되면 좋을 듯"). */}
      <div className={cx("scr-gc-top", topHidden && "is-hidden")}>
      <div className="scr-gc-users" aria-label="볼 사람">
        <div className="scr-gc-uall">
          {/* 고르기 줄 앞 라벨(2026-10-22, 요청: "필터에 라벨 추가 — 표시: 모두 선택 모두 해제 · 개인/팀별:") */}
          <span className="scr-gc-flabel">표시:</span>
          <button type="button" className="scr-compact-rect-btn is-secondary" disabled={hidden.size === 0} onClick={() => setHidden(new Set())}>모두 선택</button>
          <button type="button" className="scr-compact-rect-btn is-secondary" disabled={shown.length === 0} onClick={() => { setHidden(new Set((players ?? []).map((p) => p.playerName))); setFocus(null); }}>모두 해제</button>
        </div>
        {/* 팀은 한 줄에 나란히(2026-10-22, 요청: "PC 에선 모든 팀을 수평으로 · 모바일도 폭 되면 그렇게") — 폭이 모자라면 다음 줄로. */}
        <div className="scr-gc-uteams">
        {userGroups.map((g) => (
          <div key={g.t} className="scr-gc-ugroup">
            {g.t > 0 && <span className="scr-gc-ulabel" style={{ color: TEAM_COLOR[g.t] }}>{g.t}팀</span>}
            {g.ps.map((p) => (
              <label key={p.playerName} className="scr-checkbox-field scr-gc-user">
                <input type="checkbox" checked={!hidden.has(p.playerName)} onChange={() => toggleShown(p.playerName)} />
                {/* 색 동그라미 안에 종족 글자(2026-10-22, 요청: "맨 위 필터에 유저 종족도 표시 — 닉네임 왼쪽에 동그라미 글자로" → "종족 동그라미 말고 색깔 동그라미를
                    좀 확대하고 그 안에 글자") — 동그라미 = 그 선 색 · 글자 = 그 바탕 위 잉크(inkOn). */}
                <i className="scr-gc-udot" style={{ background: colorOf(p), color: inkOn(colorOf(p)) }} title={p.race || undefined}>{RACE_LETTER[p.race] ?? ""}</i>
                {nameOf(p)}
              </label>
            ))}
          </div>
        ))}
        </div>
      </div>
      {teamGame && (
        <div className="scr-rc-mode">
          <span className="scr-gc-flabel" aria-hidden>개인/팀별:</span>
          {/* 탭 꼴(2026-10-22, 요청: "여기에 탭 디자인 적용") — 게임 목록 · 통계 탭과 같은 .scr-line-tabs. */}
          <div className="scr-line-tabs" role="tablist" aria-label="개인/팀별">
            {VIEW_MODES.map(([m, label]) => (
              <button
                key={m} type="button" role="tab" aria-selected={mode === m}
                className={cx("scr-line-tab-btn", mode === m && "is-on")}
                onClick={() => { setView(m); setFocus(null); }}
              >{label}</button>
            ))}
          </div>
        </div>
      )}
      </div>
    </>
  );
  const panel = (
      <div className={cx("scr-modal scr-modal-graph", docked && "scr-gc-dock", full && "is-full")} ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <div className="scr-modal-head">
          <span>데이터<i className="scr-gc-sub">게임번호: {game.matchNo}</i></span>
          <span className="scr-gc-headbtns">
            {!mobile && (
              <button className="scr-icon-btn" onClick={toggleFull} aria-label={full ? "전체화면 끝" : "전체화면"} title={full ? "전체화면 끝" : "전체화면"}>
                {full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            )}
            <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
          </span>
        </div>
        <div className="scr-modal-body" ref={bodyRef}>
          {players === null ? (
            <div className="scr-rc-empty scr-gc-wait"><Spinner /> 불러오는 중…</div>
          ) : players.length === 0 ? (
            <div className="scr-rc-empty scr-gc-wait">{error || "표시할 데이터가 아직 없어요 — 재분석하면 생겨요"}</div>
          ) : (
            <div className="scr-gc" ref={boxRef}>
              {topEl}
              {box.w > 0 && <>{lanesEl}{groupEls}</>}
            </div>
          )}
        </div>
      </div>
  );
  return createPortal(
    docked ? panel : (
      <div className="scr-modal-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }}>
        <ModalHash hash="game-curves" onClose={onClose} />
        {panel}
      </div>
    ),
    document.body,
  );
}
