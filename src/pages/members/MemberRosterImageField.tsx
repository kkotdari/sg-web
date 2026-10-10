import { useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import PhotoViewer from "../../components/common/PhotoViewer";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { Spinner } from "../../components/common/Feedback";
import { useAppStore } from "../../store/appStore";
import type { Member } from "../../types";
import { imgSrc } from "../../utils/imgSrc";

const ACCEPT = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("파일을 읽지 못했어요."));
    reader.readAsDataURL(file);
  });
}

export default function MemberRosterImageField({ member }: { member: Member }) {
  const setMemberRosterImage = useAppStore((s) => s.setMemberRosterImage);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [viewing, setViewing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = async (image: string | null) => {
    setErr("");
    setBusy(true);
    try {
      await setMemberRosterImage(member.id, image);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "로스터 이미지를 저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!ACCEPT.includes(f.type)) { setErr("PNG·JPG·WebP 이미지만 올릴 수 있어요."); return; }
    if (f.size > MAX_BYTES) { setErr("이미지가 너무 커요(최대 8MB)."); return; }
    try {
      await run(await readAsDataUrl(f));
    } catch (x) {
      setErr(x instanceof Error ? x.message : "파일을 읽지 못했어요.");
    }
  };

  const src = member.rosterImage;
  return (
    <div className="scr-member-section">
      <div className="scr-member-gameids-head">
        <span>로스터 이미지</span>
        <span className="scr-member-roster-actions">
          <button
            type="button" className="scr-compact-rect-btn"
            onClick={() => fileRef.current?.click()} disabled={busy}
          >
            {busy ? <Spinner size={12} /> : <ImagePlus size={13} />} {src ? "변경" : "업로드"}
          </button>
          {src && (
            <button
              type="button" className="scr-icon-btn is-danger"
              onClick={() => setConfirmDelete(true)} disabled={busy}
              aria-label="로스터 이미지 삭제" title="로스터 이미지 삭제"
            >
              <Trash2 size={13} />
            </button>
          )}
        </span>
        <input ref={fileRef} type="file" accept={ACCEPT.join(",")} hidden onChange={handleFile} />
      </div>
      {src ? (
        <button
          type="button" className="scr-member-roster-thumb"
          onClick={() => setViewing(true)} aria-label={`${member.nickname} 로스터 이미지 크게 보기`}
        >
          <img src={imgSrc(src)} alt="" loading="lazy" />
        </button>
      ) : (
        <button
          type="button" className="scr-member-roster-thumb scr-member-roster-thumb-empty"
          onClick={() => fileRef.current?.click()} disabled={busy}
        >
          <ImagePlus size={18} />
          <span>800 × 500 규격 이미지를 올려 주세요</span>
        </button>
      )}
      {err && <div className="scr-err">{err}</div>}

      {viewing && src && (
        <PhotoViewer src={src} alt={`${member.nickname} 로스터 이미지`} onClose={() => setViewing(false)} />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="로스터 이미지 삭제"
          message={`${member.nickname}의 로스터 이미지를 지울까요? 되돌릴 수 없어요.`}
          confirmLabel="삭제"
          onConfirm={() => { setConfirmDelete(false); void run(null); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
