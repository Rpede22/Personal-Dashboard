import path from "path";

/**
 * Persistent config directory for JSON key/value files (`.work-config.json`,
 * `.race-config.json`, `.school-settings.json`, `.strava-config.json`,
 * `.wow-raid-baseline.json`).
 *
 * In dev the files live in the project root (`process.cwd()`), same as before.
 * The packaged Electron app sets `DASHBOARD_CONFIG_DIR` at startup to the
 * user-data directory (`~/Library/Application Support/Dashboard/…`) so the
 * files survive a rebuild of the app bundle — otherwise the install directory
 * gets replaced on each new DMG and every config resets to defaults.
 */
export function configDir(): string {
  return process.env.DASHBOARD_CONFIG_DIR || process.cwd();
}

/** Shorthand: `configPath("work-config.json")` → correct absolute path. */
export function configPath(basename: string): string {
  return path.join(configDir(), basename);
}
