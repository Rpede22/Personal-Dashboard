/**
 * Settings backup / share — export + import the dashboard's **view preferences**.
 *
 * These are the per-viewer prefs kept in `localStorage` under the `dashboard.*`
 * namespace (theme, density, currency, widget on/off + order + refresh, sections,
 * category filter, games visibility, weather cities, Today-briefing rows, weekly-
 * review sections, calendar filter, …). They are **secret-free by construction** —
 * no iCloud password, API key, or account lives here (those are server-side
 * config-dir JSON, never localStorage), so an exported blob is always safe to
 * share. Server config is deliberately out of scope for this v1.
 *
 * Client-safe: guards `window`/`localStorage` so it no-ops under SSR.
 */

export const BACKUP_VERSION = 1;

/** Non-`dashboard.*` localStorage keys that are still view-prefs worth carrying. */
const EXTRA_KEYS = ["calendarFilter"];

export interface SettingsBackup {
  app: "dashboard";
  version: number;
  exportedAt: string;
  prefs: Record<string, string>;
}

/** A localStorage key is exportable if it's a `dashboard.*` pref or a known extra. */
function isExportableKey(key: string): boolean {
  return key.startsWith("dashboard.") || EXTRA_KEYS.includes(key);
}

/** Snapshot every exportable view-pref currently in localStorage. */
export function exportSettings(): SettingsBackup {
  const prefs: Record<string, string> = {};
  if (typeof window !== "undefined") {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !isExportableKey(key)) continue;
        const val = localStorage.getItem(key);
        if (val != null) prefs[key] = val;
      }
    } catch { /* localStorage blocked — return whatever we have */ }
  }
  return { app: "dashboard", version: BACKUP_VERSION, exportedAt: new Date().toISOString(), prefs };
}

/** Pretty-printed JSON blob for the export textarea / file. */
export function serializeSettings(): string {
  return JSON.stringify(exportSettings(), null, 2);
}

export interface ImportResult {
  ok: boolean;
  imported: number;
  keys: string[];
  error?: string;
}

/**
 * Apply an exported blob. Only keys that pass `isExportableKey` are written, so a
 * hand-edited or hostile blob can never set arbitrary localStorage entries. Values
 * must be strings (that's all localStorage holds). Returns a count; the caller is
 * expected to reload so every consumer re-reads the new prefs consistently.
 */
export function importSettings(json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, imported: 0, keys: [], error: "That doesn't look like valid JSON." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, imported: 0, keys: [], error: "Unexpected format." };
  }
  const blob = parsed as Partial<SettingsBackup>;
  if (blob.app !== "dashboard") {
    return { ok: false, imported: 0, keys: [], error: "This isn't a Dashboard settings export." };
  }
  if (!blob.prefs || typeof blob.prefs !== "object") {
    return { ok: false, imported: 0, keys: [], error: "No settings found in the blob." };
  }
  if (typeof window === "undefined") {
    return { ok: false, imported: 0, keys: [], error: "Not available here." };
  }

  const applied: string[] = [];
  try {
    for (const [key, value] of Object.entries(blob.prefs)) {
      if (!isExportableKey(key) || typeof value !== "string") continue;
      localStorage.setItem(key, value);
      applied.push(key);
    }
  } catch {
    return { ok: false, imported: applied.length, keys: applied, error: "Couldn't write to localStorage." };
  }

  if (applied.length === 0) {
    return { ok: false, imported: 0, keys: [], error: "Nothing importable in that blob." };
  }
  return { ok: true, imported: applied.length, keys: applied };
}
