import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";

type AlertItem = { title: string; message: string };

let current: AlertItem | null = null;
const listeners = new Set<(v: AlertItem | null) => void>();
const emit = (): void => { for (const fn of listeners) fn(current); };

export function showAlert(message: string, opts?: { title?: string }): void {
  current = { title: opts?.title ?? "알림", message };
  emit();
}

export default function AlertHost() {
  const [item, setItem] = useState<AlertItem | null>(current);
  useEffect(() => {
    listeners.add(setItem);
    return () => { listeners.delete(setItem); };
  }, []);
  if (!item) return null;
  const close = (): void => { current = null; emit(); };
  return createPortal(
    <div className="scr-modal-overlay" onClick={close}>
      <div
        className="scr-modal scr-modal-sm scr-modal-confirm"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog" aria-label={item.title}
      >
        <div className="scr-confirm-head">
          <AlertTriangle size={18} className="scr-confirm-icon" />
          <span>{item.title}</span>
        </div>
        <p className="scr-confirm-msg">{item.message}</p>
        <div className="scr-form-actions">
          <button className="scr-btn scr-btn-primary" onClick={close} autoFocus>확인</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
