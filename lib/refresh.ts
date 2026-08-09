/**
 * Per-widget auto-refresh interval override.
 *
 * Each widget has a default poll interval; the user can override it via the
 * ⚡ settings menu on the widget cell. Values are stored in localStorage as
 * whole minutes, e.g. `{ sports: 5, lol: 15 }`. `0` disables polling.
 */

export const REFRESH_KEY = "dashboard.refresh";

export type WidgetSlug = "sports" | "school" | "games" | "running" | "calendar" | "workhub" | "lol";

export const REFRESH_OPTIONS_MIN = [0, 1, 2, 5, 15, 30, 60] as const;

export function loadRefreshOverrides(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(REFRESH_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch { return {}; }
}

export function saveRefreshOverride(slug: string, minutes: number | null): void {
  if (typeof window === "undefined") return;
  const cur = loadRefreshOverrides();
  if (minutes == null) delete cur[slug];
  else cur[slug] = minutes;
  try { localStorage.setItem(REFRESH_KEY, JSON.stringify(cur)); } catch { /* ignore */ }
  // Notify same-tab listeners (storage events fire across tabs only).
  window.dispatchEvent(new CustomEvent("dashboard-refresh-change", { detail: { slug, minutes } }));
}

/** Returns the effective interval (ms) for a widget, or 0 if disabled. */
export function getRefreshMs(slug: string, defaultMinutes: number): number {
  const overrides = loadRefreshOverrides();
  const m = overrides[slug];
  const effective = typeof m === "number" ? m : defaultMinutes;
  return effective > 0 ? effective * 60_000 : 0;
}
