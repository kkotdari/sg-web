import { useState, type ReactNode } from "react";
import { ChartLine } from "lucide-react";
import { cachedReplayMap } from "scplay";
import { isMeleeGame, resolveSlotName } from "./GameResultSides";
import { cleanMapName } from "../../utils/mapName";
import { cx } from "../../utils/format";
import { useLongPress } from "../../hooks/useLongPress";
import { isSecretGame } from "../../utils/gameAccess";
import { api } from "../../api/client";
import GameCurvesModal from "../../modals/GameCurvesModal";
import RaceBadge from "../../components/common/RaceBadge";
import { RecommendButton, useRecommend } from "./Recommend";
import type { GameResult, GameResultSlot, Member } from "../../types";

/** 이름 줄(PC) — 넘치면 **말줄임으로 자른다**(2026-10, 요청: "글자 좌우 압축 제거 · 글자가 잘리면 할수없이 자르기").
 *  한때는 줄 폭을 재서 transform: scaleX(--flat) 로 글자를 좌우로 눌러 담았다(ResizeObserver + fonts.ready) — 글자가 찌그러져 보였다. */
export function FlatLine({ children }: { children: ReactNode }) {
  return (
    <span className="scr-feed-row-flat">
      <span className="scr-feed-row-flat-in">{children}</span>
    </span>
  );
}

/** 데이터 단추(폰 게임 줄 · 2026-10-21 요청 · 자리는 로스터 아래 줄 가운데 — 2026-10-23, 요청: "추천은 좌하단 · 데이터는 하단 중앙") — 누르면 데이터 모달(GameCurvesModal).
 *  모달은 포털이지만 React 이벤트는 이 줄로 거슬러 올라온다 — 줄의 누름(열기·길게 눌러 고르기)이 안 타게 감싸 막는다. */
export function GameDataButton({ game, graph = true }: { game: GameResult; graph?: boolean }) {
  const [open, setOpen] = useState(false);
  const rec = useRecommend(game);
  const stop = (e: { stopPropagation: () => void }): void => e.stopPropagation();
  return (
    <span className="scr-feed-row-data-wrap" onPointerDown={stop} onPointerUp={stop} onClick={stop} onKeyDown={stop} onContextMenu={stop}>
      {/* 추천(폰 · 2026-10-22 요청) — 수와 함께 · 로스터 아래 줄 왼끝(global.css). */}
      <RecommendButton rec={rec} size={14} count className="scr-feed-row-rec" />
      {graph && (
        <button
          type="button" className="scr-icon-btn scr-feed-row-data" title="데이터 그래프" aria-label="데이터 그래프"
          onClick={() => { setOpen(true); void api.pingGameAction("graph", game); }}
        >
          <ChartLine size={15} />
        </button>
      )}
      {open && <GameCurvesModal game={game} onClose={() => setOpen(false)} />}
    </span>
  );
}

/** 맵·길이 배지 + (data) 추천·데이터 단추(폰 · 로스터 아래 줄 · PC 는 숨는다 · global.css). 폰 게임 줄의 재생 배지는 걷었다(2026-10-21, 요청: "데이터랑 상관없이 재생배지 지우란 거였어")
 *  → (play) 맵 배지 안 '분' 옆에 다시(같은 날 요청) → 2026-10-26 다시 걷음("모바일 피시에서 재생가능 배지 제거" · play 는 받기만). */
export function GameRowStatus({ game, data }: { game: GameResult; data?: boolean; play?: boolean }) {
  if (isSecretGame(game)) {
    return (
      <span className="scr-feed-row-status scr-feed-row-status-dur scr-feed-row-status-secret" title="숨긴 경기">
        <span>?</span>
      </span>
    );
  }
  const sec = game.durationSeconds;
  const full = cleanMapName(game.mapCanonName
    ?? cachedReplayMap(game.mapHash)?.canonName
    ?? game.mapName);
  const map = full.length > 5 ? full.slice(0, 5) : full;
  const tail = !!data;   // 추천은 유즈맵에도 · 그래프만 유즈맵에 없다(GameDataButton graph)
  if (sec == null && !map && !tail) return null;
  return (<>
    {(sec != null || map !== "") && (
      <span className="scr-feed-row-status scr-feed-row-status-dur" title={full || undefined}>
        {map !== "" && <span>{map}</span>}
        {sec != null && <span>{Math.round(sec / 60)}분</span>}
      </span>
    )}
    {tail && <GameDataButton game={game} graph={!game.ums} />}
  </>);
}

const sideOutcome = (result: GameResult["result"], side: 1 | 2): "승" | "무" | "패" | null =>
  (result === "draw" ? "무" : result === "team1" ? (side === 1 ? "승" : "패") : result === "team2" ? (side === 2 ? "승" : "패") : null);
const OutcomeBadge = ({ text }: { text: "승" | "무" | "패" | null }) =>
  (text ? <span className={text === "패" ? "scr-feed-row-wl is-loss" : text === "승" ? "scr-feed-row-wl is-win" : "scr-feed-row-wl"} aria-label={text === "승" ? "승리" : text === "패" ? "패배" : "무승부"}>{text}</span> : null);

export function GameRowNames({ game, memberOf, mobile, playable, nameMask }: {
  game: GameResult;
  memberOf: (id: string) => Member | undefined;
  /** 폰이면 세로 칸 꼴(아래 ★★) · PC 는 한 줄(FlatLine). */
  mobile: boolean;
  playable: boolean;
  /** 보이는 이름만 바꾸는 손 — 손님 모드의 가명(guestAliasOf · Player1…). 자료는 그대로다. */
  nameMask?: (name: string, slot: GameResultSlot) => string;
}) {
  const nameOf = (s: GameResultSlot, all: GameResultSlot[]): string =>
    (nameMask ? nameMask(resolveSlotName(s, all, memberOf), s) : resolveSlotName(s, all, memberOf));
  /** 선수 하나 — **왼쪽 종족 글자 배지** + 이름(2026-10-24, 요청: "게임 목록과 그걸 쓰는 화면들(데이터 관리 · 게임 연결 …)에 각 선수 왼쪽 종족 배지") ·
   *  이 한 벌(GameRowNames)을 게임 목록 · PC 표 · 운영자 재분석 · 삭제된 경기 · 외부 공유 · 리그 세트가 다 쓴다. 배지는 안 줄고 이름만 잘린다(global.css .scr-feed-row-person). */
  const person = (s: GameResultSlot, all: GameResultSlot[], key: string): ReactNode => (
    <span className="scr-feed-row-person" key={key}>
      <RaceBadge race={s.race} size={13} circleLetter className="scr-feed-row-race" />
      <span className="scr-feed-row-em">{nameOf(s, all)}</span>
    </span>
  );
  if (isSecretGame(game)) {
    return (
      <span className="scr-feed-row-names">
        <span className="scr-feed-row-em scr-feed-row-secret-title">비밀</span>
      </span>
    );
  }
  /* 재생 가능 배지는 걷었다(2026-10-26, 요청: "모바일 피시에서 재생가능 배지 제거") — playable 은 받기만 한다. */
  void playable;
  /* ★★ **폰은 팀마다 세로 칸**(2026-10-19, 요청: "로스터 형태 변경 …" → 첫 판(2×2 격자)을 보고 "가독성이 오히려 떨어지네 · 이렇게 —
       재생배지 · 맵시간배지 · 타임스탬프 / 1팀 승패배지 · 2팀 승패배지(3팀 있으면 …) / 1팀 로스터(세로) vs 2팀 로스터(3팀 있으면 vs 로스터 …)") —
       윗줄(재생 · 맵 · 시각)은 global.css 가 맞춘다. 여기는 둘째·셋째 줄: 격자 두 줄 × [팀 1fr | vs | 팀 1fr | vs …] — 첫 줄에 팀마다 승패 배지(칸 가운데) ·
       둘째 줄에 그 팀 이름을 한 사람 한 줄로(칸 가운데) · vs 는 이름 줄의 세로 가운데. 2026-10-26 부터 두 쪽이면 배지는 vs 양쪽(아래 pair). 개인전은 사람마다 한 칸. 이름은 칸 폭으로 잘린다(말줄임 없음 · global.css). */
  if (mobile) {
    const melee = isMeleeGame({ matchType: game.matchType, team1: game.team1, team2: game.team2 });
    const all = [...game.team1, ...game.team2];
    const sides: { slots: GameResultSlot[]; side: 1 | 2 }[] = melee
      ? all.map((s, i) => ({ slots: [s], side: i < game.team1.length ? 1 : 2 }))
      : [{ slots: game.team1, side: 1 }, { slots: game.team2, side: 2 }];
    const cols = sides.map(() => "minmax(0, 1fr)").join(" auto ");
    /* 두 쪽이면 승패 배지는 **vs 양쪽**(2026-10-26, 요청: "승패 배지를 로스터 위가 아닌 vs 양쪽으로 · 피시도") — 줄 하나 [1팀 | 승 vs 패 | 2팀].
       세 쪽 넘는 개인전은 옛 꼴(칸 위 배지 줄)이다 — vs 마다 양쪽 배지를 달면 가운데 사람 배지가 둘씩 선다. */
    const pair = sides.length === 2;
    const nameRow = pair ? 1 : 2;
    return (<>
      <span className="scr-feed-row-cols" style={{ gridTemplateColumns: cols }}>
        {sides.flatMap((sd, i) => {
          const col = i * 2 + 1;
          return [
            ...(i > 0 ? [pair ? (
              <span className="scr-feed-row-arrow scr-feed-row-vs" key={`v${i}`} style={{ gridColumn: col - 1, gridRow: 1 }}>
                <OutcomeBadge text={sideOutcome(game.result, sides[0].side)} />
                <span aria-hidden>vs</span>
                <OutcomeBadge text={sideOutcome(game.result, sd.side)} />
              </span>
            ) : <span className="scr-feed-row-arrow scr-feed-row-vs" key={`v${i}`} style={{ gridColumn: col - 1, gridRow: 2 }} aria-hidden>vs</span>] : []),
            ...(pair ? [] : [<span className="scr-feed-row-col-wl" key={`w${i}`} style={{ gridColumn: col, gridRow: 1 }}><OutcomeBadge text={sideOutcome(game.result, sd.side)} /></span>]),
            <span className="scr-feed-row-col-names" key={`n${i}`} style={{ gridColumn: col, gridRow: nameRow }}>
              {sd.slots.map((s, k) => person(s, melee ? all : sd.slots, `p${k}`))}
            </span>,
          ];
        })}
      </span>
    </>);
  }
  const sideNodes = (slots: GameResultSlot[]): ReactNode[] =>
    slots.flatMap((s, i) => [
      ...(i > 0 ? [<span className="scr-feed-row-slash" key={`s${i}`} aria-hidden>･</span>] : []),
      person(s, slots, `n${i}`),
    ]);
  if (isMeleeGame({ matchType: game.matchType, team1: game.team1, team2: game.team2 })) {
    const all = [...game.team1, ...game.team2];
    return (<>
      <FlatLine>
        <span className="scr-feed-row-name">
          <span className="scr-feed-row-name-main">
            {all.flatMap((s, i) => [
              ...(i > 0 ? [(
                <span className="scr-feed-row-arrow scr-feed-row-vs" key={`v${i}`} aria-hidden>
                  vs
                </span>
              )] : []),
              person(s, all, `n${i}`),
              <OutcomeBadge key={`w${i}`} text={sideOutcome(game.result, i < game.team1.length ? 1 : 2)} />,
            ])}
          </span>
        </span>
      </FlatLine>
    </>);
  }
  return (<>
    <FlatLine>
      <span className="scr-feed-row-name">
        <span className="scr-feed-row-name-main">{sideNodes(game.team1)}</span>
      </span>
      <span className="scr-feed-row-arrow scr-feed-row-vs">
        <OutcomeBadge text={sideOutcome(game.result, 1)} />
        <span aria-hidden>vs</span>
        <OutcomeBadge text={sideOutcome(game.result, 2)} />
      </span>
      <span className="scr-feed-row-name">
        <span className="scr-feed-row-name-main">{sideNodes(game.team2)}</span>
      </span>
    </FlatLine>
  </>);
}

export function ListRow({ desc, status, top, side, onClick, check, picked, className, disabled, onLongPress, above, lead }: {
  desc: ReactNode;
  /** 이름 줄 **왼쪽** 앞자리(폰 게임 줄의 배치 미니맵 · 2026-10-26, 요청: "모바일에도 미니맵 배치 · 왼쪽에 자리 · 카드 안에") — 없으면 안 선다. */
  lead?: ReactNode;
  /** 줄 **위**에 따로 서는 배지 줄(리그 판의 "2026 팀리그 · 결승 · 1세트" · 2026-10-19). */
  above?: ReactNode;
  /** 맵·길이 배지(GameRowStatus 따위) — desc 안이 아니라 **제 칸**에 선다. 폰 게임 줄은 이 칸을 시각 옆 윗줄로 올린다(global.css). */
  status?: ReactNode;
  top?: ReactNode;
  side?: ReactNode;
  onClick: () => void;
  check?: ReactNode;
  picked?: boolean;
  className?: string | false;
  disabled?: boolean;
  /** 길게 누르기(폰 선택 모드로 들어가기) — 없으면 안 붙는다. */
  onLongPress?: () => void;
}) {
  const hold = useLongPress(onLongPress);
  return (
    <div className={cx("scr-feed-row-wrap", !!check && "scr-feed-row-wrap-sel", picked && "is-picked")}>
      {check}
      <button
        type="button"
        {...hold}
        className={cx("scr-feed-row", className, picked && "is-picked")}
        aria-disabled={disabled ? true : undefined}
        onClick={() => { if (!disabled) onClick(); }}
      >
        <span className={cx("scr-feed-row-main", !!above && "has-above")}>
          {above && <span className="scr-feed-row-above">{above}</span>}
          {status}
          {/* 앞자리(lead)는 **카드 안** 이름 줄의 왼쪽(같은 날 되요청: "카드 안에 넣기") — 이름 칸과 한 줄. */}
          {lead ? (
            <span className="scr-feed-row-desc has-lead">
              <span className="scr-feed-row-lead">{lead}</span>
              <span className="scr-feed-row-desc-body">{desc}</span>
            </span>
          ) : <span className="scr-feed-row-desc">{desc}</span>}
          <span className="scr-feed-row-badges">
            <span className="scr-feed-row-badges-top">{top}</span>
            <span className="scr-feed-row-time">{side}</span>
          </span>
        </span>
      </button>
    </div>
  );
}
