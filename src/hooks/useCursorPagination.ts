import { useCallback, useEffect, useRef, useState } from "react";

interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number | null;
}

interface UseCursorPaginationResult<T> {
  items: T[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
  total: number | null;
  patch: (updater: (items: T[]) => T[]) => void;
}

export function useCursorPagination<T>(
  fetchPage: (cursor: string | null) => Promise<Page<T>>,
  deps: unknown[],
): UseCursorPaginationResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);

  const patch = useCallback((updater: (prev: T[]) => T[]) => setItems(updater), []);

  const generationRef = useRef(0);
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  const load = useCallback(async (targetCursor: string | null, append: boolean) => {
    const myGeneration = generationRef.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const page = await fetchPageRef.current(targetCursor);
      if (myGeneration !== generationRef.current) return;
      setItems((prev) => (append ? [...prev, ...page.items] : page.items));
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      if (page.total !== undefined && page.total !== null) setTotal(page.total);
    } catch (e) {
      if (myGeneration !== generationRef.current) return;
      setError(e instanceof Error ? e.message : "목록을 불러오지 못했어요.");
    } finally {
      if (myGeneration === generationRef.current) {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    generationRef.current += 1;
    setCursor(null);
    setHasMore(false);
    load(null, false);
  }, deps);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    load(cursor, true);
  }, [cursor, hasMore, loading, loadingMore, load]);

  const reload = useCallback(() => {
    generationRef.current += 1;
    setCursor(null);
    setHasMore(false);
    load(null, false);
  }, [load]);

  return { items, loading, loadingMore, error, hasMore, loadMore, reload, total, patch };
}
