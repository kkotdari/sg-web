import type { ReactNode } from "react";
import { ListChecks, X } from "lucide-react";
import { cx } from "../../utils/format";

export function SelectionBar({ total, count, onSelectAll, onClear, children, note }: {
  total: number;
  count: number;
  onSelectAll: () => void;
  onClear: () => void;
  children?: ReactNode;
  note?: string;
}) {
  const clearing = count > 0;
  return (
    <div className="scr-selbar" role="toolbar" aria-label="선택">
      <button
        type="button"
        className={cx("scr-sel-toggle", clearing && "is-on")}
        onClick={clearing ? onClear : onSelectAll}
        disabled={!clearing && total === 0}
        title={clearing ? "고른 것을 모두 풀어요" : (total > 0 ? "고를 수 있는 줄을 모두 골라요" : "고를 수 있는 줄이 없어요")}
      >
        {clearing ? <X size={13} aria-hidden /> : <ListChecks size={13} aria-hidden />}
        <span aria-live="polite">{clearing ? `선택취소(${count})` : `전체선택${total > 0 ? ` (${total})` : ""}`}</span>
      </button>
      {note && <span className="scr-selbar-note">{note}</span>}
      <div className="scr-selbar-actions">{children}</div>
    </div>
  );
}

export function RowCheck({ checked, disabled, disabledTitle, onChange, label }: {
  checked: boolean; disabled?: boolean;
  disabledTitle?: string;
  onChange: () => void; label?: string;
}) {
  return (
    <label
      className={cx("scr-checkbox-field scr-selcell", disabled && "is-off")}
      onClick={(e) => e.stopPropagation()}
      title={disabled ? (disabledTitle ?? "이 항목은 고를 수 없어요") : undefined}
    >
      <input
        type="checkbox" checked={checked} disabled={disabled} onChange={onChange}
        aria-label={label ?? "선택"}
      />
    </label>
  );
}
