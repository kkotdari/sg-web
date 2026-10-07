import React, { useCallback, useContext, useMemo, useState, type MouseEvent, type PointerEvent } from "react";
import { formatWhen } from "../../utils/date";
import { ReplayModule, SCENE_LINK_KEYS9, sceneLinkOf9, sceneLinkQueryOf9, type MotionBase } from "scplay";
import { api } from "../../api/client";
import RosterSide, { isMeleeGame, outcomeFor, resolveSlotName } from "../activity/GameResultSides";
import Avatar from "../../components/common/Avatar";
import { GameDetailCloseContext } from "../activity/gameDetailClose";
import { useReplayMap } from "scplay";
import { cleanMapName } from "../../utils/mapName";
import { cx } from "../../utils/format";
import { normalizeSearchText } from "../../utils/memberSearch";
import { maskPlayerName } from "../../utils/maskName";
import type { GameResult, GameResultSlot, Member } from "../../types";
export default function GuestGameStory({ gameResult, team1, team2, result, memberOf, highlightMemberIds, highlightTerms, active = true, menu, extShare = false, }: {
    gameResult: GameResult;
    team1: GameResultSlot[];
    team2: GameResultSlot[];
    result: GameResult["result"];
    memberOf: (id: string) => Member | undefined;
    highlightMemberIds?: Set<string>;
    highlightTerms?: string[];
    menu?: import("react").ReactNode;
    active?: boolean;
    extShare?: boolean;
}) {
    const grid = useReplayMap(gameResult.mapHash);
    const detailClose = useContext(GameDetailCloseContext);
    const linkQuery = useMemo(() => {
        const q = new URLSearchParams(window.location.search);
        const gameParam = q.get("item");
        if (q.get("group") === "gameResult" || gameParam) {
            if (q.get("group") !== "gameResult" || !gameParam)
                return null;
            if (gameParam !== gameResult.matchNo && Number(gameParam) !== gameResult.id)
                return null;
            return q;
        }
        return SCENE_LINK_KEYS9.some((k) => q.has(k)) ? q : null;
    }, []);
    const sceneLink = useMemo(() => (linkQuery ? sceneLinkOf9(linkQuery) : null), [linkQuery]);
    const stampText = formatWhen(gameResult.gameStartedAt ?? gameResult.date, { clock: true });
    const slots = useMemo(() => {
        const all = [...team1, ...team2];
        const rows: {
            raw: string;
            name: string;
            slot: GameResultSlot;
            team: 1 | 2;
        }[] = [];
        const add = (list: GameResultSlot[], team: 1 | 2) => {
            list.forEach((slot) => {
                /* 손님 모드 — 보이는 이름은 가린다(요청). raw(리플레이 원 이름)는 재생기가 트랙과 맞추는 열쇠라 그대로. */
                const name = maskPlayerName(resolveSlotName(slot, all, memberOf));
                if (slot.rawName)
                    rows.push({ raw: slot.rawName, name, slot, team });
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
            color: s.slot.color ?? undefined,
            observer: s.slot.observer ?? undefined,
            withName: true, highlight: hit,
            apm: s.slot.apm,
        };
    }), [slots, memberOf, highlightMemberIds, highlightTerms]);
    const t1 = useMemo(() => team1.filter((s) => !s.observer), [team1]);
    const t2 = useMemo(() => team2.filter((s) => !s.observer), [team2]);
    const o1 = outcomeFor("team1", result);
    const o2 = outcomeFor("team2", result);
    const winLabel = (() => {
        if (result === "draw")
            return "무승부";
        const side = o1 === "win" ? t1 : t2;
        if (isMeleeGame({ matchType: gameResult.matchType, team1: t1, team2: t2 })
            || (t1.length === 1 && t2.length === 1)) {
            return `${maskPlayerName(resolveSlotName(side[0], [...t1, ...t2], memberOf))} 승`;
        }
        return `${o1 === "win" ? 1 : 2}팀 승`;
    })();
    const mapName = cleanMapName(gameResult.mapName);
    const clockKey = String(gameResult.matchNo || gameResult.id);
    const onShare = useCallback(async (): Promise<string | void> => {
      const url = `${window.location.origin}${window.location.pathname}?${sceneLinkQueryOf9(clockKey).toString()}`;
      const copy = async (): Promise<string> => { await navigator.clipboard.writeText(url); return "링크 복사됨"; };
      try {
        if (typeof navigator.share === "function") {
          await navigator.share({ title: `${mapName || "경기"} 장면`, url });
          return "공유됨";
        }
        return await copy();
      } catch {
        try { return await copy(); } catch { return undefined; }
      }
    }, [clockKey, mapName]);
    const minutes = gameResult.durationSeconds != null
        ? Math.round(gameResult.durationSeconds / 60) : null;
    const melee = isMeleeGame({ matchType: gameResult.matchType, team1: t1, team2: t2 });
    const storyMap = grid ?? null;
    const showRoster = grid === null;
    const [revealWin, setRevealWin] = useState(false);
    const soleViewNow = extShare || !!detailClose || linkQuery !== null;
    const showMapLine = showRoster && Boolean(mapName || minutes !== null);
    const stopBubble = {
        onPointerDown: (e: PointerEvent) => e.stopPropagation(),
        onMouseDown: (e: MouseEvent) => e.stopPropagation(),
        onClick: (e: MouseEvent) => e.stopPropagation(),
    };
    const vsRow = (<span className="scr-challenge-arrow-row">
      <span className={cx("scr-challenge-inline-win", o1 === "draw" && "scr-challenge-inline-draw", o1 !== "win" && o1 !== "draw" && "scr-challenge-inline-win-hidden")}>
        {o1 === "draw" ? "무" : "승"}
      </span>
      <span className="scr-challenge-arrow scr-challenge-arrow-vs" aria-hidden="true">vs</span>
      <span className={cx("scr-challenge-inline-win", o2 === "draw" && "scr-challenge-inline-draw", o2 !== "win" && o2 !== "draw" && "scr-challenge-inline-win-hidden")}>
        {o2 === "draw" ? "무" : "승"}
      </span>
    </span>);
    const endSecVal = gameResult.durationSeconds ?? null;
    const teamByRaw = useMemo(() => {
        const m = new Map<string, 1 | 2>();
        for (const x of slots)
            if (x.team)
                m.set(x.raw, x.team);
        return m;
    }, [slots]);
    const teamOfRaw = useCallback((raw: string): 1 | 2 | undefined => teamByRaw.get(raw), [teamByRaw]);
    const mapBlock = storyMap && (<div className="scr-story-player" {...stopBubble}>

      <ReplayModule
        grid={storyMap} endSec={endSecVal}
        bases={bases} teamOfRaw={teamOfRaw} active={active}
        head={{
          stamp: stampText,
          mapName,
          minutes,
          win: !showRoster && result !== "not_held"
            ? {
              side: result === "draw" ? "draw" : o1 === "win" ? 1 : 2,
              label: winLabel,
              veiled: !revealWin,
            }
            : null,
          by: gameResult.createdBy ? (
            <>
              <Avatar
                member={{
                  id: gameResult.createdBy.id,
                  nickname: gameResult.createdBy.nickname,
                  avatar: memberOf(gameResult.createdBy.id)?.avatar ?? null,
                }}
                size={16}
              />
              <span>{gameResult.createdBy.nickname} 등록</span>
            </>
          ) : null,
        }}
        avatars={false}
        sceneLink={sceneLink}
        clockKey={clockKey}
        onShare={onShare}
        onDetailClose={detailClose ?? undefined}
        soleView={soleViewNow}
        loadUnitTracks={() => api.getGameUnitTracks(gameResult.id)
          .catch(() => ({ motion: null }))}
        winnerTeam={gameResult.result === "team1" ? 1 : gameResult.result === "team2" ? 2 : undefined}
        melee={isMeleeGame({ matchType: gameResult.matchType, team1: t1, team2: t2 })}
        onFinish={soleViewNow ? () => setRevealWin(true) : undefined}
        menu={menu}
      />
    </div>);
    return (<div className="scr-story">
      {showRoster && (melee ? (<div className={cx("scr-roster-matchup", "scr-roster-matchup-melee", "scr-activity-game-result-matchup", grid && "scr-story-matchup-wide")}>
            {[...t1, ...t2].map((s9, i9) => (<React.Fragment key={`${s9.memberId}-${i9}`}>
                {i9 > 0 && <span className="scr-story-melee-vs" aria-hidden>vs</span>}
                <div className="scr-roster-melee-one">
                  <RosterSide team={[s9]} memberOf={memberOf} highlightMemberIds={highlightMemberIds} highlightTerms={highlightTerms} nameMask={maskPlayerName}/>
                  
                  {result !== "not_held" && result !== "draw"
                    && t1.some((w9) => w9.memberId === s9.memberId) && (<span className="scr-story-win scr-story-win-t1">승</span>)}
                </div>
              </React.Fragment>))}
          </div>) : (<div className={cx("scr-roster-matchup", "scr-activity-game-result-matchup", grid && "scr-story-matchup-wide")}>
          <RosterSide team={t1} memberOf={memberOf} highlightMemberIds={highlightMemberIds} highlightTerms={highlightTerms} nameMask={maskPlayerName}/>
          
          <div className="scr-story-mid">
            {vsRow}
          </div>
          <RosterSide team={t2} memberOf={memberOf} highlightMemberIds={highlightMemberIds} highlightTerms={highlightTerms} nameMask={maskPlayerName}/>
        </div>))}
      {result === "not_held" && <div className="scr-activity-game-result-notheld">미실시</div>}
      {!showRoster && mapBlock}
      
      {showMapLine && (<div className="scr-game-result-trow-map-line scr-game-result-trow-map-meta">
          {mapName && <span className="scr-game-result-trow-map">{mapName}</span>}
          {minutes !== null && <span className="scr-game-result-trow-dur">({minutes}분)</span>}
        </div>)}
      
      
      {gameResult.createdBy && (<div className="scr-story-by">{gameResult.createdBy.nickname} 등록</div>)}
    </div>);
}
