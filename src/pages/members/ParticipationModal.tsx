import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import ModalHash from "../../utils/modalHash";
import { Spinner } from "../../components/common/Feedback";
import Select from "../../components/common/Select";
import { api, type ParticipationOut, type ParticipationRow } from "../../api/client";
import { useLockBodyScroll } from "../../utils/bodyScrollLock";
import { cx } from "../../utils/format";

/* ★ 참여현황(2026-11-20, 요청: "회원관리 맨 위에 버튼으로 참여현황 보기 메뉴 추가 · 누르면 모달창에 달별로 내전(리그 포함), 공방, 내전공방합 참여 일수와 게임수 ·
   참여일 아래에 내전 공방 합계 · 참여게임수 아래에도 내전 공방 합계 · 정렬은 각 컬럼별로 오름차순 내림차순 가능(헤더 클릭) ·
   기간을 24시간 진짜 일 단위로 끊거나 정오~다음날 정오로 끊는 라디오 버튼" · "마감 안 한 달 조회 시 그때 기준으로 테이블 데이터 업데이트") —
   서버(sg-api participation.py)가 마감 안 한 몫은 조회할 때 지금 판으로 다시 적고 · 마감한 달은 마감 때 굳힌 기록(지워진 공방 포함)으로 센다.
   합계 일수 = 내전이든 공방이든 하나라도 뛴 날(두 갈래를 더한 값이 아니다). 머리를 누르면 그 칸으로 줄 세움 · 한 번 더 누르면 거꾸로. */

type SortKey = "nickname" | "clanDays" | "pubDays" | "days" | "clanGames" | "pubGames" | "games";
const NUM_COLS: { key: Exclude<SortKey, "nickname">; label: string }[] = [
  { key: "clanDays", label: "내전" }, { key: "pubDays", label: "공방" }, { key: "days", label: "합계" },
  { key: "clanGames", label: "내전" }, { key: "pubGames", label: "공방" }, { key: "games", label: "합계" },
];
const BOUNDARY_KEY = "members.participation.boundary";

const monthLabel = (m: string): string => `${Number(m.slice(0, 4))}년 ${Number(m.slice(5, 7))}월`;

export default function ParticipationModal({ onClose }: { onClose: () => void }) {
  useLockBodyScroll();
  const [month, setMonth] = useState<string | null>(null);
  const [boundary, setBoundaryRaw] = useState<"midnight" | "noon">(() => {
    try { return localStorage.getItem(BOUNDARY_KEY) === "noon" ? "noon" : "midnight"; } catch { return "midnight"; }
  });
  const setBoundary = (b: "midnight" | "noon"): void => {
    setBoundaryRaw(b);
    try { localStorage.setItem(BOUNDARY_KEY, b); } catch { /* 기억 못 해도 이번 창은 된다 */ }
  };
  const [data, setData] = useState<ParticipationOut | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "days", desc: true });
  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    api.getParticipation(month, boundary)
      .then((r) => { if (live) { setData(r); if (!month) setMonth(r.month); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "참여현황을 불러오지 못했어요."); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [month, boundary]);

  const rows = useMemo(() => {
    const list = [...(data?.rows ?? [])];
    const k = sort.key;
    const dir = sort.desc ? -1 : 1;
    list.sort((a: ParticipationRow, b: ParticipationRow) => {
      const c = k === "nickname" ? a.nickname.localeCompare(b.nickname, "ko") : (a[k] as number) - (b[k] as number);
      return c !== 0 ? c * dir : a.nickname.localeCompare(b.nickname, "ko");
    });
    return list;
  }, [data, sort]);
  const clickSort = (key: SortKey): void => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "nickname" }));
  const arrow = (key: SortKey): string => (sort.key === key ? (sort.desc ? " ▼" : " ▲") : "");
  const months = data?.months ?? [];
  const mi = month ? months.indexOf(month) : -1;

  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash="participation" onClose={onClose} />
      <div className="scr-modal scr-part-modal" onClick={(e) => e.stopPropagation()}>
        <div className="scr-modal-head">
          <span>참여현황</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>
        <div className="scr-modal-body">
          <div className="scr-part-ctl">
            <div className="scr-stats-month scr-part-month">
              <button type="button" className="scr-month-cal-nav" aria-label="이전 달" disabled={mi < 0 || mi >= months.length - 1}
                onClick={() => setMonth(months[mi + 1])}>
                <ChevronLeft size={15} aria-hidden />
              </button>
              <Select value={month ?? ""} options={months.map((m) => ({ value: m, label: monthLabel(m) }))} onChange={setMonth} size="sm"
                placeholder={month ? monthLabel(month) : "달"} className="scr-part-month-select" />
              <button type="button" className="scr-month-cal-nav" aria-label="다음 달" disabled={mi <= 0}
                onClick={() => setMonth(months[mi - 1])}>
                <ChevronRight size={15} aria-hidden />
              </button>
            </div>
            <div className="scr-part-bound" role="radiogroup" aria-label="하루 나누기">
              <label className="scr-checkbox-field">
                <input type="radio" name="scr-part-bound" checked={boundary === "midnight"} onChange={() => setBoundary("midnight")} />
                <span>자정~자정(24시간)</span>
              </label>
              <label className="scr-checkbox-field">
                <input type="radio" name="scr-part-bound" checked={boundary === "noon"} onChange={() => setBoundary("noon")} />
                <span>정오~다음날 정오</span>
              </label>
            </div>
            {data && (
              <p className="scr-part-note">
                {data.closed ? "마감한 달 — 마감 때 적어 둔 기록(지워진 공방 포함)" : "마감 전 — 지금 게임 목록 기준으로 방금 다시 셌어요"} · 내전은 리그 포함 · 관전 제외
              </p>
            )}
          </div>
          {error && <div className="scr-err">{error}</div>}
          <div className={cx("scr-part-table-wrap", busy && "is-busy")}>
            {!data && busy ? (
              <div className="scr-queen-empty"><Spinner /> 불러오는 중…</div>
            ) : (
              <table className="scr-part-table">
                <thead>
                  <tr>
                    <th rowSpan={2} className="scr-part-name">
                      <button type="button" onClick={() => clickSort("nickname")}>회원{arrow("nickname")}</button>
                    </th>
                    <th colSpan={3} className="scr-part-group">참여일</th>
                    <th colSpan={3} className="scr-part-group">참여 게임수</th>
                  </tr>
                  <tr>
                    {NUM_COLS.map((c) => (
                      <th key={c.key} className={cx(c.label === "합계" && "is-sum", sort.key === c.key && "is-on")}
                        aria-sort={sort.key === c.key ? (sort.desc ? "descending" : "ascending") : "none"}>
                        <button type="button" onClick={() => clickSort(c.key)}>{c.label}{arrow(c.key)}</button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={7} className="scr-part-empty">기록이 없어요</td></tr>
                  ) : rows.map((r) => (
                    <tr key={r.memberId} className={cx(r.days === 0 && "is-zero")}>
                      <td className="scr-part-name">{r.nickname}{r.status === "withdrawn" && <small> 탈퇴</small>}{r.status === "suspended" && <small> 정지</small>}</td>
                      {NUM_COLS.map((c) => <td key={c.key} className={cx(c.label === "합계" && "is-sum")}>{r[c.key]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
