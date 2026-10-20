import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Play } from "lucide-react";
import { cachedReplayMap, useReplayMapTick } from "scplay";
import { api } from "../../api/client";
import { showToast } from "../../components/common/Toast";
import { useLongPress } from "../../hooks/useLongPress";
import { cleanMapName } from "../../utils/mapName";
import { cx } from "../../utils/format";
import { pad, serverMs } from "../../utils/date";
import { gamePlayable } from "../../utils/gamePlayable";
import { isSecretGame } from "../../utils/gameAccess";
import { isMeleeGame } from "./GameResultSides";
import { GameRowNames } from "./GameRow";
import type { GameResult, Member } from "../../types";

/* ★★ PC 게임 목록 = **표**(2026-10-19, 요청: "피시는 오히려 배지들 제거하고 완전 그리드 형태로 변경(헤더로우도 만듦) · 로스터는 모바일과 같은 형태 ·
   컬럼: 게임번호 시작일시 게임길이 맵 로스터 유형(팀전, 유즈맵, 프리포올 등) 재생가능여부 조회수 숨김 · 숨긴 게임은 해제요청 버튼").
   머리 줄(GameTableHead)과 줄(GameTableRow)이 같은 열 틀(--gtab-cols · global.css)을 쓴다 — 맵·시간·재생·NEW·'몇 분 전' 배지는 없다.
   로스터 칸은 폰과 같은 꼴(GameRowNames mobile — 팀마다 승패 배지 · 세로 이름 · vs). 폰은 옛 줄(ActivityRow → ListRow) 그대로. */

const COLS = ["게임번호", "시작일시", "게임길이", "맵", "로스터", "유형", "재생", "조회수", "숨김"] as const;

export function GameTableHead({ selecting }: { selecting: boolean }) {
  return (
    <div className={cx("scr-activity-row-wrap scr-gtab-headwrap", selecting && "scr-activity-row-wrap-sel")} aria-hidden>
      {/* 체크 칸만큼 비운다(줄의 RowCheck 와 같은 폭). */}
      {selecting && <span className="scr-checkbox-field scr-selcell scr-gtab-headcheck"><input type="checkbox" tabIndex={-1} /></span>}
      <div className="scr-gtab scr-gtab-head">
        {COLS.map((c) => <span key={c} className="scr-gtab-cell">{c}</span>)}
      </div>
    </div>
  );
}

/** 유형 — 유즈맵 · 프리포올(난투·셋 이상 일대일) · 1:1 · 팀전. */
export function gameKindText(g: GameResult): string {
  if (g.ums) return "유즈맵";
  if (isMeleeGame({ matchType: g.matchType, team1: g.team1, team2: g.team2 })) return "프리포올";
  if (g.matchType === "0101") return "1:1";
  if (g.matchType === "0102") return "팀전";
  return "-";
}

function startText(g: GameResult): string {
  if (!g.gameStartedAt) return g.date ? g.date.slice(2).replace(/-/g, ".") : "-";
  const d = new Date(serverMs(g.gameStartedAt));
  if (!Number.isFinite(d.getTime())) return "-";
  return `${pad(d.getFullYear() % 100)}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const lengthText = (sec: number | null): string =>
  (sec == null ? "-" : `${Math.floor(sec / 60)}:${pad(Math.round(sec) % 60)}`);

/** 이 화면에서 해제를 청한 판 — 서버는 같은 판에 기다리는 요청을 하나만 두니 다시 눌러도 되지만, 단추는 '요청됨'으로 잠근다. */
const requested = new Set<number>();

function UnhideCell({ game }: { game: GameResult }) {
  const [state, setState] = useState<"idle" | "busy" | "done">(requested.has(game.id) ? "done" : "idle");
  const ask = async () => {
    setState("busy");
    try {
      await api.requestUnhideGameResult(game.id);
      requested.add(game.id);
      setState("done");
      showToast("숨김 해제를 요청했어요. 운영자가 확인하면 풀려요.", { kind: "ok" });
    } catch (e) {
      setState("idle");
      showToast(e instanceof Error ? e.message : "요청하지 못했어요.", { kind: "warn" });
    }
  };
  return (
    <span className="scr-gtab-cell scr-gtab-hide">
      <span className="scr-gtab-hidden-text">숨김</span>
      <button
        type="button" className="scr-pill-btn scr-gtab-unhide"
        disabled={state !== "idle"}
        onClick={(e) => { e.stopPropagation(); if (state === "idle") void ask(); }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {state === "done" ? "요청됨" : "해제요청"}
      </button>
    </span>
  );
}

export function GameTableRow({ game, memberOf, check, picked, disabled, onClick, onLongPress, above }: {
  game: GameResult;
  memberOf: (id: string) => Member | undefined;
  check?: ReactNode;
  picked?: boolean;
  disabled?: boolean;
  onClick: () => void;
  onLongPress?: () => void;
  /** 리그 판 자리("2026 팀리그 · 결승 · 1세트") — 배지가 아니라 로스터 칸 위 작은 글로. */
  above?: string;
}) {
  useReplayMapTick();
  const hold = useLongPress(onLongPress);
  const secret = isSecretGame(game);
  const map = secret ? "" : cleanMapName(game.mapCanonName ?? cachedReplayMap(game.mapHash)?.canonName ?? game.mapName);
  const playable = !secret && gamePlayable(game);
  const open = () => { if (!disabled) onClick(); };
  return (
    <div className={cx("scr-activity-row-wrap", !!check && "scr-activity-row-wrap-sel", picked && "is-picked")}>
      {check}
      <div
        role="button" tabIndex={disabled ? -1 : 0}
        {...hold}
        className={cx("scr-gtab scr-gtab-row", secret && "is-secret", disabled && "is-off", picked && "is-picked")}
        aria-disabled={disabled ? true : undefined}
        onClick={open}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault(); open();
        }}
      >
        <span className="scr-gtab-cell scr-gtab-no">{game.matchNo}</span>
        <span className="scr-gtab-cell scr-gtab-num">{startText(game)}</span>
        <span className="scr-gtab-cell scr-gtab-num">{lengthText(game.durationSeconds)}</span>
        <span className="scr-gtab-cell scr-gtab-map" title={map || undefined}><span>{map || "-"}</span></span>
        <span className="scr-gtab-cell scr-gtab-roster">
          {above && <span className="scr-gtab-league">{above}</span>}
          <GameRowNames game={game} memberOf={memberOf} mobile playable={false} />
        </span>
        <span className="scr-gtab-cell">{secret ? "-" : gameKindText(game)}</span>
        <span className="scr-gtab-cell">
          {playable ? <Play size={12} className="scr-activity-row-play" aria-label="재생 가능" fill="currentColor" /> : <span className="scr-gtab-dim">-</span>}
        </span>
        <span className="scr-gtab-cell scr-gtab-num">{secret ? "-" : game.viewCount ?? "-"}</span>
        {game.hidden ? <UnhideCell game={game} /> : <span className="scr-gtab-cell scr-gtab-dim">-</span>}
      </div>
    </div>
  );
}
