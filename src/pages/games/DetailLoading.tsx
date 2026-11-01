import { LoadingMark } from "../../components/common/Feedback";

/** 게임 상세의 기다림 — 화면 한가운데 워드마크 로딩만(2026-10-30, 요청: "상세에 진입하면 타이틀 외의 다른 부분은 그리지 말고 워드마크 로딩바만").
 *  게임을 받는 동안(GameDetailPage)·지도와 재생기가 다 될 때까지(GameResultStory) 같은 것을 띄운다. 누름은 아래(제목 줄)로 흘려보낸다. */
/** pct — 워드마크 아랫줄 퍼센트(0~100 · 게임 받기 → 지도 → 재생기 로딩을 이어 붙인 값 · GameResultStory ★). */
export function DetailLoading({ pct = null }: { pct?: number | null }) {
  return (
    <div className="scr-detail-loading" aria-live="polite">
      <LoadingMark full pct={pct === null ? null : Math.max(0, Math.min(100, Math.floor(pct)))} />
    </div>
  );
}
