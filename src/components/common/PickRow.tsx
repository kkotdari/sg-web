import { cx } from "../../utils/format";

export default function PickRow<T extends string>({
  options, value, onChange, label, className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={cx("scr-pickrow", className)} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value} type="button"
          className={cx("scr-pick", o.value === value && "scr-pick-on")}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
