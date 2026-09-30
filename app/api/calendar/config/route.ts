import { NextResponse } from "next/server";
import {
  readCalendarConfig,
  writeCalendarConfig,
  toPublic,
  type CalendarConfig,
  type IcsFeed,
  type CalDAVInclude,
} from "@/lib/calendar-config";

/**
 * GET  /api/calendar/config  → the client-safe config (no raw CalDAV password).
 * POST /api/calendar/config  → update any subset of { icsFeeds, caldav }.
 *
 * The password is write-only: GET returns `hasPassword` instead of the value,
 * and POST only overwrites the stored password when a non-empty `pass` is
 * sent — an omitted/blank `pass` keeps the existing one, so the panel can be
 * saved without re-typing the credential every time.
 */

export async function GET() {
  return NextResponse.json(toPublic(readCalendarConfig()));
}

export async function POST(request: Request) {
  let body: {
    icsFeeds?: unknown;
    caldav?: { user?: unknown; pass?: unknown; includes?: unknown };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const current = readCalendarConfig();
  const next: CalendarConfig = {
    icsFeeds: current.icsFeeds,
    caldav: { ...current.caldav },
  };

  // ── ICS feeds ──────────────────────────────────────────────────────────
  if (Array.isArray(body.icsFeeds)) {
    const feeds: IcsFeed[] = [];
    for (const r of body.icsFeeds) {
      if (!r || typeof r !== "object") continue;
      const name = typeof (r as IcsFeed).name === "string" ? (r as IcsFeed).name.trim() : "";
      const url = typeof (r as IcsFeed).url === "string" ? (r as IcsFeed).url.trim() : "";
      if (!name) continue;
      if (url && !/^(https?|webcal):\/\//i.test(url)) {
        return NextResponse.json({ error: `Feed "${name}" URL must start with http(s):// or webcal://` }, { status: 400 });
      }
      feeds.push({ name, url });
    }
    next.icsFeeds = feeds;
  }

  // ── CalDAV ─────────────────────────────────────────────────────────────
  if (body.caldav && typeof body.caldav === "object") {
    const c = body.caldav;
    if (typeof c.user === "string") next.caldav.user = c.user.trim();
    // Password is write-only — only overwrite when a non-empty value arrives.
    if (typeof c.pass === "string" && c.pass.trim()) next.caldav.pass = c.pass;
    if (Array.isArray(c.includes)) {
      const includes: CalDAVInclude[] = [];
      for (const r of c.includes) {
        if (!r || typeof r !== "object") continue;
        const rawMatch = (r as CalDAVInclude).match;
        const rawDisplay = (r as CalDAVInclude).display;
        const match = typeof rawMatch === "string" ? rawMatch.trim() : "";
        const display = typeof rawDisplay === "string" ? rawDisplay.trim() : "";
        if (!match) continue;
        includes.push(display ? { match, display } : { match });
      }
      next.caldav.includes = includes;
    }
  }

  try {
    writeCalendarConfig(next);
  } catch (err) {
    return NextResponse.json({ error: `Failed to save: ${String(err)}` }, { status: 500 });
  }
  return NextResponse.json(toPublic(next));
}
