import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { api } from "../../api/client";
import { useAppStore } from "../../store/appStore";
import { cx } from "../../utils/format";
import { questionParts, type PollDef } from "../../polls/defs";

/* ★ 설문 답 판(공통 양식 · polls/defs ★ — 2026-11-16 StatsPoll 에서 떼어 냄) — 아래쪽 가운데에 뜨는 판 · 로그인한 사람만 ·
   서버(sg-api /polls)가 답했는지 안다(다른 기기에서도 한 번). 닫기는 이번 방문만 숨긴다(답할 때까지 다음 방문에 다시 뜬다). */
const hiddenThisVisit = new Set<string>();

/** 문항 — `**낱말**` 은 굵게. */
export function PollQuestion({ text }: { text: string }) {
  return <>{questionParts(text).map((t, i) => (i % 2 ? <b key={i}>{t}</b> : <Fragment key={i}>{t}</Fragment>))}</>;
}

export default function PollSheet({ def, on = true }: { def: PollDef | null; on?: boolean }) {
  const user = useAppStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = def?.key ?? "";
  useEffect(() => {
    if (!on || !key || !user || hiddenThisVisit.has(key)) return undefined;
    let alive = true;
    api.getPollState(key).then((s) => { if (alive && !s.answered) setOpen(true); }).catch(() => { /* 서버 오류면 안 띄운다 */ });
    return () => { alive = false; };
  }, [user, on, key]);
  if (!open || !def) return null;
  const submit = async (): Promise<void> => {
    if (choice === null || busy) return;
    setBusy(true); setErr(null);
    try {
      await api.answerPoll(def.key, { choice, comment: comment.trim() });
      setDone(true);
      window.setTimeout(() => setOpen(false), 1600);
    } catch {
      setErr("보내지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  };
  const close = (): void => { hiddenThisVisit.add(def.key); setOpen(false); };
  return createPortal(
    <div className="scr-poll" role="dialog" aria-label={`설문 — ${def.title}`}>
      <button type="button" className="scr-icon-btn scr-poll-x" onClick={close} aria-label="닫기"><X size={14} /></button>
      {done ? (
        <p className="scr-poll-thanks">고마워요! 답이 잘 들어갔어요.</p>
      ) : (
        <>
          <p className="scr-poll-q"><PollQuestion text={def.question} /></p>
          {def.emphasis && <p className="scr-poll-em">{def.emphasis}</p>}
          <div className="scr-poll-choices" role="radiogroup" aria-label="고르기">
            {def.choices.map((c, i) => (
              <button key={c} type="button" role="radio" aria-checked={choice === i + 1}
                className={cx("scr-poll-choice", choice === i + 1 && "is-on")} onClick={() => setChoice(i + 1)}>
                <i>{i + 1}</i>{c}
              </button>
            ))}
          </div>
          {def.commentHint && (
            <textarea className="scr-poll-text" value={comment} maxLength={1000} rows={2}
              placeholder={def.commentHint} onChange={(e) => setComment(e.target.value)} />
          )}
          {err && <p className="scr-poll-err">{err}</p>}
          <button type="button" className="scr-rect-btn scr-poll-send" disabled={choice === null || busy} onClick={() => void submit()}>
            {busy ? "보내는 중…" : "제출"}
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
