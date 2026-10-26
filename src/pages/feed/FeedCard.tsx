import type { ReactNode } from "react";
import { cx } from "../../utils/format";

export function FeedCard({
  className, dateLabel, icon, label, timeText, headMeta, actions, bodyClassName, children, comment,
}: {
  className?: string;
  dateLabel?: string;
  icon?: ReactNode;
  label?: ReactNode;
  timeText: ReactNode;
  headMeta?: ReactNode;
  actions?: ReactNode;
  bodyClassName?: string;
  children: ReactNode;
  comment?: ReactNode;
}) {
  return (
    <div className={cx("scr-feed-card", className)}>
      <div className="scr-feed-card-head" {...(dateLabel ? { "data-date-label": dateLabel } : {})}>
        <div className="scr-feed-card-head-title">
          {icon}
          {label && <span className="scr-feed-card-label">{label}</span>}
        </div>
        <div className="scr-feed-card-head-meta">
          {timeText && <span className="scr-feed-card-time">{timeText}</span>}
          {headMeta}
        </div>
      </div>
      {actions}
      <div className={cx("scr-feed-card-body", bodyClassName)}>
        {children}
      </div>
      {comment && (
        <div className="scr-feed-card-comment" onClick={(e) => e.stopPropagation()}>
          {comment}
        </div>
      )}
    </div>
  );
}
