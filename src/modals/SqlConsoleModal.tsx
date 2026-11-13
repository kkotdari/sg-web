import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Copy, Play } from "lucide-react";
import ModalHash from "../utils/modalHash";
import ConfirmDialog from "../components/common/ConfirmDialog";
import { api, type SqlConsoleResult } from "../api/client";
import { showToast } from "../components/common/Toast";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import { useIsMobile } from "../hooks/useIsMobile";
import { cx } from "../utils/format";

/* ★ DB SQL 콘솔(2026-11-13, 요청: "제어판 맨 아래 콘솔 메뉴 · 버튼 누르면 db sql 콘솔이 열리고(피시는 팝업창 · 폰은 전체 모달) · sql 입력과 결과 로우 md 표로 노출") —
   sg-api POST /api/admin/sql(관리자만 · 기본 읽기 전용 · '쓰기 허용'을 켜야 고친 것이 남는다 · 줄 500 까지 · 15초). Ctrl/⌘ + Enter 로 실행. */

/* ★ 줄임말(2026-11-13, 요청: "sql 콘솔창에 acclog 엔터시 아래 쿼리 수행") — 입력이 줄임말 하나뿐일 때 Enter 를 누르면 그 쿼리로 펼쳐 바로 실행한다
   (펼친 쿼리가 입력 칸에 남아 고쳐 다시 돌릴 수 있다 · 읽기 쿼리라 '쓰기 허용'과 상관없이 읽기로). 그 밖의 글에서 Enter 는 줄 바꿈 그대로(실행은 Ctrl/⌘ + Enter). */
const SQL_ALIASES: Record<string, string> = {
  acclog: [
    "SELECT",
    "\tTO_CHAR(a.logged_in_at, 'HH24:MI:SS') AS WHEN",
    "\t, b.nickname",
    "\t, a.screen_code",
    "\t, a.detail",
    "\t, a.client_kind",
    "FROM access_history a",
    "LEFT JOIN members b ON a.member_pk = b.pk",
    "ORDER BY a.id DESC",
    "LIMIT 50;",
  ].join("\n"),
};

const cellMd = (v: unknown): string => {
  if (v === null || v === undefined) return "NULL";
  const s = typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
};

const cellText = (v: unknown): string => (v === null || v === undefined ? "NULL" : typeof v === "object" ? JSON.stringify(v) : String(v));

export function toMdTable(r: SqlConsoleResult): string {
  if (!r.columns.length) return `(${r.rowCount}줄 바뀜)`;
  const head = `| ${r.columns.map(cellMd).join(" | ")} |`;
  const sep = `| ${r.columns.map(() => "---").join(" | ")} |`;
  const body = r.rows.map((row) => `| ${row.map(cellMd).join(" | ")} |`);
  return [head, sep, ...body].join("\n");
}

export default function SqlConsoleModal({ onClose }: { onClose: () => void }) {
  useLockBodyScroll();
  const mobile = useIsMobile();
  const [sql, setSql] = useState("");
  const [write, setWrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<SqlConsoleResult | null>(null);
  const [askWrite, setAskWrite] = useState(false);

  const exec = async (text: string, w: boolean) => {
    if (busy || !text.trim()) return;
    setBusy(true); setErr(null);
    try {
      setRes(await api.adminSql(text, w));
    } catch (e) {
      setRes(null); setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const run = () => { if (write) setAskWrite(true); else void exec(sql, false); };
  const md = res ? toMdTable(res) : "";

  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash="sql-console" onClose={onClose} />
      <div className={cx("scr-modal scr-sqlc-modal", mobile && "is-full")}>
        <div className="scr-modal-head">
          <span>SQL 콘솔</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>
        <div className="scr-modal-body scr-sqlc-body">
          <textarea
            className="scr-sqlc-input" value={sql} spellCheck={false} autoCapitalize="off" autoCorrect="off"
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              if (e.ctrlKey || e.metaKey) { e.preventDefault(); run(); return; }
              const alias = !e.shiftKey && !e.altKey ? SQL_ALIASES[sql.trim().toLowerCase()] : undefined;   // 위 ★ 줄임말
              if (alias) { e.preventDefault(); setSql(alias); void exec(alias, false); }
            }}
            placeholder="SELECT …"
          />
          <div className="scr-sqlc-bar">
            <label className="scr-sqlc-write">
              <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} /> 쓰기 허용
            </label>
            <span className="scr-sqlc-meta">
              {res && `${res.rowCount}줄${res.truncated ? "(500줄까지)" : ""} · ${res.ms}ms${res.wrote ? " · 반영됨" : ""}`}
            </span>
            {res && res.columns.length > 0 && (
              <button type="button" className="scr-icon-btn" aria-label="표 복사" title="md 표 복사"
                onClick={() => { void navigator.clipboard?.writeText(md).then(() => showToast("복사했어요")); }}>
                <Copy size={14} />
              </button>
            )}
            <button type="button" className="scr-rect-btn" onClick={run} disabled={busy || !sql.trim()}>
              <Play size={13} /> {busy ? "실행 중…" : "실행"}
            </button>
          </div>
          {err && <div className="scr-err" role="alert">{err}</div>}
          {res && (res.columns.length === 0
            ? <p className="scr-sqlc-meta">{md}</p>
            : (
              /* md 표를 보통 md 뷰어 모양으로 그린다(2026-11-13, 요청: "md 형식이 표준 md 뷰잉 양식으로 변환되어") — 복사 단추는 md 글 그대로. */
              /* ★ 한 번에 한 방향만(2026-11-13, 요청: "sql 결과창 드래그 세로 가로 동시에 안되게 · 바운스도 안되게") — 바깥 겹은 가로만 · 안 겹은 세로만 민다:
                 손가락이 처음 민 쪽의 겹이 그 끌기를 맡아 대각선으로 함께 밀리지 않는다(관성은 그대로) · 두 겹 다 튕김 없음(overscroll-behavior none) · 머리 붙박이는 안 겹 기준. */
              <div className="scr-sqlc-out">
                <div className="scr-sqlc-out-v">
                <table className="scr-sqlc-table">
                  <thead><tr>{res.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
                  <tbody>
                    {res.rows.map((row, ri) => (
                      <tr key={ri}>{row.map((v, ci) => <td key={ci} className={cx(v === null && "is-null")}>{cellText(v)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            ))}
        </div>
      </div>
      {askWrite && (
        <ConfirmDialog
          title="쓰기로 실행할까요?"
          message="DB 를 바로 고칩니다 — 되돌릴 수 없어요."
          confirmLabel="실행"
          onConfirm={() => { setAskWrite(false); void exec(sql, true); }}
          onCancel={() => setAskWrite(false)}
        />
      )}
    </div>,
    document.body,
  );
}
