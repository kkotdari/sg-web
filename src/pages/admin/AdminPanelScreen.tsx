import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Spinner } from "../../components/common/Feedback";
import Select from "../../components/common/Select";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { RowCheck, SelectAllToggle } from "../../components/common/Selection";
import { GameRowNames, GameRowStatus, ListRow } from "../activity/GameRow";
import { gamePlayable } from "../../utils/gamePlayable";
import ReplayBatchButton from "../../components/common/ReplayBatchButton";
import VersionManageModal from "../../modals/VersionManageModal";
import ExtShareManageModal from "../../modals/ExtShareManageModal";
import DeletedGamesModal from "../../modals/DeletedGamesModal";
import UnhideRequestsModal from "../../modals/UnhideRequestsModal";
import { api } from "../../api/client";
import { parseReplayFile } from "../../utils/replayParser";
import { createSummaryPool, runLanes } from "../../utils/replaySummaryPool";
import { useAppStore } from "../../store/appStore";
import { showAlert } from "../../components/common/AlertDialog";
import { showToast } from "../../components/common/Toast";
import { useLockBodyScroll } from "../../utils/bodyScrollLock";
import { cx } from "../../utils/format";
import { versionNumber } from "../../utils/appVersion";
import { playCreak } from "../../utils/sfx";
import { fmt, formatAgo, gameNow, todayStr } from "../../utils/date";
import type { GameResult } from "../../types";

/** 제어판의 삭제 관리(삭제된 경기 — 복원·완전 삭제) 줄을 보이나 — 숨김(2026-10-16, 나중에 되살릴 예정 · true 면 되살아난다). */
const SHOW_DELETED_GAMES = true;   // 되살림(2026-10-20, 요청: "삭제게임 목록 기능 다시 보이게")

interface AdminPanelScreenProps {
  isAdmin: boolean;
}

export default function AdminPanelScreen({ isAdmin }: AdminPanelScreenProps) {
  useEffect(() => { playCreak(); }, []);
  const appVersion = useAppStore((s) => s.appVersion);
  const memberOf = useAppStore((s) => s.memberOf);
  const appVersions = useAppStore((s) => s.appVersions);
  const setAppVersion = useAppStore((s) => s.setAppVersion);
  const noticeEnabled = useAppStore((s) => s.noticeEnabled);
  const setNoticeEnabled = useAppStore((s) => s.setNoticeEnabled);

  const [busy, setBusy] = useState(false);
  const [versionManageOpen, setVersionManageOpen] = useState(false);
  const [extShareOpen, setExtShareOpen] = useState(false);
  const [deletedGamesOpen, setDeletedGamesOpen] = useState(false);
  const [unhideOpen, setUnhideOpen] = useState(false);
  /* 기다리는 숨김 해제 요청 수 — 줄 제목 옆에 센다(창을 닫으면 다시 센다). */
  const [unhideCount, setUnhideCount] = useState<number | null>(null);
  useEffect(() => {
    if (unhideOpen) return;
    let alive = true;
    api.listUnhideRequests().then((r) => { if (alive) setUnhideCount(r.length); }).catch(() => {});
    return () => { alive = false; };
  }, [unhideOpen]);
  const [togglingNotice, setTogglingNotice] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [redo, setRedo] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [confirmRedo, setConfirmRedo] = useState(false);

  const downloadReplays = async () => {
    setDownloading(true);
    try {
      const blob = await api.downloadReplayArchive();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "replays.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "리플레이를 다운로드하지 못했어요.");
    } finally {
      setDownloading(false);
    }
  };

  const deleteAllGameResults = async () => {
    const typed = window.prompt(
      '모든 경기기록을 삭제합니다(리그 경기에 연결된 판은 남겨요). 첨부 리플레이까지 지워지고 되돌릴 수 없어요.\n삭제하려면 "삭제"를 입력하세요.',
    );
    if (typed !== "삭제") return;
    setBusy(true);
    try {
      const { deleted } = await api.deleteAllGameResults();
      showToast(`${deleted}건의 경기기록을 삭제했어요.`, { kind: "ok" });
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "삭제하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const [purgeUntil, setPurgeUntil] = useState(() => {
    const d = gameNow();
    d.setDate(d.getDate() - 30);
    return fmt(d);
  });
  const [confirmPurge, setConfirmPurge] = useState<{ count: number; until: string } | null>(null);
  const [purging, setPurging] = useState(false);
  const askPurgeTruth = async () => {
    if (!purgeUntil) { showAlert("어느 날짜까지 지울지 골라 주세요."); return; }
    setPurging(true);
    try {
      const { count } = await api.countExpiredTruth(purgeUntil);
      if (count === 0) { showToast(`${purgeUntil}까지 지울 참값이 없어요.`, { kind: "ok" }); return; }
      setConfirmPurge({ count, until: purgeUntil });
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "세어 보지 못했어요.");
    } finally {
      setPurging(false);
    }
  };
  const purgeTruth = async (until: string) => {
    setConfirmPurge(null);
    setPurging(true);
    try {
      const { deleted } = await api.purgeExpiredTruth(until);
      showToast(`${deleted}판의 참값을 지웠어요.`, { kind: "ok" });
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "지우지 못했어요.");
    } finally {
      setPurging(false);
    }
  };

  const reanalyzeGames = async (only?: number[]) => {
    setRedo({ done: 0, total: 0, failed: 0 });
    let done = 0;
    let failed = 0;
    const pool = createSummaryPool();
    try {
      let ids: number[] = only ?? [];
      if (!only) {
        let cursor: string | undefined;
        do {
          const page = await api.getGameResultsPage({ cursor, limit: 100 });
          page.items.forEach((m) => { if (m.replay) ids.push(m.id); });
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
      }
      ids = [...new Set(ids)];
      setRedo({ done: 0, total: ids.length, failed: 0 });

      const one = async (id: number) => {
        try {
          const blob = await api.downloadReplay(id);
          if (pool) {
            const r = await pool.run(id, `${id}.rep`, await blob.arrayBuffer());
            if (!r.ok) throw new Error(r.error);
            await api.reanalyzeGameResult(id, {
              mapData: r.mapData,
              mapName: r.mapName, gameStartedAt: r.gameStartedAt,
              durationSeconds: r.durationSeconds, chats: r.chats, slots: r.slots,
            });
          } else {
            const parsed = await parseReplayFile(new File([blob], `${id}.rep`));
            await api.reanalyzeGameResult(id, {
              mapData: parsed.mapGrid ?? null,
              mapName: parsed.mapName || null,
              gameStartedAt: parsed.gameStartedAt ?? null,
              durationSeconds: parsed.durationSeconds ?? null,
              chats: parsed.chats,
              slots: parsed.players.map((p) => ({
                rawName: p.rawName, race: p.race,
                apm: p.apm, eapm: p.eapm,
                cmdCount: p.cmdCount, effectiveCmdCount: p.effectiveCmdCount,
                buildCount: p.buildCount,
              })),
            });
          }
        } catch {
          failed += 1;
        }
        done += 1;
        setRedo({ done, total: ids.length, failed });
      };
      await runLanes(ids, (pool?.size ?? 2) * 2, one);

      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      if (failed > 0) {
        showAlert(`경기 ${done - failed}건을 다시 분석했어요. ${failed}건은 리플레이를 읽지 못해 그대로 뒀어요. 참값 자취는 서버가 뒤에서 굽습니다 — 잠시 뒤 재생해 보세요.`);
      } else {
        showToast(`경기 ${done}건을 다시 분석했어요 — 참값 자취는 서버가 뒤에서 굽습니다.`, { kind: "ok" });
      }
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "경기를 다시 분석하지 못했어요.");
    } finally {
      pool?.close();
      setRedo(null);
    }
  };

  type PickRow = { id: number; matchNo: string; date: string; day: string; map: string; who: string; game: GameResult };
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickRows, setPickRows] = useState<PickRow[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [pickQuery, setPickQuery] = useState("");
  const [pickFrom, setPickFrom] = useState("");
  useLockBodyScroll(pickerOpen, () => setPickerOpen(false));

  const openPicker = async () => {
    setPickerOpen(true);
    if (pickRows) return;
    try {
      const rows: PickRow[] = [];
      let cursor: string | undefined;
      do {
        const page = await api.getGameResultsPage({ cursor, limit: 100 });
        for (const m of page.items) {
          if (!m.replay) continue;
          const names = [...m.team1, ...m.team2]
            .map((sl) => sl.rawName || "")
            .filter(Boolean);
          rows.push({
            id: m.id,
            matchNo: m.matchNo,
            date: m.gameStartedAt ? m.gameStartedAt.slice(0, 10) : m.date,
            day: m.date,
            map: m.mapName || "(맵 미상)",
            who: names.join(" · "),
            game: m,
          });
        }
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      setPickRows(rows);
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "경기 목록을 받지 못했어요.");
      setPickRows([]);
    }
  };

  const pickMatches = (r: PickRow, from: string): boolean => {
    if (from && r.day < from) return false;
    const q = pickQuery.trim().toLowerCase();
    if (!q) return true;
    return `${r.matchNo} ${r.date} ${r.map} ${r.who}`.toLowerCase().includes(q);
  };
  const pickFiltered = (pickRows ?? []).filter((r) => pickMatches(r, pickFrom));
  const changePickFrom = (v: string) => {
    setPickFrom(v);
    if (!v) return;
    setPicked(new Set((pickRows ?? []).filter((r) => pickMatches(r, v)).map((r) => r.id)));
  };
  const allShownPicked = pickFiltered.length > 0 && pickFiltered.every((r) => picked.has(r.id));
  const toggleAllShown = () => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (allShownPicked) pickFiltered.forEach((r) => next.delete(r.id));
      else pickFiltered.forEach((r) => next.add(r.id));
      return next;
    });
  };
  const togglePick = (id: number) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const currentNumber = versionNumber(appVersion);

  const [versionPickerOpen, setVersionPickerOpen] = useState(false);
  useLockBodyScroll(versionPickerOpen, () => setVersionPickerOpen(false));
  const [confirmSetVersion, setConfirmSetVersion] = useState<string | null>(null);
  useLockBodyScroll(pickerOpen, () => setPickerOpen(false));
  const [pickValue, setPickValue] = useState("");

  const pickableVersions = appVersions
    .filter((v) => versionNumber(v.number) !== currentNumber)
    .reverse();

  const openVersionPicker = () => {
    setPickValue(pickableVersions[0]?.number ?? "");
    setVersionPickerOpen(true);
  };

  const setVersion = async (number: string) => {
    setBusy(true);
    try {
      await setAppVersion(number);
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "버전 설정에 실패했어요.");
    } finally {
      setBusy(false);
    }
  };

  const toggleNotice = async () => {
    setTogglingNotice(true);
    try {
      await setNoticeEnabled(!noticeEnabled);
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "설정을 바꾸지 못했어요.");
    } finally {
      setTogglingNotice(false);
    }
  };

  return (
    <div className="scr-screen scr-admin-screen">
      <div className="scr-v2-toolbar">
        <h1 className="scr-title scr-v2-toolbar-title">제어판</h1>
      </div>

      <div className="scr-admin-panel-body">

        {!isAdmin && (
          <div className="scr-adm-card">
            <p className="scr-adm-note">관리 기능은 운영자만 사용할 수 있어요.</p>
          </div>
        )}

        {isAdmin && (
          <>
            <section className="scr-adm-card">
              <div className="scr-adm-card-head">
                <h2 className="scr-adm-card-title">버전</h2>
                <span className="scr-adm-card-meta">현재 {currentNumber}</span>
              </div>
              <div className="scr-adm-rows">
                <div className="scr-adm-row">
                  <div className="scr-adm-row-text">
                    <span className="scr-adm-row-title">현재 버전 바꾸기</span>
                    <span className="scr-adm-row-desc">
                      등록된 버전 중 하나를 모두에게 적용합니다. 바꾸면 회원들은 다음 접속 때 안내를 다시 봅니다.
                    </span>
                  </div>
                  <button
                    type="button" className="scr-rect-btn scr-adm-row-btn"
                    onClick={openVersionPicker} disabled={busy}
                  >
                    {busy ? <Spinner /> : "바꾸기"}
                  </button>
                </div>

                <div className="scr-adm-row">
                  <div className="scr-adm-row-text">
                    <span className="scr-adm-row-title">버전 목록</span>
                    <span className="scr-adm-row-desc">버전을 더하거나 지우고, 버전마다의 안내 글을 씁니다.</span>
                  </div>
                  <button
                    type="button" className="scr-rect-btn scr-adm-row-btn"
                    onClick={() => setVersionManageOpen(true)}
                  >
                    열기
                  </button>
                </div>

                <div className="scr-adm-row">
                  <div className="scr-adm-row-text">
                    <span className="scr-adm-row-title">버전 안내 표시</span>
                    <span className="scr-adm-row-desc">
                      {noticeEnabled ? "새 버전으로 처음 들어올 때 안내를 띄웁니다." : "안내를 띄우지 않습니다."}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={noticeEnabled}
                    aria-label="버전 안내 표시"
                    className={cx("scr-notice-switch scr-adm-row-switch", noticeEnabled && "scr-notice-switch-on")}
                    onClick={() => void toggleNotice()}
                    disabled={togglingNotice}
                  >
                    <span className="scr-notice-switch-knob" />
                  </button>
                </div>
              </div>
            </section>

            <ReplayBatchButton />

            <section className="scr-adm-card">
              <div className="scr-adm-card-head">
                <h2 className="scr-adm-card-title">경기 자료</h2>
              </div>
              <div className="scr-adm-rows">
                <div className="scr-adm-row">
                  <div className="scr-adm-row-text">
                    <span className="scr-adm-row-title">경기 재분석</span>
                    <span className="scr-adm-row-desc">
                      고른 경기의 리플레이를 다시 읽어 분석 값을 새로 씁니다. 직접 입력한 값은 그대로예요.
                    </span>
                  </div>
                  <button
                    type="button" className="scr-rect-btn scr-adm-row-btn"
                    onClick={() => { void openPicker(); }} disabled={redo !== null}
                  >
                    {redo ? (
                      <>
                        <Spinner />
                        {redo.total > 0 ? `${redo.done}/${redo.total}` : "목록 받는 중"}
                        {redo.failed > 0 ? ` · 실패 ${redo.failed}` : ""}
                      </>
                    ) : "고르기"}
                  </button>
                </div>

                <div className="scr-adm-row">
                  <div className="scr-adm-row-text">
                    <span className="scr-adm-row-title">리플레이 내려받기</span>
                    <span className="scr-adm-row-desc">등록된 리플레이 전부를 날짜별 폴더로 묶어 zip 하나로 받습니다.</span>
                  </div>
                  <button
                    type="button" className="scr-rect-btn scr-adm-row-btn"
                    onClick={downloadReplays} disabled={downloading}
                  >
                    {downloading ? <Spinner /> : "내려받기"}
                  </button>
                </div>

                <div className="scr-adm-row">
                  <div className="scr-adm-row-text">
                    <span className="scr-adm-row-title">참값 지우기</span>
                    <span className="scr-adm-row-desc">
                      고른 날짜까지(그날 포함) 경기의 재생 자료를 지웁니다. 리플레이와 통계는 그대로고, 그 경기는 로스터로만 보여요. 리그 경기에 연결된 판은 남겨요.
                    </span>
                    <label className="scr-adm-row-field">
                      <span className="scr-adm-row-field-label">이 날짜까지</span>
                      <input
                        type="date" className="scr-input scr-date-compact"
                        value={purgeUntil} max={todayStr()}
                        onChange={(e) => setPurgeUntil(e.target.value)}
                      />
                    </label>
                  </div>
                  <button
                    type="button" className="scr-rect-btn scr-adm-row-btn"
                    onClick={() => { void askPurgeTruth(); }} disabled={purging}
                  >
                    {purging ? <Spinner /> : "지우기"}
                  </button>
                </div>

                {/* 숨김 해제 요청 — 게임 목록의 '해제요청'이 모인다(2026-10-19 · UnhideRequestsModal ★). */}
                <div className="scr-adm-row">
                  <div className="scr-adm-row-text">
                    <span className="scr-adm-row-title">숨김 해제 요청{unhideCount ? ` (${unhideCount})` : ""}</span>
                    <span className="scr-adm-row-desc">
                      회원이 숨긴 경기의 해제를 요청하면 여기에 모여요. 해제하면 경기가 다시 보입니다.
                    </span>
                  </div>
                  <button
                    type="button" className="scr-rect-btn scr-adm-row-btn"
                    onClick={() => setUnhideOpen(true)}
                  >
                    열기
                  </button>
                </div>

                {/* 삭제 관리(삭제된 경기 복원·완전 삭제) — 숨김(2026-10-16 요청: "삭제관리 메뉴 숨김처리 · 나중에 되살릴 예정"). SHOW_DELETED_GAMES 를 true 로 돌리면 되살아난다. */}
                {SHOW_DELETED_GAMES && (
                  <div className="scr-adm-row">
                    <div className="scr-adm-row-text">
                      <span className="scr-adm-row-title">삭제된 경기</span>
                      <span className="scr-adm-row-desc">
                        지운 경기를 복원하거나 완전히 지웁니다. 지운 경기는 등록기가 같은 리플레이를 올려도 다시 등록되지 않아요.
                      </span>
                    </div>
                    <button
                      type="button" className="scr-rect-btn scr-adm-row-btn"
                      onClick={() => setDeletedGamesOpen(true)}
                    >
                      열기
                    </button>
                  </div>
                )}

                <div className="scr-adm-row">
                  <div className="scr-adm-row-text">
                    <span className="scr-adm-row-title">모든 경기기록 삭제</span>
                    <span className="scr-adm-row-desc">첨부 리플레이까지 함께 지워지고 되돌릴 수 없어요. 리그 경기에 연결된 판은 남겨요.</span>
                  </div>
                  <button
                    type="button" className="scr-rect-btn scr-adm-row-btn"
                    onClick={deleteAllGameResults} disabled={busy}
                  >
                    {busy ? <Spinner /> : "삭제"}
                  </button>
                </div>
              </div>
            </section>

            <section className="scr-adm-card">
              <div className="scr-adm-card-head">
                <h2 className="scr-adm-card-title">외부 공개</h2>
              </div>
              <div className="scr-adm-rows">
                <div className="scr-adm-row">
                  <div className="scr-adm-row-text">
                    <span className="scr-adm-row-title">게임 관리</span>
                    <span className="scr-adm-row-desc">
                      손님에게 보일 재생 목록을 만들고 이름·비밀번호를 정합니다(비우면 잠금 없음).
                      경기는 게임 목록에서 골라 '공개'로 담습니다.
                    </span>
                  </div>
                  <button
                    type="button" className="scr-rect-btn scr-adm-row-btn"
                    onClick={() => setExtShareOpen(true)}
                  >
                    열기
                  </button>
                </div>
              </div>
            </section>

          </>
        )}
      </div>

      {confirmSetVersion && (
        <ConfirmDialog
          title={`현재 버전을 ${confirmSetVersion}(으)로 바꿀까요?`}
          message="모든 사용자에게 즉시 반영되고, 회원들은 다음 접속 시 버전 안내를 다시 보게 됩니다."
          confirmLabel="설정"
          onConfirm={() => {
            const next = confirmSetVersion;
            setConfirmSetVersion(null);
            void setVersion(next);
          }}
          onCancel={() => setConfirmSetVersion(null)}
        />
      )}

      {pickerOpen && createPortal(
        <div className="scr-modal-overlay">
          <div
            className="scr-modal scr-modal-md scr-redo-pick"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="scr-modal-head">
              <span>다시 분석할 경기 고르기</span>
              <button className="scr-icon-btn" onClick={() => setPickerOpen(false)} aria-label="닫기"><X size={14} /></button>
            </div>
            <div className="scr-modal-body scr-redo-pick-body">
              {pickRows === null ? (
                <div className="scr-redo-pick-empty"><Spinner /> 경기 목록을 받는 중…</div>
              ) : pickRows.length === 0 ? (
                <div className="scr-redo-pick-empty">게임이 없어요</div>
              ) : (
                <>
                  <label className="scr-redo-pick-from">
                    <span className="scr-redo-pick-from-label">이 날짜부터</span>
                    <input
                      type="date" className="scr-input scr-date-compact"
                      value={pickFrom} max={todayStr()}
                      onChange={(e) => changePickFrom(e.target.value)}
                    />
                  </label>
                  <input
                    type="search"
                    className="scr-input scr-redo-pick-search"
                    placeholder="경기번호·날짜·맵·선수로 찾기"
                    value={pickQuery}
                    onChange={(e) => setPickQuery(e.target.value)}
                  />
                  <SelectAllToggle
                    className="scr-redo-pick-all" all={allShownPicked} count={picked.size} onToggle={toggleAllShown}
                    suffix={pickQuery.trim() ? ` (검색된 ${pickFiltered.length}건)` : ` (${pickFiltered.length}건)`}
                  />
                  {/* 줄 = 폰 게임 목록 꼴(.scr-gm · 2026-10-20, 요청: "재분석 … 게임 목록을 노출하는 부분 전부 모바일 화면의 게임목록처럼"). */}
                  <div className="scr-redo-pick-list scr-activity-rows">
                    {pickFiltered.map((r) => (
                      <ListRow
                        key={r.id}
                        check={<RowCheck checked={picked.has(r.id)} onChange={() => togglePick(r.id)} label={`${r.matchNo} 선택`} />}
                        picked={picked.has(r.id)}
                        className="scr-activity-row-game scr-gm"
                        onClick={() => togglePick(r.id)}
                        status={<GameRowStatus game={r.game} playable={gamePlayable(r.game)} />}
                        desc={<GameRowNames game={r.game} memberOf={memberOf} mobile playable={gamePlayable(r.game)} />}
                        side={formatAgo(r.game.gameStartedAt ?? r.game.date)}
                      />
                    ))}
                    {pickFiltered.length === 0 && (
                      <div className="scr-redo-pick-empty">결과가 없어요</div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="scr-modal-foot scr-redo-pick-foot">
              <span className="scr-redo-pick-count">{picked.size}건 선택</span>
              <button
                type="button"
                className="scr-rect-btn"
                disabled={picked.size === 0}
                onClick={() => { setPickerOpen(false); setConfirmRedo(true); }}
              >
                다시 분석
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {confirmPurge !== null && (
        <ConfirmDialog
          title={`${confirmPurge.count}판의 참값을 지울까요?`}
          message={`${confirmPurge.until}까지(그날 포함) 경기의 재생 자료만 지웁니다(리그 경기에 연결된 판은 남겨요). 리플레이 파일과 통계는 그대로예요. 다시 보려면 그 날짜부터 재분석하면 다시 구워집니다.`}
          confirmLabel="지우기"
          onConfirm={() => { void purgeTruth(confirmPurge.until); }}
          onCancel={() => setConfirmPurge(null)}
        />
      )}

      {confirmRedo && (
        <ConfirmDialog
          title={`고른 경기 ${picked.size}건을 다시 분석할까요?`}
          message="리플레이가 붙은 경기를 다시 읽어 분석 결과를 새로 씁니다. 직접 입력한 값(날짜·승패·회원 연결 등)은 그대로예요. 건수가 많으면 몇 분 걸립니다."
          confirmLabel="다시 분석"
          onConfirm={() => { setConfirmRedo(false); void reanalyzeGames([...picked]); }}
          onCancel={() => setConfirmRedo(false)}
        />
      )}

      {versionManageOpen && (
        <VersionManageModal onClose={() => setVersionManageOpen(false)} />
      )}

      {extShareOpen && (
        <ExtShareManageModal onClose={() => setExtShareOpen(false)} />
      )}

      {unhideOpen && (
        <UnhideRequestsModal onClose={() => setUnhideOpen(false)} />
      )}
      {deletedGamesOpen && (
        <DeletedGamesModal onClose={() => setDeletedGamesOpen(false)} />
      )}


      {versionPickerOpen && (
        <div className="scr-modal-overlay" onClick={() => setVersionPickerOpen(false)}>
          <div
            className="scr-modal scr-modal-sm scr-admin-panel-version-popup"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="scr-modal-head">
              <span>현재 버전 설정</span>
              <button className="scr-icon-btn" onClick={() => setVersionPickerOpen(false)} aria-label="닫기"><X size={14} /></button>
            </div>
            <div className="scr-modal-body">
              {pickableVersions.length === 0 ? (
                <div className="scr-version-pick-empty">버전이 없어요</div>
              ) : (
                <>
                  <Select
                    value={pickValue}
                    options={pickableVersions.map((v) => ({ value: v.number, label: `${v.number} 버전` }))}
                    onChange={setPickValue}
                    className="scr-version-pick-select"
                  />
                  <button
                    type="button"
                    className="scr-rect-btn scr-version-pick-confirm"
                    onClick={() => { setConfirmSetVersion(pickValue); setVersionPickerOpen(false); }}
                    disabled={!pickValue}
                  >
                    설정
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
