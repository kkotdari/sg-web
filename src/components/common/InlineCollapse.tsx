import type { ReactNode } from "react";
import { cx } from "../../utils/format";

export default function InlineCollapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={cx("scr-inline-collapse", open && "scr-inline-collapse-open")} aria-hidden={!open}>
      <div className="scr-inline-collapse-inner">{children}</div>
    </div>
  );
}
