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
import { POLLS, pollDef, type PollDef } from "../polls/defs";
import { PollQuestion } from "../components/polls/PollSheet";
import type { PollResult, PollSummary } from "../types";

/* ★ 설문 결과(2026-11-16, 요청: "설문 결과 보는 창 제어판에 추가해줘 · 앞으로 설문조사 다양하게 생길 수 있으니 공통 양식으로") —
   설문 고르기(정의 표 polls/defs ∪ 서버에 답이 든 열쇠 · 마지막 답이 최근인 차례) → 문항 · 고르기별 막대(누르면 그 답만) · 눈금 설문은 평균 ·
   답 목록(닉네임 · 고른 것 · 의견 · 때) · '의견 있는 답만' · md 복사(표 + 의견 — 대화에 붙여 넣기 좋게). 정의를 지운 옛 설문은 번호로 보인다. */

interface Item { key: string; def: PollDef | null; sum: PollSummary | null }

const labelOf = (def: PollDef | null, n: number): string => def?.choices[n - 1] ?? `${n}번`;
const pct = (n: number, total: number): string => (total > 0 ? `${Math.round((n / total) * 100)}%` : "0%");

function toMd(it: Item, res: PollResult, n: number): string {
  const def = it.def;
  const lines = [`## 설문 — ${def?.title ?? it.key}`, "", def ? `> ${def.question.replace(/\*\*/g, "")}${def.emphasis ? ` (${def.emphasis})` : ""}` : `> 열쇠 ${it.key}`, "",
    `답 ${res.total}명`, "", "| 번 | 고르기 | 명 | 비율 |", "|---|---|---|---|"];
  for (let i = 1; i <= n; i++) lines.push(`| ${i} | ${labelOf(def, i)} | ${res.counts[i - 1] ?? 0} | ${pct(res.counts[i - 1] ?? 0, res.total)} |`);
  const said = res.answers.filter((a) => a.comment);
  if (said.length) {
    lines.push("", `### 의견 ${said.length}개`, "");
    for (const a of said) lines.push(`- (${a.choice} ${labelOf(def, a.choice)}) ${a.nickname}: ${a.comment.replace(/\s*\n\s*/g, " / ")}`);
  }
  return lines.join("\n");
}

export default function PollResultsModal({ onClose }: { onClose: () => void }) {
  useLockBodyScroll();
  const [sums, setSums] = useState<PollSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [res, setRes] = useState<PollResult | null>(null);
  const [resErr, setResErr] = useState<string | null>(null);
  const [only, setOnly] = useState<number | null>(null);
  const [saidOnly, setSaidOnly] = useState(false);

  useEffect(() => {
    let alive = true;
    api.listPolls().then((s) => { if (alive) setSums(s); }).catch((e) => {
      if (!alive) return;
      setErr(e instanceof Error ? e.message : "설문 목록을 받지 못했어요.");
      setSums([]);
    });
    return () => { alive = false; };
  }, []);

  // 서버에 답이 든 설문(최근 차례) 먼저 · 정의만 있고 아직 답이 없는 설문은 뒤에.
  const items = useMemo<Item[]>(() => {
    const byKey = new Map((sums ?? []).map((s) => [s.key, s]));
    const out: Item[] = (sums ?? []).map((s) => ({ key: s.key, def: pollDef(s.key), sum: s }));
    for (const d of POLLS) if (!byKey.has(d.key)) out.push({ key: d.key, def: d, sum: null });
    return out;
  }, [sums]);
  const cur = items.find((it) => it.key === key) ?? null;
  useEffect(() => { if (key === null && items.length > 0 && sums !== null) setKey(items[0].key); }, [items, key, sums]);

  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    setRes(null); setResErr(null); setOnly(null);
    api.getPollResult(key).then((r) => { if (alive) setRes(r); }).catch((e) => {
      if (alive) setResErr(e instanceof Error ? e.message : "결과를 받지 못했어요.");
    });
    return () => { alive = false; };
  }, [key]);

  const def = cur?.def ?? null;
  const n = Math.max(def?.choices.length ?? 0, res ? res.counts.reduce((m, c, i) => (c > 0 ? i + 1 : m), 0) : 0, 2);
  const maxCount = res ? Math.max(1, ...res.counts) : 1;
  const mean = res && res.total > 0 ? res.answers.reduce((s, a) => s + a.choice, 0) / res.total : null;
  const shown = (res?.answers ?? []).filter((a) => (only === null || a.choice === only) && (!saidOnly || a.comment));
  const saidCount = (res?.answers ?? []).filter((a) => a.comment).length;

  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash="poll-results" onClose={onClose} />
      <div className="scr-modal scr-modal-md scr-pollres" onClick={(e) => e.stopPropagation()}>
        <div className="scr-modal-head">
          <span>설문 결과</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>
        <div className="scr-modal-body scr-pollres-body">
          {sums === null ? (
            <div className="scr-pollres-empty"><Spinner /> 설문 목록을 받는 중…</div>
          ) : items.length === 0 ? (
            <div className="scr-pollres-empty">{err ?? "아직 설문이 없어요"}</div>
          ) : (
            <>
              <div className="scr-pollres-tabs" role="tablist" aria-label="설문">
                {items.map((it) => (
                  <button key={it.key} type="button" role="tab" aria-selected={it.key === key}
                    className={cx("scr-pill-btn scr-pollres-tab", it.key === key && "is-on")} onClick={() => setKey(it.key)}>
                    {it.def?.title ?? it.key}<em>{it.sum?.total ?? 0}명</em>
                  </button>
                ))}
              </div>
              {cur && (
                <div className="scr-pollres-card">
                  <p className="scr-pollres-q">{def ? <PollQuestion text={def.question} /> : <>정의가 없는 설문 · 열쇠 <code>{cur.key}</code></>}</p>
                  {def?.emphasis && <p className="scr-pollres-em">{def.emphasis}</p>}
                  <p className="scr-pollres-meta">
                    답 {res?.total ?? cur.sum?.total ?? 0}명
                    {def && ` · ${def.where}`}
                    {def && ` · ${def.since} 시작`}
                    {cur.sum && ` · 마지막 답 ${formatAgo(serverMs(cur.sum.lastAt))}`}
                  </p>
                  {resErr ? (
                    <div className="scr-pollres-empty">{resErr}</div>
                  ) : !res ? (
                    <div className="scr-pollres-empty"><Spinner /> 결과를 받는 중…</div>
                  ) : (
                    <>
                      {def?.scale && mean !== null && (
                        <p className="scr-pollres-mean">
                          평균 <b>{mean.toFixed(2)}</b>
                          <span> · 1 {labelOf(def, 1)} ~ {n} {labelOf(def, n)}</span>
                        </p>
                      )}
                      <div className="scr-pollres-bars">
                        {Array.from({ length: n }, (_, i) => {
                          const c = res.counts[i] ?? 0;
                          return (
                            <button key={i} type="button" className={cx("scr-pollres-bar", only === i + 1 && "is-on")}
                              onClick={() => setOnly((o) => (o === i + 1 ? null : i + 1))} aria-pressed={only === i + 1}
                              title={only === i + 1 ? "모든 답 보기" : "이 고르기의 답만 보기"}>
                              <span className="scr-pollres-bar-label"><i>{i + 1}</i>{labelOf(def, i + 1)}</span>
                              <span className="scr-pollres-bar-track"><span className="scr-pollres-bar-fill" style={{ width: `${(c / maxCount) * 100}%` }} /></span>
                              <span className="scr-pollres-bar-num">{c}명 <em>{pct(c, res.total)}</em></span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="scr-pollres-tools">
                        <button type="button" className={cx("scr-pill-btn", saidOnly && "is-on")} onClick={() => setSaidOnly((v) => !v)} aria-pressed={saidOnly}>
                          의견 있는 답만 ({saidCount})
                        </button>
                        {only !== null && (
                          <button type="button" className="scr-pill-btn" onClick={() => setOnly(null)}>{only}번만 · 풀기</button>
                        )}
                        <button type="button" className="scr-pill-btn scr-pollres-copy"
                          onClick={() => { void navigator.clipboard?.writeText(toMd(cur, res, n)).then(() => showToast("복사했어요")); }}>
                          <Copy size={12} />md 복사
                        </button>
                      </div>
                      <div className="scr-pollres-list">
                        {shown.length === 0 ? (
                          <div className="scr-pollres-empty">{res.total === 0 ? "아직 답이 없어요" : "고른 조건의 답이 없어요"}</div>
                        ) : shown.map((a, i) => (
                          <div key={`${a.nickname}-${i}`} className="scr-pollres-row">
                            <div className="scr-pollres-row-head">
                              <span className="scr-pollres-row-name">{a.nickname}</span>
                              <span className="scr-pollres-row-pick"><i>{a.choice}</i>{labelOf(def, a.choice)}</span>
                              <span className="scr-pollres-row-when">{formatAgo(serverMs(a.createdAt))}</span>
                            </div>
                            {a.comment && <p className="scr-pollres-row-text">{a.comment}</p>}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
