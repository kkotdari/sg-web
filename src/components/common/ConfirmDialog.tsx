import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { useLockBodyScroll } from "../../utils/bodyScrollLock";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  error?: string | null;
  className?: string;
}

export default function ConfirmDialog({
  title, message, confirmLabel = "확인", cancelLabel = "취소", onConfirm, onCancel,
  error = null, className,
}: ConfirmDialogProps) {
  useLockBodyScroll();
  return createPortal(
    <div className="scr-modal-overlay">
      <div className={`scr-modal scr-modal-sm scr-modal-confirm${className ? ` ${className}` : ""}`}>
        <div className="scr-confirm-head">
          <AlertTriangle size={18} className="scr-confirm-icon" />
          <span>{title}</span>
        </div>
        {message && <p className="scr-confirm-msg">{message}</p>}
        {error && <div className="scr-err" role="alert">{error}</div>}
        <div className="scr-form-actions">
          <button className="scr-btn scr-btn-ghost" onClick={onCancel}>{cancelLabel}</button>
          <button className="scr-btn scr-btn-primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
