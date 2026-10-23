import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Spinner } from "../../components/common/Feedback";
import { api } from "../../api/client";
import { useLockBodyScroll } from "../../utils/bodyScrollLock";
import { MatchSets, sideOfPeople } from "../league/LeagueMatchSets";
import type { LeagueMatchSet, PlacementPlayer, PlacementRound } from "../../types";

const FLIP: Record<string, LeagueMatchSet["winner"]> = { a: "b", b: "a", draw: "draw" };

/** 대진의 세트를 앞사람(a) 기준으로 — 서버는 회원 pk 작은 쪽을 a 로 둔다. */
export function setsFor(round: PlacementRound, a: string, b: string): LeagueMatchSet[] {
  const pair = round.pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
  if (!pair) return [];
  if (pair.a === a) return pair.sets;
  return pair.sets.map((s) => ({ ...s, winner: s.winner === null ? null : FLIP[s.winner] }));
}

/** 배치고사 한 칸(두 사람) — 세트 추가 · 손으로 결과 · 게임 잇기(리그 경기 결과 창과 같은 세트 줄 · MatchSets). */
export default function PlacementPairModal({
  round, a, b, canEdit, onSaved, onClose,
}: {
  round: PlacementRound; a: PlacementPlayer; b: PlacementPlayer; canEdit: boolean;
  onSaved: (r: PlacementRound) => void; onClose: () => void;
}) {
  useLockBodyScroll();
  const initial = useMemo(() => setsFor(round, a.memberId, b.memberId), [round, a.memberId, b.memberId]);
  const [sets, setSets] = useState<LeagueMatchSet[]>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const sideA = useMemo(() => sideOfPeople([{ id: a.memberId, nick: a.nickname }]), [a]);
  const sideB = useMemo(() => sideOfPeople([{ id: b.memberId, nick: b.nickname }]), [b]);
  const keyOf = (list: LeagueMatchSet[]): string => JSON.stringify(list.map((x) => [x.gameResultId, x.winner, (x.memo ?? "").trim()]));
  const won = sets.filter((s) => s.winner === "a").length;
  const lost = sets.filter((s) => s.winner === "b").length;
  const decided = sets.some((s) => s.winner !== null);

  const save = async (): Promise<void> => {
    if (keyOf(sets) === keyOf(initial)) { onClose(); return; }
    setErr("");
    setBusy(true);
    try {
      onSaved(await api.setPlacementSets(round.id, a.memberId, b.memberId, sets));
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="scr-modal-overlay">
      <div className="scr-modal scr-league-match-modal">
        <div className="scr-modal-head">
          <span>{round.name}</span>
          <button type="button" className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>
        <div className="scr-modal-body scr-league-match-body">
          <div className="scr-league-match-vs">
            <span>{a.nickname}</span>
            <span className="scr-league-match-vs-sep">vs</span>
            <span>{b.nickname}</span>
          </div>
          <MatchSets
            sideA={sideA} sideB={sideB} who="두 사람이" sets={sets} onChange={setSets}
            nameA={a.nickname} nameB={b.nickname} disabled={busy || !canEdit} onOpenGame={onClose}
          />
          <p className="scr-league-match-note">
            결과 {decided ? `${won} : ${lost}` : "—"}
            {!canEdit && <span className="scr-label-optional"> (두 선수나 운영자만 고칠 수 있어요)</span>}
          </p>
          {err && <div className="scr-err" role="alert">{err}</div>}
        </div>
        <div className="scr-form-actions">
          <button type="button" className="scr-rect-btn is-secondary" onClick={onClose} disabled={busy}>{canEdit ? "취소" : "닫기"}</button>
          {canEdit && (
            <button type="button" className="scr-rect-btn" onClick={() => { void save(); }} disabled={busy}>
              {busy && <Spinner size={14} />} 저장
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
