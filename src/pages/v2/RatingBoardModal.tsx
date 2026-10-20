import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import ModalHash from "../../utils/modalHash";
import Avatar from "../../components/common/Avatar";
import { Spinner } from "../../components/common/Feedback";
import { LADDER_GAME_TYPES } from "../../constants/gameTypes";
import { api } from "../../api/client";
import { rankOf } from "./rankOrder";
import { useLockBodyScroll } from "../../utils/bodyScrollLock";
import type { GameType, Member, MemberStats } from "../../types";

/* ★ 레이팅(2026-10-20, 요청: "래더에 역대퀸 레이팅 버튼도 추가하고 월별 어닝이 아닌 실제 레이팅 순위와 점수 전적 노출") —
   래더 표는 달마다 **번 점수**(ratingScope period)지만, 여기는 **처음부터 쌓인 레이팅**(ratingScope total · 기간 없음) 그대로의 순위 ·
   점수(기준 1000) · 전적(전 기간 일대일). 배치(판이 적어 아직 흔들리는) 중이면 곁에 작게 "배치". */

const LADDER_TYPE: GameType = LADDER_GAME_TYPES[0];
const MEDALS = ["🥇", "🥈", "🥉"];

interface Row { member: Member; rank: number; score: number; overall: MemberStats; provisional: boolean }

export default function RatingBoardModal({ poolIds, members, onClose }: {
  poolIds: string[];
  members: Member[];
  onClose: () => void;
}) {
  useLockBodyScroll();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (poolIds.length === 0) { setRows([]); return; }
    let cancelled = false;
    const byId = new Map(members.map((m) => [m.id, m]));
    api.getGameResultStats({ memberIds: poolIds, matchType: LADDER_TYPE, race: "all", ratingScope: "total" })
      .then((res) => {
        if (cancelled) return;
        const stats: Record<string, (typeof res.members)[number]> = {};
        res.members.forEach((e) => { stats[e.memberId] = e; });
        const list = [...rankOf(stats, poolIds)]
          .map(([id, rank]) => {
            const e = stats[id];
            const member = byId.get(id);
            if (!member || e.rankScore == null || e.overall.plays === 0) return null;
            return { member, rank, score: Math.round(e.rankScore), overall: e.overall, provisional: !!e.provisional };
          })
          .filter((r): r is Row => r !== null)
          .sort((a, b) => a.rank - b.rank || a.member.nickname.localeCompare(b.member.nickname));
        setRows(list);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "레이팅을 불러오지 못했어요.");
        setRows([]);
      });
    return () => { cancelled = true; };
  }, [poolIds, members]);

  const record = (s: MemberStats): string =>
    `${s.plays}전 ${s.wins}승 ${s.losses}패${s.draws > 0 ? ` ${s.draws}무` : ""} · ${s.winRate}%`;

  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash="rating" onClose={onClose} />
      <div className="scr-modal scr-modal-sm scr-queen-modal scr-rating-modal" onClick={(e) => e.stopPropagation()}>
        <div className="scr-modal-head">
          <span>레이팅</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>
        <div className="scr-modal-body">
          <p className="scr-rating-note">처음부터 쌓인 일대일 레이팅(기준 1000) 순위예요. 래더 표의 점수는 그 달에 번 점수예요.</p>
          {error && <div className="scr-err">{error}</div>}
          {rows === null ? (
            <div className="scr-queen-empty"><Spinner /> 불러오는 중…</div>
          ) : rows.length === 0 ? (
            error ? null : <div className="scr-queen-empty">아직 기록이 없어요</div>
          ) : rows.map((r) => (
            <div className="scr-rating-row" key={r.member.id}>
              <span className="scr-rating-rank">
                {r.rank <= MEDALS.length ? <span className="scr-rating-medal">{MEDALS[r.rank - 1]}</span> : r.rank}
              </span>
              <Avatar member={r.member} size={36} className="scr-queen-avatar-img" />
              <span className="scr-rating-who">
                <span className="scr-rating-name">
                  {r.member.nickname}
                  {r.provisional && <span className="scr-rating-prov" title="판이 적어 아직 점수가 크게 흔들려요">배치</span>}
                </span>
                <span className="scr-rating-rec">{record(r.overall)}</span>
              </span>
              <span className="scr-rating-score">{r.score.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
