/**
 * Server-only calendar-feeds config. Moves the hardcoded ICS feed URLs +
 * iCloud CalDAV credentials + include-list (previously split between
 * `.env.local` and `app/api/calendar/route.ts`) into a single editable
 * `calendar-feeds.json` under the config dir.
 *
 * Migration is seamless: any field absent (or blank) in the JSON falls back
 * to the old env-var value, so an existing install keeps working until the
 * user saves through the Settings › Calendar panel — at which point the JSON
 * takes over. The file is gitignored (it holds the iCloud app-specific
 * password), so it never gets committed.
 *
 * Uses `fs` — import only from server code (API routes), never a client
 * component.
 */

import fs from "fs";
import { configPath } from "./config-dir";

export interface IcsFeed {
  /** Display name shown as the calendar's label + filter chip. */
  name: string;
  /** ICS/webcal URL (read-only feed). */
  url: string;
}

export interface CalDAVInclude {
  /** Prefix compared against the raw iCloud display name; first match wins,
   *  so list longer overlapping prefixes first. */
  match: string;
  /** Optional rename to the label shown in the app. */
  display?: string;
}

export interface CalendarConfig {
  icsFeeds: IcsFeed[];
  caldav: {
    user: string;
    pass: string;
    includes: CalDAVInclude[];
  };
}

/** Client-safe view — never exposes the raw CalDAV password. */
export interface CalendarConfigPublic {
  icsFeeds: IcsFeed[];
  caldav: {
    user: string;
    hasPassword: boolean;
    includes: CalDAVInclude[];
  };
}

const FILE = "calendar-feeds.json";

/**
 * The pre-config defaults — everything read from env vars, matching the old
 * hardcoded behaviour so nothing breaks before the user migrates.
 */
export function envDefaults(): CalendarConfig {
  return {
    icsFeeds: [
      { name: "Rasmus_skole", url: process.env.CALENDAR_SDU_URL ?? "" },
      { name: "Cand", url: process.env.CALENDAR_CAND_URL ?? "" },
      { name: "Rasmus_arbejde", url: process.env.CALENDAR_ARBEJDE_URL ?? "" },
    ],
    caldav: {
      user: process.env.ICLOUD_CALDAV_USER ?? "",
      pass: process.env.ICLOUD_CALDAV_PASS ?? "",
      includes: [
        // Rasmus's own personal calendar — writeable, distinct from Jennifer's.
        { match: "Kalender Rasmus" },
        // Jennifer's shared personal calendar — renamed for clarity.
        { match: "Kalender", display: "Kalender Jennifer" },
        // Jennifer's shared work calendar.
        { match: "Arbejde", display: "Jennifer_arbejde" },
        // Rasmus's own work calendar — remapped to collide with the ICS feed
        // of the same name (feed is dropped in favour of the writeable copy).
        { match: "Rasmus", display: "Rasmus_arbejde" },
      ],
    },
  };
}

function cleanFeeds(raw: unknown): IcsFeed[] | null {
  if (!Array.isArray(raw)) return null;
  const out: IcsFeed[] = [];
  for (const r of raw) {
    if (r && typeof r === "object" && typeof (r as IcsFeed).name === "string") {
      const name = (r as IcsFeed).name.trim();
      const url = typeof (r as IcsFeed).url === "string" ? (r as IcsFeed).url.trim() : "";
      if (name) out.push({ name, url });
    }
  }
  return out;
}

function cleanIncludes(raw: unknown): CalDAVInclude[] | null {
  if (!Array.isArray(raw)) return null;
  const out: CalDAVInclude[] = [];
  for (const r of raw) {
    if (r && typeof r === "object" && typeof (r as CalDAVInclude).match === "string") {
      const rawDisplay = (r as CalDAVInclude).display;
      const match = (r as CalDAVInclude).match.trim();
      const display = typeof rawDisplay === "string" ? rawDisplay.trim() : "";
      if (match) out.push(display ? { match, display } : { match });
    }
  }
  return out;
}

/**
 * Read the resolved calendar config. JSON wins field-by-field; anything
 * absent or blank falls back to the env-var default so migration is smooth.
 */
export function readCalendarConfig(): CalendarConfig {
  const def = envDefaults();
  let j: Record<string, unknown> | null = null;
  try {
    j = JSON.parse(fs.readFileSync(configPath(FILE), "utf8"));
  } catch {
    return def;
  }
  if (!j || typeof j !== "object") return def;

  const caldav = (j.caldav ?? {}) as Record<string, unknown>;
  const feeds = cleanFeeds(j.icsFeeds);
  const includes = cleanIncludes(caldav.includes);
  const user = typeof caldav.user === "string" ? caldav.user.trim() : "";
  const pass = typeof caldav.pass === "string" ? caldav.pass : "";

  return {
    icsFeeds: feeds ?? def.icsFeeds,
    caldav: {
      user: user || def.caldav.user,
      pass: pass || def.caldav.pass,
      includes: includes ?? def.caldav.includes,
    },
  };
}

export function writeCalendarConfig(cfg: CalendarConfig): void {
  fs.writeFileSync(configPath(FILE), JSON.stringify(cfg, null, 2), "utf8");
}

/** Client-safe projection — swaps the raw password for a boolean. */
export function toPublic(cfg: CalendarConfig): CalendarConfigPublic {
  return {
    icsFeeds: cfg.icsFeeds,
    caldav: {
      user: cfg.caldav.user,
      hasPassword: !!cfg.caldav.pass,
      includes: cfg.caldav.includes,
    },
  };
}

/** Build the `Basic …` auth header, or null when credentials are missing. */
export function caldavAuth(cfg: CalendarConfig = readCalendarConfig()): string | null {
  if (!cfg.caldav.user || !cfg.caldav.pass) return null;
  return "Basic " + Buffer.from(`${cfg.caldav.user}:${cfg.caldav.pass}`).toString("base64");
}
