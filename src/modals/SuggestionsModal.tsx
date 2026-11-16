import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, X } from "lucide-react";
import ModalHash from "../utils/modalHash";
import { Spinner } from "../components/common/Feedback";
import { showToast } from "../components/common/Toast";
import { api } from "../api/client";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import { cx } from "../utils/format";
import { formatAgo, serverMs } from "../utils/date";
import { SUGGEST_TOPIC } from "../components/stats/WpaRules";

/* ★ 건의함(2026-11-16, 요청: "부족한 조건을 팀원들이 건의할 수 있게" — WPA 계산 조건 창의 건의 · sg-api /suggestions) — 제어판 '설문' 칸.
   주제 고르기(알려진 주제 ∪ 서버에 건의가 든 주제) → 건의 목록(닉네임 · 글 · 때 · 최근 차례) · md 복사(대화에 붙여 넣기 좋게). */
const TOPIC_LABEL: Record<string, string> = { [SUGGEST_TOPIC]: "WPA 계산 조건" };

interface Topic { topic: string; total: number }
interface Row { id: number; nickname: string | null; text: string; createdAt: string }

export default function SuggestionsModal({ onClose }: { onClose: () => void }) {
  useLockBodyScroll();
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [topic, setTopic] = useState<string>(SUGGEST_TOPIC);
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let alive = true;
    api.listSuggestionTopics().then((t) => { if (alive) setTopics(t); }).catch((e) => {
      if (!alive) return;
      setErr(e instanceof Error ? e.message : "건의 주제를 받지 못했어요.");
      setTopics([]);
    });
    return () => { alive = false; };
  }, []);
  const tabs = useMemo<Topic[]>(() => {
    const out = [...(topics ?? [])];
    for (const k of Object.keys(TOPIC_LABEL)) if (!out.some((t) => t.topic === k)) out.push({ topic: k, total: 0 });
    return out;
  }, [topics]);
  useEffect(() => {
    let alive = true;
    setRows(null);
    api.getSuggestions(topic).then((r) => { if (alive) setRows(r); }).catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [topic]);
  const md = (): string => [`## 건의 — ${TOPIC_LABEL[topic] ?? topic} (${rows?.length ?? 0}개)`, "",
    ...(rows ?? []).map((r) => `- ${r.nickname ?? "?"}: ${r.text.replace(/\s*\n\s*/g, " / ")}`)].join("\n");
  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash="suggestions" onClose={onClose} />
      <div className="scr-modal scr-modal-md scr-pollres" onClick={(e) => e.stopPropagation()}>
        <div className="scr-modal-head">
          <span>건의함</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>
        <div className="scr-modal-body scr-pollres-body">
          {topics === null ? (
            <div className="scr-pollres-empty"><Spinner /> 건의 주제를 받는 중…</div>
          ) : (
            <>
              <div className="scr-pollres-tabs" role="tablist" aria-label="주제">
                {tabs.map((t) => (
                  <button key={t.topic} type="button" role="tab" aria-selected={t.topic === topic}
                    className={cx("scr-pill-btn scr-pollres-tab", t.topic === topic && "is-on")} onClick={() => setTopic(t.topic)}>
                    {TOPIC_LABEL[t.topic] ?? t.topic}<em>{t.total}개</em>
                  </button>
                ))}
              </div>
              {err && <div className="scr-pollres-empty">{err}</div>}
              <div className="scr-pollres-tools">
                <span className="scr-pollres-meta">팀원이 보낸 건의예요. WPA 계산 조건은 통계 표 WPA 칸 머리의 '?'에서 보여요.</span>
                <button type="button" className="scr-pill-btn scr-pollres-copy" disabled={!rows || rows.length === 0}
                  onClick={() => { void navigator.clipboard?.writeText(md()).then(() => showToast("복사했어요")); }}>
                  <Copy size={12} />md 복사
                </button>
              </div>
              <div className="scr-pollres-list">
                {rows === null ? (
                  <div className="scr-pollres-empty"><Spinner /> 건의를 받는 중…</div>
                ) : rows.length === 0 ? (
                  <div className="scr-pollres-empty">아직 건의가 없어요</div>
                ) : rows.map((r) => (
                  <div key={r.id} className="scr-pollres-row">
                    <div className="scr-pollres-row-head">
                      <span className="scr-pollres-row-name">{r.nickname ?? "?"}</span>
                      <span className="scr-pollres-row-when">{formatAgo(serverMs(r.createdAt))}</span>
                    </div>
                    <p className="scr-pollres-row-text">{r.text}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
