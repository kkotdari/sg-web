import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Users, X } from "lucide-react";
import { LoadingMark, Spinner } from "../../components/common/Feedback";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import Select from "../../components/common/Select";
import { useAppStore } from "../../store/appStore";
import { isAdminRole } from "../../constants/roles";
import { api } from "../../api/client";
import { cx } from "../../utils/format";
import { navigateTo, parseRoute, pathOf } from "../../utils/route";
import PlacementPairModal, { setsFor } from "./PlacementPairModal";
import type { PlacementPlayer, PlacementRound, PlacementRoundBrief } from "../../types";

/* ★ 배치고사(2026-10-23, 요청: "배치고사 화면 제작 — 메뉴는 레일/서랍 · 회원 전원이 서로 라운드 로빈 · 각 칸에 세트 추가 및 결과 수기 입력 또는 경기 연결(리그 매치 결과 입력과 비슷) ·
   가장 중요한 건 티어표가 위에 — 1~4 티어 · 순위로 1/4 하는 게 아니라 진짜 실력 군집으로(상위 · 중상 · 중하 · 하)" · "1차 2차 될 수 있다는 것도").
   위 = 회차 탭(1차 · 2차 …) · 티어표(서버가 점수 · 티어를 낸다 — 세트 승패로 맞춘 브래들리-테리 점수를 자연 경계로 묶는다) · 아래 = 라운드 로빈 표(칸을 누르면 그 대진 창). */

const TIER_NAME = ["상위", "중상", "중하", "하"];

function idOfRoute(): number | null {
  const raw = parseRoute().item;
  const n = raw === null ? NaN : Number(raw);
  return Number.isInteger(n) ? n : null;
}

const recordOf = (p: PlacementPlayer): string => `${p.won}승 ${p.lost}패${p.drawn ? ` ${p.drawn}무` : ""}`;

function TierBoard({ round }: { round: PlacementRound }) {
  const placed = round.players.filter((p) => p.tier !== null);
  const waiting = round.players.filter((p) => p.tier === null);
  return (
    <section className="scr-pl-tiers" aria-label="티어표">
      <h2 className="scr-pl-h2">티어표</h2>
      <p className="scr-pl-note">
        세트 {round.placedMin}개 이상 친 사람을 점수가 몰린 묶음으로 나눠요 — 사람 수를 넷으로 자르지 않아 틈이 벌어진 곳에서 갈려요.
      </p>
      <div className="scr-pl-tier-grid">
        {Array.from({ length: round.tierCount }, (_, i) => i + 1).map((t) => {
          const ps = placed.filter((p) => p.tier === t);
          return (
            <div key={t} className={cx("scr-pl-tier", `is-t${t}`)}>
              <div className="scr-pl-tier-head">
                <b>{t}티어</b><span>{TIER_NAME[t - 1] ?? ""}</span><span className="scr-pl-tier-n">{ps.length}명</span>
              </div>
              {ps.length === 0 ? <div className="scr-pl-tier-empty">—</div> : (
                <ol className="scr-pl-tier-list">
                  {ps.map((p) => (
                    <li key={p.memberId}>
                      <span className="scr-pl-nick">{p.nickname}</span>
                      <span className="scr-pl-rating">{p.rating}</span>
                      <span className="scr-pl-rec">{recordOf(p)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
      {waiting.length > 0 && (
        <div className="scr-pl-waiting">
          <span className="scr-pl-waiting-label">미배치 {waiting.length}명</span>
          {waiting.map((p) => (
            <span key={p.memberId} className="scr-pl-chip">{p.nickname}<small>{p.won + p.lost + p.drawn}세트</small></span>
          ))}
        </div>
      )}
    </section>
  );
}

/** 라운드 로빈 표 — 줄 사람 기준 세트 수(이김:짐) · 칸을 누르면 그 대진 창. 줄·칸은 닉네임 차례(점수 차례는 저장할 때마다 바뀌어 칸을 찾기 어렵다). */
function RoundRobin({ round, onPick }: { round: PlacementRound; onPick: (a: PlacementPlayer, b: PlacementPlayer) => void }) {
  const people = useMemo(() => [...round.players].sort((p, q) => p.nickname.localeCompare(q.nickname, "ko")), [round.players]);
  const total = (people.length * (people.length - 1)) / 2;
  const done = round.pairs.filter((p) => p.sets.some((s) => s.winner !== null)).length;
  return (
    <section className="scr-pl-rr" aria-label="대진표">
      <div className="scr-pl-rr-head">
        <h2 className="scr-pl-h2">대진표</h2>
        <span className="scr-pl-note">{done} / {total} 대진</span>
      </div>
      <div className="scr-pl-rr-scroll">
        <table className="scr-pl-table">
          <thead>
            <tr>
              <th className="scr-pl-corner" />
              {people.map((p) => <th key={p.memberId} scope="col"><span>{p.nickname}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {people.map((row) => (
              <tr key={row.memberId}>
                <th scope="row">
                  <span className="scr-pl-row-name">{row.nickname}</span>
                  {row.tier !== null && <span className={cx("scr-pl-tier-badge", `is-t${row.tier}`)}>{row.tier}</span>}
                </th>
                {people.map((col) => {
                  if (col.memberId === row.memberId) return <td key={col.memberId} className="scr-pl-self" aria-hidden />;
                  const sets = setsFor(round, row.memberId, col.memberId);
                  const w = sets.filter((s) => s.winner === "a").length;
                  const l = sets.filter((s) => s.winner === "b").length;
                  const any = sets.some((s) => s.winner !== null);
                  return (
                    <td key={col.memberId} className={cx(any && (w > l ? "is-win" : w < l ? "is-loss" : "is-draw"))}>
                      <button
                        type="button" className="scr-pl-cell" onClick={() => onPick(row, col)}
                        aria-label={`${row.nickname} 대 ${col.nickname}${any ? ` ${w}:${l}` : ""}`}
                      >
                        {any ? `${w}:${l}` : sets.length > 0 ? "·" : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** 운영자 — 참가자 넣고 빼기(열 때는 활동 회원 전원). 뺀 사람의 세트는 남아 있다가 다시 넣으면 돌아온다. */
function PlayersEdit({ round, onSaved }: { round: PlacementRound; onSaved: (r: PlacementRound) => void }) {
  const members = useAppStore((s) => s.members);
  const [busy, setBusy] = useState(false);
  const inRound = new Set(round.players.map((p) => p.memberId));
  const options = members
    .filter((m) => m.status === "active" && !inRound.has(m.id))
    .map((m) => ({ value: m.id, label: m.nickname }));
  const run = async (job: () => Promise<PlacementRound>): Promise<void> => {
    setBusy(true);
    try { onSaved(await job()); } catch { /* 다시 받은 판이 없으면 그대로 둔다 */ } finally { setBusy(false); }
  };
  return (
    <div className="scr-pl-players">
      {round.players.map((p) => (
        <span key={p.memberId} className="scr-pl-chip">
          {p.nickname}
          <button
            type="button" className="scr-icon-btn" disabled={busy} aria-label={`${p.nickname} 빼기`}
            onClick={() => { void run(() => api.removePlacementPlayer(round.id, p.memberId)); }}
          >
            <X size={12} />
          </button>
        </span>
      ))}
      {options.length > 0 && (
        <Select
          value="" size="sm" placeholder="참가자 넣기" options={options} disabled={busy}
          onChange={(v) => { void run(() => api.addPlacementPlayer(round.id, v)); }}
        />
      )}
    </div>
  );
}

export default function PlacementScreen() {
  const user = useAppStore((s) => s.user);
  const isAdmin = isAdminRole(user?.roles ?? []);
  const [rounds, setRounds] = useState<PlacementRoundBrief[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(() => idOfRoute());
  const [round, setRound] = useState<PlacementRound | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pick, setPick] = useState<{ a: PlacementPlayer; b: PlacementPlayer } | null>(null);
  const [editPlayers, setEditPlayers] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onPop = () => setSelectedId(idOfRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    api.getPlacementRounds()
      .then(setRounds)
      .catch((e) => { setRounds([]); setError(e instanceof Error ? e.message : "배치고사를 불러오지 못했어요."); });
  }, []);
  // 주소에 회차가 없으면 가장 최근 회차.
  const shownId = selectedId ?? rounds?.[0]?.id ?? null;
  useEffect(() => {
    if (shownId === null) { setRound(null); return undefined; }
    let alive = true;
    setLoading(true);
    setError("");
    api.getPlacementRound(shownId)
      .then((r) => { if (alive) setRound(r); })
      .catch((e) => { if (alive) { setRound(null); setError(e instanceof Error ? e.message : "배치고사를 불러오지 못했어요."); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [shownId]);

  const open = (id: number): void => {
    navigateTo(pathOf({ screen: "placement", item: String(id) }), { replace: true, notify: false });
    setSelectedId(id);
    setEditPlayers(false);
  };
  const saved = (r: PlacementRound): void => {
    setRound(r);
    setRounds((list) => (list ?? []).map((x) => (x.id === r.id ? { ...x, name: r.name, players: r.players.length } : x)));
  };
  const create = async (): Promise<void> => {
    setCreating(true);
    setError("");
    try {
      const r = await api.createPlacementRound(`${(rounds?.length ?? 0) + 1}차 배치고사`);
      setRounds((list) => [{ id: r.id, name: r.name, createdAt: r.createdAt, players: r.players.length }, ...(list ?? [])]);
      setRound(r);
      open(r.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "만들지 못했어요.");
    } finally {
      setCreating(false);
    }
  };
  const remove = async (): Promise<void> => {
    if (!round) return;
    setConfirmDelete(false);
    try {
      await api.deletePlacementRound(round.id);
      const rest = (rounds ?? []).filter((x) => x.id !== round.id);
      setRounds(rest);
      setRound(null);
      navigateTo(pathOf({ screen: "placement" }), { replace: true, notify: false });
      setSelectedId(rest[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "지우지 못했어요.");
    }
  };
  const canEditPair = (a: PlacementPlayer, b: PlacementPlayer): boolean =>
    isAdmin || (!!user && (user.id === a.memberId || user.id === b.memberId));

  return (
    <div className="scr-screen scr-placement-screen">
      <div className="scr-v2-toolbar">
        <div className="scr-v2-toolbar-title-row">
          <h1 className="scr-title scr-v2-toolbar-title">배치고사</h1>
        </div>
      </div>

      <div className="scr-pl-bar">
        {rounds && rounds.length > 0 && (
          <div className="scr-activity-game-tabs" role="tablist" aria-label="회차">
            {[...rounds].reverse().map((r) => (
              <button
                key={r.id} type="button" role="tab" aria-selected={r.id === shownId}
                className={cx("scr-activity-game-tab", r.id === shownId && "is-on")}
                onClick={() => open(r.id)}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}
        {isAdmin && (
          <div className="scr-pl-admin">
            {round && (
              <>
                <button type="button" className={cx("scr-compact-rect-btn", !editPlayers && "is-secondary")} onClick={() => setEditPlayers((v) => !v)}>
                  <Users size={13} aria-hidden /> 참가자
                </button>
                <button type="button" className="scr-compact-rect-btn is-secondary" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={13} aria-hidden /> 회차 삭제
                </button>
              </>
            )}
            <button type="button" className="scr-compact-rect-btn" onClick={() => { void create(); }} disabled={creating}>
              {creating ? <Spinner size={12} /> : <Plus size={13} aria-hidden />} 새 회차
            </button>
          </div>
        )}
      </div>

      {error && <div className="scr-err">{error}</div>}
      {isAdmin && editPlayers && round && <PlayersEdit round={round} onSaved={saved} />}

      {rounds === null || (loading && !round) ? <LoadingMark /> : !round ? (
        <div className="scr-empty">{isAdmin ? "아직 배치고사가 없어요. '새 회차'로 여세요." : "아직 배치고사가 없어요."}</div>
      ) : (
        <>
          <TierBoard round={round} />
          <RoundRobin round={round} onPick={(a, b) => setPick({ a, b })} />
        </>
      )}

      {pick && round && (
        <PlacementPairModal
          round={round} a={pick.a} b={pick.b} canEdit={canEditPair(pick.a, pick.b)}
          onSaved={saved} onClose={() => setPick(null)}
        />
      )}
      {confirmDelete && round && (
        <ConfirmDialog
          title={`${round.name}를 지울까요?`}
          message="이 회차의 대진 세트가 모두 사라지고 되돌릴 수 없어요."
          confirmLabel="삭제"
          onConfirm={() => { void remove(); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
