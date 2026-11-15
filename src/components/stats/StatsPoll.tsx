import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { api } from "../../api/client";
import { useAppStore } from "../../store/appStore";
import { cx } from "../../utils/format";

/* ★ 통계 설문(2026-11-15, 요청: "통계 들어가면 지금 토스트 없애고 대신 아래쪽에 poll 뜨게 · 현재 순위 순서가 얼마나 맞다고 생각하시나요 ·
   1 대부분 맞다 2 반 이상 맞다 3 반 정도 맞다 4 반 이상 틀리다 5 대부분 틀리다 · 틀리다면 어느 부분이 틀린지 적어주세요 · 제출 버튼 · 한 사람에 한 번만" →
   "티어가 아닌 순서만 보라고 강조" → 문항 "11월 실력(WPA)의 순서가 맞다고 생각하시나요?(티어가 아닌 순서만 봐주세요!)") —
   아래쪽에 뜨는 판 · 로그인한 사람만 · 서버(sg-api /polls)가 답했는지 안다(다른 기기에서도 한 번). 닫기는 이번 방문만 숨긴다(답할 때까지 다음 방문에 다시 뜬다).
   설문을 바꾸려면 POLL_KEY 를 새로(옛 답은 그대로 남는다). */
export const STATS_POLL_ON = true;
const POLL_KEY = "wpa-order-2026-11";
const POLL_MONTH = "11월";
const CHOICES = ["대부분 맞다", "반 이상 맞다", "반 정도 맞다", "반 이상 틀리다", "대부분 틀리다"] as const;
let hiddenThisVisit = false;

export default function StatsPoll() {
  const user = useAppStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!STATS_POLL_ON || !user || hiddenThisVisit) return undefined;
    let alive = true;
    api.getPollState(POLL_KEY).then((s) => { if (alive && !s.answered) setOpen(true); }).catch(() => { /* 서버 오류면 안 띄운다 */ });
    return () => { alive = false; };
  }, [user]);
  if (!open) return null;
  const submit = async (): Promise<void> => {
    if (choice === null || busy) return;
    setBusy(true); setErr(null);
    try {
      await api.answerPoll(POLL_KEY, { choice, comment: comment.trim() });
      setDone(true);
      window.setTimeout(() => setOpen(false), 1600);
    } catch {
      setErr("보내지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  };
  const close = (): void => { hiddenThisVisit = true; setOpen(false); };
  return createPortal(
    <div className="scr-stats-poll" role="dialog" aria-label="통계 설문">
      <button type="button" className="scr-icon-btn scr-stats-poll-x" onClick={close} aria-label="닫기"><X size={14} /></button>
      {done ? (
        <p className="scr-stats-poll-thanks">고마워요! 답이 잘 들어갔어요.</p>
      ) : (
        <>
          <p className="scr-stats-poll-q">{POLL_MONTH} 실력(WPA)의 <b>순서</b>가 맞다고 생각하시나요?</p>
          <p className="scr-stats-poll-em">티어가 아닌 순서만 봐주세요!</p>
          <div className="scr-stats-poll-choices" role="radiogroup" aria-label="얼마나 맞나요">
            {CHOICES.map((c, i) => (
              <button key={c} type="button" role="radio" aria-checked={choice === i + 1}
                className={cx("scr-stats-poll-choice", choice === i + 1 && "is-on")} onClick={() => setChoice(i + 1)}>
                <i>{i + 1}</i>{c}
              </button>
            ))}
          </div>
          <textarea className="scr-stats-poll-text" value={comment} maxLength={1000} rows={2}
            placeholder="틀리다면 어느 부분이 틀린지 적어주세요" onChange={(e) => setComment(e.target.value)} />
          {err && <p className="scr-stats-poll-err">{err}</p>}
          <button type="button" className="scr-rect-btn scr-stats-poll-send" disabled={choice === null || busy} onClick={() => void submit()}>
            {busy ? "보내는 중…" : "제출"}
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
