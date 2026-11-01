import React, { useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { formatWhen } from "../../utils/date";
import { ReplayModule, sceneLinkOf9, type MotionBase } from "scplay";
import { createPortal } from "react-dom";
import { api } from "../../api/client";
import Comments from "../feed/Comments";
import { gameResultShareContent } from "./gameShare";
import { preloadKakao, shareToKakao } from "../../utils/kakaoShare";
import RosterSide, { isMeleeGame, outcomeFor, resolveSlotName } from "./GameResultSides";
import Avatar from "../../components/common/Avatar";
import { GameDetailCloseContext } from "./gameDetailClose";
import { useReplayMap } from "scplay";
import { cleanMapName } from "../../utils/mapName";
import { parseRoute } from "../../utils/route";
import { cx } from "../../utils/format";
import { DetailLoading } from "./DetailLoading";
import { hasComputerSlot, truthMissing } from "../../utils/gamePlayable";
import { normalizeSearchText } from "../../utils/memberSearch";
import type { GameResult, GameResultSlot, Member } from "../../types";

export default function GameResultStory({
  gameResult, team1, team2, result, memberOf, highlightMemberIds, highlightTerms, active = true,
  menu, headSlot = null, onShown,
}: {
  gameResult: GameResult;
  team1: GameResultSlot[];
  team2: GameResultSlot[];
  result: GameResult["result"];
  memberOf: (id: string) => Member | undefined;
  highlightMemberIds?: Set<string>;
  highlightTerms?: string[];
  menu?: import("react").ReactNode;
  active?: boolean;
  /** 페이지 제목 줄의 머리 칸(.scr-crumb-meta) — 있으면 시각·맵·승패·등록자를 거기에 포털로 그린다(게임 페이지). */
  headSlot?: HTMLElement | null;
  /** 게임 상세 — 판(재생기 · 로스터)이 다 그려졌다(재생기는 로딩이 다 끝난 때) · 부르는 쪽이 댓글 따위를 이때 세운다. */
  onShown?: () => void;
}) {
  const grid = useReplayMap(gameResult.mapHash);
  const detailClose = useContext(GameDetailCloseContext);
  const linkQuery = useMemo(() => {
    const r = parseRoute();
    if (r.group !== "gameResult" || r.item === null) return null;
    if (r.item !== gameResult.matchNo && Number(r.item) !== gameResult.id) return null;
    return new URLSearchParams(window.location.search);
  }, []);
  const sceneLink = useMemo(
    () => (linkQuery ? sceneLinkOf9(linkQuery) : null), [linkQuery]);
  const stampText = formatWhen(gameResult.gameStartedAt ?? gameResult.date, { clock: true });

  const slots = useMemo(() => {
    const all = [...team1, ...team2];
    const rows: { raw: string; name: string; slot: GameResultSlot; team: 1 | 2 }[] = [];
    const add = (list: GameResultSlot[], team: 1 | 2) => {
      list.forEach((slot) => {
        const name = resolveSlotName(slot, all, memberOf);
        if (slot.rawName) rows.push({ raw: slot.rawName, name, slot, team });
      });
    };
    add(team1, 1);
    add(team2, 2);
    return rows;
  }, [team1, team2, memberOf]);
  const bases: MotionBase[] = useMemo(() => slots.map((s) => {
    const nameLc = normalizeSearchText(s.name);
    const hit = highlightMemberIds?.has(s.slot.memberId)
      || !!highlightTerms?.some((t) => nameLc.includes(t));
    return {
      key: s.raw, name: s.name, memberId: s.slot.memberId,
      avatar: memberOf(s.slot.memberId)?.avatar ?? null,
      race: s.slot.race, team: s.team,
      withName: true, highlight: hit,
      apm: s.slot.apm,
    };
  }), [slots, memberOf, highlightMemberIds, highlightTerms]);

  const o1 = outcomeFor("team1", result);
  const o2 = outcomeFor("team2", result);
  /* 승자 편이 비면(프리포올을 다 한 편에 두고 결과 미정·승자 칸 빔 등) 이름을 못 낸다 — 예전엔 side[0] 이 없어 화면 전체가 죽었다
     (2026-10-20, 지적: "프리포올 상세에 아무것도 안 나와 재생기조차"). 미정·미개최는 배지를 안 그리므로 글도 비운다. */
  const winLabel = (() => {
    if (result === "draw") return "무승부";
    if (result === "not_held" || result === "unknown") return "";
    const side = o1 === "win" ? team1 : team2;
    if (isMeleeGame({ matchType: gameResult.matchType, team1, team2 })
      || (team1.length === 1 && team2.length === 1)) {
      return side[0] ? `${resolveSlotName(side[0], [...team1, ...team2], memberOf)} 승` : "";
    }
    return `${o1 === "win" ? 1 : 2}팀 승`;
  })();
  /* 유즈맵 판은 맵 이름 앞에 '유즈맵'을 단다 — 기록만 남는 판이라 재생기가 없다(아래 umsGame · 2026-10-19). */
  const umsGame = gameResult.ums === true;
  const mapName0 = cleanMapName(gameResult.mapCanonName ?? gameResult.mapName);
  const mapName = umsGame ? (mapName0 ? `유즈맵 · ${mapName0}` : "유즈맵") : mapName0;
  const minutes = gameResult.durationSeconds != null
    ? Math.round(gameResult.durationSeconds / 60) : null;
  const melee = isMeleeGame({ matchType: gameResult.matchType, team1, team2 });
  const computerGame = hasComputerSlot({ team1, team2 });
  const noTruth = !computerGame && !umsGame && truthMissing(gameResult);
  const unplayable = computerGame || umsGame || noTruth;
  const storyMap = unplayable ? null : (grid ?? null);
  const mapPending = !unplayable && grid === undefined;
  const showRoster = !mapPending && storyMap === null;
  const [playerReady, setPlayerReady] = useState(false);
  useEffect(() => {
    let t9 = 0;
    const raf9 = requestAnimationFrame(() => { t9 = window.setTimeout(() => setPlayerReady(true), 0); });
    return () => { cancelAnimationFrame(raf9); window.clearTimeout(t9); };
  }, []);
  const playerWait = !showRoster && !!storyMap && !playerReady;
  const [revealWin, setRevealWin] = useState(false);
  const soleViewNow = !!detailClose || linkQuery !== null;
  /* ★ 게임 상세는 **다 될 때까지 워드마크만**(2026-10-30, 요청: "상세에 진입하면 타이틀 외의 다른 부분은 그리지 말고 워드마크 로딩바만 · 재생 정보가 도착하면 그때
     재생기를 띄우든 로스터를 띄우든 결정 · 재생기는 모든 정보가 다 도착하고 화면이 준비되면 그때 그리기 — 전광판이나 시간 그런 것도 다") — 지도를 받는 동안
     (mapPending)·재생기 로딩(scplay veil → onReady) 동안은 판 자리를 비우고 DetailLoading 만. 로스터 판은 곧장. 옛 자료를 기다리는 재생기(PlayerLoadShell)는 걷었다. */
  const [playerShown, setPlayerShown] = useState(false);
  /* ★ 로딩 퍼센트(2026-11-01, 요청: "워드마크 아랫줄에 단색으로 로딩 퍼센티지") — 게임 받기(GameDetailPage 3%) → 지도 받기 10% → 재생기 로딩 20~99%(scplay onLoadProgress 0~1) · 다 되면 걷힌다. */
  const [playerProg, setPlayerProg] = useState(0);
  const loadPct = mapPending ? 10 : Math.min(99, 20 + 79 * playerProg);
  const loadingNow = soleViewNow && !showRoster && !playerShown;
  const onShownRef = useRef(onShown); onShownRef.current = onShown;
  useEffect(() => { if (!loadingNow && (showRoster || playerShown)) onShownRef.current?.(); }, [loadingNow, showRoster, playerShown]);
  const showMapLine = showRoster && !headSlot && Boolean(mapName || minutes !== null);

  const stopBubble = {
    onPointerDown: (e: PointerEvent) => e.stopPropagation(),
    onMouseDown: (e: MouseEvent) => e.stopPropagation(),
    onClick: (e: MouseEvent) => e.stopPropagation(),
  };

  const vsRow = (
    <span className="scr-challenge-arrow-row">
      <span className={cx("scr-challenge-inline-win", o1 === "draw" && "scr-challenge-inline-draw", o1 !== "win" && o1 !== "draw" && "scr-challenge-inline-win-hidden")}>
        {o1 === "draw" ? "무" : "승"}
      </span>
      <span className="scr-challenge-arrow scr-challenge-arrow-vs" aria-hidden="true">vs</span>
      <span className={cx("scr-challenge-inline-win", o2 === "draw" && "scr-challenge-inline-draw", o2 !== "win" && o2 !== "draw" && "scr-challenge-inline-win-hidden")}>
        {o2 === "draw" ? "무" : "승"}
      </span>
    </span>
  );

  const endSecVal = gameResult.durationSeconds ?? null;
  const teamByRaw = useMemo(() => {
    const m = new Map<string, 1 | 2>();
    for (const x of slots) if (x.team) m.set(x.raw, x.team);
    return m;
  }, [slots]);
  const teamOfRaw = useCallback(
    (raw: string): 1 | 2 | undefined => teamByRaw.get(raw), [teamByRaw],
  );

  const shareScene = useCallback(async (): Promise<string | undefined> => {
    const out = await shareToKakao(gameResultShareContent(gameResult, memberOf, { scene: true }));
    return out === "shared" ? "공유됨" : out === "copied" ? "링크 복사됨" : undefined;
  }, [gameResult, memberOf]);
  useEffect(() => { preloadKakao(); }, []);

  /* 머리 줄 — 시각 · 맵 이름 길이 · 승패 배지 · 등록자(2026-10-09). 재생기(scplay)의 머리 줄(.scr-story-map-head)을 걷고(요청: "빨간
     상자 타이틀 부분을 제거해서 화면을 더 확보") 게임 페이지에서는 페이지 제목 줄의 칸(headSlot · .scr-crumb-meta)에 포털로 그린다.
     칸이 없는 자리(피드 카드·공유 페이지)는 판 위에 맵 이름 한 줄만 둔다 — 시각·등록자는 카드 머리와 아래 등록 줄이 이미 말한다.
     승패 배지는 **자리는 차지하고 그림만 감춘다**(veil) — 다 본 순간 줄이 뛰지 않게. */
  const winSide = result === "draw" ? "draw" : o1 === "win" ? 1 : 2;
  const winBadge = !showRoster && result !== "not_held" && result !== "unknown" ? (
    <span
      className={cx("scr-story-win",
        winSide === "draw" ? "scr-story-win-draw" : winSide === 1 ? "scr-story-win-t1" : "scr-story-win-t2",
        !revealWin && "scr-story-win-veil")}
      aria-hidden={!revealWin}
    >
      {winLabel}
    </span>
  ) : null;
  const mapMeta = mapName || minutes !== null ? (
    <span className="scr-game-crumb-map">
      {mapName}
      {minutes !== null && <span className="scr-game-crumb-dur">{minutes}분</span>}
    </span>
  ) : null;
  const headMeta = headSlot ? createPortal(
    <>
      <span className="scr-game-crumb-when">{stampText}</span>
      {mapMeta && <span className="scr-game-crumb-sep" aria-hidden>·</span>}
      {mapMeta}
      {gameResult.createdBy && (
        <span className="scr-game-crumb-by">
          <Avatar
            member={{
              id: gameResult.createdBy.id,
              nickname: gameResult.createdBy.nickname,
              avatar: memberOf(gameResult.createdBy.id)?.avatar ?? null,
            }}
            size={14}
          />
          <span>{gameResult.createdBy.nickname} 등록</span>
        </span>
      )}
    </>,
    headSlot,
  ) : null;
  const mapBlock = storyMap && (
    <div {...stopBubble}>
      <ReplayModule
        grid={storyMap} endSec={endSecVal}
        bases={bases} teamOfRaw={teamOfRaw} active={active}
        sceneLink={sceneLink}
        clockKey={String(gameResult.matchNo || gameResult.id)}
        onShare={shareScene}
        onDetailClose={detailClose ?? undefined}
        soleView={soleViewNow}
        askMode={soleViewNow}   /* 게임 상세는 들어올 때 보기 모드(요약 · 풀)를 묻는다 — 재생기가 장면 링크면 안 묻는다(2026-10-23) */
        veil={soleViewNow}   /* 로딩이 다 끝날 때까지 가린다(위 loadingNow ★) */
        onReady={() => setPlayerShown(true)}
        onLoadProgress={setPlayerProg}
        loadUnitTracks={() => api.getGameUnitTracks(gameResult.id)
          .catch(() => ({ motion: null }))}
        winnerTeam={gameResult.result === "team1" ? 1 : gameResult.result === "team2" ? 2 : undefined}
        melee={isMeleeGame({ matchType: gameResult.matchType, team1, team2 })}
        onFinish={soleViewNow ? () => setRevealWin(true) : undefined}
        side={detailClose
          ? <Comments targetType="gameResult" targetId={gameResult.id} overModal />
          : undefined}
        menu={menu}
      />
    </div>
  );

  return (
    <div className="scr-story">
    {headMeta}
      {showRoster && (
        melee ? (
          <div className={cx("scr-roster-matchup", "scr-roster-matchup-melee",
            "scr-feed-game-result-matchup", grid && "scr-story-matchup-wide")}>
            {[...team1, ...team2].map((s9, i9) => (
              <React.Fragment key={`${s9.memberId}-${i9}`}>
                {i9 > 0 && <span className="scr-story-melee-vs" aria-hidden>vs</span>}
                <div className="scr-roster-melee-one">
                  <RosterSide
                    team={[s9]} memberOf={memberOf}
                    highlightMemberIds={highlightMemberIds} highlightTerms={highlightTerms}
                  />
                  {result !== "not_held" && result !== "unknown" && result !== "draw"
                    && team1.some((w9) => w9.memberId === s9.memberId) && (
                    <span className="scr-story-win scr-story-win-t1">승</span>
                  )}
                </div>
              </React.Fragment>
            ))}
          </div>
        ) : (
        <div className={cx("scr-roster-matchup", "scr-feed-game-result-matchup", grid && "scr-story-matchup-wide")}>
          <RosterSide
            team={team1} memberOf={memberOf}
            highlightMemberIds={highlightMemberIds} highlightTerms={highlightTerms}
          />
          <div className="scr-story-mid">
            {vsRow}
          </div>
          <RosterSide
            team={team2} memberOf={memberOf}
            highlightMemberIds={highlightMemberIds} highlightTerms={highlightTerms}
          />
        </div>
        )
      )}
      {result === "not_held" && <div className="scr-feed-game-result-notheld">미실시</div>}
    {!showRoster && !headSlot && (mapMeta || winBadge) && (
      <div className="scr-game-result-trow-map-line scr-game-result-trow-map-meta scr-story-maphead">
        {mapName && <span className="scr-game-result-trow-map">{mapName}</span>}
        {minutes !== null && <span className="scr-game-result-trow-dur">({minutes}분)</span>}
        {winBadge}
      </div>
    )}
      {/* 게임 상세는 다 될 때까지 워드마크(DetailLoading · 위 loadingNow ★) — 목록 카드는 옛 흐린 네모 그대로. */}
      {loadingNow && <DetailLoading pct={loadPct} />}
      {(mapPending || playerWait) && !soleViewNow && <div className="scr-story-mapwait" aria-hidden />}
      {!showRoster && playerReady && mapBlock}
      {showMapLine && (
        <div className="scr-game-result-trow-map-line scr-game-result-trow-map-meta">
          {mapName && <span className="scr-game-result-trow-map">{mapName}</span>}
          {minutes !== null && <span className="scr-game-result-trow-dur">({minutes}분)</span>}
        </div>
      )}
      {gameResult.createdBy && !loadingNow && (
        <div className="scr-story-by">{gameResult.createdBy.nickname} 등록</div>
      )}
    </div>
  );
}
