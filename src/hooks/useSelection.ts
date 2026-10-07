import { useCallback, useState } from "react";

export interface Selection {
  picked: ReadonlySet<string>;
  toggle: (key: string) => void;
  setMany: (keys: Iterable<string>, picked: boolean) => void;
  keepOnly: (keys: Iterable<string>) => void;
  clear: () => void;
}

export function useSelection(): Selection {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());

  const clear = useCallback(() => {
    setPicked((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);
  const toggle = useCallback((key: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const setMany = useCallback((keys: Iterable<string>, value: boolean) => {
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

  return { picked, toggle, setMany, keepOnly, clear };
}
