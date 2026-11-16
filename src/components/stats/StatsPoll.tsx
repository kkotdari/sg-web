import PollSheet from "../polls/PollSheet";
import { pollDef } from "../../polls/defs";

/* ★ 통계 설문(2026-11-15, 요청: "통계 들어가면 지금 토스트 없애고 대신 아래쪽에 poll 뜨게 · 현재 순위 순서가 얼마나 맞다고 생각하시나요 ·
   1 대부분 맞다 2 반 이상 맞다 3 반 정도 맞다 4 반 이상 틀리다 5 대부분 틀리다 · 틀리다면 어느 부분이 틀린지 적어주세요 · 제출 버튼 · 한 사람에 한 번만" →
   "티어가 아닌 순서만 보라고 강조" → 문항 "11월 실력(WPA)의 순서가 맞다고 생각하시나요?(티어가 아닌 순서만 봐주세요!)") —
   문항 · 고르기는 polls/defs(공통 양식 · 2026-11-16) · 판은 components/polls/PollSheet. 설문을 바꾸려면 defs 에 새 열쇠로 한 줄 더하고 아래 열쇠를 바꾼다
   (옛 답은 그대로 남고 제어판 '설문 결과' 에서 계속 보인다). */
export const STATS_POLL_ON = true;
const STATS_POLL_KEY = "wpa-order-2026-11";

export default function StatsPoll() {
  return <PollSheet def={pollDef(STATS_POLL_KEY)} on={STATS_POLL_ON} />;
}
