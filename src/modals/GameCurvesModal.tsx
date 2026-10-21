import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { TEAM_COLOR } from "scplay";
import ModalHash from "../utils/modalHash";
import { Spinner } from "../components/common/Feedback";
import { AXIS_FS, Chart, StickyGutter, chipBox, chipGutter, chipWOf, GAME_FONT_K, inkOn, textW, type ChartLine } from "../pages/stats/RaceCurves";
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
   차례: [개인색 · 팀색] → 테크 줄(사람마다 한 줄 · 다 지은 때 칩) → 일꾼 수 → 병력 가치. 셋 다 같은 가로 자(잰 폭 · 끝 칩 여백 chipGutter) · 같은 높이
   · 같은 분 눈금(niceTicks). 테크 줄 앞머리엔 그 사람 색 닉네임 칩 · 테크 음영은 무채색(요청: "칸 앞머리에 심플하게 닉네임" → "왼쪽 닉네임을 칩으로 · 테크트리에서는 색 제거").
   곡선·개인색은 서버의 통계용 참값 표(GET /{id}/curves) — 판(Chart)은 통계 펼침(RaceCurves)과 같은 것 · 눈금은 판마다 그 판에 맞춘 둥근 간격(niceTicks · 가로는 그 판 길이).
   범례 대신 줄 끝 닉네임 칩(누르면 그 사람을 끄고 켠다 — 테크 줄도 같이 · 2026-10-21 요청).
   개인색을 못 읽은 판(옛 굽기 · 로스터 색이 한 가지뿐)은 원작 팔레트를 자리 차례로 쓴다(재생기 personalUsable 과 같은 거름). */

const BW_PALETTE = ["#f40404", "#0c48cc", "#2cb494", "#88409c", "#f88c14", "#703014", "#cce0d0", "#fcfc38"];
type ColorMode = "player" | "team";

/** 테크 건물 짧은 이름(서버 series.TECH 와 짝). */
/* 흔히 부르는 약어(2026-10-21, 요청: "사이버 → 코어 · 에볼 → 챔버 · 이거 말고도 범용적인 약어로") — 아둔(시타델) · 트리뷰널 · 마운드 · 캐번 · 코버트 · 피직스 · 서포트. */
const TECH_LABEL: Record<number, string> = {
  111: "배럭", 112: "아카데미", 113: "팩토리", 114: "스타포트", 116: "사이언스", 122: "엔베", 123: "아머리",
  107: "컴샛", 108: "핵사일로", 115: "컨트롤타워", 117: "코버트", 118: "피직스", 120: "머신샵",
  142: "스포닝풀", 132: "레어", 133: "하이브", 135: "히드라덴", 139: "챔버", 141: "스파이어", 137: "그레이터",
  138: "퀸즈네스트", 136: "마운드", 140: "캐번", 134: "나이더스",
  160: "게이트", 166: "포지", 164: "코어", 163: "아둔", 165: "아카이브", 155: "로보", 171: "서포트",
  159: "옵저버터리", 167: "스타게이트", 169: "플릿비컨", 170: "트리뷰널",
};
const clock = (sec: number): string => `${Math.floor(sec / 60)}:${pad(sec % 60)}`;

type Lane = { key: string; name: string; color: string; techs: GameCurve["techs"] };
/** 테크 줄 치수(2026-10-21, 요청: "칩과 눈금 폰트를 통계 그래프 눈금 크기와 같게 · 테크트리와 제목도 맞춰서 키우기") —
    눈금·닉네임 칩 글자 = AXIS_FS × GAME_FONT_K(통계 PC 눈금과 같은 화면 크기) · 테크 글자는 11px(요청: "테크트리 글자 굵기 줄이고 크기 한단만 낮춰줘" — 0.8 배 11.9 → 11 · 굵기 600 → 500).
    테크는 글자만 — 글자를 감싼 컴팩트 네모 칩 상자는 평소 보이지 않는 마우스 자리로 남아 겹침 가르기와 팝업 자리를 재고, 같은 종류 강조 때만 칠한다
    (요청: "직사각형 음영" → "테크트리 음영제거" → "칩형태로 강조 · 컴팩트 네모칩"). 칸 사이·두 단 사이도 글자에 비례 — 번잡하지 않게. */
function tlDims(k: number) {
  const axisFs = AXIS_FS * k;
  /* 테크 글자 — PC 11px · 폰(k 1) 9.5px(2026-10-21, 요청: "모바일에서도 볼 수 있게"). */
  const fs = k > 1 ? 11 : 9.5;
  const ch = fs * 1.35;   /* 칸 최소 높이 셈에만 — 그리는 높이는 컴팩트 네모 칩 비(chipBox) */
  const tier = fs * 0.15;
  /** axis: 판 아래 눈금 띠 · rowMin: 한 칸 최소 높이(두 단 + 위아래 숨) — 사람이 많아 모자라면 세 판이 같이 커지고 창 안에서 내린다. */
  return { axisFs, fs, gap: fs * 0.4, tier, axis: axisFs + 8, rowMin: Math.ceil(2 * ch + 2 * tier + fs * 0.9) };
}
const shortName = (s: string): string => (s.length > 10 ? `${s.slice(0, 9)}…` : s);

/** 닉네임 칩(그 사람 색 · 컴팩트 네모 칩) — 오른끝을 right 에 맞춘다. */
function NameChip({ name, color, right, cy, k }: { name: string; color: string; right: number; cy: number; k: number }) {
  const cb = chipBox();
  const nw = chipWOf(name) * k;
  return (
    <g className="scr-tl-name">
      <rect x={right - nw} y={cy - (cb.h * k) / 2} width={nw} height={cb.h * k} rx={cb.r * k} style={{ fill: color }} />
      <text x={right - nw / 2} y={cy} textAnchor="middle" dominantBaseline="central" style={{ fontSize: cb.fs * k, fill: inkOn(color) }}>{name}</text>
    </g>
  );
}

/** 테크 줄 — 사람마다 한 줄 · 다 지은 때만 칩으로(2026-10-21, 요청: "다지은때만 칩형태로 표시"). 칩의 왼끝 = 다 지은 때 ·
 *  칩은 칸의 세로 가운데 · 겹치는 칩끼리만 위아래로. 마우스를 얹으면 완공 시각 팝업 · 같은 종류 테크(모든 사람)는 강조색. */
function TechLanes({ lanes, maxX, ticksX, w: CW, h: H, padL: PL, padR, k, stickyGutter }: {
  lanes: Lane[]; maxX: number; ticksX: number[]; w: number; h: number; padL: number; padR: number;
  /** 글자 배수(PC GAME_FONT_K · 폰 1). */
  k: number;
  /** 닉네임 칸을 가로로 밀어도 제자리에(폰 · 요청: "좌측 틀 고정"). */
  stickyGutter: boolean;
}) {
  /* 칩에 마우스를 얹으면 그래프와 같은 꼴의 팝업(2026-10-21, 요청: "그래프처럼 팝업으로") — 칩 오른쪽(오른끝 가까이면 왼쪽)에 뜬다. */
  const [hover, setHover] = useState<{ tech: GameCurve["techs"][number]; x0: number; x1: number; cy: number } | null>(null);
  /* 칸 높이는 판 높이(h · 두 판과 같다)를 사람 수로 나눈 것(2026-10-21, 요청: "세 판 높이 통일"). */
  const D = tlDims(k);
  const ROW_H = (H - D.axis - 4) / Math.max(1, lanes.length);
  /* 마우스는 얹으면 · 손가락은 누르면 뜨고(다시 누르거나 딴 데 누르면 닫힌다 — 터치는 떼는 순간 pointerleave 가 와서 얹기가 못 버틴다). */
  const plotRef = useRef<HTMLDivElement>(null);
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
  const cb = chipBox();
  const CH = (FS * cb.h) / cb.fs;
  const PX = (FS * cb.px) / cb.fs;
  const RX = (FS * cb.r) / cb.fs;
  const GAP = D.gap;
  const x = (sec: number): number => PL + Math.min(1, sec / 60 / maxX) * (CW - PL - padR);
  const chipW = (s: string): number => textW(s, FS) + 2 * PX;
  let y0 = 4;
  /* 칩은 칸의 세로 가운데 · **겹치는 칩끼리만** 가운데 위아래로 가른다(2026-10-21, 요청: "겹치는것들만 위아래로 배치").
     칩의 왼끝 = 다 지은 때 · 오른끝을 넘는 칩은 거꾸로 칩의 오른끝을 그때에 맞춘다(요청: "테크 칩 화면밖으로 나감") · 칩은 그 줄 색으로 칠하고 글자는 가운데(좌우 여백 같게).
     가로로 겹치는 칩들을 한 무리로 묶고, 한 칩뿐인 무리는 가운데 · 여럿인 무리는 윗단 · 아랫단에 — 두 단에도 안 들어가면 앞 칩 뒤로 민다
     (정확한 때는 팝업에 있다). */
  const RIGHT = CW - padR;
  const rows = lanes.map((l) => {
    const items = l.techs.map((t) => {
      const label = TECH_LABEL[t.t] ?? `#${t.t}`;
      const xe = x(t.e);
      const w = chipW(label);
      const flip = xe + w > RIGHT;
      return { t, x: flip ? xe - w : xe, label, w, slot: 0 as -1 | 0 | 1 };
    }).sort((p, q) => p.x - q.x);
    for (let a = 0; a < items.length;) {
      let b = a + 1;
      let end = items[a].x + items[a].w + GAP;
      while (b < items.length && items[b].x < end) { end = Math.max(end, items[b].x + items[b].w + GAP); b += 1; }
      if (b - a > 1) {
        const ends = { [-1]: -Infinity, 1: -Infinity } as Record<-1 | 1, number>;
        for (let k = a; k < b; k += 1) {
          const it = items[k];
          const slot: -1 | 1 = it.x >= ends[-1] ? -1 : it.x >= ends[1] ? 1 : ends[-1] <= ends[1] ? -1 : 1;
          it.x = Math.min(Math.max(it.x, ends[slot]), RIGHT - it.w);
          ends[slot] = it.x + it.w + GAP;
          it.slot = slot;
        }
      }
      a = b;
    }
    const row = { l, chips: items, top: y0, h: ROW_H };
    y0 += ROW_H;
    return row;
  });
  return (
    <figure className="scr-rc-chart">
      <figcaption className="scr-rc-title">테크 건물<i> · 다 지은 때</i></figcaption>
      <div className="scr-rc-plot" ref={plotRef}>
      {stickyGutter && (
        <StickyGutter w={PL} h={H} bodyH={H - D.axis}>
          {rows.map(({ l, top, h }) => <NameChip key={l.key} name={shortName(l.name)} color={l.color} right={PL - 6 * k} cy={top + h / 2} k={k} />)}
        </StickyGutter>
      )}
      <svg viewBox={`0 0 ${CW} ${H}`} className="scr-rc-svg scr-tl-svg" role="img" aria-label="테크 건물을 다 지은 때">
        {rows.map(({ l, chips, top, h }) => {
          /* 앞머리 닉네임은 그 사람 색 칩(2026-10-21, 요청: "왼쪽 닉네임을 칩으로 · 테크트리에서는 색 제거") — 끝 칩과 같은 컴팩트 네모 칩(chipBox). */
          return (
          <g key={l.key}>
            <line className="scr-rc-grid" x1={PL} x2={CW - padR} y1={top + h} y2={top + h} />
            <NameChip name={shortName(l.name)} color={l.color} right={PL - 6 * k} cy={top + h / 2} k={k} />
            {chips.map(({ t, x: cx0, label, w, slot }) => {
              const mid = top + h / 2;
              const y = slot === 0 ? mid - CH / 2 : slot < 0 ? mid - CH - D.tier : mid + D.tier;
              /* 얹은 테크와 같은 종류(모든 사람)는 강조색 칩으로(2026-10-21, 요청: "같은 종류의 건물을 모두 하이라이팅" → "칩형태로 강조해줘") —
                 보이지 않던 마우스 상자를 강조색으로 칠한다 · 글자색은 그대로(요청: "폰트색은 그대로"). */
              const hl = hover !== null && hover.tech.t === t.t;
              const show = (): void => setHover({ tech: t, x0: cx0, x1: cx0 + w, cy: y });
              return (
                <g
                  key={t.t} className="scr-tl-hit"
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") show(); }}
                  onPointerLeave={(e) => { if (e.pointerType === "mouse") setHover(null); }}
                  onClick={(e) => { if ((e.nativeEvent as PointerEvent).pointerType !== "mouse") { if (hover?.tech === t) setHover(null); else show(); } }}
                >
                  <rect className={`scr-tl-chip${hl ? " is-hl" : ""}`} x={cx0} y={y} width={w} height={CH} rx={RX} />
                  <text
                    className="scr-tl-label" x={cx0 + w / 2} y={y + CH / 2} textAnchor="middle" dominantBaseline="central"
                    style={{ fontSize: FS }}
                  >{label}</text>
                </g>
              );
            })}
          </g>
          );
        })}
        {ticksX.map((m) => (
          <text key={m} className="scr-rc-axis" x={x(m * 60)} y={H - 5} textAnchor="middle" style={{ fontSize: D.axisFs }}>{m}분</text>
        ))}
      </svg>
      {hover && (
        <div
          className={`scr-rc-tip${hover.x1 / CW > 0.8 ? " is-left" : ""}`} role="status"
          style={{ left: `${((hover.x1 / CW > 0.8 ? hover.x0 : hover.x1) / CW) * 100}%`, top: `${(hover.cy / H) * 100}%`, minWidth: 0 }}
        >
          {/* 팝업은 완공 시각 한 줄만(2026-10-21, 요청: "완공: 15:03 이런 식으로 간단히 표시하고 아무것도 넣지 말기"). */}
          <div className="scr-rc-tip-row">완공: {clock(hover.tech.e)}</div>
        </div>
      )}
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
  /* 폰(2026-10-21, 요청: "모바일에서도 볼 수 있게" → "최소폭 필요 · 세로 가로 스크롤 허용 · 세 그래프 폭 모두 충분히") — 화면 가득 · 글자는 통계 폰 눈금 크기(배수 1) ·
     세 판은 최소 폭(.scr-gc min-width · global.css)으로 그리고 창 몸이 가로·세로로 민다. */
  const mobile = useIsMobile();
  const fontK = mobile ? 1 : GAME_FONT_K;
  const [players, setPlayers] = useState<GameCurve[] | null>(null);
  /* 세 판(테크 · 일꾼 · 병력)은 같은 높이(2026-10-21 요청) — 판 폭은 잰 그대로, 높이는 창 안에 셋이 들어가게((화면 높이 − 머리·범례·제목) ÷ 3 · 최소 180).
     잰 크기 그대로(1:1) 그려 글자·선이 늘거나 줄지 않는다. */
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    /* 테크 줄 한 칸은 rowMin 아래로 안 줄인다 — 사람이 많아 모자라면 세 판이 같이 커지고 창 안에서 내린다. */
    const D = tlDims(fontK);
    const lanesMin = (players ?? []).length * D.rowMin + D.axis + 4;
    const measure = (): void => setBox({
      w: Math.floor(el.clientWidth),
      h: Math.max(216, lanesMin, Math.floor((window.innerHeight - 330) / 3)),
    });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [players, fontK]);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<ColorMode>("player");
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set());

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
  const colorOf = (p: GameCurve, i: number): string => (mode === "team"
    ? TEAM_COLOR[teamNo(p.team)]
    : personalOk && p.color ? p.color : BW_PALETTE[i % BW_PALETTE.length]);
  const nameOf = (p: GameCurve): string => memberOf(p.memberId)?.nickname ?? p.playerName;
  /* 눈금은 이 판에 맞춘다(2026-10-21, 요청: "게임마다 적절한 눈금") — 통계의 고정 자(일꾼 100 · 병력 20K · 0/반/끝)가 아니라
     이 판 최댓값을 덮는 둥근 간격 눈금(세로 ≤5칸 · 가로 분 ≤7칸). */
  const sc = useMemo(() => {
    const ps = players ?? [];
    const x = Math.max(1, ...ps.map((p) => Math.max(p.wk.length, p.av.length) - 1));
    return { x, xt: niceTicks(x, 7), wk: niceTicks(Math.max(0, ...ps.flatMap((p) => p.wk))), av: niceTicks(Math.max(0, ...ps.flatMap((p) => p.av))) };
  }, [players]);
  const linesOf = (key: "wk" | "av"): ChartLine[] => (players ?? []).flatMap((p, i) => (p[key].length < 2
    ? [] : [{ key: p.playerName, label: shortName(nameOf(p)), color: colorOf(p, i), ys: p[key], off: off.has(p.playerName) }]));
  const padR = chipGutter((players ?? []).map((p) => shortName(nameOf(p))), fontK);
  /* 왼쪽 여백 = 가장 긴 닉네임 칩 + 여백 — 두 판도 같은 여백이라 가로 자가 같다. */
  const PL = 12 * fontK + fontK * Math.max(0, ...(players ?? []).map((p) => chipWOf(shortName(nameOf(p)))));
  const toggle = (k: string): void => setOff((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

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
              <div className="scr-rc-mode" role="radiogroup" aria-label="선 색">
                {(["player", "team"] as const).map((m) => (
                  <button
                    key={m} type="button" role="radio" aria-checked={mode === m}
                    className={cx("scr-compact-rect-btn", mode !== m && "is-secondary")} onClick={() => setMode(m)}
                  >
                    {m === "player" ? "개인색" : "팀색"}
                  </button>
                ))}
              </div>
              {box.w > 0 && (
                <>
                  <TechLanes
                    maxX={sc.x} ticksX={sc.xt} w={box.w} h={box.h} padL={PL} padR={padR} k={fontK} stickyGutter={mobile}
                    lanes={players.flatMap((p, i) => (off.has(p.playerName) ? [] : [{ key: p.playerName, name: nameOf(p), color: colorOf(p, i), techs: p.techs }]))}
                  />
                  <Chart title="일꾼 수" unit="기" lines={linesOf("wk")} maxX={sc.x} maxY={sc.wk[sc.wk.length - 1]} ticksX={sc.xt} ticksY={sc.wk} width={box.w} height={box.h} padL={PL} onToggle={toggle} fontK={fontK} stickyGutter={mobile} />
                  <Chart title="병력 가치" unit="" lines={linesOf("av")} note="살아 있는 전투 유닛의 미네랄+가스 합" maxX={sc.x} maxY={sc.av[sc.av.length - 1]} ticksX={sc.xt} ticksY={sc.av} width={box.w} height={box.h} padL={PL} onToggle={toggle} fontK={fontK} stickyGutter={mobile} />
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
