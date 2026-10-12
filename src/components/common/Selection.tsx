import type { ReactNode } from "react";
import { cx } from "../../utils/format";
import { useIsMobile } from "../../hooks/useIsMobile";

export function SelectionBar({ total, count, onSelectAll, onClear, children, note, mode, onExit }: {
  total: number;
  count: number;
  onSelectAll: () => void;
  onClear: () => void;
  children?: ReactNode;
  note?: string;
  /** 폰 선택 모드(useSelection().mode) — 켜져 있으면 '선택종료'가 선다. */
  mode?: boolean;
  onExit?: () => void;
}) {
  const clearing = count > 0;
  const mobile = useIsMobile();
  /* 폰은 체크박스 없이 **글자 버튼**(2026-10-11, 요청: "모바일에서 전체선택 버튼 옆의 체크박스와 목록 각각의 체크박스 제거 · 목록 타이틀 길게 누르면 선택 모드 ·
     선택/선택해제는 로우 전체에 · 전체선택은 글자 버튼 · 선택 모드에서 선택종료 버튼 추가") — 줄 고르기는 줄을 길게 눌러 선택 모드로 들어간 뒤 줄 누름으로. */
  /* ★ 선택 모드 밖은 **버튼이 아니라 설명**(같은 날, 요청: "전체선택 버튼을 '길게 눌러서 선택'으로 변경(버튼 아니고 설명) · 선택 모드에 전체 선택/선택 해제") —
     고를 길은 길게 누르기뿐이라 일괄 단추(지우기 따위)도 선택 모드에서만 선다. */
  if (mobile && !mode) {
    return (
      <div className="scr-selbar scr-selbar-m" aria-label="선택">
        <span className="scr-sel-hint">길게 눌러서 선택</span>
        {note && <span className="scr-selbar-note">{note}</span>}
      </div>
    );
  }
  if (mobile) {
    return (
      <div className="scr-selbar scr-selbar-m" role="toolbar" aria-label="선택">
        <button
          type="button" className="scr-text-btn scr-sel-all-m"
          disabled={!clearing && total === 0}
          onClick={clearing ? onClear : onSelectAll}
        >
          <span aria-live="polite">{clearing ? `선택 해제 (${count})` : `전체 선택${total > 0 ? ` (${total})` : ""}`}</span>
        </button>
        {onExit && (
          <button type="button" className="scr-text-btn scr-sel-exit" onClick={onExit}>선택종료</button>
        )}
        {note && <span className="scr-selbar-note">{note}</span>}
        <div className="scr-selbar-actions">{children}</div>
      </div>
    );
  }
  return (
    <div className="scr-selbar" role="toolbar" aria-label="선택">
      <label
        className="scr-checkbox-field scr-sel-all"
        title={clearing ? "고른 것을 모두 풀어요" : (total > 0 ? "고를 수 있는 줄을 모두 골라요" : "고를 수 있는 줄이 없어요")}
      >
        <input
          type="checkbox" checked={clearing} disabled={!clearing && total === 0}
          onChange={clearing ? onClear : onSelectAll}
        />
        <span aria-live="polite">{clearing ? `선택취소(${count})` : `전체선택${total > 0 ? ` (${total})` : ""}`}</span>
      </label>
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
  // 폰은 줄 체크칸이 없다 — 선택 모드에서 줄 전체를 눌러 고른다(위 SelectionBar ★).
  if (useIsMobile()) return null;
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

/** 고르기 전용 목록(팀 짜기 · 다시 분석 고르기 · 맵 묶기)의 전체 선택 — PC 는 종전 체크박스 · 폰은 **글자 단추**(2026-10-12, 요청: "전체 선택 있는 곳 …
 *  모두 모바일은 같은 방식 적용해야 해"). 이 목록들은 고르는 것이 할 일의 전부라 길게 누르기(선택 모드) 없이 줄을 눌러 바로 고른다 — 줄 체크칸은 폰에서 CSS 가 숨긴다. */
export function SelectAllToggle({ all, count, onToggle, disabled, className, suffix }: {
  all: boolean; count: number; onToggle: () => void; disabled?: boolean; className: string;
  /** 글 뒤에 붙는 말(예: " (검색된 12건)") — 두 모양 다. */
  suffix?: string;
}) {
  const mobile = useIsMobile();
  if (mobile) {
    return (
      <button type="button" className="scr-text-btn scr-sel-all-m scr-sel-all-pick" disabled={disabled} onClick={onToggle}>
        {all ? `선택 해제 (${count})` : `전체 선택${suffix ?? ""}`}
      </button>
    );
  }
  return (
    <label className={className}>
      <input type="checkbox" checked={all} onChange={onToggle} disabled={disabled} />
      {suffix ? <span>전체 선택{suffix}</span> : "전체 선택"}
    </label>
  );
}
