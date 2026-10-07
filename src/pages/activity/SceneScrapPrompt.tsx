import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api/client";
import type { KakaoShareContent } from "../../utils/kakaoShare";

let promptOpen = false;

export function useSceneScrap(content: () => KakaoShareContent, gameNo: string): {
  scrap: () => Promise<boolean>;
  node: ReactNode;
} {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const snapRef = useRef<KakaoShareContent | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const gameNoRef = useRef(gameNo);
  gameNoRef.current = gameNo;

  const settle = useCallback((ok: boolean): void => {
    promptOpen = false;
    setOpen(false);
    const r = resolveRef.current;
    resolveRef.current = null;
    r?.(ok);
  }, []);

  const scrap = useCallback(() => new Promise<boolean>((resolve) => {
    if (promptOpen) { resolve(false); return; }
    const c9 = contentRef.current();
    if (!c9.link) { resolve(false); return; }
    promptOpen = true;
    snapRef.current = c9;
    resolveRef.current = resolve;
    setTitle("");
    setErr("");
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }), []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") settle(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, settle]);

  useEffect(() => () => {
    if (resolveRef.current) {
      promptOpen = false;
      resolveRef.current(false);
      resolveRef.current = null;
    }
  }, []);

  const save = async (): Promise<void> => {
    const c9 = snapRef.current;
    if (!c9 || !c9.link || busy) return;
    setBusy(true);
    setErr("");
    try {
      await api.createSceneScrap({
        title: title.trim() || c9.title,
        subtitle: c9.description ?? "",
        link: c9.link,
        gameNo: gameNoRef.current || null,
      });
      settle(true);
    } catch {
      setErr("담지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const node = !open ? null : createPortal((
    <div
      className="scr-scrap-modal"
      onMouseDown={(e) => { if (e.target === e.currentTarget) settle(false); }}
    >
      <div
        className="scr-scrap-pop"
        role="dialog"
        aria-modal="true"
        aria-label="장면 스크랩"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="scr-input scr-scrap-pop-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Enter") { e.preventDefault(); void save(); }
            if (e.key === "Escape") settle(false);
          }}
          placeholder={snapRef.current?.title ?? "제목"}
          maxLength={60}
          aria-label="스크랩 제목"
        />
        <div className="scr-scrap-pop-hint">
          비워 두면 <b>{snapRef.current?.title ?? "공유 제목"}</b>으로 저장돼요.
        </div>
        {err && <div className="scr-err" role="alert">{err}</div>}
        <div className="scr-scrap-pop-btns">
          <button
            type="button" className="scr-rect-btn scr-lighting-color"
            onClick={() => settle(false)}
          >
            취소
          </button>
          <button
            type="button" className="scr-rect-btn scr-lighting-color-fill"
            onClick={() => void save()} disabled={busy}
          >
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  ), document.body);

  return { scrap, node };
}
