import { useEffect, useRef, useState } from "react";
import type { BaseRace, MemberStats, StatCurve } from "../../types";

/* ★ 통계 펼침 = 분당 곡선 두 판(2026-10-20, 요청: "펼친 부분 내용 변경 · 시간별 … 연속 선 그래프로 세 종족을 색을 나눠서 같은 그래프에
   겹쳐서" → "일꾼 수랑 병력 가치로"). 서버의 통계용 참값(game_result_participant_curves → curve {wk, av, n})을 종족마다 한 줄로 겹친다.
   두 값은 자가 달라(명 · 미네랄+가스) 한 축에 안 싣고 판을 둘로 나눈다. 판 수가 처음의 20% 밑으로 줄어든 꼬리 분은 자른다(한두 판이
   곡선을 흔들지 않게). 선 색은 그래프 전용(--race-chart-*) — 앱의 종족색은 밝은 바탕에서 노랑이 1.47:1 이라 선으로 못 읽혀 검사기
   (dataviz validate_palette)를 통과한 한 단 진한 짝을 쓴다. 손가락·마우스가 닿은 분에 세로 선과 세 종족 값을 띄운다. */

const RACES: BaseRace[] = ["테란", "프로토스", "저그"];
const TONE: Record<BaseRace, string> = {
  테란: "var(--race-chart-terran)", 프로토스: "var(--race-chart-protoss)", 저그: "var(--race-chart-zerg)",
};
const W0 = 320;
const H0 = 150;
export const CHART_PAD = { l: 34, r: 12, t: 10, b: 20 };
const PAD = CHART_PAD;

type Line = { race: BaseRace; ys: number[] };
/** 판에 그리는 한 줄 — 통계는 종족마다, 게임 그래프(GameCurvesModal)는 사람마다. */
export type ChartLine = { key: string; label: string; color: string; ys: number[] };
type ByRace = Partial<Record<BaseRace, MemberStats>> | undefined;

/** 모든 줄이 함께 쓰는 자(2026-10-20, 요청: "일꾼 수 100 · 병력 가치 5K 로 세로 눈금 똑같이 · 가로도 똑같이" → 병력 "20K") — 세로는 일꾼 0~100 ·
 *  병력 0~20K 가 기본이고 넘는 줄이 있으면 그 단(100 · 5K)으로 올려 **모두** 같이 늘린다. 가로는 보이는 줄 중 가장 긴 분. */
export interface CurveScale { x: number; wk: number; av: number }
const WK_STEP = 100;
const AV_STEP = 5000;
const AV_MIN = 20000; // 병력 가치 세로 자 기본 0~20K(2026-10-20, 요청: "5K" → "20K")

/** 줄 값들로 자를 정한다(위 규칙 그대로 · 게임 그래프도 같은 자). */
export function scaleOf(wkLines: number[][], avLines: number[][]): CurveScale {
  let x = 1, wk = 0, av = 0;
  for (const ys of wkLines) { x = Math.max(x, ys.length - 1); wk = Math.max(wk, ...ys); }
  for (const ys of avLines) { x = Math.max(x, ys.length - 1); av = Math.max(av, ...ys); }
  return {
    x,
    wk: Math.max(WK_STEP, Math.ceil(wk / WK_STEP) * WK_STEP),
    av: Math.max(AV_MIN, Math.ceil(av / AV_STEP) * AV_STEP),
  };
}

const linesOf = (byRace: ByRace, key: "wk" | "av"): Line[] => RACES.flatMap((race) => {
  const c = byRace?.[race]?.curve;
  if (!c || c.n.length === 0) return [];
  const ys = trimmed(c, key);
  return ys.length >= 2 ? [{ race, ys }] : [];
});

export function curveScale(all: ByRace[]): CurveScale {
  return scaleOf(all.flatMap((b) => linesOf(b, "wk").map((l) => l.ys)), all.flatMap((b) => linesOf(b, "av").map((l) => l.ys)));
}

/** 판 수가 첫 분의 20%(최소 1판) 밑으로 떨어지기 전까지만. */
function trimmed(c: StatCurve, key: "wk" | "av"): number[] {
  const floor = Math.max(1, Math.ceil((c.n[0] ?? 0) * 0.2));
  const out: number[] = [];
  for (let i = 0; i < c[key].length; i += 1) {
    if ((c.n[i] ?? 0) < floor) break;
    out.push(c[key][i]);
  }
  return out;
}

const compact = (v: number): string => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K` : `${Math.round(v * 10) / 10}`);

/** 가로 눈금(분) — 판과 게임 그래프의 테크 줄이 같이 쓴다. */
function minuteTicks(maxX: number): number[] {
  const step = maxX <= 10 ? 2 : maxX <= 20 ? 5 : 10;
  return Array.from({ length: Math.floor(maxX / step) + 1 }, (_, i) => i * step);
}

/* 끝 칩(2026-10-21, 요청: "범례 제거하고 대신 그래프마다 그래프 끝에 칩으로 표시 · 칩 누르면 껐다켰다") — 줄마다 끝점 오른쪽에 이름 칩.
   칩끼리 겹치면 아래로 밀고(끝점과 짧은 줄로 잇는다), 끈 줄은 선을 지우고 칩만 흐리게 남긴다(다시 눌러 켠다). 칩 자리만큼 오른쪽 여백을 연다. */
/** 칠한 칩 위 글자색(2026-10-21, 요청: "모든 칩을 색으로 채우고 흰색이나 검정색 글자" → "흰검 결정 기준은 재생기랑 똑같이") —
    재생기 chipStyle 과 같은 셈: 휘도 0.299R + 0.587G + 0.114B(0~255)가 150 을 넘으면 검정 #111 · 아니면 흰 #fff.
    var(--…) 색은 지금 테마의 값을 읽어 잰다 · #rrggbb 가 아니면 재생기처럼 밝은 것(검정)으로 친다. */
function lumOf(color: string): number {
  const v = color.startsWith("var(")
    ? getComputedStyle(document.documentElement).getPropertyValue(color.slice(4, -1).split(",")[0].trim()).trim()
    : color;
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
  return m ? 0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16) : 255;
}
export function inkOn(color: string): string {
  return lumOf(color) > 150 ? "#111" : "#fff";
}
/** 값 글자 테두리 — 바탕과 비슷한 색(밝은 테마의 노랑·연두빛 흰색 · 어두운 테마의 갈색·남색)만 반대 밝기 테로 감싼다
    (2026-10-21, 지적: "다크 라이트 테마에서 각각 어두운 값 밝은 값에 반대 보더라인"). 나머지는 바탕색 테(CSS). */
function valOutline(color: string): string | undefined {
  const light = document.documentElement.classList.contains("scr-light-theme");
  const lum = lumOf(color);
  /* 검정·흰 테는 너무 튀어 회색으로 · 테마마다 한 단 더 바탕 반대쪽(요청: "너무 튀면 회색?" → 밝은 테마 #6e6e6e · 어두운 테마 #a5a5a5). */
  if (light && lum > 170) return "#6e6e6e";
  if (!light && lum < 70) return "#a5a5a5";
  return undefined;
}

/** 눈금 글자(판 자 · 2026-10-21, 요청: "눈금글자 20프로 확대" 9 → 10.8). 통계 판은 viewBox 320 을 칸 폭(PC 440)으로 늘려 그린다. */
export const AXIS_FS = 10.8;
/** 게임 그래프(잰 크기 1:1)의 글자 배수 — 통계 PC 판이 늘어나는 비(440/320)라, 눈금·칩 글자가 통계 그래프 눈금과 같은 화면 크기가 된다
    (2026-10-21, 요청: "칩과 눈금 폰트사이즈가 통계 그래프의 눈금 폰트 크기와 같게"). */
export const GAME_FONT_K = 440 / 320;
/** 칩 치수 = 컴팩트 네모 칩(.scr-compact-rect-chip · global.css 의 --compact-chip-h/-px/-r, 글자 배수) × 눈금 글자 크기 — 판 자로 적어 판과 함께 늘고 준다.
    끝 칩 · 게임 그래프 테크 줄의 닉네임 칩이 쓴다. CSS 값을 처음 쓸 때 한 번 읽는다(못 읽으면 같은 기본값). */
let chipBoxMemo: { fs: number; h: number; px: number; r: number } | null = null;
export function chipBox(): { fs: number; h: number; px: number; r: number } {
  if (chipBoxMemo) return chipBoxMemo;
  const cs = getComputedStyle(document.documentElement);
  const num = (name: string, dflt: number): number => { const v = parseFloat(cs.getPropertyValue(name)); return Number.isFinite(v) && v > 0 ? v : dflt; };
  chipBoxMemo = { fs: AXIS_FS, h: AXIS_FS * num("--compact-chip-h", 1.35), px: AXIS_FS * num("--compact-chip-px", 0.3), r: AXIS_FS * num("--compact-chip-r", 0.3) };
  return chipBoxMemo;
}
let measureCtx: CanvasRenderingContext2D | null = null;
/** 글자 폭(px · 굵기 600 · 본문 글꼴) — 칩 폭을 글자에 딱 맞춰 좌우 여백이 같게. */
export function textW(s: string, fs: number): number {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return s.length * fs;
  measureCtx.font = `600 ${fs}px ${getComputedStyle(document.body).fontFamily}`;
  return measureCtx.measureText(s).width;
}
/** 글자가 maxW(px)를 넘으면 뒤를 잘라 "…"(2026-10-21, 요청: "닉네임 칩 가로폭 봐서 적절히 글자수 제한") — 글자 수가 아니라 실제 폭으로(한글·영문 폭이 다르다). */
export function fitText(s: string, fs: number, maxW: number): string {
  if (textW(s, fs) <= maxW) return s;
  let t = s;
  while (t.length > 1 && textW(`${t}…`, fs) > maxW) t = t.slice(0, -1);
  return `${t}…`;
}
export const chipWOf = (s: string): number => textW(s, chipBox().fs) + 2 * chipBox().px;
/** 끝 칩을 단 판의 오른쪽 여백(k = 글자 배수) — 게임 그래프의 테크 줄도 같은 여백을 써서 가로 자를 맞춘다. */
export const chipGutter = (labels: string[], k = 1): number => PAD.r + k * (8 + Math.max(0, ...labels.map(chipWOf)));

/** 지나는 점을 그대로 지나는 매끈한 곡선(단조 3차 · Fritsch–Carlson — 점 사이에서 위아래로 튀지 않는다 · 2026-10-21, 요청: "그래프 곡선화"). */
function smoothPath(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n < 3) return `M${pts.map((p) => p.join(",")).join("L")}`;
  const m: number[] = [];
  for (let i = 0; i < n - 1; i += 1) m.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i += 1) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i += 1) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const q = a * a + b * b;
    if (q > 9) { const r = 3 / Math.sqrt(q); t[i] = r * a * m[i]; t[i + 1] = r * b * m[i]; }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i += 1) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = (x1 - x0) / 3;
    d += `C${x0 + h},${y0 + t[i] * h},${x1 - h},${y1 - t[i + 1] * h},${x1},${y1}`;
  }
  return d;
}

/** 값 글자의 세로 자리 — 저마다 제 점 **옆**(pref = 점 높이)에 두고, 겹치면 위로 밀며(아래에서부터), 판 위끝에 닿을 때만 아래로 민다
    (2026-10-21, 요청: "값은 선 아래보다는 위가 낫겠지" → "가능하면 점 옆에 · 안 되면 위로 밀리게"). */
function spreadAbove<T extends { pref: number; ty: number }>(items: T[], gap: number, top: number): T[] {
  const s = [...items].sort((a, b) => a.pref - b.pref);
  for (let i = s.length - 1; i >= 0; i -= 1) s[i].ty = Math.min(s[i].pref, i < s.length - 1 ? s[i + 1].ty - gap : Infinity);
  s.forEach((c, i) => { c.ty = Math.max(c.ty, top, i > 0 ? s[i - 1].ty + gap : -Infinity); });
  return s;
}

/** 세로선 손잡이 — 마우스는 얹으면 따라가고(떠나면 걷힘), 손가락은 **좌우로 밀면** 따라가며(세로로 밀면 화면 스크롤 · 판은 touch-action: pan-y) 탭은 그 자리에
    (2026-10-21, 요청: "모바일 터치 좌우로 이동" → "칩 없는 곳도 클릭 가능 · 터치에 따라가면서 변화"). skip 이 참인 곳(테크 칩)은 제 손잡이가 받는다.
    click 의 pointerType 은 브라우저마다 없을 수 있어 누른 순간의 종류를 기억한다. */
export function useScrub(pick: (clientX: number) => void, clear: () => void, skip?: (t: EventTarget) => boolean) {
  const touch = useRef<{ type: string; x: number; y: number; scrub: boolean }>({ type: "mouse", x: 0, y: 0, scrub: false });
  return {
    onPointerDown: (e: React.PointerEvent) => {
      touch.current = { type: e.pointerType, x: e.clientX, y: e.clientY, scrub: false };
      if (e.pointerType === "mouse" && !skip?.(e.target)) pick(e.clientX);
    },
    onPointerMove: (e: React.PointerEvent) => {
      /* 마우스는 칩 위에선 칩이 받고, 손가락은 칩에서 시작해도 좌우로 밀면 따라간다. */
      if (e.pointerType === "mouse") { if (!skip?.(e.target)) pick(e.clientX); return; }
      const t = touch.current;
      if (!t.scrub) {
        const dx = Math.abs(e.clientX - t.x);
        if (dx > 6 && dx > Math.abs(e.clientY - t.y)) t.scrub = true;
      }
      if (t.scrub) pick(e.clientX);
    },
    onClick: (e: React.MouseEvent) => { if (touch.current.type !== "mouse" && !skip?.(e.target)) pick(e.clientX); },
    onPointerLeave: (e: React.PointerEvent) => { if (e.pointerType === "mouse") clear(); },
  };
}

/** 여러 판이 함께 쓰는 세로선(분) — 판(.scr-rc-svg) 밖 어디를 누르든 걷힌다(폰은 손가락을 떼도 남아 있어 이것이 닫는 길이다).
    (2026-10-21, 요청: "세로선을 모든 테크 & 그래프 간 동기화 · 통계도") */
export function useSharedCross(): [number | null, (m: number | null) => void] {
  const [at, setAt] = useState<number | null>(null);
  useEffect(() => {
    if (at === null) return undefined;
    const close = (e: PointerEvent): void => {
      if (!(e.target as Element | null)?.closest?.(".scr-rc-svg")) setAt(null);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [at]);
  return [at, setAt];
}

export function Chart({ title, lines, note, maxX, maxY, width, padL, height, focus, onFocus, ticksX: tx, ticksY: ty, fontK: k = 1, padR: padROverride, at: atRaw, onAt }: {
  title: string; lines: ChartLine[]; note?: string; maxX: number; maxY: number;
  /** 눈금(기본: 세로는 0·반·끝 · 가로는 minuteTicks) — 게임 그래프는 그 판에 맞춘 눈금을 건넨다. */
  ticksX?: number[]; ticksY?: number[];
  /** 판의 가로 자(기본 320) — 넓은 자리(PC 게임 그래프)는 키워 판이 너무 높아지지 않게 한다(높이 150 그대로). */
  width?: number;
  /** 왼쪽 여백(기본 34) — 게임 그래프는 테크 줄 앞머리의 닉네임 칸과 가로 자를 맞추려 넓힌다. */
  padL?: number;
  /** 판의 세로 자(기본 150) — 게임 그래프는 잰 칸 크기 그대로(1:1) 그려 세 판의 높이를 맞춘다. */
  height?: number;
  /** 굵게 볼 줄(key) · 끝 칩을 누르면 그 줄만 굵게(다시 누르면 풀린다 · 2026-10-21, 요청: "칩터치 → 그 그래프만 두껍게 보기"). */
  focus?: string | null;
  onFocus?: (key: string) => void;
  /** 글자 배수(기본 1 — 통계) — 게임 그래프는 GAME_FONT_K. 눈금·칩 글자와 칩이 함께 커진다. */
  fontK?: number;
  /** 오른쪽 여백(기본: 칩 자리만큼) — 폰 게임 그래프는 좁게 주고, 판 밖으로 나갈 칩은 끝점 왼쪽에 놓는다. */
  padR?: number;
  /** 세로선(분 · 여러 판이 함께 · useSharedCross) — 이 판은 가장 가까운 분에 맞춰 그린다. */
  at: number | null;
  onAt: (m: number | null) => void;
}) {
  const W = width ?? W0;
  const H = height ?? H0;
  const PL = padL ?? PAD.l;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const PR = padROverride ?? (onFocus ? chipGutter(lines.map((l) => l.label), k) : PAD.r);
  const CB = chipBox();
  const CHIP_H = CB.h * k;
  const FS = AXIS_FS * k;
  const at = atRaw === null ? null : Math.max(0, Math.min(maxX, Math.round(atRaw)));
  const x = (i: number) => PL + (i / maxX) * (W - PL - PR);
  const y = (v: number) => PAD.t + (1 - v / maxY) * (H - PAD.t - PAD.b);
  const ticksY = ty ?? [0, maxY / 2, maxY];
  const ticksX = tx ?? minuteTicks(maxX);
  const pick = (clientX: number): void => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    onAt(Math.max(0, Math.min(maxX, Math.round(((sx - PL) / (W - PL - PR)) * maxX))));
  };
  const scrub = useScrub(pick, () => onAt(null));
  /* 칩 자리 — 끝점 오른쪽(판 오른끝을 넘으면 끝점 왼쪽) · 겹치면 밀고 바닥을 넘으면 되민다(2026-10-21, 지적: "칩끼리 겹쳐서 안보이는 문제"). */
  const chips = (onFocus ? lines : []).filter((l) => l.ys.length > 0).map((l) => {
    const i = l.ys.length - 1;
    const w = chipWOf(l.label) * k;
    const right = x(i) + 8 * k + w <= W;
    return { l, ex: x(i), ey: y(l.ys[i]), cx: right ? x(i) + 8 * k : x(i) - 8 * k - w, y: y(l.ys[i]), ty: 0, w };
  });
  const step = CHIP_H + 2 * k;
  const crossX = (a: (typeof chips)[number], b: (typeof chips)[number]): boolean => a.cx < b.cx + b.w && b.cx < a.cx + a.w;
  {
    const s = [...chips].sort((a, b) => a.y - b.y);
    s.forEach((c, i) => {
      c.ty = Math.max(PAD.t + CHIP_H / 2, c.y);
      for (const p of s.slice(0, i)) if (crossX(c, p)) c.ty = Math.max(c.ty, p.ty + step);
    });
    for (let i = s.length - 1; i >= 0; i -= 1) {
      s[i].ty = Math.min(s[i].ty, H - PAD.b - CHIP_H / 2);
      for (const q of s.slice(i + 1)) if (crossX(s[i], q)) s[i].ty = Math.min(s[i].ty, q.ty - step);
    }
  }
  /* 세로선 자리의 값 — 사람(종족)마다 제 색 글자로 점 옆에(팝업 대신 · 2026-10-21, 요청: "팝업 제거, 세로선만 유지하고 가로축에 그 시각 표시 ·
     세로선의 해당점의 숫자를 사용자별 그래프마다 자기색으로"). 점 옆(세로선 오른편 · 아래 valsRight) · 겹치면 위로 민다(spreadAbove). */
  const vals = at === null ? [] : spreadAbove(
    /* 고른 사람이 있으면 그 사람 값만(2026-10-21, 요청: "선택한 경우 그 사람 값만 나오게"). */
    lines.filter((l) => at < l.ys.length && (!focus || l.key === focus)).map((l) => ({ l, v: l.ys[at], y: y(l.ys[at]), pref: y(l.ys[at]), ty: 0 })),
    FS + 1 * k, PAD.t + FS / 2,
  );
  /* 값은 세로선 오른편(왼끝 맞춤)이 기본 — 판 오른끝을 넘거나 끝 칩(닉네임)을 가릴 때만 왼편에 오른끝을 맞춰 한 줄로
     (2026-10-21, 요청: "값들이 닉네임을 가리지 않게 왼쪽으로 · 값끼리 수직 정렬" → "닉네임을 가릴 때만"). */
  const valsRight = at !== null && vals.every(({ v, ty }) => {
    const x0 = x(at) + 8 * k;
    const x1 = x0 + textW(compact(v), FS);
    return x1 <= W && !chips.some((c) => x0 < c.cx + c.w && c.cx < x1 && Math.abs(ty - c.ty) < (FS + CHIP_H) / 2);
  });
  const ordered = focus ? [...lines.filter((l) => l.key !== focus), ...lines.filter((l) => l.key === focus)] : lines;
  /* 칩을 누른 사람(종족)만 또렷이 — 그 선은 굵게 · 칩은 살짝 크게, 나머지는 선·점·칩·값 모두 흐리게(2026-10-21, 요청: "액티브 칩은 살짝 확대만 ·
     나머지 사람들 거 딤 처리 · 나머지 그래프 선도 딤"). */
  const dim = (key: string): string => (focus && focus !== key ? " is-dim" : "");
  return (
    <figure className="scr-rc-chart">
      <figcaption className="scr-rc-title">{title}{note && <i> · {note}</i>}</figcaption>
      <div className="scr-rc-plot">
        <svg
          ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="scr-rc-svg" role="img"
          aria-label={`${title} 분당 — ${lines.map((l) => `${l.label} ${l.ys.length - 1}분까지`).join(", ")}`}
          {...scrub}
        >
          {ticksY.map((v) => (
            <g key={v}>
              <line className="scr-rc-grid" x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} />
              {/* 0 · 0분 글자는 안 쓴다(2026-10-21, 요청: "그래프 0 0분 표시 안하기") — 줄은 그대로. */}
              {v !== 0 && <text className="scr-rc-axis" x={PL - 5} y={y(v)} textAnchor="end" dominantBaseline="middle" style={{ fontSize: FS }}>{compact(v)}</text>}
            </g>
          ))}
          {/* 세로선의 분은 가로축에(가까운 눈금 글자는 비켜 준다). */}
          {ticksX.filter((m) => m !== 0 && (at === null || Math.abs(x(m) - x(at)) > 26 * k)).map((m) => (
            <text key={m} className="scr-rc-axis" x={x(m)} y={H - 5} textAnchor="middle" style={{ fontSize: FS }}>{m}분</text>
          ))}
          {at !== null && <text className="scr-rc-at" x={x(at)} y={H - 5} textAnchor="middle" style={{ fontSize: FS }}>{at}분</text>}
          {ordered.map((l) => (
            <path
              key={l.key} className={`scr-rc-line${focus === l.key ? " is-focus" : ""}${dim(l.key)}`} style={{ stroke: l.color }}
              d={smoothPath(l.ys.map((v, i) => [x(i), y(v)]))}
            />
          ))}
          {ordered.map((l) => {
            const i = l.ys.length - 1;
            return <circle key={l.key} className={`scr-rc-end${dim(l.key)}`} cx={x(i)} cy={y(l.ys[i])} r={focus === l.key ? 5 : 4} style={{ fill: l.color }} />;
          })}
          {chips.map((c) => (
            <g
              key={c.l.key} className={`scr-rc-chip${focus === c.l.key ? " is-focus" : ""}${dim(c.l.key)}`} role="button" tabIndex={0}
              transform={focus === c.l.key ? `translate(${c.cx + c.w / 2} ${c.ty}) scale(1.15) translate(${-(c.cx + c.w / 2)} ${-c.ty})` : undefined}
              aria-pressed={focus === c.l.key} aria-label={`${c.l.label} 굵게 보기`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onFocus?.(c.l.key); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onFocus?.(c.l.key); } }}
            >
              {Math.abs(c.ty - c.ey) > 1 && <line className="scr-rc-chip-lead" x1={c.ex} y1={c.ey} x2={c.cx} y2={c.ty} style={{ stroke: c.l.color }} />}
              <rect x={c.cx} y={c.ty - CHIP_H / 2} width={c.w} height={CHIP_H} rx={CB.r * k} style={{ fill: c.l.color }} />
              <text x={c.cx + c.w / 2} y={c.ty} textAnchor="middle" dominantBaseline="central" style={{ fontSize: CB.fs * k, fill: inkOn(c.l.color) }}>{c.l.label}</text>
            </g>
          ))}
          {at !== null && <line className="scr-rc-cross" x1={x(at)} x2={x(at)} y1={PAD.t} y2={H - PAD.b} />}
          {vals.map(({ l, y: py }) => <circle key={l.key} className={`scr-rc-dot${dim(l.key)}`} cx={x(at ?? 0)} cy={py} r={4} style={{ fill: l.color }} />)}
          {vals.map(({ l, v, ty: vy }) => (
            <text
              key={l.key} className={`scr-rc-val${dim(l.key)}`} x={x(at ?? 0) + (valsRight ? 8 : -8) * k} y={vy}
              textAnchor={valsRight ? "start" : "end"} dominantBaseline="central" style={{ fontSize: FS, fill: l.color, stroke: valOutline(l.color) }}
            >{compact(v)}</text>
          ))}
        </svg>
      </div>
    </figure>
  );
}

export default function RaceCurves({ byRace, scale }: { byRace?: Partial<Record<BaseRace, MemberStats>>; scale?: CurveScale }) {
  /* 줄 끝 칩을 누르면 그 종족 선만 굵게(2026-10-21, 요청: "칩터치 → 그 그래프만 두껍게 보기로 변경" — 옛 끄고 켜기 대신). 두 판이 한 상태를 같이 쓴다. */
  const [focus, setFocus] = useState<string | null>(null);
  const [at, setAt] = useSharedCross();
  const allWk = linesOf(byRace, "wk");
  const allAv = linesOf(byRace, "av");
  const sc = scale ?? curveScale([byRace]);
  if (allWk.length === 0 && allAv.length === 0) {
    return <div className="scr-rc-empty">표시할 데이터가 아직 없어요</div>;
  }
  const pickFocus = (k: string): void => setFocus((f) => (f === k ? null : k));
  const drawn = (ls: Line[]): ChartLine[] => ls.map((l) => ({ key: l.race, label: l.race, color: TONE[l.race], ys: l.ys }));
  return (
    <div className="scr-rc">
      <div className="scr-rc-charts">
        {/* 병력이 먼저 · 일꾼 수가 다음(2026-10-21, 요청: "일꾼과 병력가치 순서변경 · 통계에도 적용") · 제목 "병력 가치" → "병력"(요청).
            짧은 설명(2026-10-20, 요청: "병력 가치가 뭐야?" → "짧은 설명 붙이고" → "분마다 평균 · 일꾼·오버로드·건물 제외 걷고 설명은 제목 옆으로") — 셈은 sg-api series.ARMY_COST. */}
        <Chart title="병력" lines={drawn(allAv)} note="살아 있는 전투 유닛의 미네랄+가스 합" maxX={sc.x} maxY={sc.av} focus={focus} onFocus={pickFocus} at={at} onAt={setAt} />
        <Chart title="일꾼 수" lines={drawn(allWk)} maxX={sc.x} maxY={sc.wk} focus={focus} onFocus={pickFocus} at={at} onAt={setAt} />
      </div>
    </div>
  );
}
