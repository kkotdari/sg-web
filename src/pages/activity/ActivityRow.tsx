import { memo, useEffect, useReducer, useState, type RefObject } from "react";
import { useReplayMapTick } from "scplay";
import { RowCheck } from "../../components/common/Selection";
import { cx } from "../../utils/format";
import { formatAgo } from "../../utils/date";
import { gamePlayable } from "../../utils/gamePlayable";
import { isSecretGame } from "../../utils/gameAccess";
import { GameRowNames, GameRowStatus, ListRow } from "./GameRow";
import { StartMapCell } from "./GameTable";
import { GameTableRow, UnhideRequestButton } from "./GameTable";
import { commentStatOf, subscribeComments } from "./ActivityComments";
import { PostBadges } from "./PostCard";
import {
  commentTargetOf, namesWithRest, rowFlagsOf, rowKeyOf, type DisplayItem,
} from "./activityItems";
import type { GameResult, Member } from "../../types";

/* ★ 활동 목록 한 줄 — memo(2026-10-19, 요청: "…목록과 상세등 모두 컴포넌트 분리"). 홈·묶음 목록이 같이 쓴다.
   손잡이는 늘 같은 그릇(act)으로 받고 누를 때 그릇 안의 최신 것을 부른다 — 그래서 고르기·새 글 표시·댓글 수처럼 제 것이 바뀔 때만 다시 그린다. */

export interface RowAct {
  open: (item: DisplayItem) => void;
  /** 한 판 숨기기(확인 창을 띄운다) — PC 게임 표의 링크 칸. */
  hide: (item: DisplayItem) => void;
  toggle: (key: string) => void;
  setMany: (keys: Iterable<string>, picked: boolean) => void;
}

export interface RowView {
  isMobile: boolean;
  memberOf: (id: string) => Member | undefined;
  /** 고르기 줄(체크) — 고르기를 못 하는 화면(홈)은 false. */
  selecting: boolean;
  /** 폰 선택 모드 — 켜진 동안 줄 누름은 열기가 아니라 고르기다. */
  selMode: boolean;
  selectionNote: string;
  /** PC 게임 표의 리그 칸 — 리그 탭에서만 선다(GameTable ★★ · 2026-10-20). */
  leagueCol: boolean;
}

function rowStatusOf(item: DisplayItem) {
  if (item.kind === "leagueMatch") {
    const done = item.match.setsWonA !== null && item.match.setsWonB !== null;
    return (
      <span className={cx("scr-activity-row-status", done && "scr-activity-row-status-faded")}>
        {done ? "Finish" : "Ready"}
      </span>
    );
  }
  if (item.kind === "gameResult") return <GameRowStatus game={item.gameResult} data play={gamePlayable(item.gameResult)} />;
  return null;
}

/** 게임 줄 이름 — 맵 이름이 늦게 오면(맵 받기) 이 줄만 다시 그린다. */
function GameNames({ game, memberOf, mobile }: { game: GameResult; memberOf: RowView["memberOf"]; mobile: boolean }) {
  useReplayMapTick();
  return <GameRowNames game={game} memberOf={memberOf} mobile={mobile} playable={gamePlayable(game)} />;
}

function rowDesc(item: DisplayItem, view: RowView) {
  if (item.kind === "leagueMatch") {
    const m = item.match;
    const sideText = (t: typeof m.teamA) => (
      t === null ? "미정"
        : t.members.length === 1 ? t.members[0].nickname
          : t.members.length > 1 ? `${t.label}팀`
            : t.label
    );
    return (
      <>
        <span className="scr-activity-row-name scr-activity-row-name-clip">
          <span className="scr-activity-row-name-main">{sideText(m.teamA)}</span>
        </span>
        <span className="scr-activity-row-arrow scr-activity-row-colon" aria-hidden>:</span>
        <span className="scr-activity-row-name scr-activity-row-name-clip">
          <span className="scr-activity-row-name-main">{sideText(m.teamB)}</span>
        </span>
      </>
    );
  }
  if (item.kind === "schedule") {
    return (
      <span className="scr-activity-row-names scr-activity-row-name-clip">
        <span className="scr-activity-row-em">{item.schedule.title}</span>
      </span>
    );
  }
  if (item.kind === "post") {
    return (
      <span className="scr-activity-row-names scr-activity-row-name-clip">
        <PostBadges post={item.post} />
        <span className="scr-activity-row-em">{item.post.title}</span>
      </span>
    );
  }
  if (item.kind === "rankingShift") {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const sec of item.shift.sections) {
      for (const e of sec.shifts) {
        if (seen.has(e.memberId)) continue;
        seen.add(e.memberId); names.push(e.nickname);
      }
    }
    return <span className="scr-activity-row-names">{namesWithRest(names)}{" 변동"}</span>;
  }
  return <GameNames game={item.gameResult} memberOf={view.memberOf} mobile={view.isMobile} />;
}

export const ActivityRow = memo(function ActivityRow({ item, flag, notes, pickable, picked, minute, view, act }: {
  item: DisplayItem;
  flag: "new" | "update" | null;
  notes: number;
  pickable: boolean;
  picked: boolean;
  /** 분 단위 시계 — '몇 분 전'이 흐르게 분마다 바뀐다. */
  minute: number;
  view: RowView;
  act: RefObject<RowAct>;
}) {
  void minute;
  const key = rowKeyOf(item);
  const { isMobile, selecting, selMode } = view;
  const secret = item.kind === "gameResult" && isSecretGame(item.gameResult);
  const check = selecting && (
    <RowCheck
      checked={picked} disabled={!pickable}
      disabledTitle={secret ? "숨긴 경기는 고를 수 없어요" : view.selectionNote}
      onChange={() => act.current.toggle(key)}
    />
  );
  /* PC 게임 줄은 표 한 줄(GameTable ★★ · 2026-10-19) — 머리 줄은 목록이 단다(ActivityHome · ActivityGroupPage). */
  if (!isMobile && item.kind === "gameResult") {
    const lg = item.gameResult.league;
    return (
      <GameTableRow
        game={item.gameResult} memberOf={view.memberOf}
        check={check} picked={picked} disabled={secret}
        onClick={() => act.current.open(item)}
        when={formatAgo(item.time)}
        onHide={() => act.current.hide(item)}
        leagueCol={view.leagueCol}
        league={lg ? { name: lg.leagueName, round: `${lg.roundName}${lg.matchInRound ? ` ${lg.matchInRound}경기` : ""} ${lg.setNo}세트` } : null}
      />
    );
  }
  return (
    <ListRow
      check={selecting && (
        <RowCheck
          checked={picked} disabled={!pickable}
          disabledTitle={secret ? "숨긴 경기는 고를 수 없어요" : view.selectionNote}
          onChange={() => act.current.toggle(key)}
        />
      )}
      picked={picked}
      className={cx(
        item.kind === "gameResult" && "scr-activity-row-game scr-gm",
        secret && "scr-activity-row-secret",
      )}
      disabled={secret && !(isMobile && selMode)}
      onClick={() => {
        /* 폰 선택 모드에서는 줄 전체가 고르기다(Selection.tsx ★) — 못 고르는 줄은 그대로 둔다. */
        if (isMobile && selMode) { if (pickable) act.current.toggle(key); return; }
        act.current.open(item);
      }}
      onLongPress={isMobile && selecting ? () => {
        if (pickable) act.current.toggle(key);
        else act.current.setMany([], true);
      } : undefined}
      status={rowStatusOf(item)}
      lead={item.kind === "gameResult" && !secret ? <StartMapCell game={item.gameResult} memberOf={view.memberOf} /> : undefined}
      above={item.kind === "gameResult" && item.gameResult.league ? (
        /* 리그 판 배지 — 리그 이름 · 라운드 · 세트(요청: "위에 별도 배지로 리그명 라운드명 세트번호(2026 팀리그 · 결승 · 1세트)"). */
        <span className="scr-league-tag">
          {item.gameResult.league.leagueName} · {item.gameResult.league.roundName}{item.gameResult.league.matchInRound ? ` ${item.gameResult.league.matchInRound}경기` : ""} · {item.gameResult.league.setNo}세트
        </span>
      ) : undefined}
      desc={<>
        {rowDesc(item, view)}
        {secret && <UnhideRequestButton game={item.gameResult} inRow />}
        {notes > 0 && (
          <span className="scr-activity-row-notes" title={`댓글 ${notes}개`}>[{notes}]</span>
        )}
      </>}
      top={flag && (
        <span className={cx("scr-activity-row-flag", `scr-activity-row-flag-${flag}`)}>
          {flag === "new" ? "NEW" : "UPDATE"}
        </span>
      )}
      side={formatAgo(item.time)}
    />
  );
});

/** 목록 화면의 시계 — 분마다(‘몇 분 전’·NEW) 그리고 댓글 수가 바뀔 때 목록을 다시 셈한다. 줄은 제 값이 바뀐 것만 다시 그린다. */
export function useRowClock(): number {
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000));
  useEffect(() => {
    const t = setInterval(() => setMinute(Math.floor(Date.now() / 60_000)), 60_000);
    return () => clearInterval(t);
  }, []);
  const [, bumpComments] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribeComments(bumpComments), []);
  return minute;
}

/** 줄 하나를 그릴 값 — 홈·묶음 목록이 같이 쓴다. */
export function rowPropsOf(item: DisplayItem, pick: { selecting: boolean; canPick: (it: DisplayItem) => boolean; picked: ReadonlySet<string> | null }) {
  const key = rowKeyOf(item);
  const target = commentTargetOf(item);
  const pickable = pick.selecting && pick.canPick(item);
  return {
    key,
    item,
    flag: rowFlagsOf(item)[0] ?? null,
    notes: commentStatOf(target.type, target.id).count,
    pickable,
    picked: pickable && !!pick.picked?.has(key),
  };
}
