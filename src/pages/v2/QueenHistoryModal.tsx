import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import ModalHash from "../../utils/modalHash";
import Avatar from "../../components/common/Avatar";
import { Spinner } from "../../components/common/Feedback";
import { LADDER_GAME_TYPES } from "../../constants/gameTypes";
import { api } from "../../api/client";
import { rankOf } from "./rankOrder";
import { useLockBodyScroll } from "../../utils/bodyScrollLock";
import { currentMonthValue, monthInputToRange, shiftMonthValue } from "../../utils/date";
import type { GameType, Member, MemberStats } from "../../types";

/* ★ 역대 퀸(2026-10-20, 요청: "래더에 상성보기 왼쪽에 역대 퀸 버튼 추가하고 누르면 각 월별 1위 리스트 · 맨 위가 오래된 순 ·
   2026년 / 7월 퀸 마크 전적 / 8월 퀸 기수 전적 · 한 줄 한 줄 꽤 크게 아바타랑 닉네임 · 전적은 좀 작게").
   달마다 래더 표와 같은 셈(같은 회원 풀 · 같은 유형 · ratingScope period · rankOf)으로 1위를 뽑는다 — 공동 1위면 다 선다.
   첫 경기 달부터 이번 달까지 — 이번 달은 아직 바뀔 수 있어 이름 곁에 "진행 중" 배지(2026-10-20 요청: "아직 진행중인 달은 지금 이사람이고 바뀔 수 있음을 알리는 배지"). */

const LADDER_TYPE: GameType = LADDER_GAME_TYPES[0];

interface QueenMonth {
  month: string;
  queens: { member: Member; overall: MemberStats }[];
}

const recordText = (s: MemberStats): string =>
  `${s.plays}전 ${s.wins}승 ${s.losses}패${s.draws > 0 ? ` ${s.draws}무` : ""}`;

export default function QueenHistoryModal({ poolIds, members, firstMonth, onClose }: {
  poolIds: string[];
  members: Member[];
  firstMonth: string | null;
  onClose: () => void;
}) {
  useLockBodyScroll();
  const months = useMemo(() => {
    const out: string[] = [];
    if (!firstMonth) return out;
    const now = currentMonthValue();
    for (let m = firstMonth; m <= now; m = shiftMonthValue(m, 1)) out.push(m);
    return out;
  }, [firstMonth]);
  const [rows, setRows] = useState<QueenMonth[] | null>(null);
  const nowMonth = currentMonthValue();
  const [error, setError] = useState("");

  useEffect(() => {
    if (poolIds.length === 0 || months.length === 0) { setRows([]); return; }
    let cancelled = false;
    const byId = new Map(members.map((m) => [m.id, m]));
    Promise.all(months.map(async (month): Promise<QueenMonth> => {
      const { from, to } = monthInputToRange(month);
      const res = await api.getGameResultStats({
        memberIds: poolIds, dateFrom: from, dateTo: to,
        matchType: LADDER_TYPE, race: "all", ratingScope: "period",
      });
      const stats: Record<string, (typeof res.members)[number]> = {};
      res.members.forEach((e) => { stats[e.memberId] = e; });
      const queens = [...rankOf(stats, poolIds)]
        .filter(([, r]) => r === 1)
        .map(([id]) => ({ member: byId.get(id), overall: stats[id].overall }))
        .filter((q): q is QueenMonth["queens"][number] => !!q.member)
        .sort((a, b) => a.member.nickname.localeCompare(b.member.nickname));
      return { month, queens };
    })).then((list) => {
      if (!cancelled) setRows(list.filter((r) => r.queens.length > 0));
    }).catch((e) => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : "역대 퀸을 불러오지 못했어요.");
      setRows([]);
    });
    return () => { cancelled = true; };
  }, [months, poolIds, members]);

  /* 해마다 묶는다 — 머리에 "2026년". */
  const years = useMemo(() => {
    const out: { year: string; items: QueenMonth[] }[] = [];
    for (const r of rows ?? []) {
      const y = r.month.slice(0, 4);
      if (out.length === 0 || out[out.length - 1].year !== y) out.push({ year: y, items: [] });
      out[out.length - 1].items.push(r);
    }
    return out;
  }, [rows]);

  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash="queens" onClose={onClose} />
      <div className="scr-modal scr-modal-sm scr-queen-modal" onClick={(e) => e.stopPropagation()}>
        <div className="scr-modal-head">
          <span>역대 퀸</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>
        <div className="scr-modal-body">
          {error && <div className="scr-err">{error}</div>}
          {rows === null ? (
            <div className="scr-queen-empty"><Spinner /> 불러오는 중…</div>
          ) : years.length === 0 ? (
            error ? null : <div className="scr-queen-empty">아직 기록이 없어요</div>
          ) : years.map((y) => (
            <div className="scr-queen-year" key={y.year}>
              <div className="scr-queen-year-head">{y.year}년</div>
              {y.items.map((r) => r.queens.map((q, i) => (
                <div className="scr-queen-row" key={`${r.month}-${q.member.id}`}>
                  <span className="scr-queen-month">{i === 0 ? `${Number(r.month.slice(5, 7))}월` : ""}</span>
                  {/* 왕관은 아바타 **위 가운데**에 살짝 겹쳐 얹는다 · 아바타는 동그랗게(2026-10-20 요청). */}
                  <span className="scr-queen-avatar">
                    <Avatar member={q.member} size={44} className="scr-queen-avatar-img" />
                    <span className="scr-queen-crown" aria-label="퀸">👑</span>
                  </span>
                  <span className="scr-queen-name">
                    <span className="scr-queen-name-text">{q.member.nickname}</span>
                    {r.month === nowMonth && <span className="scr-queen-live" title="이번 달은 아직 끝나지 않아 바뀔 수 있어요">진행 중</span>}
                  </span>
                  <span className="scr-queen-record">{recordText(q.overall)}</span>
                </div>
              )))}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
