"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Persisted tab order for hubs with multi-tab strips (NHL, Sports, Running,
 * Work, Game). Each hub gets its own storage key (e.g. `dashboard.tabs.nhl`)
 * so reorders don't leak between hubs.
 *
 * Behaviour matches the DashboardGrid widget-order pattern:
 *   • Stored order is merged with the code-declared default so newly-added
 *     tabs surface automatically (appended at the end).
 *   • Removed/unknown tabs are silently dropped.
 *   • `reset()` clears the stored value so the next render falls back to the
 *     hub's own default order.
 */
export function useTabOrder<T extends string>(
  hubKey: string,
  defaults: readonly T[],
): {
  order: T[];
  moveBefore: (dragged: T, target: T) => void;
  reset: () => void;
} {
  const storageKey = `dashboard.tabs.${hubKey}`;
  const [order, setOrder] = useState<T[]>(() => [...defaults]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) { setOrder([...defaults]); return; }
      const parsed = JSON.parse(raw) as T[];
      const known = new Set(defaults);
      const kept = parsed.filter((t): t is T => known.has(t as T));
      const seen = new Set(kept);
      for (const t of defaults) if (!seen.has(t)) kept.push(t);
      setOrder(kept.length ? kept : [...defaults]);
    } catch {
      setOrder([...defaults]);
    }
  }, [storageKey, defaults]);

  const persist = useCallback((next: T[]) => {
    setOrder(next);
    if (typeof window === "undefined") return;
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
  }, [storageKey]);

  const moveBefore = useCallback((dragged: T, target: T) => {
    if (dragged === target) return;
    setOrder((prev) => {
      const next = prev.filter((t) => t !== dragged);
      const idx = next.indexOf(target);
      if (idx === -1) return prev;
      next.splice(idx, 0, dragged);
      // Persist directly so we don't need two renders.
      if (typeof window !== "undefined") {
        try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      }
      return next;
    });
  }, [storageKey]);

  const reset = useCallback(() => {
    if (typeof window !== "undefined") {
      try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    }
    persist([...defaults]);
  }, [storageKey, defaults, persist]);

  return { order, moveBefore, reset };
}
