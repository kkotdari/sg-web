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
import { formatAgo, todayStr } from "../../utils/date";
import type { GameResult } from "../../types";
import { indexGame } from "../../utils/gameIndex";

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

  /* ★ **데이터 관리**(2026-10-20, 요청: "재분석 참값 삭제 경기 삭제가 비슷한 모달창 사용 · 날짜칸이 제어판에 있지 않고 모달창에 · 버튼도 모두 대상선택 ·
     아니면 데이터관리 메뉴로 통합해서 모달창 열고 from to 입력칸 주고 버튼 3개 · 공방경기 체크박스도") — 옛 세 줄(경기 재분석 · 참값 지우기(날짜까지) · 모든 경기기록 삭제)을
     한 창(아래 pickerOpen)으로 모았다: 기간(from~to) · 공방 경기만 · 찾기로 대상을 고르고 [재분석 · 참값 삭제 · 경기 삭제] 중 하나를 **고른 판에만** 건다.
     리그 경기 세트에 이은 판은 서버가 늘 남긴다(참값 삭제는 외부 공개 판도). */
  const [confirmPurge, setConfirmPurge] = useState<number[] | null>(null);
  const [purging, setPurging] = useState(false);
  /* 게임 삭제 중 — 버전 바꾸기(busy)와 따로 둔다(2026-10-21, 지적: "버전 변경과 데이터 관리 버튼이 스피너가 연동되어 돈다"). */
  const [deletingGames, setDeletingGames] = useState(false);
  const purgeTruth = async (ids: number[]) => {
    setConfirmPurge(null);
    setPurging(true);
    try {
      const { deleted } = await api.purgeTruthOf(ids);
      showToast(`${deleted}판의 참값을 지웠어요.`, { kind: "ok" });
      void loadPickRows();
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "지우지 못했어요.");
    } finally {
      setPurging(false);
    }
  };
  const deleteGames = async (ids: number[]) => {
    const typed = window.prompt(
      `고른 게임 ${ids.length}건을 삭제합니다(리그 경기에 연결된 판은 남겨요). 첨부 리플레이까지 지워지고 되돌릴 수 없어요.\n삭제하려면 "삭제"를 입력하세요.`,
    );
    if (typed !== "삭제") return;
    setDeletingGames(true);
    try {
      const { deleted } = await api.deleteGamesOf(ids);
      showToast(`${deleted}건의 게임 기록을 삭제했어요.`, { kind: "ok" });
      setPicked(new Set());
      void loadPickRows();
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "삭제하지 못했어요.");
    } finally {
      setDeletingGames(false);
    }
  };

  /** 재분석이 실패한 판(게임번호 · 까닭) — 끝나면 창으로 보여 주고 그것만 다시 돌린다(2026-10-20, 요청: "실패한 경우 실패한 목록을 마지막에 보여줘야 그거만 다시 분석"). */
  type RedoFail = { id: number; matchNo: string; why: string };
  const [redoFails, setRedoFails] = useState<RedoFail[] | null>(null);
  const [redoTotal, setRedoTotal] = useState(0);
  useLockBodyScroll(redoFails !== null, () => setRedoFails(null));

  const reanalyzeGames = async (only?: number[]) => {
    setRedo({ done: 0, total: 0, failed: 0 });
    setRedoFails(null);
    let done = 0;
    const fails: RedoFail[] = [];
    const pool = createSummaryPool();
    try {
      let ids: number[] = only ?? [];
      const noOf = new Map<number, string>((pickRows ?? []).map((r) => [r.id, r.matchNo]));
      if (!only) {
        let cursor: string | undefined;
        do {
          const page = await api.getGameResultsPage({ cursor, limit: 100 });
          page.items.forEach((m) => { if (m.replay) { ids.push(m.id); noOf.set(m.id, m.matchNo); } });
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
      }
      /* 게임번호 차례로(2026-10-20, 요청: "재분석 요청은 게임번호순으로") — 번호 없는 판은 뒤로. 읽기(파싱)는 여럿이 함께 돌지만 서버에 보내는 것은
         앞 번호가 끝난(성공·실패) 뒤에야 보낸다 — 아래 turn. */
      ids = [...new Set(ids)].sort((a, b) => {
        const na = noOf.get(a) ?? ""; const nb = noOf.get(b) ?? "";
        if (!na !== !nb) return na ? -1 : 1;
        return na.localeCompare(nb, undefined, { numeric: true }) || a - b;
      });
      setRedo({ done: 0, total: ids.length, failed: 0 });
      const indexLater: number[] = [];
      const at = new Map(ids.map((id, i) => [id, i] as const));
      const release: (() => void)[] = [];
      const turn: Promise<void>[] = ids.map((_, i) => new Promise<void>((r) => { release[i] = r; }));

      const one = async (id: number) => {
        const i = at.get(id)!;
        let ok = false;
        try {
          const blob = await api.downloadReplay(id);
          let body: Parameters<typeof api.reanalyzeGameResult>[1];
          if (pool) {
            const r = await pool.run(id, `${id}.rep`, await blob.arrayBuffer());
            if (!r.ok) throw new Error(r.error || "리플레이를 읽지 못했어요");
            body = {
              mapData: r.mapData,
              mapName: r.mapName, gameStartedAt: r.gameStartedAt,
              durationSeconds: r.durationSeconds, chats: r.chats, slots: r.slots,
            };
          } else {
            const parsed = await parseReplayFile(new File([blob], `${id}.rep`));
            body = {
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
            };
          }
          if (i > 0) await turn[i - 1];
          await api.reanalyzeGameResult(id, body);
          ok = true;
        } catch (e) {
          fails.push({ id, matchNo: noOf.get(id) ?? "", why: e instanceof Error && e.message ? e.message : "알 수 없는 오류" });
        } finally {
          /* 내 차례가 끝난 것은 앞 번호까지 끝난 뒤다 — 읽기에서 실패한 판이 뒤 번호를 앞서 보내게 두지 않는다. */
          if (i > 0) await turn[i - 1];
          release[i]();
        }
        if (ok) {
            /* 게임 색인(utils/gameIndex ★) — 지금 있는 참값 자취로 굽는다. 자취가 없거나(굽는 중 · 지운 판) 못 구우면 끝에 한 번 더 본다. */
          try { if (await indexGame(id) === "none") indexLater.push(id); } catch { indexLater.push(id); }
        }
        done += 1;
        setRedo({ done, total: ids.length, failed: fails.length });
      };
      await runLanes(ids, (pool?.size ?? 2) * 2, one);
      /* 끝에 한 번 더 — 그사이 서버가 자취를 구웠을 수 있다. 그래도 없으면 그 판의 옛 낱말을 그대로 둔다. */
      await runLanes([...indexLater], 2, async (id) => { try { await indexGame(id); } catch { /* 다음 재분석에 */ } });

      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      if (fails.length > 0) {
        fails.sort((a, b) => (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0));
        setRedoTotal(ids.length);
        setRedoFails(fails);
      } else {
        showToast(`게임 ${done}건을 다시 분석했어요 — 참값 자취는 서버가 뒤에서 굽습니다.`, { kind: "ok" });
      }
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "게임을 다시 분석하지 못했어요.");
    } finally {
      pool?.close();
      setRedo(null);
    }
  };

  type PickRow = { id: number; matchNo: string; game: GameResult };
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickRows, setPickRows] = useState<PickRow[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  type PickFilter = { from: string; to: string; pub: boolean; q: string };
  const [pickFilter, setPickFilter] = useState<PickFilter>({ from: "", to: "", pub: false, q: "" });
  useLockBodyScroll(pickerOpen, () => setPickerOpen(false));

  /** 대상 목록 — 리플레이 없는 판도 든다(참값·경기 삭제의 대상 · 재분석은 리플레이 있는 판만 건다). 지우고 나면 다시 받는다. */
  /* 조회 단추로만 받는다(2026-10-21, 요청: "데이터관리에서 모든 게임 조회 X · 조회버튼 추가") — 기간 · 공방 게임만 · 검색 글 모두 서버 조건
     (검색 글은 게임 목록 검색창과 같은 any 조건 · 2026-10-21, 요청: "조회 버튼을 아래에 · 검색창 입력해도 바로 필터되는 게 아니라 조회 눌러야 api 로 요청"). */
  const [pickLoading, setPickLoading] = useState(false);
  const loadPickRows = async (f: PickFilter = pickFilter) => {
    setPickLoading(true);
    try {
      const rows: PickRow[] = [];
      let cursor: string | undefined;
      do {
        const page = await api.getGameResultsPage({
          cursor, limit: 100, dateFrom: f.from || undefined, dateTo: f.to || undefined, pubOnly: f.pub || undefined,
          any: f.q.trim() || undefined,
        });
        for (const m of page.items) rows.push({ id: m.id, matchNo: m.matchNo, game: m });
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      setPickRows(rows);
      const alive = new Set(rows.map((r) => r.id));
      setPicked((prev) => new Set([...prev].filter((id) => alive.has(id))));
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "게임 목록을 받지 못했어요.");
      setPickRows((prev) => prev ?? []);
    } finally {
      setPickLoading(false);
    }
  };
  const openPicker = () => {
    /* 열 때마다 조건·고른 판을 비운다(2026-10-21, 지적: "선택조건이 닫았다 열어도 유지") — 닫을 때 비우면 닫은 뒤 뜨는 확인 창이 고른 판을 잃는다. */
    setPickFilter({ from: "", to: "", pub: false, q: "" });
    setPicked(new Set());
    setPickRows(null);
    setPickerOpen(true);
  };

  const pickShown = pickRows ?? [];
  const changePickFilter = (patch: Partial<PickFilter>) => setPickFilter((f) => ({ ...f, ...patch }));
  const searchPicks = () => { setPicked(new Set()); void loadPickRows(pickFilter); };
  const pickedIds = [...picked];
  const pickedReplayIds = (pickRows ?? []).filter((r) => picked.has(r.id) && r.game.replay).map((r) => r.id);
  const dataBusy = redo !== null || purging || deletingGames;
  const allShownPicked = pickShown.length > 0 && pickShown.every((r) => picked.has(r.id));
  const toggleAllShown = () => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (allShownPicked) pickShown.forEach((r) => next.delete(r.id));
      else pickShown.forEach((r) => next.add(r.id));
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
                <h2 className="scr-adm-card-title">게임 자료</h2>
              </div>
              <div className="scr-adm-rows">
                <div className="scr-adm-row">
                  <div className="scr-adm-row-text">
                    <span className="scr-adm-row-title">데이터 관리</span>
                    <span className="scr-adm-row-desc">
                      기간·공방 게임으로 대상을 골라 재분석하거나 참값(재생 자료)·게임 기록을 지웁니다. 리그 경기에 연결된 판은 지우지 않아요.
                    </span>
                  </div>
                  <button
                    type="button" className="scr-rect-btn scr-adm-row-btn"
                    onClick={openPicker} disabled={dataBusy}
                  >
                    {redo ? (
                      <>
                        <Spinner />
                        {redo.total > 0 ? `${redo.done}/${redo.total}` : "목록 받는 중"}
                        {redo.failed > 0 ? ` · 실패 ${redo.failed}` : ""}
                      </>
                    ) : purging || deletingGames ? <Spinner /> : "열기"}
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

                {/* 숨김 해제 요청 — 게임 목록의 '해제요청'이 모인다(2026-10-19 · UnhideRequestsModal ★). */}
                <div className="scr-adm-row">
                  <div className="scr-adm-row-text">
                    <span className="scr-adm-row-title">숨김 해제 요청{unhideCount ? ` (${unhideCount})` : ""}</span>
                    <span className="scr-adm-row-desc">
                      회원이 숨긴 게임의 해제를 요청하면 여기에 모여요. 해제하면 게임이 다시 보입니다.
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
                      <span className="scr-adm-row-title">삭제된 게임</span>
                      <span className="scr-adm-row-desc">
                        삭제한 게임을 복원하거나 완전히 지웁니다. 완전히 지운 게임은 다시 등록할 수 있어요.
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
                      담을 게임은 게임 목록에서 골라 '공개'로 담습니다.
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
              <span>데이터 관리</span>
              <button className="scr-icon-btn" onClick={() => setPickerOpen(false)} aria-label="닫기"><X size={14} /></button>
            </div>
            <div className="scr-modal-body scr-redo-pick-body">
              <div className="scr-redo-pick-filters">
                <label className="scr-redo-pick-from">
                  <span className="scr-redo-pick-from-label">기간</span>
                  <input
                    type="date" className="scr-input scr-date-compact" aria-label="시작 날짜"
                    value={pickFilter.from} max={pickFilter.to || todayStr()}
                    onChange={(e) => changePickFilter({ from: e.target.value })}
                  />
                  <span className="scr-redo-pick-from-label" aria-hidden>~</span>
                  <input
                    type="date" className="scr-input scr-date-compact" aria-label="끝 날짜"
                    value={pickFilter.to} min={pickFilter.from || undefined} max={todayStr()}
                    onChange={(e) => changePickFilter({ to: e.target.value })}
                  />
                </label>
                <label className="scr-checkbox-field scr-redo-pick-pub">
                  <input type="checkbox" checked={pickFilter.pub} onChange={(e) => changePickFilter({ pub: e.target.checked })} />
                  공방 게임만
                </label>
                <input
                  type="search"
                  className="scr-input scr-redo-pick-search"
                  placeholder="게임번호·맵·선수로 찾기"
                  value={pickFilter.q}
                  onChange={(e) => changePickFilter({ q: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter" && !pickLoading && !dataBusy) searchPicks(); }}
                />
                <button type="button" className="scr-rect-btn scr-redo-pick-go" onClick={searchPicks} disabled={pickLoading || dataBusy}>
                  {pickLoading ? <Spinner /> : "조회"}
                </button>
              </div>
              {pickRows === null ? (
                <div className="scr-redo-pick-empty">{pickLoading ? <><Spinner /> 게임 목록을 받는 중…</> : "기간을 고르고 조회를 눌러 주세요"}</div>
              ) : pickRows.length === 0 ? (
                <div className="scr-redo-pick-empty">게임이 없어요</div>
              ) : (
                <>
                  {/* 전체 선택은 다른 화면과 같은 공용 꼴(SelectAllToggle — PC 체크 · 폰 글자 단추 · 2026-10-20, 요청: "전체선택은 다른 화면과 똑같이 가자"). */}
                  <SelectAllToggle
                    className="scr-redo-pick-all" all={allShownPicked} count={picked.size} onToggle={toggleAllShown}
                    suffix={` (${pickShown.length}건)`}
                  />
                  {/* 줄 = 폰 게임 목록 꼴(.scr-gm · 2026-10-20, 요청: "재분석 … 게임 목록을 노출하는 부분 전부 모바일 화면의 게임목록처럼"). */}
                  <div className="scr-redo-pick-list scr-activity-rows">
                    {pickShown.map((r) => (
                      <ListRow
                        key={r.id}
                        check={<RowCheck checked={picked.has(r.id)} onChange={() => togglePick(r.id)} label={`${r.matchNo} 선택`} />}
                        picked={picked.has(r.id)}
                        className="scr-activity-row-game scr-gm"
                        onClick={() => togglePick(r.id)}
                        status={<GameRowStatus game={r.game} />}
                        desc={<GameRowNames game={r.game} memberOf={memberOf} mobile playable={gamePlayable(r.game)} />}
                        side={formatAgo(r.game.gameStartedAt ?? r.game.date)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="scr-modal-foot scr-redo-pick-foot">
              <span className="scr-redo-pick-count">{picked.size}건 선택</span>
              <div className="scr-redo-pick-acts">
                <button
                  type="button" className="scr-rect-btn"
                  disabled={pickedReplayIds.length === 0 || dataBusy}
                  title={pickedReplayIds.length < picked.size ? `리플레이가 있는 ${pickedReplayIds.length}건만 다시 분석해요` : undefined}
                  onClick={() => { setPickerOpen(false); setConfirmRedo(true); }}
                >
                  재분석
                </button>
                <button
                  type="button" className="scr-rect-btn is-secondary"
                  disabled={picked.size === 0 || dataBusy}
                  onClick={() => { setPickerOpen(false); setConfirmPurge(pickedIds); }}
                >
                  참값 삭제
                </button>
                <button
                  type="button" className="scr-rect-btn is-secondary"
                  disabled={picked.size === 0 || dataBusy}
                  onClick={() => { setPickerOpen(false); void deleteGames(pickedIds); }}
                >
                  게임 삭제
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {confirmPurge !== null && (
        <ConfirmDialog
          title={`고른 게임 ${confirmPurge.length}건의 참값을 지울까요?`}
          message="고른 게임의 재생 자료만 지웁니다(리그 경기·외부 공개에 연결된 판은 남겨요). 리플레이 파일과 통계·전술 낱말은 그대로예요. 다시 보려면 그 게임을 재분석하면 다시 구워집니다."
          confirmLabel="지우기"
          onConfirm={() => { void purgeTruth(confirmPurge); }}
          onCancel={() => setConfirmPurge(null)}
        />
      )}

      {redoFails !== null && createPortal(
        <div className="scr-modal-overlay">
          <div className="scr-modal scr-modal-md scr-redo-pick" onClick={(e) => e.stopPropagation()}>
            <div className="scr-modal-head">
              <span>재분석 실패 {redoFails.length}건</span>
              <button className="scr-icon-btn" onClick={() => setRedoFails(null)} aria-label="닫기"><X size={14} /></button>
            </div>
            <div className="scr-modal-body scr-redo-pick-body">
              <div className="scr-redo-fail-note">
                {redoFails.length >= redoTotal
                  ? `고른 ${redoTotal}건을 모두 다시 분석하지 못했어요 — 그대로 두었어요.`
                  : `${redoTotal - redoFails.length}건은 다시 분석했어요(참값 자취는 서버가 뒤에서 굽습니다). 아래 ${redoFails.length}건은 그대로 두었어요.`}
              </div>
              {/* 줄 = 고르기 창과 같은 폰 게임 목록 꼴 · 위에 실패 까닭(2026-10-20). */}
              <div className="scr-redo-pick-list scr-activity-rows">
                {redoFails.map((f) => {
                  const g = (pickRows ?? []).find((r) => r.id === f.id)?.game;
                  return (
                    <ListRow
                      key={f.id}
                      className="scr-activity-row-game scr-gm"
                      onClick={() => {}}
                      above={<span className="scr-redo-fail-why">{f.matchNo || `#${f.id}`} · {f.why}</span>}
                      status={g ? <GameRowStatus game={g} /> : null}
                      desc={g ? <GameRowNames game={g} memberOf={memberOf} mobile playable={gamePlayable(g)} /> : <span>{f.matchNo || `#${f.id}`}</span>}
                      side={g ? formatAgo(g.gameStartedAt ?? g.date) : ""}
                    />
                  );
                })}
              </div>
            </div>
            <div className="scr-modal-foot scr-redo-pick-foot">
              <button type="button" className="scr-rect-btn is-secondary" onClick={() => setRedoFails(null)}>닫기</button>
              <button
                type="button" className="scr-rect-btn"
                onClick={() => {
                  const again = redoFails.map((f) => f.id);
                  setPicked(new Set(again));
                  setRedoFails(null);
                  void reanalyzeGames(again);
                }}
              >
                실패한 {redoFails.length}건 다시 분석
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {confirmRedo && (
        <ConfirmDialog
          title={`고른 게임 ${pickedReplayIds.length}건을 다시 분석할까요?`}
          message="리플레이가 붙은 게임을 다시 읽어 분석 결과를 새로 씁니다. 직접 입력한 값(날짜·승패·회원 연결 등)은 그대로예요. 건수가 많으면 몇 분 걸립니다."
          confirmLabel="다시 분석"
          onConfirm={() => { setConfirmRedo(false); void reanalyzeGames(pickedReplayIds); }}
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
