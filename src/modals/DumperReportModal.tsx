import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Spinner } from "../components/common/Feedback";
import { api } from "../api/client";
import { showAlert } from "../components/common/AlertDialog";
import { showToast } from "../components/common/Toast";
import { useLockBodyScroll } from "../utils/bodyScrollLock";

/* 덤퍼 검사(2026-11-05, 요청: "핵있는 판 검사 모듈 … 리플레이 여러개를 같이 보내면 리포트를 내는" · "지금처럼 계속 배포하고 로그로 확인하긴 힘들어") —
   경기 번호(데이터 관리에서 고른 판이 미리 든다)·리플레이 파일 여럿 × 설정 변형마다 서버가 덤퍼를 돌려 리포트 글을 준다(sg-api dumper_report).
   변형은 한 줄에 하나: "이름: BWDUMP_열쇠=값 …"(값 없이 이름만이면 기본). 참값은 저장하지 않는다. */
const DEFAULT_VARIANTS = "기본\n늦춤0: BWDUMP_NUKEFREE=0";

function parseVariants(text: string): { name: string; env: Record<string, string> }[] {
  return text.split("\n").map((ln) => ln.trim()).filter(Boolean).map((ln) => {
    const [head, rest] = ln.includes(":") ? [ln.slice(0, ln.indexOf(":")), ln.slice(ln.indexOf(":") + 1)] : [ln, ""];
    const env: Record<string, string> = {};
    for (const kv of rest.split(/\s+/).filter(Boolean)) {
      const i = kv.indexOf("=");
      if (i > 0) env[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
    }
    return { name: head.trim(), env };
  });
}

async function fileB64(f: File): Promise<string> {
  const buf = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export default function DumperReportModal({ nos: nos0, onClose }: { nos?: string[]; onClose: () => void }) {
  useLockBodyScroll();
  const [nos, setNos] = useState((nos0 ?? []).join(" "));
  const [files, setFiles] = useState<File[]>([]);
  const [variants, setVariants] = useState(DEFAULT_VARIANTS);
  const [job, setJob] = useState<string | null>(null);
  const [prog, setProg] = useState<{ status: string; total: number; done: number; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    if (!job) return undefined;
    let stop = false;
    const tick = async () => {
      try {
        const st = await api.dumperReportStatus(job);
        if (stop || !alive.current) return;
        setProg(st);
        if (st.status !== "done") window.setTimeout(() => { void tick(); }, 3000);
      } catch (e) {
        if (!stop) showAlert(e instanceof Error ? e.message : "검사 진행을 못 읽었어요.");
      }
    };
    void tick();
    return () => { stop = true; };
  }, [job]);

  const start = async () => {
    const list = nos.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
    if (list.length === 0 && files.length === 0) { showAlert("경기 번호나 리플레이 파일을 주세요."); return; }
    setBusy(true);
    try {
      const fs = await Promise.all(files.map(async (f) => ({ name: f.name, b64: await fileB64(f) })));
      const got = await api.dumperReport({ nos: list, files: fs, variants: parseVariants(variants) });
      setProg(null);
      setJob(got.job);
      showToast(`검사 시작 — ${got.total}번 돌려요`);
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "검사를 시작하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!prog) return;
    try { await navigator.clipboard.writeText(prog.text); showToast("리포트를 복사했어요"); } catch { showAlert("복사하지 못했어요."); }
  };

  return createPortal(
    <div className="scr-modal-overlay">
      <div className="scr-modal scr-modal-md scr-dumper-rep" onClick={(e) => e.stopPropagation()}>
        <div className="scr-modal-head">
          <span>덤퍼 검사</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>
        <div className="scr-modal-body scr-dumper-rep-body">
          <label className="scr-dumper-rep-field">
            <span>경기 번호(빈칸·쉼표로 여럿)</span>
            <textarea className="scr-input" rows={2} value={nos} onChange={(e) => setNos(e.target.value)} placeholder="261104232830 261011220105" />
          </label>
          <label className="scr-dumper-rep-field">
            <span>리플레이 파일(여럿 골라도 돼요)</span>
            <input type="file" accept=".rep" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </label>
          <label className="scr-dumper-rep-field">
            <span>설정 변형 — 한 줄에 하나 · "이름: BWDUMP_열쇠=값"</span>
            <textarea className="scr-input" rows={3} value={variants} onChange={(e) => setVariants(e.target.value)} />
          </label>
          {job && (
            <div className="scr-dumper-rep-prog">
              {prog ? `${prog.done}/${prog.total} · ${prog.status === "done" ? "끝" : "돌리는 중"}` : "시작하는 중…"}
              {prog && prog.status !== "done" && <Spinner />}
            </div>
          )}
          {prog && <pre className="scr-dumper-rep-text">{prog.text}</pre>}
        </div>
        <div className="scr-modal-foot">
          {prog && <button type="button" className="scr-rect-btn is-secondary" onClick={() => { void copy(); }}>복사</button>}
          <button type="button" className="scr-rect-btn" onClick={() => { void start(); }} disabled={busy || (!!job && prog?.status !== "done")}>
            {busy ? <Spinner /> : job ? "다시 검사" : "검사 시작"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
