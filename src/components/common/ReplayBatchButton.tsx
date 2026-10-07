import { useRef, useState } from "react";
import { showAlert } from "./AlertDialog";
import { FileUp, FolderUp, X } from "lucide-react";
import { Spinner } from "./Feedback";
import ReplayReviewModal from "../../modals/ReplayReviewModal";
import { useAppStore } from "../../store/appStore";
import { buildReplayDrafts } from "../../utils/replayDraft";
import type { ReplayDraft } from "../../utils/replayDraft";

const CHUNK_SIZE = 50;

const MAX_MANUAL_DRAFTS = 500;

interface BatchTally {
  total: number;
  done: number;
  registered: number;
  merged: number;
  failed: number;
}

const EMPTY_TALLY: BatchTally = { total: 0, done: 0, registered: 0, merged: 0, failed: 0 };

export default function ReplayBatchButton() {
  const members = useAppStore((s) => s.members);

  const [tally, setTally] = useState<BatchTally>(EMPTY_TALLY);
  const [running, setRunning] = useState(false);
  const [pickedNote, setPickedNote] = useState("");
  const [manualDrafts, setManualDrafts] = useState<ReplayDraft[]>([]);
  const [dropped, setDropped] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);

  const abortRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const setDirInput = (el: HTMLInputElement | null) => {
    inputRef.current = el;
  };
  const openPicker = (mode: "file" | "dir") => {
    const el = inputRef.current;
    if (!el) return;
    if (mode === "dir") {
      el.setAttribute("webkitdirectory", "");
      el.setAttribute("directory", "");
      el.removeAttribute("accept");
    } else {
      el.removeAttribute("webkitdirectory");
      el.removeAttribute("directory");
      el.setAttribute("accept", ".rep,application/octet-stream");
    }
    el.click();
  };

  const [staged, setStaged] = useState<File[]>([]);
  const addFiles = (incoming: File[]) => {
    const reps = incoming.filter((f) => f.name.toLowerCase().endsWith(".rep"));
    if (reps.length === 0) {
      setPickedNote(`파일 ${incoming.length}개를 봤지만 리플레이(.rep)가 없어요.`);
      return;
    }
    setStaged((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}|${f.size}|${f.lastModified}`));
      const merged = [...prev];
      for (const f of reps) {
        const k = `${f.name}|${f.size}|${f.lastModified}`;
        if (seen.has(k)) continue;
        seen.add(k);
        merged.push(f);
      }
      setPickedNote("");
      return merged;
    });
  };

  const fileKey = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
  const dropStaged = (key: string) => {
    setStaged((prev) => prev.filter((f) => fileKey(f) !== key));
  };

  const runBatch = (fileList: FileList | null) => {
    const picked = fileList ? [...fileList] : [];
    if (inputRef.current) inputRef.current.value = "";
    if (picked.length === 0) {
      setPickedNote("고른 것이 없어요 (선택을 취소했거나 빈 폴더예요).");
      return;
    }
    addFiles(picked);
  };

  const executeBatch = async (files: File[]) => {
    abortRef.current = false;
    setRunning(true);
    setTally({ ...EMPTY_TALLY, total: files.length });
    setManualDrafts([]);
    setDropped(0);
    setStaged([]);
    setPickedNote("");

    const done: BatchTally = { ...EMPTY_TALLY, total: files.length };
    const record = (outcome: "registered" | "merged" | "failed") => {
      done.done += 1;
      done[outcome] += 1;
      setTally({ ...done });
    };

    try {
      for (let start = 0; start < files.length; start += CHUNK_SIZE) {
        if (abortRef.current) break;
        const chunk = files.slice(start, start + CHUNK_SIZE);

        let drafts;
        try {
          drafts = await buildReplayDrafts(chunk, members);
        } catch {
          chunk.forEach(() => record("failed"));
          continue;
        }

        for (const draft of drafts) {
          if (abortRef.current) break;
          record(draft.parseError ? "failed"
            : draft.excludeReason === "duplicate" ? "merged" : "registered");
          setManualDrafts((prev) => {
            if (prev.length >= MAX_MANUAL_DRAFTS) { setDropped((n) => n + 1); return prev; }
            return [...prev, draft];
          });
        }
      }
      const left = done.total - done.done;
      if (left > 0) window.alert(`배치를 중단했어요 (${left}개 남음).`);
      setReviewOpen(true);
    } catch (e) {
      showAlert(e instanceof Error ? `배치가 중단됐어요: ${e.message}` : "배치가 예기치 않게 중단됐어요.");
    } finally {
      setRunning(false);
    }
  };

  const pendingReview = !running && manualDrafts.length > 0 && !reviewOpen;

  const pct = tally.total > 0 ? Math.round((tally.done / tally.total) * 100) : 0;

  return (
    <section className="scr-adm-card scr-batch">
      <input
        ref={setDirInput}
        type="file"
        multiple
        hidden
        onChange={(e) => runBatch(e.target.files)}
      />
      <div className="scr-adm-card-head">
        <h2 className="scr-adm-card-title">배치등록</h2>
        {!running && staged.length > 0 && (
          <span className="scr-adm-card-meta">{staged.length}개 담김</span>
        )}
      </div>
      <p className="scr-adm-card-desc">
        리플레이를 골라 한 번에 읽어 옵니다. 폴더를 고르면 하위 폴더까지 훑어요.
        무엇을 등록할지는 다 읽은 뒤 뜨는 검토창에서 정합니다.
      </p>

      {running ? (
        <div className="scr-batch-run">
          <div className="scr-batch-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <span className="scr-batch-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="scr-batch-run-foot">
            <span className="scr-batch-run-count">
              <Spinner /> {tally.done} / {tally.total}
            </span>
            <button
              type="button"
              className="scr-btn scr-batch-stop"
              onClick={() => { abortRef.current = true; }}
            >
              중단
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="scr-batch-pick">
            <button type="button" className="scr-btn scr-batch-pick-btn" onClick={() => openPicker("file")}>
              <FileUp size={15} /> 파일 고르기
            </button>
            <button type="button" className="scr-btn scr-batch-pick-btn" onClick={() => openPicker("dir")}>
              <FolderUp size={15} /> 폴더 고르기
            </button>
          </div>

          {staged.length > 0 ? (
            <>
              <ul className="scr-batch-list">
                {staged.map((f) => {
                  const rel = f.webkitRelativePath || "";
                  const cut = rel.lastIndexOf("/");
                  const dir = cut > 0 ? rel.slice(0, cut + 1) : "";
                  return (
                  <li key={fileKey(f)} className="scr-batch-item">
                    {dir && <span className="scr-batch-item-dir">{dir}</span>}
                    <span className="scr-batch-item-name">{f.name}</span>
                    <span className="scr-batch-item-gap" />
                    <button
                      type="button"
                      className="scr-icon-btn scr-batch-item-drop"
                      aria-label={`${f.name} 빼기`}
                      onClick={() => dropStaged(fileKey(f))}
                    >
                      <X size={13} />
                    </button>
                  </li>
                  );
                })}
              </ul>
              <div className="scr-batch-foot">
                <button
                  type="button" className="scr-btn scr-btn-ghost scr-batch-clear"
                  onClick={() => { setStaged([]); setPickedNote(""); }}
                >
                  비우기
                </button>
                <button
                  type="button" className="scr-btn scr-btn-primary scr-batch-go"
                  onClick={() => { void executeBatch(staged); }}
                >
                  {staged.length}개 읽어 오기
                </button>
              </div>
            </>
          ) : (
            <p className="scr-batch-empty">{pickedNote || "리플레이가 없어요"}</p>
          )}
        </>
      )}

      {pendingReview && (
        <button
          type="button"
          className="scr-btn scr-btn-primary scr-batch-reopen"
          onClick={() => setReviewOpen(true)}
        >
          읽어 온 {manualDrafts.length}개 다시 열기
        </button>
      )}

      {reviewOpen && (
        <ReplayReviewModal
          drafts={manualDrafts}
          truncated={dropped > 0}
          droppedCount={dropped}
          onClose={() => setReviewOpen(false)}
          onSaved={() => setReviewOpen(false)}
          onRegistered={(fileName) => {
            setManualDrafts((prev) => prev.filter((d) => d.fileName !== fileName));
          }}
        />
      )}
    </section>
  );
}
