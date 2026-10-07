import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2, Pencil, X, Save, Maximize2, ChevronLeft, ChevronRight } from "lucide-react";
import { Spinner, LoadingMark } from "../../components/common/Feedback";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import LeagueCreateModal from "../../modals/LeagueCreateModal";
import LeagueTeamsPanel from "./LeagueTeamsPanel";
import LeagueBracket from "./LeagueBracket";
import LeaguePresentEdit from "./LeaguePresentEdit";
import LeaguePresentView from "./LeaguePresentView";
import { useAppStore } from "../../store/appStore";
import { useEditableFocused } from "../../hooks/useEditableFocused";
import { isAdminRole } from "../../constants/roles";
import { api } from "../../api/client";
import { cx } from "../../utils/format";
import { navigateTo, parseRoute, pathOf, wasPushed } from "../../utils/route";
import type { League, LeagueListItem, LeagueMode, LeagueStatus } from "../../types";

const MODE_LABEL: Record<LeagueMode, string> = { team: "팀리그", individual: "개인리그" };

function idOfRoute(): number | null {
  const raw = parseRoute().item;
  const n = raw === null ? NaN : Number(raw);
  return Number.isInteger(n) ? n : null;
}
const STATUS_LABEL: Record<LeagueStatus, string> = { setup: "준비중", active: "진행중", completed: "완료" };

export default function LeagueScreen() {
  const user = useAppStore((s) => s.user);
  const isAdmin = isAdminRole(user?.roles ?? []);
  const fabHidden = useEditableFocused();
  const [editMode, setEditMode] = useState(false);
  const canEdit = isAdmin && editMode;
  const [leagues, setLeagues] = useState<LeagueListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(() => idOfRoute());
  const [league, setLeague] = useState<League | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LeagueListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [confirmCloseEdit, setConfirmCloseEdit] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    const onPop = () => setSelectedId(idOfRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openLeague = (id: number) => {
    navigateTo(pathOf({ screen: "leagues", item: String(id) }), { search: window.location.search, notify: false });
    setSelectedId(id);
  };
  const goList = () => {
    if (editMode && dirtyCount > 0) { setConfirmLeave(true); return; }
    leaveToList();
  };
  const leaveToList = () => {
    setConfirmLeave(false);
    if (wasPushed()) { window.history.back(); return; }
    navigateTo(pathOf({ screen: "leagues" }), { search: window.location.search, notify: false });
    setSelectedId(null);
  };

  const loadList = () => {
    setLoadingList(true);
    setError("");
    api.getLeagues()
      .then(setLeagues)
      .catch((e) => setError(e instanceof Error ? e.message : "리그 목록을 불러오지 못했어요."))
      .finally(() => setLoadingList(false));
  };
  useEffect(loadList, []);

  useEffect(() => {
    setEditMode(false);
    setPresenting(false);
    setViewing(false);
    if (selectedId === null) { setLeague(null); return; }
    setLoadingDetail(true);
    api.getLeague(selectedId)
      .then(setLeague)
      .catch((e) => setError(e instanceof Error ? e.message : "리그 정보를 불러오지 못했어요."))
      .finally(() => setLoadingDetail(false));
  }, [selectedId]);

  const saversRef = useRef<Record<string, { dirty: boolean; commit: () => Promise<League> }>>({});
  const [dirtyCount, setDirtyCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const recountDirty = () => setDirtyCount(
    Object.values(saversRef.current).filter((e) => e.dirty).length,
  );
  const registerTeamsSave = useCallback(
    (entry: { dirty: boolean; commit: () => Promise<League> } | null) => {
      if (entry) saversRef.current.teams = entry; else delete saversRef.current.teams;
      recountDirty();
    }, [],
  );
  const registerBracketSave = useCallback(
    (entry: { dirty: boolean; commit: () => Promise<League> } | null) => {
      if (entry) saversRef.current.bracket = entry; else delete saversRef.current.bracket;
      recountDirty();
    }, [],
  );
  const saveAll = async () => {
    setError("");
    setSaving(true);
    try {
      let latest: League | null = null;
      for (const key of ["teams", "bracket"] as const) {
        const entry = saversRef.current[key];
        if (entry?.dirty) latest = await entry.commit();
      }
      if (latest) handleLeagueUpdated(latest);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreated = (created: League) => {
    setLeagues((prev) => [
      { id: created.id, name: created.name, mode: created.mode, status: created.status, teamCount: created.teams.length },
      ...prev,
    ]);
    openLeague(created.id);
  };

  const handleLeagueUpdated = (updated: League) => {
    setLeague(updated);
    setLeagues((prev) => prev.map((l) => (
      l.id === updated.id
        ? { id: updated.id, name: updated.name, mode: updated.mode, status: updated.status, teamCount: updated.teams.length }
        : l
    )));
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      await api.deleteLeague(deleteTarget.id);
      setLeagues((prev) => prev.filter((l) => l.id !== deleteTarget.id));
      setDeleteTarget(null);
      if (selectedId === deleteTarget.id) leaveToList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "리그를 삭제하지 못했어요.");
    } finally {
      setDeleting(false);
    }
  };

  const shownStatus: LeagueStatus = league?.status ?? "setup";

  return (
    <div className="scr-screen scr-league-screen">
      {selectedId === null ? (
        <div className="scr-v2-toolbar">
          <div className="scr-v2-toolbar-title-row">
            <h1 className="scr-title scr-v2-toolbar-title">리그</h1>
          </div>
        </div>
      ) : (
        <div className="scr-v2-toolbar scr-v2-toolbar-crumb">
          <div className="scr-v2-toolbar-title-row scr-crumb">
            <button type="button" className="scr-crumb-back" onClick={goList}>
              <ChevronLeft size={14} />
              <span>리그</span>
            </button>
            <h1 className="scr-title scr-crumb-title">{league?.name ?? ""}</h1>
          </div>
        </div>
      )}

      {error && <div className="scr-err">{error}</div>}

      {isAdmin && selectedId === null && (
        <div className={cx("scr-activity-add-fab-wrap scr-activity-add-wrap", fabHidden && "scr-activity-add-fab-wrap-hidden")}>
          <button type="button" className="scr-activity-add-fab scr-circle-btn scr-lighting-color-glass" onClick={() => setCreating(true)}>
            생성
          </button>
        </div>
      )}

      {selectedId === null ? (
        loadingList ? <LoadingMark />
          : leagues.length === 0 ? <div className="scr-empty">리그가 없어요</div>
          : (
            <div className="scr-league-list">
              {leagues.map((l) => (
                <button
                  key={l.id} type="button" className="scr-league-row"
                  onClick={() => openLeague(l.id)}
                >
                  <span className="scr-league-row-name">{l.name}</span>
                  <span className="scr-league-row-meta">
                    {MODE_LABEL[l.mode]} · {l.teamCount}{l.mode === "individual" ? "명" : "팀"}
                  </span>
                  <span className={cx("scr-league-status-pill", `scr-league-status-${l.status}`)}>
                    {STATUS_LABEL[l.status]}
                  </span>
                  <ChevronRight size={14} className="scr-league-row-go" />
                </button>
              ))}
            </div>
          )
      ) : loadingDetail || !league ? (
        <LoadingMark />
      ) : (
        <div className="scr-league-summary-card">
          <div className="scr-league-summary-row">
            <span className={cx("scr-league-status-pill", `scr-league-status-${shownStatus}`)}>
              {STATUS_LABEL[shownStatus]}
            </span>
          </div>

          {(isAdmin || league.matches.length > 0) && (
            <div className="scr-league-btn-row">
              {!editMode ? (
                <>
                  {league.matches.length > 0 && (
                    <button
                      type="button" className="scr-icon-btn"
                      onClick={() => setViewing(true)}
                      aria-label="전체화면으로 보기" title="전체화면으로 보기"
                    >
                      <Maximize2 size={15} />
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button" className="scr-icon-btn"
                      onClick={() => setEditMode(true)}
                      aria-label="수정" title="수정"
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button" className="scr-icon-btn scr-league-save-btn"
                    onClick={saveAll} disabled={saving || dirtyCount === 0}
                    aria-label="저장" title={dirtyCount === 0 ? "바뀐 게 없어요" : "저장"}
                  >
                    {saving ? <Spinner size={14} /> : <Save size={15} />}
                  </button>
                  <button
                    type="button" className="scr-icon-btn"
                    onClick={() => setPresenting(true)}
                    aria-label="전체화면으로 구성" title="전체화면으로 구성"
                  >
                    <Maximize2 size={15} />
                  </button>
                  <button
                    type="button" className="scr-icon-btn"
                    onClick={() => (dirtyCount > 0 ? setConfirmCloseEdit(true) : setEditMode(false))}
                    aria-label="수정 닫기" title="수정 닫기"
                  >
                    <X size={16} />
                  </button>
                  <button
                    type="button" className="scr-icon-btn scr-icon-btn-danger"
                    onClick={() => setDeleteTarget(leagues.find((l) => l.id === league.id) ?? null)}
                    aria-label="리그 삭제" title="리그 삭제"
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
          )}

          <div className="scr-league-summary-meta">
            <span>{MODE_LABEL[league.mode]}</span>
            <span>
              {league.teams.length}{league.mode === "individual" ? "명" : "팀"}
              {league.drawSize ? ` · 대진표 ${league.matches.length}경기` : ""}
            </span>
          </div>
          {canEdit && (
            <LeagueTeamsPanel league={league} onRegisterSave={registerTeamsSave} />
          )}
          <LeagueBracket
            league={league} canEdit={canEdit}
            onUpdated={handleLeagueUpdated} onRegisterSave={registerBracketSave}
          />
        </div>
      )}

      {viewing && league && (
        <LeaguePresentView
          league={league} onUpdated={handleLeagueUpdated} onClose={() => setViewing(false)}
        />
      )}
      {presenting && league && (
        <LeaguePresentEdit
          league={league} onUpdated={handleLeagueUpdated} onClose={() => setPresenting(false)}
        />
      )}
      {creating && <LeagueCreateModal onClose={() => setCreating(false)} onCreated={handleCreated} />}
      {confirmLeave && (
        <ConfirmDialog
          title="저장하지 않고 나가기"
          message={"아직 저장하지 않은 구성이 있어요. 목록으로 나가면 사라집니다.\n계속할까요?"}
          confirmLabel="저장 안 하고 나가기"
          onConfirm={leaveToList}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
      {confirmCloseEdit && (
        <ConfirmDialog
          title="저장하지 않고 닫기"
          message={"아직 저장하지 않은 구성이 있어요. 닫으면 사라집니다.\n계속할까요?"}
          confirmLabel="저장 안 하고 닫기"
          onConfirm={() => { setConfirmCloseEdit(false); setEditMode(false); }}
          onCancel={() => setConfirmCloseEdit(false)}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="리그 삭제"
          message={`"${deleteTarget.name}" 리그를 삭제할까요? 팀/대진표/결과가 모두 함께 삭제되고 되돌릴 수 없어요.`}
          confirmLabel={deleting ? "삭제 중..." : "삭제"}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
