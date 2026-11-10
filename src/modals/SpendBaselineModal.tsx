import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Spinner } from "../components/common/Feedback";
import { api } from "../api/client";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import { cx } from "../utils/format";

type Row = { bucket: string; plays: number; perMin: number | null; now: number; armyBase: number };

/** ★ 생산 기준 비교(2026-11-10, 요청: "단추 만들어 줘 · 비포 앤 애프터 비교") — 생산 = 총지출로 바꾼 뒤 길이 칸마다
 *  지금 기준(병력 기준 × 잠정 배 = 비포)과 실측 분당 총지출(애프터)을 나란히 본다. 기간을 비우면 모든 판. 실측이 기준보다 크면 그 칸 사람들의 생산 점수가 오른다. */
export default function SpendBaselineModal({ onClose }: { onClose: () => void }) {
  useLockBodyScroll();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setErr(null);
    try { setRows((await api.spendBaseline({ dateFrom: from || undefined, dateTo: to || undefined })).buckets); }
    catch (e) { setErr(e instanceof Error ? e.message : "기준을 재지 못했어요."); }
    finally { setBusy(false); }
  };
  const total = rows?.reduce((a, r) => a + r.plays, 0) ?? 0;
  return createPortal(
    <div className="scr-modal-overlay">
      <div className="scr-modal scr-modal-md scr-spendbase" onClick={(e) => e.stopPropagation()}>
        <div className="scr-modal-head">
          <h2 className="scr-modal-title">생산 기준 비교</h2>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>
        <div className="scr-modal-body">
          <p className="scr-spendbase-note">
            판 길이 칸마다 한 사람 평균 <b>분당 총지출</b>(병력 · 일꾼 · 서플라이 · 건물 · 공방업 · 연구)을 잽니다.
            <b>비포</b>는 지금 기준(병력 기준 × 잠정 배), <b>애프터</b>는 실측값입니다. 실측이 크면 그 칸의 생산 점수가 오르고, 작으면 내립니다.
          </p>
          <div className="scr-spendbase-form">
            <input type="date" className="scr-input scr-input-sm" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="시작일" />
            <span>~</span>
            <input type="date" className="scr-input scr-input-sm" value={to} onChange={(e) => setTo(e.target.value)} aria-label="종료일" />
            <button type="button" className="scr-rect-btn" onClick={() => { void run(); }} disabled={busy}>{busy ? <Spinner /> : "재기"}</button>
          </div>
          {err && <p className="scr-spendbase-err">{err}</p>}
          {rows && (
            <>
              <table className="scr-spendbase-table">
                <thead>
                  <tr><th>길이(분)</th><th>사람·판</th><th>비포</th><th>애프터</th><th>차이</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const k = r.perMin !== null && r.now > 0 ? r.perMin / r.now : null;
                    return (
                      <tr key={r.bucket}>
                        <td>{r.bucket}</td>
                        <td>{r.plays}</td>
                        <td>{Math.round(r.now).toLocaleString()}</td>
                        <td>{r.perMin === null ? "—" : Math.round(r.perMin).toLocaleString()}</td>
                        <td className={cx(k !== null && (k > 1.05 ? "is-up" : k < 0.95 ? "is-down" : ""))}>
                          {k === null ? "—" : `${k >= 1 ? "+" : ""}${Math.round((k - 1) * 100)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="scr-spendbase-note">모두 {total}사람·판 · 판 수가 적은 칸(20 아래)은 들쭉날쭉하니 이웃 칸과 견줘 보세요. 적용은 이 표를 알려 주시면 기준 상수를 바꿉니다.</p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
