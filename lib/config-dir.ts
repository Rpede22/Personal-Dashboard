import path from "path";
import fs from "fs";

/**
 * Persistent config directory for the app's JSON config files (all the
 * `configPath(...)` files: `.work-config.json`, `tasks.json`, `podcasts.json`,
 * `steam.json`, `feedback.json`, …).
 *
 * Base:
 *   - dev: the project root (`process.cwd()`)
 *   - packaged app: `DASHBOARD_CONFIG_DIR` (set by `electron/main.js` to the
 *     user-data dir) so the files survive an app-bundle rebuild.
 *
 * Files live in a **`config/` sub-folder** of that base (keeps the project root
 * — and the user-data dir — tidy instead of ~20 loose JSON files). A one-time
 * migration moves any file still sitting in the old base location into `config/`
 * on first access, so existing installs lose nothing. (`wow-tier.json` is a
 * tracked static import from the repo root — it is NOT a config-dir file and
 * stays where it is.)
 */

function configBase(): string {
  return process.env.DASHBOARD_CONFIG_DIR || process.cwd();
}

/** Every config-dir JSON basename — used only by the one-time migration. */
const CONFIG_FILES = [
  ".race-config.json", ".school-settings.json", ".strava-config.json",
  ".work-config.json", ".wow-raid-baseline.json",
  "budget.json", "calendar-feeds.json", "countdowns.json", "custom-dishes.json", "faceit-accounts.json",
  "feedback.json", "followed-teams.json", "meal-plan.json", "news-config.json",
  "onboarding.json", "podcasts.json", "steam.json", "subscriptions.json",
  "tasks.json", "tft-accounts.json", "transit.json", "twitch-channels.json",
  "watchlist.json", "work-config.json", "youtube-channels.json",
];

let _ensured = false;
function ensureConfigDir(dir: string): void {
  if (_ensured) return;
  _ensured = true;
  try {
    fs.mkdirSync(dir, { recursive: true });
    // One-time migration: move any legacy file from the base into config/.
    const base = configBase();
    if (path.resolve(base) !== path.resolve(dir)) {
      for (const name of CONFIG_FILES) {
        const from = path.join(base, name);
        const to = path.join(dir, name);
        try {
          if (fs.existsSync(from) && !fs.existsSync(to)) fs.renameSync(from, to);
        } catch { /* skip a single file, keep going */ }
      }
    }
  } catch { /* ignore — reads/writes will surface real errors */ }
}

/** The `config/` directory (created + migrated on first call). */
export function configDir(): string {
  const dir = path.join(configBase(), "config");
  ensureConfigDir(dir);
  return dir;
}

/** Shorthand: `configPath("work-config.json")` → `<base>/config/work-config.json`. */
export function configPath(basename: string): string {
  return path.join(configDir(), basename);
}
