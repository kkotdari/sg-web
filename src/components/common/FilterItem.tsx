import type { ReactNode } from "react";

interface FilterItemProps {
  label?: string;
  children: ReactNode;
}

export default function FilterItem({ label, children }: FilterItemProps) {
  return (
    <div className="scr-filter-item">
      {label && <span className="scr-filter-item-label">{label}</span>}
      {children}
    </div>
  );
}
