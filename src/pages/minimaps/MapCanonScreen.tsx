import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, Link2Off, ImageDown, Pencil, Plus } from "lucide-react";
import { ReplayMapCanvas } from "scplay";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import Select from "../../components/common/Select";
import { Spinner } from "../../components/common/Feedback";
import { api } from "../../api/client";
import { showAlert } from "../../components/common/AlertDialog";
import { showToast } from "../../components/common/Toast";
import { useReplayMap } from "scplay";
import { cleanMapName } from "../../utils/mapName";
import { downloadMinimapPng, renderMinimapCanvas } from "../../utils/minimapExport";
import type { ReplayMapGrid } from "../../utils/replayParser";
import { cx } from "../../utils/format";
import type { MapCanon, MapCatalog, MapCatalogEntry } from "../../types";

const mapLabel = (m: MapCatalogEntry): string => cleanMapName(m.name ?? "") || "(이름 없음)";

function GridThumb({ hash }: { hash: string }) {
  const grid = useReplayMap(hash);
  return (
    <span className="scr-minimap-thumb scr-minimap-thumb-grid">
      {grid ? <ReplayMapCanvas grid={grid} /> : null}
    </span>
  );
}

function MapPngButton({
  map, disabled, onView,
}: { map: MapCatalogEntry; disabled: boolean; onView: (grid: ReplayMapGrid) => void }) {
  const grid = useReplayMap(map.hash);
  return (
    <button
      type="button" className="scr-icon-btn"
      disabled={disabled || !grid}
      aria-label={`${mapLabel(map)} 지도 그림 보기`}
      title={grid ? "지도 그림 보기(2048px)" : "맵 격자를 받는 중"}
      onClick={() => { if (grid) onView(grid); }}
    >
      <ImageDown size={14} />
    </button>
  );
}

function MapImageModal({
  grid, title, onClose,
}: { grid: ReplayMapGrid; title: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let dead = false;
    let made = "";
    renderMinimapCanvas(grid)
      .then((cv) => new Promise<Blob | null>((res) => cv.toBlob(res, "image/png")))
      .then((blob) => {
        if (dead || !blob) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch((e) => { if (!dead) setErr(e instanceof Error ? e.message : "그림을 못 만들었어요."); });
    return () => { dead = true; if (made) URL.revokeObjectURL(made); };
  }, [grid]);
  return createPortal(
    <div className="scr-modal-overlay">
      <div className="scr-modal scr-mapimg-modal" role="dialog" aria-label={`${title} 지도 그림`}>
        <div className="scr-modal-head">
          <span>{title}</span>
          <span className="scr-minimap-map-meta">
            {grid.width}×{grid.height} 타일 · {grid.width * 16}px
          </span>
        </div>
        <div className="scr-mapimg-body">
          {err ? <div className="scr-err" role="alert">{err}</div>
            : url ? <img className="scr-mapimg" src={url} alt={`${title} 지도`} />
              : <Spinner />}
        </div>
        <div className="scr-form-actions">
          <button type="button" className="scr-rect-btn scr-lighting-color" onClick={onClose}>닫기</button>
          <button
            type="button" className="scr-rect-btn scr-lighting-color-fill" disabled={!url}
            onClick={() => { if (url) void downloadMinimapPng(grid, title); }}
          >
            PNG 내려받기
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function mapMeta(map: MapCatalogEntry): string {
  const shared = map.sharedMatches ?? 0;
  return [`${map.width}×${map.height}`, `${map.matches}경기`,
    ...(shared > 0 ? [`외부 공개 ${shared}판`] : [])].join(" · ");
}

function UnmappedRow({
  map, picked, disabled, onToggle, onView,
}: {
  map: MapCatalogEntry; picked: boolean; disabled: boolean; onToggle: () => void;
  onView: (grid: ReplayMapGrid) => void;
}) {
  return (
    <label className={cx("scr-minimap-map-row", picked && "scr-minimap-map-row-on")}>
      <input type="checkbox" checked={picked} onChange={onToggle} disabled={disabled} />
      <GridThumb hash={map.hash} />
      <span className="scr-minimap-map-text">
        <span className="scr-minimap-map-name">{mapLabel(map)}</span>
        <span className="scr-minimap-map-meta">{mapMeta(map)}</span>
      </span>
      <MapPngButton map={map} disabled={disabled} onView={onView} />
    </label>
  );
}

function MappedRow({
  map, disabled, onUnlink, onView,
}: {
  map: MapCatalogEntry; disabled: boolean; onUnlink: () => void;
  onView: (grid: ReplayMapGrid) => void;
}) {
  return (
    <div className="scr-minimap-map-row scr-minimap-map-row-static">
      <GridThumb hash={map.hash} />
      <span className="scr-minimap-map-text">
        <span className="scr-minimap-map-name">{mapLabel(map)}</span>
        <span className="scr-minimap-map-meta">{mapMeta(map)}</span>
      </span>
      <MapPngButton map={map} disabled={disabled} onView={onView} />
      <button
        type="button" className="scr-icon-btn" disabled={disabled}
        aria-label={`${mapLabel(map)} 묶음 해제`} title="이 대표맵에서 떼어 내기"
        onClick={onUnlink}
      >
        <Link2Off size={14} />
      </button>
    </div>
  );
}

export default function MapCanonScreen() {
  const [catalog, setCatalog] = useState<MapCatalog | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<string>("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<MapCanon | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<MapCanon | null>(null);
  const [confirmOrphan, setConfirmOrphan] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [mapView, setMapView] = useState<{ grid: ReplayMapGrid; title: string } | null>(null);

  const reload = async () => setCatalog(await api.getMapCatalog());
  useEffect(() => { void reload(); }, []);

  const maps = catalog?.maps ?? [];
  const canons = catalog?.canons ?? [];
  const unmapped = useMemo(
    () => maps.filter((m) => m.canonId === null).sort((a, b) => b.matches - a.matches),
    [maps],
  );
  const orphans = useMemo(() => maps.filter((m) => m.orphan), [maps]);
  const byCanon = useMemo(() => {
    const out = new Map<number, MapCatalogEntry[]>();
    for (const m of maps) {
      if (m.canonId === null) continue;
      const list = out.get(m.canonId) ?? [];
      list.push(m);
      out.set(m.canonId, list);
    }
    return out;
  }, [maps]);

  const allPicked = unmapped.length > 0 && unmapped.every((m) => picked.has(m.hash));
  const toggle = (hash: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(hash)) next.delete(hash); else next.add(hash);
    return next;
  });
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(unmapped.map((m) => m.hash)));

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await reload(); }
    catch (e) { showAlert(e instanceof Error ? e.message : "실패했어요."); }
    finally { setBusy(false); }
  };

  const submitName = () => {
    const trimmed = name.trim();
    if (!trimmed) { showAlert("대표맵 이름을 적어 주세요."); return; }
    void run(async () => {
      await api.createMapCanon({ name: trimmed });
      setName("");
      setAddOpen(false);
    });
  };

  const submitEdit = () => {
    if (!editing) return;
    const trimmed = editName.trim();
    if (!trimmed || trimmed === editing.name) { setEditing(null); return; }
    const id = editing.id;
    void run(async () => {
      await api.updateMapCanon(id, { name: trimmed });
      setEditing(null);
    });
  };

  const assign = () => {
    const id = Number(target);
    if (!id) { showAlert("붙일 대표맵을 골라 주세요."); return; }
    void run(async () => {
      await api.assignMapCanon(id, [...picked]);
      setPicked(new Set());
    });
  };

  return (
    <div className="scr-screen scr-minimap-screen">
      <div className="scr-minimap-panel">
        <div className="scr-minimap-panel-head">
          <span className="scr-notice-edit-label">안 묶인 맵 {unmapped.length}개</span>
          {orphans.length > 0 && (
            <button
              type="button" className="scr-rect-btn scr-lighting-color" disabled={busy}
              onClick={() => setConfirmOrphan(true)}
            >
              안 쓰는 맵 {orphans.length}개 정리
            </button>
          )}
          {unmapped.length > 0 && (
            <label className="scr-minimap-all">
              <input type="checkbox" checked={allPicked} onChange={toggleAll} disabled={busy} />
              전체 선택
            </label>
          )}
        </div>
        <div className="scr-minimap-maps">
          {catalog === null && <Spinner />}
          {catalog !== null && unmapped.length === 0 && (
            <div className="scr-minimap-empty">
              {maps.length === 0
                ? "아직 등록된 맵이 없어요 — 리플레이를 등록하면 여기 쌓입니다."
                : "모든 맵이 대표맵에 묶여 있어요."}
            </div>
          )}
          {unmapped.map((m) => (
            <UnmappedRow
              key={m.hash} map={m} picked={picked.has(m.hash)} disabled={busy}
              onToggle={() => toggle(m.hash)}
              onView={(g) => setMapView({ grid: g, title: mapLabel(m) })}
            />
          ))}
        </div>
        {picked.size > 0 && (
          <div className="scr-minimap-assign">
            <Select
              value={target} onChange={setTarget} disabled={busy}
              options={[
                { value: "", label: "붙일 대표맵 고르기" },
                ...canons.map((c) => ({ value: String(c.id), label: c.name })),
              ]}
            />
            <button type="button" className="scr-rect-btn scr-lighting-color-fill" disabled={busy} onClick={assign}>
              {picked.size}개 묶기
            </button>
          </div>
        )}
      </div>

      <div className="scr-minimap-panel">
        <div className="scr-minimap-panel-head">
          <span className="scr-notice-edit-label">대표맵 {canons.length}개</span>
          <button
            type="button" className="scr-rect-btn scr-lighting-color" disabled={busy}
            onClick={() => setAddOpen((v) => !v)} aria-expanded={addOpen}
          >
            <Plus size={12} /> 추가
          </button>
        </div>
        {(addOpen || (catalog !== null && canons.length === 0)) && (
          <div className="scr-form-actions">
            <input
              className="scr-input" value={name} disabled={busy}
              placeholder="예) 빠른무한 · 투혼"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitName(); }}
            />
            <button type="button" className="scr-rect-btn scr-lighting-color-fill" disabled={busy} onClick={submitName}>
              만들기
            </button>
          </div>
        )}
        {catalog !== null && canons.length === 0 && (
          <div className="scr-minimap-empty">대표맵이 없어요</div>
        )}
        {canons.map((c) => {
          const mine = byCanon.get(c.id) ?? [];
          return (
            <div key={c.id} className="scr-minimap-group">
              <div className="scr-minimap-image-row">
                {editing?.id === c.id ? (
                  <input
                    className="scr-input scr-minimap-name-input"
                    value={editName} disabled={busy} autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitEdit();
                      if (e.key === "Escape") setEditing(null);
                    }}
                    onBlur={submitEdit}
                    aria-label={`${c.name} 이름 고치기`}
                  />
                ) : (
                <span className="scr-minimap-map-text">
                  <span className="scr-minimap-map-name">{c.name}</span>
                  <span className="scr-minimap-map-meta">
                    맵 {mine.length}개 · {mine.reduce((a, m) => a + m.matches, 0)}경기
                  </span>
                </span>
                )}
                {editing?.id !== c.id && (
                  <button
                    type="button" className="scr-icon-btn" disabled={busy}
                    aria-label={`${c.name} 이름 고치기`} title="이름 고치기"
                    onClick={() => { setEditing(c); setEditName(c.name); }}
                  >
                    <Pencil size={14} />
                  </button>
                )}
                <button
                  type="button" className="scr-icon-btn" disabled={busy}
                  aria-label={`${c.name} 삭제`} title="대표맵 삭제"
                  onClick={() => setConfirmDel(c)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="scr-minimap-maps">
                {mine.length === 0 && <div className="scr-minimap-empty">맵이 없어요</div>}
                {mine.map((m) => (
                  <MappedRow
                    key={m.hash} map={m} disabled={busy}
                    onUnlink={() => void run(() => api.assignMapCanon(null, [m.hash]))}
                    onView={(g) => setMapView({ grid: g, title: mapLabel(m) })}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {confirmOrphan && (
        <ConfirmDialog
          title="안 쓰는 맵을 지울까요?"
          message={`클럽 경기도 외부 공개도 쓰지 않는 맵 ${orphans.length}개를 지웁니다.`
            + " 되돌릴 수 없어요 — 지운 뒤 그 맵의 경기가 다시 등록되면 격자는 새로 쌓입니다."}
          confirmLabel="지우기"
          onConfirm={() => {
            setConfirmOrphan(false);
            void run(async () => {
              const { deleted } = await api.deleteOrphanMaps();
              showToast(`${deleted}개를 지웠어요.`, { kind: "ok" });
            });
          }}
          onCancel={() => setConfirmOrphan(false)}
        />
      )}

      {confirmDel && (
        <ConfirmDialog
          title="대표맵을 지울까요?"
          message={`"${confirmDel.name}"을 지우면 묶여 있던 맵들이 다시 안 묶인 상태가 됩니다.`}
          confirmLabel="지우기"
          onConfirm={() => {
            const id = confirmDel.id;
            setConfirmDel(null);
            void run(() => api.deleteMapCanon(id));
          }}
          onCancel={() => setConfirmDel(null)}
        />
      )}

      {mapView && createPortal(
        <MapImageModal grid={mapView.grid} title={mapView.title} onClose={() => setMapView(null)} />,
        document.body,
      )}
    </div>
  );
}
