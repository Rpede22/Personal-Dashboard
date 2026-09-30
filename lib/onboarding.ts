/**
 * First-run detection for the onboarding wizard. Server-only (`fs`).
 *
 * "First run" = a fresh install with no config yet. We treat onboarding as
 * already-complete when EITHER an explicit marker was written (the user
 * finished or skipped the wizard) OR any of the known config files already
 * exists (so existing installs from before this feature never get prompted).
 *
 * The marker lives in the config dir (survives app updates via
 * DASHBOARD_CONFIG_DIR), so a rebuilt bundle doesn't re-trigger onboarding.
 */

import fs from "fs";
import { configPath } from "./config-dir";

const MARKER = "onboarding.json";

// Any of these existing means the app has been used/configured already.
const CONFIG_FILES = [
  ".work-config.json",
  ".school-settings.json",
  ".race-config.json",
  ".strava-config.json",
  "countdowns.json",
  "news-config.json",
  "calendar-feeds.json",
  "followed-teams.json",
];

function markerSaysComplete(): boolean {
  try {
    const j = JSON.parse(fs.readFileSync(configPath(MARKER), "utf8"));
    return j?.completed === true;
  } catch {
    return false;
  }
}

function anyConfigExists(): boolean {
  return CONFIG_FILES.some((f) => {
    try { return fs.existsSync(configPath(f)); } catch { return false; }
  });
}

export function isOnboardingComplete(): boolean {
  return markerSaysComplete() || anyConfigExists();
}

export function markOnboardingComplete(): void {
  try {
    fs.writeFileSync(
      configPath(MARKER),
      JSON.stringify({ completed: true, completedAt: new Date().toISOString() }, null, 2),
      "utf8",
    );
  } catch { /* non-fatal — worst case the wizard shows once more */ }
}
