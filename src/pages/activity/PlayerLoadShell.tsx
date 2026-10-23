import { PENDING_GRID9, ReplayModule } from "scplay";

const NO_BASES: never[] = [];
const noTeam = (): undefined => undefined;

/** ★ 자료를 기다리는 재생기(2026-10-23, 요청: "상세 처음 들어올 때 카드형 스켈레톤 없이 바로 재생기가 뜨면 좋겠어 · 로딩으로" → "그러지 말고 재생기를 처음부터
 *  보여줘 · 데이터는 나중에 채우고") — 게임·지도를 받는 동안 **진짜 재생기**를 빈 지도(PENDING_GRID9)·빈 로스터로 먼저 세운다(scplay pending: 틀·독·툴박스 그대로 ·
 *  무대는 까만 판 + LOADING · 시계 섬). 자료가 오면 GameResultStory 의 재생기가 그 자리를 받는다. 옛 검은 판 흉내(.scr-player-shell)는 걷었다. */
export default function PlayerLoadShell() {
  return (
    <div className="scr-story">
      <ReplayModule grid={PENDING_GRID9} endSec={null} bases={NO_BASES} teamOfRaw={noTeam} soleView pending />
    </div>
  );
}
