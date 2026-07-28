import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { discoverCalDAVCalendars, putCalDAVEvent, type QuickAddInput } from "@/lib/caldav";

/**
 * POST /api/calendar/add
 * Body: { calendar: string, title: string, startISO: string, endISO?: string,
 *         allDay?: boolean, location?: string, description?: string }
 *
 * Writes a new event to iCloud CalDAV. The calendar is chosen by display name
 * (must match one of the collections discovered under the user's principal —
 * typically "Kalender", "Arbejde", etc.). If `endISO` is omitted, defaults
 * to +1h for timed events and same-day for all-day events.
 */
export async function POST(request: Request) {
  const user = process.env.ICLOUD_CALDAV_USER;
  const pass = process.env.ICLOUD_CALDAV_PASS;
  if (!user || !pass) {
    return NextResponse.json({ error: "iCloud CalDAV not configured (ICLOUD_CALDAV_USER / ICLOUD_CALDAV_PASS)." }, { status: 503 });
  }

  let body: {
    calendar?: string;
    title?: string;
    startISO?: string;
    endISO?: string;
    allDay?: boolean;
    location?: string;
    description?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const { calendar, title, startISO, endISO, allDay, location, description } = body;
  if (!calendar || !title || !startISO) {
    return NextResponse.json({ error: "calendar, title, startISO required" }, { status: 400 });
  }
  const start = new Date(startISO);
  if (isNaN(start.getTime())) {
    return NextResponse.json({ error: "Invalid startISO" }, { status: 400 });
  }
  let end = endISO ? new Date(endISO) : null;
  if (end && isNaN(end.getTime())) end = null;
  if (!end) {
    end = new Date(start.getTime() + (allDay ? 24 * 3600 * 1000 : 60 * 60 * 1000));
  }

  const auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

  const calendars = await discoverCalDAVCalendars(auth);
  const match = calendars.find((c) => c.displayName === calendar)
             ?? calendars.find((c) => c.displayName.toLowerCase() === calendar.toLowerCase());
  if (!match) {
    return NextResponse.json({
      error: `Calendar "${calendar}" not found on iCloud. Available: ${calendars.map((c) => c.displayName).join(", ")}`,
    }, { status: 404 });
  }

  const uid = `dashboard-${Date.now()}-${randomUUID().slice(0, 8)}@dashboard.local`;
  const event: QuickAddInput = {
    uid,
    title,
    start,
    end,
    allDay: !!allDay,
    location: location || undefined,
    description: description || undefined,
  };

  try {
    const url = await putCalDAVEvent(match.url, auth, event);
    return NextResponse.json({ ok: true, url, uid });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
