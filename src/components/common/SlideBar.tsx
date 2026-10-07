import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRef } from "react";
import { cx } from "../../utils/format";

interface SlideBarProps {
  title: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  labelSide?: "left" | "right";
  "aria-label": string;
}

export default function SlideBar({
  title, options, value, onChange, labelSide = "right", ...rest
}: SlideBarProps) {
  const n = options.length;
  const widest = options.reduce((m, o) => Math.max(m, o.label.length), 1);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const trackRef = useRef<HTMLDivElement>(null);
  const pick = (clientY: number, snap: boolean): void => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.height <= 0) return;
    const f = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    const raw = f * (n - 1);
    const i = Math.round(raw);
    if (!snap && Math.abs(raw - i) > 0.28) return;
    if (options[i] && options[i].value !== value) onChange(options[i].value);
  };
  const onDown = (e: ReactPointerEvent): void => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pick(e.clientY, true);
  };
  const onMove = (e: ReactPointerEvent): void => {
    if (!(e.buttons & 1)) return;
    e.stopPropagation();
    pick(e.clientY, false);
  };
  const onKeyDown = (e: ReactKeyboardEvent): void => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    e.stopPropagation();
    const ni = e.key === "ArrowUp" ? Math.max(0, index - 1) : Math.min(n - 1, index + 1);
    if (ni !== index) onChange(options[ni].value);
  };
  const at = (i: number): string => `${(i / (n - 1)) * 100}%`;
  return (
    <div
      className={cx("scr-slidebar", `scr-slidebar-${labelSide}`)}
      onPointerDown={onDown}
      onPointerMove={onMove}
    >
      <span className="scr-slidebar-title">{title}</span>
      <div
        ref={trackRef}
        className="scr-slidebar-track"
        role="slider"
        tabIndex={0}
        aria-label={rest["aria-label"]}
        aria-valuemin={1}
        aria-valuemax={n}
        aria-valuenow={n - index}
        aria-valuetext={options[index]?.label}
        aria-orientation="vertical"
        onKeyDown={onKeyDown}
      >
        <span className="scr-slidebar-rail" />
        {options.map((o, i) => (
          <span key={o.value} className="scr-slidebar-tickwrap" style={{ top: at(i) }}>
            <i className={cx("scr-slidebar-tick", i === index && "scr-slidebar-tick-on")} />
          </span>
        ))}
        <span className="scr-slidebar-thumb" style={{ top: at(index) }} />
      </div>
      <span className="scr-slidebar-value" style={{ minWidth: `${widest}ch` }}>
        {options[index]?.label}
      </span>
    </div>
  );
}
