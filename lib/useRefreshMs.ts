"use client";

import { useEffect, useState } from "react";
import { getRefreshMs } from "@/lib/refresh";

/**
 * React hook that returns the current effective refresh interval (ms) for a
 * widget, respecting the user's override in localStorage. Returns 0 when the
 * user has disabled auto-refresh — callers should skip `setInterval` in that
 * case. Re-renders when the override changes (same-tab CustomEvent + cross-tab
 * `storage` event).
 */
export function useRefreshMs(slug: string, defaultMinutes: number): number {
  const [ms, setMs] = useState<number>(() => getRefreshMs(slug, defaultMinutes));

  useEffect(() => {
    function recompute() { setMs(getRefreshMs(slug, defaultMinutes)); }
    recompute();
    function onCustom(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.slug !== slug) return;
      recompute();
    }
    function onStorage(e: StorageEvent) {
      if (e.key === "dashboard.refresh") recompute();
    }
    window.addEventListener("dashboard-refresh-change", onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("dashboard-refresh-change", onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, [slug, defaultMinutes]);

  return ms;
}
