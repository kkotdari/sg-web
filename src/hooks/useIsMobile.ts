import { useEffect, useState } from "react";

const QUERY = "(max-width: 960px)";   // 1159 → 960(2026-10-13, 요청: "단순하게 가자 sg-web 과 재생기에 모두 모바일 기준을 960 으로")

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const sync = () => setMobile(mq.matches);
    mq.addEventListener("change", sync);
    sync();
    return () => mq.removeEventListener("change", sync);
  }, []);
  return mobile;
}
