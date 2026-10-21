import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import ModalHash from "../../utils/modalHash";
import { useLockBodyScroll } from "../../utils/bodyScrollLock";

/* 업로더 설치(2026-10-21, 요청: "메뉴 중 앱 설치를 원래 기능 제거하고 그 자리를 업로더 설치로 · 파일 다운로드 팝업 열기") —
   PC 앱(sg-uploader) 내려받기 고리. 파일은 public/uploader/download(릴리스 때 함께 올린다) · 판 번호는 update.json. 쓰는 PC 쪽을 맨 위에. */
const FILES = [
  { key: "win", os: "Windows", label: "Windows", file: "sg-uploader-setup.exe" },
  { key: "arm", os: "Mac", label: "Mac (Apple 칩 · M1 이후)", file: "sg-uploader-arm64.dmg" },
  { key: "x64", os: "Mac", label: "Mac (Intel)", file: "sg-uploader-x64.dmg" },
] as const;

export default function UploaderInstallModal({ onClose }: { onClose: () => void }) {
  useLockBodyScroll(true, onClose);
  const [version, setVersion] = useState("");
  useEffect(() => {
    let alive = true;
    fetch("/uploader/update.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { version?: string } | null) => { if (alive && j?.version) setVersion(j.version); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const mine = /Mac/i.test(navigator.userAgent) ? "Mac" : "Windows";
  const files = [...FILES].sort((a, b) => Number(b.os === mine) - Number(a.os === mine));
  return createPortal(
    <div className="scr-modal-overlay" onClick={onClose}>
      <ModalHash hash="uploader-install" onClose={onClose} />
      <div className="scr-modal scr-modal-sm scr-uploader-install-modal" onClick={(e) => e.stopPropagation()}>
        <div className="scr-modal-head">
          <span>업로더 설치{version && <i className="scr-gc-sub">v{version}</i>}</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>
        <div className="scr-modal-body">
          <p className="scr-install-guide-lead">
            PC 에 설치해 두면 스타 리플레이를 <b>자동으로 올려</b> 줘요. 쓰는 PC 에 맞는 파일을 내려받으세요.
          </p>
          <div className="scr-uploader-files">
            {files.map((f) => (
              <a key={f.key} className="scr-rect-btn is-secondary scr-uploader-file" href={`/uploader/download/${f.file}`} download>
                <Download size={14} />
                <span>{f.label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
