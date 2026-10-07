import type { ReactNode } from "react";
import { cx } from "../../utils/format";

export function ActivityCard({
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
    <div className={cx("scr-activity-card", className)}>
      <div className="scr-activity-card-head" {...(dateLabel ? { "data-date-label": dateLabel } : {})}>
        <div className="scr-activity-card-head-title">
          {icon}
          {label && <span className="scr-activity-card-label">{label}</span>}
        </div>
        <div className="scr-activity-card-head-meta">
          {timeText && <span className="scr-activity-card-time">{timeText}</span>}
          {headMeta}
        </div>
      </div>
      {actions}
      <div className={cx("scr-activity-card-body", bodyClassName)}>
        {children}
      </div>
      {comment && (
        <div className="scr-activity-card-comment" onClick={(e) => e.stopPropagation()}>
          {comment}
        </div>
      )}
    </div>
  );
}
