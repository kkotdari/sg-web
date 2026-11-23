import { useEffect, useRef, useState } from "react";
import { Copy, FileUp, Play } from "lucide-react";
import Select from "../../components/common/Select";
import { Spinner } from "../../components/common/Feedback";
import { showToast } from "../../components/common/Toast";
import { api, type DiagResult } from "../../api/client";

/* ★ 진단(2026-11-22, 요청: "제어판에 진단 섹션 · 셀렉트 드롭다운으로 진단할 내용 선택 후 진단하면 아래 결과 노출되고 복사 가능하게 ·
   진단 스크립트 업로드해서 진단도 가능하게") — sg-api GET /api/game-results/admin/diag(고른 진단) · POST /admin/diag/script(올린 파이썬 글을 서버가
   딴 프로세스에서 돌려 print 한 것 · 재료는 통계와 같은 달마다 티어 판 묶음 · 이름 없음 · 120초 · sg-api scripts/diag/README.md).
   결과는 글 그대로(마크다운) · 복사 단추 · 스크립트면 오류 줄(stderr)도 아래에. */
const KINDS = [
  { value: "wpa-swing", label: "WPA 달마다 흔들림(티어 띠별)", desc: "상 · 중 · 하 띠마다 달 사이 흔들림 · 판 수로 오는 우연 폭 · 승패 운 · 실제 실력 변화 폭 · 섞기 후보의 다음 달 맞히기(이름 없음 · 수십 초)." },
  { value: "tier-calibration", label: "티어 예상 승률 맞음(구간별)", desc: "우세한 편의 예상 확률 구간마다 판 수 · 예상 평균 · 실제 승률(승패 보정 전 · 뒤)." },
  { value: "script", label: "스크립트 업로드", desc: "파이썬 파일(.py)을 올려 서버에서 돌립니다 — print 한 것이 결과예요. by_month(달 → 티어 판 묶음) · joined · meta · tier · swing · svc · wpa 를 바로 씁니다(120초)." },
] as const;
type Kind = (typeof KINDS)[number]["value"];

export default function AdminDiagCard() {
  const [kind, setKind] = useState<Kind>("wpa-swing");
  const [file, setFile] = useState<{ name: string; code: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sec, setSec] = useState(0);
  const [res, setRes] = useState<(DiagResult & { label: string }) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cur = KINDS.find((k) => k.value === kind) ?? KINDS[0];

  /* 걸린 초(진단은 수십 초 걸린다) — 도는 동안만 */
  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    setSec(0);
    const id = window.setInterval(() => setSec(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [busy]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    void f.text().then((code) => setFile({ name: f.name, code }));
  };

  const run = async () => {
    setBusy(true);
    const label = kind === "script" ? `스크립트 ${file?.name ?? ""}` : cur.label;
    try {
      const out = kind === "script" ? await api.adminDiagScript(file?.code ?? "") : await api.adminDiag(kind);
      setRes({ ...out, label });
    } catch (e) {
      setRes({ text: "", stderr: e instanceof Error ? e.message : "진단에 실패했어요.", label });
    } finally {
      setBusy(false);
    }
  };

  const whole = res ? [res.text, res.stderr ? `\n[오류 · stderr]\n${res.stderr}` : ""].join("").trim() : "";
  const meta = res ? [res.label, res.seconds != null ? `${res.seconds}초` : null, res.exit != null ? `끝 값 ${res.exit}` : null, res.sha1 ? `sha1 ${res.sha1}` : null].filter(Boolean).join(" · ") : "";

  return (
    <section className="scr-adm-card">
      <div className="scr-adm-card-head">
        <h2 className="scr-adm-card-title">진단</h2>
      </div>
      <div className="scr-adm-diag">
        <div className="scr-adm-diag-bar">
          <Select value={kind} options={KINDS.map((k) => ({ value: k.value, label: k.label }))} onChange={(v) => setKind(v as Kind)} className="scr-adm-diag-select" />
          {kind === "script" && (
            <>
              <input ref={fileRef} type="file" accept=".py,text/x-python,text/plain" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
              <button type="button" className="scr-rect-btn scr-adm-diag-btn" onClick={() => fileRef.current?.click()} disabled={busy} title={file?.name}>
                <FileUp size={14} /> <span className="scr-adm-diag-file">{file ? file.name : "파일 고르기"}</span>
              </button>
            </>
          )}
          <button type="button" className="scr-rect-btn scr-adm-diag-btn" onClick={() => void run()} disabled={busy || (kind === "script" && !file)}>
            {busy ? <><Spinner /> {sec}초</> : <><Play size={14} /> 진단</>}
          </button>
        </div>
        <p className="scr-adm-row-desc">{cur.desc}</p>
        {res && (
          <div className="scr-adm-diag-out">
            <div className="scr-adm-diag-out-head">
              <span className="scr-adm-diag-meta">{meta}</span>
              <button type="button" className="scr-rect-btn scr-adm-diag-btn" disabled={!whole}
                onClick={() => { void navigator.clipboard?.writeText(whole).then(() => showToast("복사했어요")); }}>
                <Copy size={14} /> 복사
              </button>
            </div>
            {res.text && <pre className="scr-adm-diag-pre">{res.text}</pre>}
            {res.stderr && <pre className="scr-adm-diag-pre is-err">{res.stderr}</pre>}
          </div>
        )}
      </div>
    </section>
  );
}
