import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

export type ToastKind = "warn" | "info" | "ok";

export type ToastItem = {
  id: number;
  text: string;
  kind: ToastKind;
  ms: number;
  out?: boolean;
  at?: { x: number; y: number };
};

const MAX = 3;
const DEFAULT_MS = 3000;
const OUT_MS = 220;

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<(v: ToastItem[]) => void>();
const emit = (): void => { for (const fn of listeners) fn(items); };

function drop(id: number): void {
  const it = items.find((x) => x.id === id);
  if (!it || it.out) return;
  items = items.map((x) => (x.id === id ? { ...x, out: true } : x));
  emit();
  window.setTimeout(() => {
    items = items.filter((x) => x.id !== id);
    emit();
  }, OUT_MS);
}

export function showToast(
  text: string, opts?: { kind?: ToastKind; ms?: number; at?: { x: number; y: number } },
): number {
  const kind = opts?.kind ?? "info";
  const ms = Math.max(600, opts?.ms ?? DEFAULT_MS);
  const same = items.find((x) => x.text === text && !x.out);
  if (same) {
    window.setTimeout(() => drop(same.id), ms);
    return same.id;
  }
  seq += 1;
  const id = seq;
  items = [...items, { id, text, kind, ms, at: opts?.at }].slice(-MAX);
  emit();
  window.setTimeout(() => drop(id), ms);
  return id;
}

export function clearToasts(): void {
  for (const it of items) drop(it.id);
}

const ICON: Record<ToastKind, typeof AlertTriangle> = {
  warn: AlertTriangle, info: Info, ok: CheckCircle2,
};

export default function ToastHost(): React.ReactElement | null {
  const [list, setList] = useState<ToastItem[]>(items);
  useEffect(() => {
    listeners.add(setList);
    setList(items);
    return () => { listeners.delete(setList); };
  }, []);
  if (list.length === 0) return null;
  const at = [...list].reverse().find((x) => x.at)?.at;
  return createPortal(
    <div
      className="scr-toastwrap" role="status" aria-live="polite"
      style={at ? { left: `${Math.round(at.x)}px`, top: `${Math.round(at.y)}px` } : undefined}
    >
      {list.map((it) => {
        const Icon = ICON[it.kind];
        return (
          <div
            key={it.id}
            className={`scr-toast scr-toast-${it.kind}${it.out ? " is-out" : ""}`}
            onClick={() => drop(it.id)}
          >
            <Icon size={16} className="scr-toast-icon" aria-hidden />
            <span className="scr-toast-text">{it.text}</span>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
