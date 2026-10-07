import { useCallback, useEffect, useState } from "react";

export function useUrlState(key: string, initial = ""): [string, (v: string) => void] {
  const read = (): string => {
    if (typeof window === "undefined") return initial;
    return new URLSearchParams(window.location.search).get(key) ?? initial;
  };
  const [value, setValue] = useState<string>(read);
  useEffect(() => {
    const onPop = (): void => setValue(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [key, initial]);
  const set = useCallback((next: string): void => {
    setValue(next);
    const p = new URLSearchParams(window.location.search);
    if (next === "" || next === initial) p.delete(key);
    else p.set(key, next);
    const qs = p.toString();
    window.history.replaceState(
      window.history.state, "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`,
    );
  }, [key, initial]);
  return [value, set];
}
