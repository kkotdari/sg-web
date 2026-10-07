import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Save, X } from "lucide-react";
import { Spinner } from "../../components/common/Feedback";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import LeagueTeamsPanel from "./LeagueTeamsPanel";
import LeagueBracket from "./LeagueBracket";
import { useLockBodyScroll } from "../../utils/bodyScrollLock";
import { useDocumentFullscreen } from "../../hooks/useDocumentFullscreen";
import { cx } from "../../utils/format";
import type { League } from "../../types";

type Tab = "pool" | "teams" | "bracket";

const TABS: { key: Tab; label: string }[] = [
  { key: "pool", label: "참가 선수 구성" },
  { key: "teams", label: "팀 구성" },
  { key: "bracket", label: "대진표 구성" },
];

export default function LeaguePresentEdit({ league, onUpdated, onClose }: {
  league: League;
  onUpdated: (league: League) => void;
  onClose: () => void;
}) {
  useLockBodyScroll();
  const [tab, setTab] = useState<Tab>("pool");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const saversRef = useRef<Record<string, { dirty: boolean; commit: () => Promise<League> }>>({});
  const [dirtyCount, setDirtyCount] = useState(0);
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
    setErr("");
    setSaving(true);
    try {
      let latest: League | null = null;
      for (const key of ["teams", "bracket"] as const) {
        const entry = saversRef.current[key];
        if (entry?.dirty) latest = await entry.commit();
      }
      if (latest) onUpdated(latest);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  };

  const dirtyRef = useRef(dirtyCount);
  dirtyRef.current = dirtyCount;
  const [confirmClose, setConfirmClose] = useState(false);
  const tryClose = useCallback(() => {
    if (dirtyRef.current > 0) { setConfirmClose(true); return; }
    onClose();
  }, [onClose]);
  const fs = useDocumentFullscreen(tryClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") tryClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tryClose]);

  return createPortal(
    <div className="scr-league-present" role="dialog" aria-modal="true" aria-label="리그 구성">
      <div className="scr-league-present-head">
        <span className="scr-league-present-name">{league.name}</span>
        <nav className="scr-league-present-tabs">
          {TABS.map((t, i) => (
            <button
              key={t.key} type="button"
              className={cx("scr-league-present-tab", tab === t.key && "scr-league-present-tab-on")}
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
            >
              <span className="scr-league-present-tab-no">{i + 1}</span>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="scr-league-present-actions">
          {fs.supported && !fs.isFullscreen && (
            <button type="button" className="scr-icon-btn" onClick={fs.enter} aria-label="전체화면" title="전체화면">
              <Maximize2 size={18} />
            </button>
          )}
          <button
            type="button" className="scr-rect-btn"
            onClick={saveAll} disabled={saving || dirtyCount === 0}
            title={dirtyCount === 0 ? "바뀐 게 없어요" : "저장"}
          >
            {saving ? <Spinner size={14} /> : <Save size={15} />} 저장
          </button>
          <button type="button" className="scr-icon-btn" onClick={tryClose} aria-label="닫기" title="닫기 (Esc)">
            <X size={20} />
          </button>
        </div>
      </div>

      {err && <div className="scr-err scr-league-present-err">{err}</div>}

      <div className="scr-league-present-body scr-scroll">
        <div className="scr-league-present-pane" hidden={tab === "bracket"}>
          <LeagueTeamsPanel
            league={league} onRegisterSave={registerTeamsSave}
            section={tab === "pool" ? "pool" : "teams"} large
          />
        </div>
        <div className="scr-league-present-pane" hidden={tab !== "bracket"}>
          <LeagueBracket
            league={league} canEdit onUpdated={onUpdated} onRegisterSave={registerBracketSave} present
          />
        </div>
      </div>

      {confirmClose && (
        <ConfirmDialog
          title="저장하지 않고 닫기"
          message={"아직 저장하지 않은 구성이 있어요. 닫으면 사라집니다.\n계속할까요?"}
          confirmLabel="저장 안 하고 닫기"
          onConfirm={onClose}
          onCancel={() => setConfirmClose(false)}
        />
      )}
    </div>,
    document.body,
  );
}
