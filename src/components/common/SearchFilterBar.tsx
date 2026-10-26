import { type ReactNode } from "react";
import { Spinner } from "./Feedback";

/* 목록 머리 띠 — 거르기 판 · 개수 · 머릿줄. 한때 한 줄 검색칸(자동완성)을 품었으나 모든 화면이 껐다(게임은 검색폼 ·
   2026-10-26 걷음, 요청: "불필요한 소스 다 삭제"). */
interface SearchFilterBarProps {
  count: number;
  countLabel: string;
  countLoading?: boolean;
  filterPanel?: ReactNode;
  trailing?: ReactNode;
  showCount?: boolean;
  countInline?: boolean;
  heading?: ReactNode;
}

export default function SearchFilterBar({
  count, countLabel, countLoading = false,
  filterPanel,
  trailing,
  showCount = true,
  countInline = false,
  heading,
}: SearchFilterBarProps) {
  const countItem = showCount ? (
    <span className="scr-list-count scr-filter-bar-count">
      {count}{countLabel}
      {countLoading && <Spinner size={11} />}
    </span>
  ) : null;

  const panelItem = filterPanel ? <div className="scr-filter-panel">{filterPanel}</div> : null;

  const hasInlineContent = (!countInline && panelItem)
    || (countInline && (panelItem || countItem)) || trailing;

  return (
    <div className="scr-filter-bar">
      {hasInlineContent && (
        <div className="scr-filter-inline-stack">
          {!countInline && panelItem}
          {countInline && (panelItem || countItem) && (
            <div className="scr-filter-inline-tail">{panelItem}{countItem}</div>
          )}
          {trailing}
        </div>
      )}
      {!countInline && (heading ? (
        <div className="scr-filter-head-row">{heading}{countItem}</div>
      ) : countItem)}
    </div>
  );
}
