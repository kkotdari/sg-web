import { useCallback, useState } from "react";

export interface Selection {
  picked: ReadonlySet<string>;
  toggle: (key: string) => void;
  setMany: (keys: Iterable<string>, picked: boolean) => void;
  keepOnly: (keys: Iterable<string>) => void;
  clear: () => void;
  /** 선택 모드(폰) — 줄을 길게 누르거나 하나라도 고르면 켜지고, '선택종료'(exit)로만 꺼진다. 켜진 동안 줄 누름은 열기가 아니라 고르기다. */
  mode: boolean;
  exit: () => void;
}

export function useSelection(): Selection {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [mode, setMode] = useState(false);

  const clear = useCallback(() => {
    setPicked((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);
  const toggle = useCallback((key: string) => {
    setMode(true);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const setMany = useCallback((keys: Iterable<string>, value: boolean) => {
    if (value) setMode(true);
    setPicked((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (value) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }, []);
  const keepOnly = useCallback((keys: Iterable<string>) => {
    setPicked((prev) => {
      if (prev.size === 0) return prev;
      const keep = keys instanceof Set ? keys : new Set(keys);
      const next = new Set([...prev].filter((k) => keep.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, []);

  const exit = useCallback(() => {
    setMode(false);
    setPicked((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  return { picked, toggle, setMany, keepOnly, clear, mode, exit };
}
