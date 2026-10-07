import { useEffect, useState } from "react";

const QUERY = "(max-width: 1159px)";

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
