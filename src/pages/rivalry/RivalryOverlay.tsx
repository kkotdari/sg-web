import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Spinner } from "../../components/common/Feedback";
import RivalryMap, { RivalryLegend } from "../v2/RivalryMap";
import { useAppStore } from "../../store/appStore";
import { api } from "../../api/client";
import { useLockBodyScroll } from "../../utils/bodyScrollLock";
import type { RivalryPair } from "../../types";

export default function RivalryOverlay({ from, to, onClose }: {
  from: string; to: string; onClose: () => void;
}) {
  const memberOf = useAppStore((s) => s.memberOf);
  const [pairs, setPairs] = useState<RivalryPair[] | undefined>(undefined);
  const [error, setError] = useState("");
  useLockBodyScroll();

  useEffect(() => {
    let cancelled = false;
    setPairs(undefined);
    setError("");
    api.getRivalries({ mode: "solo", dateFrom: from || undefined, dateTo: to || undefined })
      .then((res) => { if (!cancelled) setPairs(res.pairs); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "상성 데이터를 불러오지 못했어요."); });
    return () => { cancelled = true; };
  }, [from, to]);

  return createPortal(
    <div className="scr-rivalry-overlay">
      <div className="scr-rivalry-overlay-body">
        <div className="scr-rivalry-overlay-head">
          <span className="scr-rivalry-overlay-title">상성 관계</span>
          <button type="button" className="scr-rivalry-overlay-close" onClick={onClose} aria-label="닫기">
            <X size={20} />
          </button>
        </div>
        {error && <div className="scr-err">{error}</div>}
        {pairs === undefined && !error
          ? (
            <div className="scr-rivalry">
              <div className="scr-rivalry-overlay-loading"><Spinner size={18} /></div>
              <RivalryLegend />
            </div>
          )
          : pairs !== undefined && <RivalryMap pairs={pairs} memberOf={memberOf} />}
      </div>
    </div>,
    document.body,
  );
}
