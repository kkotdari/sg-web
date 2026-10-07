import { useLayoutEffect, useRef, useState } from "react";
import { cx } from "../../utils/format";

interface PillTabsProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  "aria-label": string;
  fit?: boolean;
  toggle?: boolean;
}

export default function PillTabs<T extends string>({ options, value, onChange, fit = false, toggle = false, ...rest }: PillTabsProps<T>) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const isToggle = toggle && options.length === 2;
  const flip = (): void => { onChange(options[index === 0 ? 1 : 0].value); };
  const wrapRef = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    if (!fit) return undefined;
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const measure = (): void => {
      const el = wrap.querySelector<HTMLButtonElement>(".scr-pill-tab-btn-active");
      if (!el) return;
      const wr = wrap.getBoundingClientRect();
      const br = el.getBoundingClientRect();
      if (br.width <= 0) return;
      const left = br.left - wr.left - wrap.clientLeft;
      setInd((prev) => (prev && Math.abs(prev.left - left) < 0.5
        && Math.abs(prev.width - br.width) < 0.5 ? prev : { left, width: br.width }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    wrap.querySelectorAll(".scr-pill-tab-btn").forEach((b) => ro.observe(b));
    let live = true;
    void document.fonts?.ready.then(() => { if (live) measure(); }).catch(() => {});
    return () => { live = false; ro.disconnect(); };
  }, [fit, value, options.length]);
  return (
    <div
      ref={wrapRef}
      className={cx("scr-pill-tabs", isToggle && "scr-pill-tabs-toggle")}
      role="tablist"
      aria-label={rest["aria-label"]}
      onClick={isToggle ? flip : undefined}
      style={{
        gridTemplateColumns: fit
          ? `repeat(${options.length}, max-content)`
          : `repeat(${options.length}, minmax(0, 1fr))`,
      }}
    >
      <span
        className="scr-pill-tabs-indicator"
        style={fit
          ? ind
            ? { width: ind.width, left: ind.left, transform: "none" }
            : { opacity: 0 }
          : { width: `calc((100% - 2px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={cx("scr-pill-tab-btn", o.value === value && "scr-pill-tab-btn-active")}
          onClick={isToggle ? undefined : () => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
