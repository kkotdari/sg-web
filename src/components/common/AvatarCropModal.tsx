import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import ModalHash from "../../utils/modalHash";
import { createPortal } from "react-dom";
import { readAsDataUrl, loadImage, MAX_SIDE, JPEG_QUALITY } from "../../utils/image";
import { useLockBodyScroll } from "../../utils/bodyScrollLock";

interface AvatarCropModalProps {
  file: File;
  onCancel: () => void;
  onDone: (dataUrl: string) => void;
}

const VIEW = 260;

function clampPos(x: number, y: number, scale: number, img: HTMLImageElement) {
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  const minX = Math.min(0, VIEW - w);
  const minY = Math.min(0, VIEW - h);
  return { x: Math.min(0, Math.max(minX, x)), y: Math.min(0, Math.max(minY, y)) };
}

export default function AvatarCropModal({ file, onCancel, onDone }: AvatarCropModalProps) {
  useLockBodyScroll();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [err, setErr] = useState("");
  const [minScale, setMinScale] = useState(1);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const dataUrl = await readAsDataUrl(file);
        const image = await loadImage(dataUrl);
        if (cancelled) return;
        const fit = VIEW / Math.min(image.naturalWidth, image.naturalHeight);
        setImg(image);
        setMinScale(fit);
        setScale(fit);
        setPos({ x: (VIEW - image.naturalWidth * fit) / 2, y: (VIEW - image.naturalHeight * fit) / 2 });
      } catch {
        if (!cancelled) setErr("이미지를 불러오지 못했어요.");
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!img) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !img) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const next = clampPos(dragRef.current.origX + dx, dragRef.current.origY + dy, scale, img);
    setPos(next);
  };
  const onPointerUp = () => { dragRef.current = null; };

  const onZoom = (next: number) => {
    if (!img) return;
    const center = VIEW / 2;
    const ratio = next / scale;
    const nx = center - (center - pos.x) * ratio;
    const ny = center - (center - pos.y) * ratio;
    setScale(next);
    setPos(clampPos(nx, ny, next, img));
  };

  const confirm = () => {
    if (!img) return;
    const sSide = VIEW / scale;
    const sx = -pos.x / scale;
    const sy = -pos.y / scale;
    const canvas = document.createElement("canvas");
    canvas.width = MAX_SIDE;
    canvas.height = MAX_SIDE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sSide, sSide, 0, 0, MAX_SIDE, MAX_SIDE);
    onDone(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
  };

  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash="avatar-crop" onClose={onCancel} />
      <div className="scr-modal scr-modal-sm scr-modal-crop">
        <div className="scr-modal-head">
          <span>사진 위치 조절</span>
        </div>
        <div className="scr-modal-body">
          {err ? (
            <div className="scr-err">{err}</div>
          ) : (
            <>
              <div
                className="scr-crop-frame"
                style={{ width: VIEW, height: VIEW }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
              >
                {img && (
                  <img
                    src={img.src}
                    alt=""
                    draggable={false}
                    className="scr-crop-img"
                    style={{
                      width: img.naturalWidth * scale,
                      height: img.naturalHeight * scale,
                      transform: `translate(${pos.x}px, ${pos.y}px)`,
                    }}
                  />
                )}
                <div className="scr-crop-ring" />
              </div>
              <input
                type="range"
                className="scr-crop-zoom"
                min={minScale}
                max={minScale * 3}
                step={0.01}
                value={scale}
                onChange={(e) => onZoom(Number(e.target.value))}
                disabled={!img}
                aria-label="확대/축소"
              />
            </>
          )}
        </div>
        <div className="scr-form-actions">
          <button type="button" className="scr-rect-btn" onClick={onCancel}>취소</button>
          <button type="button" className="scr-rect-btn is-fill" onClick={confirm} disabled={!img}>완료</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
