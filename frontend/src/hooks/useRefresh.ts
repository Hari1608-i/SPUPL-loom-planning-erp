import { useState, useCallback } from 'react';

/**
 * useRefresh — shared hook for all pages.
 *
 * Usage:
 *   const { refreshing, triggerRefresh } = useRefresh(fetchData);
 *
 *   <button onClick={triggerRefresh}>
 *     <RefreshCw className={refreshing ? 'animate-refresh-spin' : ''} />
 *   </button>
 *
 * The button will blink (flash + spin) for 600 ms, then call your fetch.
 */
export function useRefresh(fetchFn: () => Promise<void> | void) {
  const [refreshing, setRefreshing] = useState(false);

  const triggerRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await fetchFn();
    } finally {
      // Keep animation visible for at least 700ms so user sees the blink
      setTimeout(() => setRefreshing(false), 700);
    }
  }, [fetchFn, refreshing]);

  return { refreshing, triggerRefresh };
}
