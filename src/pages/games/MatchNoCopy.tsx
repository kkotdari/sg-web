import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { showToast } from "../../components/common/Toast";
import { cx } from "../../utils/format";

/** 글을 클립보드로 — 클립보드 API 가 없거나 막힌 곳(옛 웹뷰 · http)은 숨은 글 칸으로 베낀다. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* 아래 옛 길로 */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch { return false; }
}

/* ★ 게임번호 복사(2026-11-19, 요청: "게임번호를 그냥 오버레이로 · 터치시 복사도 되게 · 피시도 복사 기능 넣기") — 폰 게임 줄 오른위 오버레이(.scr-feed-row-corner) · PC 표 첫 칸(.scr-gtab-no)이
   같이 쓴다. 누르면 줄이 열리거나 길게 누르기(고르기)가 시작되지 않게 누름을 여기서 끊는다 · 복사하면 알림과 함께 1.2초 "복사됨". */
export default function MatchNoCopy({ no, className }: { no: string; className?: string }) {
  const [done, setDone] = useState(false);
  const tm = useRef(0);
  useEffect(() => () => window.clearTimeout(tm.current), []);
  const stop = (e: PointerEvent | MouseEvent | KeyboardEvent): void => { e.stopPropagation(); };
  const run = (): void => {
    void copyText(no).then((ok) => {
      if (!ok) { showToast("복사하지 못했어요", { kind: "warn" }); return; }
      showToast(`게임번호 ${no} 복사했어요`);
      setDone(true);
      window.clearTimeout(tm.current);
      tm.current = window.setTimeout(() => setDone(false), 1200);
    });
  };
  return (
    <span
      role="button" tabIndex={0}
      className={cx("scr-matchno", done && "is-copied", className)}
      title="눌러서 게임번호 복사" aria-label={`게임번호 ${no} 복사`}
      onPointerDown={stop} onPointerUp={stop} onMouseDown={stop} onContextMenu={stop}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); run(); }}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" || e.key === " ") { e.preventDefault(); run(); } }}
    >
      {done ? "복사됨" : no}
    </span>
  );
}
