import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Spinner } from "../../components/common/Feedback";
import Select from "../../components/common/Select";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { RowCheck, SelectAllToggle } from "../../components/common/Selection";
import { GameRowNames, GameRowStatus, ListRow } from "../games/GameRow";
import { GameTableHead, GameTableRow } from "../games/GameTable";
import WpaDetailModal from "../../modals/WpaDetailModal";
import UnhideRequestsModal from "../../modals/UnhideRequestsModal";
import ReplayBatchButton from "../../components/common/ReplayBatchButton";
import { gamePlayable } from "../../utils/gamePlayable";
import { useIsMobile } from "../../hooks/useIsMobile";
import { api } from "../../api/client";
import { useAppStore } from "../../store/appStore";
import { showAlert } from "../../components/common/AlertDialog";
import { showToast } from "../../components/common/Toast";
import { useLockBodyScroll } from "../../utils/bodyScrollLock";
import { cx } from "../../utils/format";
import { formatAgo } from "../../utils/date";
import type { GameDataFlags, GameManageHasKey, GameManagePage, GameManageQuery, GameResult } from "../../types";

/* ★★ 게임관리 화면(2026-11-20, 요청: "게임 데이터 관리 → 제어판이 아닌 게임관리 별도 화면으로 분리 · 컬럼에 숨김 삭제 등도 추가" ·
   "게임자료 섹션 자체를 다 옮겨오기 · 단 메인화면은 게임 목록이 뜨고 버튼들로" · "목록은 메인 그리드를 공유해서 쓰고 각 상황에 맞게 조회가 가능하게 필터를 자세히 ·
   조회한 목록은 페이징 · 전체선택은 페이징 무관 모두 선택되게(건수 표시) · 그걸 선택한 거에 대해 각 액션들을 취할 수 있게").
   옛 제어판 '게임 자료' 칸(데이터 관리 창 · WPA 상세보기 · 월 마감 · 리플레이 내려받기 · 숨김 해제 요청 · 삭제된 게임)을 한 화면으로 옮겼다 — 월 마감은 같은 날 기능째 걷었고
   (요청: "마감 기능 제거하자 그냥"), 삭제된 게임 창은 이 표의 [삭제] 거름 + [복원] · [완전삭제]가 대신한다.
   표 = PC 게임 목록 표(GameTable ★★)의 앞 여섯 칸 + 데이터 칸(GameTableHead manageCols · GameTableRow manage) · 폰은 게임 목록 줄(ListRow) 위에 칸 O/X.
   목록 · 거름 · 쪽 · 전체 id 는 서버가 한다(POST /api/game-results/admin/manage) — 전체 선택은 거름에 드는 판 id 전부를 받아 고른다.
   ★ 거름 둘째 판(같은 날, 요청: "배치등록도 게임관리로 · 종류(내전 · 공방 · 리그) · 유형 · 특이사항(명예의 전당 · 쇼츠 · 외부 공개) → 체크박스 ·
   리플레이 · 참값 · 통계 · 색인 · 숨김 · 삭제 → 라디오(전체도 있는 라디오) · 그 외의 필터는 제거 · 디자인은 화려함보단 깔끔하게") — 고르면 바로 다시 받는다(조회 단추 없음).
   옛 첫 판의 기간 · 검색 · 종류 하나 고르기 · 참값 끔 · 리그 거름과 전체/O/X 덩이 단추는 걷었다. 삭제 라디오만 처음 값이 X(지운 판 빼고 — 여느 목록과 같게). */

type Radio = "all" | "o" | "x";
type RadioKey = "replay" | "truth" | "stats" | "index" | "hidden" | "deleted";
type Kind = NonNullable<GameManageQuery["kinds"]>[number];
type GType = NonNullable<GameManageQuery["types"]>[number];
type Mark = NonNullable<GameManageQuery["marks"]>[number];
interface Filter { kinds: Kind[]; types: GType[]; marks: Mark[]; radios: Record<RadioKey, Radio> }
const EMPTY: Filter = {
  kinds: [], types: [], marks: [],
  radios: { replay: "all", truth: "all", stats: "all", index: "all", hidden: "all", deleted: "x" },
};

/** 데이터 칸(표 머리 · 폰 줄 같은 차례). 참값은 끔 표식이면 "끔". */
const FLAG_COLS: { key: keyof GameDataFlags; label: string }[] = [
  { key: "replay", label: "리플레이" }, { key: "truth", label: "참값" }, { key: "stats", label: "통계" }, { key: "index", label: "색인" },
  { key: "hidden", label: "숨김" }, { key: "deleted", label: "삭제" }, { key: "fame", label: "명전" }, { key: "league", label: "리그" },
  { key: "shorts", label: "쇼츠" }, { key: "shared", label: "공개" },
];
const KINDS: [Kind, string][] = [["clan", "내전"], ["pub", "공방"], ["league", "리그"]];
const TYPES: [GType, string][] = [["1v1", "1:1"], ["team", "팀전"], ["ffa", "프리포올"], ["ums", "유즈맵"]];
const MARKS: [Mark, string][] = [["fame", "명예의 전당"], ["shorts", "쇼츠"], ["shared", "외부 공개"]];
const RADIOS: [RadioKey, string][] = [["replay", "리플레이"], ["truth", "참값"], ["stats", "통계"], ["index", "색인"], ["hidden", "숨김"], ["deleted", "삭제"]];
const SIZE_OPTIONS = [{ value: "50", label: "50개씩" }, { value: "100", label: "100개씩" }, { value: "200", label: "200개씩" }];

const toQuery = (f: Filter): GameManageQuery => {
  const has: Partial<Record<GameManageHasKey, boolean>> = {};
  for (const [k] of RADIOS) {
    if (k === "deleted" || f.radios[k] === "all") continue;
    has[k] = f.radios[k] === "o";
  }
  const d = f.radios.deleted;
  return { kinds: f.kinds, types: f.types, marks: f.marks, has, deleted: d === "all" ? "include" : d === "o" ? "only" : "exclude" };
};

function CheckRow<T extends string>({ label, items, value, onChange }: {
  label: string; items: [T, string][]; value: T[]; onChange: (v: T[]) => void;
}) {
  return (
    <div className="scr-gman-frow">
      <span className="scr-gman-flabel">{label}</span>
      <div className="scr-gman-opts">
        {items.map(([k, t]) => (
          <label key={k} className="scr-checkbox-field scr-gman-opt">
            <input
              type="checkbox" checked={value.includes(k)}
              onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((x) => x !== k))}
            />
            {t}
          </label>
        ))}
      </div>
    </div>
  );
}

function RadioRow({ name, label, value, onChange }: { name: string; label: string; value: Radio; onChange: (v: Radio) => void }) {
  const opts: [Radio, string][] = [["all", "전체"], ["o", "O"], ["x", "X"]];
  return (
    <div className="scr-gman-frow" role="radiogroup" aria-label={label}>
      <span className="scr-gman-flabel">{label}</span>
      <div className="scr-gman-opts">
        {opts.map(([v, t]) => (
          <label key={v} className="scr-checkbox-field scr-gman-opt">
            <input type="radio" name={`scr-gman-${name}`} checked={value === v} onChange={() => onChange(v)} />
            {t}
          </label>
        ))}
      </div>
    </div>
  );
}

/** 칸 O/X — 참값은 끔 표식이면 "끔". */
function FlagMark({ f, k }: { f: GameDataFlags | undefined; k: keyof GameDataFlags }) {
  if (!f) return <span className="scr-gman-ox is-x">-</span>;
  if (k === "truth" && !f.truth && f.noTruth) return <span className="scr-gman-ox is-off" title="참값 끔(참값 없이 등록 · 참값 삭제)">끔</span>;
  return <span className={cx("scr-gman-ox", f[k] ? "is-o" : "is-x")}>{f[k] ? "O" : "X"}</span>;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type Act = "make" | "purge" | "redo" | "restore" | "unfame";
type RedoFail = { id: number; matchNo: string; why: string };

export default function GameManageScreen() {
  const memberOf = useAppStore((s) => s.memberOf);
  const mobile = useIsMobile();

  const [applied, setApplied] = useState<Filter>(EMPTY);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(50);
  const [data, setData] = useState<GameManagePage | null>(null);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [picking, setPicking] = useState(false);
  const seq = useRef(0);

  const load = async (f: Filter = applied, p: number = page, sz: number = size) => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const got = await api.manageGames({ ...toQuery(f), page: p, size: sz });
      if (my !== seq.current) return;
      setData(got);
      /* 쪽이 줄어 지금 쪽이 비면(지운 뒤) 마지막 쪽으로 */
      const last = Math.max(1, Math.ceil(got.total / sz));
      if (p > last) { setPage(last); void load(f, last, sz); }
    } catch (e) {
      if (my === seq.current) showAlert(e instanceof Error ? e.message : "게임 목록을 받지 못했어요.");
    } finally {
      if (my === seq.current) setLoading(false);
    }
  };
  /* 첫 화면은 바로 목록(요청: "메인화면은 게임 목록이 뜨고") — 거름 없이 새 판부터. */
  useEffect(() => { void load(EMPTY, 1, size); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  /** 거름을 바꾸면 바로 다시 받는다 — 첫 쪽부터 · 고른 판은 비운다(안 보이는 판에 일을 걸지 않게). */
  const apply = (next: Filter) => {
    setApplied(next);
    setPage(1);
    setPicked(new Set());
    void load(next, 1, size);
  };
  const patch = (x: Partial<Filter>) => apply({ ...applied, ...x });
  const setRadio = (k: RadioKey, v: Radio) => apply({ ...applied, radios: { ...applied.radios, [k]: v } });
  const isEmpty = JSON.stringify(applied) === JSON.stringify(EMPTY);
  const goPage = (p: number) => { setPage(p); void load(applied, p, size); };
  const changeSize = (v: string) => { const sz = Number(v); setSize(sz); setPage(1); void load(applied, 1, sz); };

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));
  const items = data?.items ?? [];
  const flags = data?.flags ?? {};
  const allOn = total > 0 && picked.size >= total;
  /** 전체 선택 — 쪽과 무관하게 거름에 드는 판 전부(서버가 id 를 다 준다). */
  const toggleAll = async () => {
    if (allOn) { setPicked(new Set()); return; }
    setPicking(true);
    try {
      const got = await api.manageGames({ ...toQuery(applied), idsOnly: true });
      setPicked(new Set(got.ids ?? []));
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "전체를 고르지 못했어요.");
    } finally {
      setPicking(false);
    }
  };
  const togglePick = (id: number) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const pageAllOn = items.length > 0 && items.every((g) => picked.has(g.id));
  const togglePage = () => setPicked((prev) => {
    const next = new Set(prev);
    if (pageAllOn) items.forEach((g) => next.delete(g.id));
    else items.forEach((g) => next.add(g.id));
    return next;
  });

  /* ── 위 단추(옛 제어판 게임 자료 칸) ── */
  const [wpaOpen, setWpaOpen] = useState(false);
  /* 배치등록 창(2026-11-20 둘째 · 옛 제어판 배치등록 칸) — 한 번 연 뒤로는 닫아도 붙여 둔다(읽는 중 · 담은 파일 · 검토할 판을 잃지 않게 · 숨기기만). */
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchMounted, setBatchMounted] = useState(false);
  useLockBodyScroll(batchOpen, () => setBatchOpen(false));
  const [unhideOpen, setUnhideOpen] = useState(false);
  const [unhideCount, setUnhideCount] = useState<number | null>(null);
  useEffect(() => {
    if (unhideOpen) return;
    let alive = true;
    api.listUnhideRequests().then((r) => { if (alive) setUnhideCount(r.length); }).catch(() => {});
    return () => { alive = false; };
  }, [unhideOpen]);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const downloadAll = async () => {
    setDownloadingAll(true);
    try {
      download(await api.downloadReplayArchive(), "replays.zip");
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "리플레이를 다운로드하지 못했어요.");
    } finally {
      setDownloadingAll(false);
    }
  };

  /* ── 고른 판에 거는 일 ── */
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Act | null>(null);
  const [redo, setRedo] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [redoFails, setRedoFails] = useState<RedoFail[] | null>(null);
  const [redoTotal, setRedoTotal] = useState(0);
  const failGames = useRef<Map<number, GameResult>>(new Map());
  useLockBodyScroll(redoFails !== null, () => setRedoFails(null));
  const ids = [...picked];
  const working = busy !== null || redo !== null;

  /** 서버 묶음 일(재분석 · 참값 굽기) — 진행은 단추에 · 실패한 판은 창으로(옛 제어판 데이터 관리 그대로). */
  const runBatch = async (only: number[], make: boolean) => {
    setRedo({ done: 0, total: 0, failed: 0 });
    setRedoFails(null);
    items.forEach((g) => failGames.current.set(g.id, g));
    try {
      const { batch, total: n } = make ? await api.makeTruthOf(only) : await api.reanalyzeGames(only);
      if (n === 0) {
        showToast(make ? "구울 판이 없어요." : "참값이 있는 판이 없어요 — 재분석은 참값이 있는 판만 해요([참값 굽기]로 먼저 구우세요).", { kind: "warn" });
        return;
      }
      setRedo({ done: 0, total: n, failed: 0 });
      let st = await api.reanalyzeStatus(batch);
      while (st.done < st.total) {
        setRedo({ done: st.done, total: st.total, failed: st.failed });
        await new Promise((resolve) => setTimeout(resolve, 2000));
        st = await api.reanalyzeStatus(batch);
      }
      if (st.fails.length > 0) {
        setRedoTotal(st.total);
        setRedoFails(st.fails);
      } else {
        showToast(make ? `게임 ${st.total}건의 참값을 서버가 구웠어요.` : `게임 ${st.total}건을 서버가 다시 분석했어요.`, { kind: "ok" });
      }
      void load();
    } catch (e) {
      showAlert(e instanceof Error ? e.message : make ? "참값을 굽지 못했어요." : "게임을 다시 분석하지 못했어요.");
    } finally {
      setRedo(null);
    }
  };

  const run = async (act: Act) => {
    setConfirm(null);
    if (act === "make" || act === "redo") { void runBatch(ids, act === "make"); return; }
    setBusy(act);
    try {
      if (act === "purge") {
        const { deleted, skipped } = await api.purgeTruthOf(ids);
        showToast(`${deleted}판의 참값을 지웠어요${skipped ? ` · 지킨 판(리그 · 명예의 전당 · 쇼츠) ${skipped}판은 건너뛰었어요` : ""}.`, { kind: "ok" });
      } else if (act === "unfame") {
        const { removed } = await api.unfameGames(ids);
        showToast(`${removed}판을 명예의 전당에서 뺐어요.`, { kind: "ok" });
      } else if (act === "restore") {
        let ok = 0;
        for (const id of ids) {
          try { await api.restoreGameResult(id); ok += 1; } catch { /* 지운 판이 아니면 건너뛴다 */ }
        }
        showToast(`${ok}판을 되살렸어요${ids.length - ok ? ` · ${ids.length - ok}판은 지운 판이 아니라 그대로예요` : ""}.`, { kind: "ok" });
      }
      void load();
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "처리하지 못했어요.");
    } finally {
      setBusy(null);
    }
  };
  const purgeGames = async () => {
    const typed = window.prompt(
      `고른 게임 ${ids.length}건을 리플레이까지 완전히 지웁니다(리그 · 명예의 전당 · 쇼츠가 있는 판은 남겨요). 되돌릴 수 없어요.\n삭제하려면 "삭제"를 입력하세요.`,
    );
    if (typed !== "삭제") return;
    setBusy("delete");
    try {
      const { deleted } = await api.deleteGamesOf(ids);
      showToast(`${deleted}건을 완전히 지웠어요${ids.length - deleted ? ` · ${ids.length - deleted}건은 지킨 판이라 남겼어요` : ""}.`, { kind: "ok" });
      setPicked(new Set());
      void load();
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "삭제하지 못했어요.");
    } finally {
      setBusy(null);
    }
  };
  const exportPicked = async () => {
    setBusy("export");
    try {
      download(await api.exportGamesOf(ids), `sg-replays_${ids.length}.zip`);
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "리플레이를 내려받지 못했어요.");
    } finally {
      setBusy(null);
    }
  };

  const CONFIRM: Record<Act, { title: string; message: string; label: string }> = {
    make: { title: `고른 게임 ${ids.length}건의 참값을 구울까요?`, label: "참값 굽기",
      message: "리플레이가 붙은 판의 참값(재생 자료)을 서버가 굽습니다 — 참값을 지웠거나 참값 없이 등록한 판도 다시 만들어요. 건수가 많으면 몇 분 걸립니다." },
    purge: { title: `고른 게임 ${ids.length}건의 참값을 지울까요?`, label: "지우기",
      message: "재생 자료만 지웁니다 — 리플레이 파일 · 통계 · 색인은 그대로예요. 지운 판은 외부 공개 목록에서도 빠지고, 재분석해도 참값을 다시 만들지 않아요([참값 굽기]로 다시). 리그 · 명예의 전당 · 쇼츠가 있는 판은 건너뜁니다." },
    redo: { title: `고른 게임 ${ids.length}건을 다시 분석할까요?`, label: "다시 분석",
      message: "참값이 있는 판만 리플레이를 다시 읽어 모든 기록(요약 · 참값 · 통계 · 색인)을 새로 씁니다. 직접 입력한 값(날짜 · 승패 · 회원 연결 등)은 그대로예요. 건수가 많으면 몇 분 걸립니다." },
    restore: { title: `고른 게임 ${ids.length}건을 되살릴까요?`, label: "복원",
      message: "지운 판을 다시 목록에 세우고 서버가 다시 굽습니다. 지운 판이 아니면 그대로 둬요." },
    unfame: { title: `고른 게임 ${ids.length}건을 명예의 전당에서 뺄까요?`, label: "빼기",
      message: "명예의 전당 표식만 뗍니다 — 판과 자료는 그대로예요. 추천이 다시 3에 닿으면 또 들어가요." },
  };

  const pagerNums = (() => {
    const out: number[] = [];
    for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p += 1) out.push(p);
    return out;
  })();

  /** 종류 칸 — 리그(리그 경기 세트) · 내전(참가자 전원이 회원) · 공방. */
  const kindOf = (g: GameResult): string => (flags[String(g.id)]?.league ? "리그" : g.clan === false ? "공방" : g.clan ? "내전" : "-");
  const flagCells = (g: GameResult): ReactNode[] => FLAG_COLS.map((c) => <FlagMark key={c.key} f={flags[String(g.id)]} k={c.key} />);

  return (
    <div className="scr-screen scr-gman-screen">
      <div className="scr-v2-toolbar">
        <h1 className="scr-title scr-v2-toolbar-title">게임관리</h1>
      </div>
      {/* 맨 위 단추 줄 — 회원관리와 같은 꼴(.scr-v2-primary-row · 옛 제어판 게임 자료 칸의 목록 밖 일). */}
      <div className="scr-v2-primary-row scr-gman-tools">
          <button type="button" className="scr-rect-btn is-secondary" onClick={() => { setBatchMounted(true); setBatchOpen(true); }}>배치등록</button>
        <button type="button" className="scr-rect-btn is-secondary" onClick={() => setWpaOpen(true)}>WPA 상세보기</button>
          <button type="button" className="scr-rect-btn is-secondary" onClick={() => setUnhideOpen(true)}>
            숨김 해제 요청{unhideCount ? ` (${unhideCount})` : ""}
          </button>
          <button
            type="button" className="scr-rect-btn is-secondary" onClick={() => { void downloadAll(); }} disabled={downloadingAll}
            title="등록된 리플레이 전부를 날짜별 폴더로 묶어 zip 하나로"
          >
            {downloadingAll ? <Spinner /> : "리플레이 전체 받기"}
          </button>
      </div>

      <div className="scr-gman-filters">
        <CheckRow label="종류" items={KINDS} value={applied.kinds} onChange={(v) => patch({ kinds: v })} />
        <CheckRow label="유형" items={TYPES} value={applied.types} onChange={(v) => patch({ types: v })} />
        <CheckRow label="특이사항" items={MARKS} value={applied.marks} onChange={(v) => patch({ marks: v })} />
        <div className="scr-gman-radios">
          {RADIOS.map(([k, t]) => <RadioRow key={k} name={k} label={t} value={applied.radios[k]} onChange={(v) => setRadio(k, v)} />)}
        </div>
        <button type="button" className="scr-text-btn scr-gman-reset" onClick={() => apply(EMPTY)} disabled={isEmpty || loading}>초기화</button>
      </div>

      <div className="scr-gman-bar">
        <SelectAllToggle
          className="scr-gman-all" all={allOn} count={picked.size} onToggle={() => { void toggleAll(); }} disabled={picking || total === 0}
          suffix={` (${total}건)`}
        />
        {!mobile && items.length > 0 && (
          <label className="scr-gman-all">
            <input type="checkbox" checked={pageAllOn} onChange={togglePage} />
            <span>이 쪽 선택</span>
          </label>
        )}
        {picking && <Spinner />}
        <span className="scr-gman-count">{picked.size > 0 ? `${picked.size}건 선택 · ` : ""}전체 {total}건</span>
        <span className="scr-gman-gap" />
        <div className="scr-gman-acts">
          <button type="button" className="scr-rect-btn" disabled={ids.length === 0 || working} onClick={() => setConfirm("make")}
            title="참값을 지웠거나 참값 없이 등록한 판도 다시 구워요">
            {redo ? <><Spinner />{redo.total > 0 ? ` ${redo.done}/${redo.total}` : ""}{redo.failed > 0 ? ` · 실패 ${redo.failed}` : ""}</> : "참값 굽기"}
          </button>
          <button type="button" className="scr-rect-btn is-secondary" disabled={ids.length === 0 || working} onClick={() => setConfirm("purge")}>
            {busy === "purge" ? <Spinner /> : "참값 삭제"}
          </button>
          <button type="button" className="scr-rect-btn is-secondary" disabled={ids.length === 0 || working} onClick={() => setConfirm("redo")}
            title="참값이 있는 판만 다시 분석해요">
            재분석
          </button>
          <button type="button" className="scr-rect-btn is-secondary" disabled={ids.length === 0 || working} onClick={() => { void exportPicked(); }}>
            {busy === "export" ? <Spinner /> : "리플레이 받기"}
          </button>
          <button type="button" className="scr-rect-btn is-secondary" disabled={ids.length === 0 || working} onClick={() => setConfirm("unfame")}>
            {busy === "unfame" ? <Spinner /> : "명예의 전당 빼기"}
          </button>
          <button type="button" className="scr-rect-btn is-secondary" disabled={ids.length === 0 || working} onClick={() => setConfirm("restore")}>
            {busy === "restore" ? <Spinner /> : "복원"}
          </button>
          <button type="button" className="scr-rect-btn is-danger" disabled={ids.length === 0 || working} onClick={() => { void purgeGames(); }}>
            {busy === "delete" ? <Spinner /> : "완전삭제"}
          </button>
        </div>
      </div>

      {data === null ? (
        <div className="scr-gman-empty">{loading ? <><Spinner /> 게임 목록을 받는 중…</> : "게임 목록을 받지 못했어요"}</div>
      ) : items.length === 0 ? (
        <div className="scr-gman-empty">조건에 맞는 게임이 없어요</div>
      ) : mobile ? (
        <div className={cx("scr-feed-rows scr-gman-rows", loading && "is-loading")}>
          {items.map((g) => (
            <ListRow
              key={g.id}
              check={<RowCheck checked={picked.has(g.id)} onChange={() => togglePick(g.id)} label={`${g.matchNo} 선택`} />}
              picked={picked.has(g.id)}
              className="scr-feed-row-game scr-gm"
              onClick={() => togglePick(g.id)}
              above={(
                <span className="scr-gman-mflags">
                  <span className="scr-gman-mno">{g.matchNo || "-"} · {kindOf(g)}</span>
                  {FLAG_COLS.map((c) => (
                    <span key={c.key} className="scr-gman-mflag">{c.label} <FlagMark f={flags[String(g.id)]} k={c.key} /></span>
                  ))}
                </span>
              )}
              status={<GameRowStatus game={g} />}
              desc={<GameRowNames game={g} memberOf={memberOf} mobile playable={gamePlayable(g)} />}
              side={formatAgo(g.gameStartedAt ?? g.date)}
            />
          ))}
        </div>
      ) : (
        <div className="scr-gman-tablewrap">
          <div className={cx("scr-feed-rows scr-gtab-list is-manage", loading && "is-loading")}>
            <GameTableHead selecting leagueCol={false} manageCols={FLAG_COLS.map((c) => c.label)} />
            {items.map((g) => (
              <GameTableRow
                key={g.id}
                game={g} memberOf={memberOf} leagueCol={false}
                check={<RowCheck checked={picked.has(g.id)} onChange={() => togglePick(g.id)} label={`${g.matchNo} 선택`} />}
                picked={picked.has(g.id)}
                onClick={() => togglePick(g.id)}
                when={formatAgo(g.gameStartedAt ?? g.date)}
                manage={flagCells(g)}
                kind={kindOf(g)}
              />
            ))}
          </div>
        </div>
      )}

      {total > 0 && (
        <div className="scr-gman-pager">
          <button type="button" className="scr-icon-btn scr-gman-pg" disabled={page <= 1 || loading} onClick={() => goPage(1)} aria-label="첫 쪽">«</button>
          <button type="button" className="scr-icon-btn scr-gman-pg" disabled={page <= 1 || loading} onClick={() => goPage(page - 1)} aria-label="앞 쪽">‹</button>
          {pagerNums.map((p) => (
            <button key={p} type="button" className={cx("scr-icon-btn scr-gman-pg", p === page && "is-on")} disabled={loading} onClick={() => goPage(p)}>{p}</button>
          ))}
          <button type="button" className="scr-icon-btn scr-gman-pg" disabled={page >= pages || loading} onClick={() => goPage(page + 1)} aria-label="다음 쪽">›</button>
          <button type="button" className="scr-icon-btn scr-gman-pg" disabled={page >= pages || loading} onClick={() => goPage(pages)} aria-label="끝 쪽">»</button>
          <span className="scr-gman-pginfo">{page} / {pages}</span>
          <Select value={String(size)} options={SIZE_OPTIONS} onChange={changeSize} className="scr-gman-size" size="sm" />
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title={CONFIRM[confirm].title}
          message={CONFIRM[confirm].message}
          confirmLabel={CONFIRM[confirm].label}
          onConfirm={() => { void run(confirm); }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {redoFails !== null && createPortal(
        <div className="scr-modal-overlay">
          <div className="scr-modal scr-modal-md scr-redo-pick" onClick={(e) => e.stopPropagation()}>
            <div className="scr-modal-head">
              <span>실패 {redoFails.length}건</span>
              <button className="scr-icon-btn" onClick={() => setRedoFails(null)} aria-label="닫기"><X size={14} /></button>
            </div>
            <div className="scr-modal-body scr-redo-pick-body">
              <div className="scr-redo-fail-note">
                {redoFails.length >= redoTotal
                  ? `고른 ${redoTotal}건을 모두 처리하지 못했어요 — 그대로 두었어요.`
                  : `${redoTotal - redoFails.length}건은 서버가 처리했어요. 아래 ${redoFails.length}건은 그대로 두었어요.`}
              </div>
              <div className="scr-redo-pick-list scr-feed-rows">
                {redoFails.map((f) => {
                  const g = failGames.current.get(f.id);
                  return (
                    <ListRow
                      key={f.id}
                      className="scr-feed-row-game scr-gm"
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
                  void runBatch(again, false);
                }}
              >
                실패한 {redoFails.length}건 다시 분석
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {batchMounted && createPortal(
        <div className="scr-modal-overlay" style={batchOpen ? undefined : { display: "none" }}>
          <div className="scr-modal scr-modal-md scr-gman-batch" onClick={(e) => e.stopPropagation()}>
            <div className="scr-modal-head">
              <span>배치등록</span>
              <button className="scr-icon-btn" onClick={() => setBatchOpen(false)} aria-label="닫기"><X size={14} /></button>
            </div>
            <div className="scr-modal-body">
              <ReplayBatchButton inModal onSaved={() => { void load(); }} />
            </div>
          </div>
        </div>,
        document.body,
      )}
      {wpaOpen && <WpaDetailModal onClose={() => setWpaOpen(false)} />}
      {unhideOpen && <UnhideRequestsModal onClose={() => setUnhideOpen(false)} />}
    </div>
  );
}
