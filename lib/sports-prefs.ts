"use client";

import { broadcastSettingsChange } from "@/lib/dashboard-settings";

/**
 * Small per-viewer sports preferences (localStorage).
 *
 * `showEdm` — whether the dedicated Edmonton Oilers (NHL) box appears in the
 * Sports widget. EDM is hard-wired (its own `/nhl` hub, not a followed team), so
 * it can't be removed from the Teams list; this toggle lets it be hidden anyway.
 * Default on. Writes broadcast the shared settings-change event so the widget
 * re-reads live via `useSettingsTick`.
 */

const SHOW_EDM_KEY = "dashboard.sports.showEdm";

export function loadShowEdm(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(SHOW_EDM_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setShowEdm(show: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SHOW_EDM_KEY, show ? "1" : "0");
    broadcastSettingsChange();
  } catch { /* ignore */ }
}
