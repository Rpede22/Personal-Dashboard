import { NextResponse } from "next/server";
import { discoverCalDAVCalendars, dav, resolveHref, extractAllHrefs } from "@/lib/caldav";

/**
 * POST /api/calendar/delete
 * Body: { calendar: string, uid: string }
 *
 * Deletes an event from an iCloud CalDAV calendar by UID. Only CalDAV-writeable
 * calendars are supported — ICS-feed events (Rasmus_skole, Cand, etc. via
 * `CALENDAR_*_URL`) can't be deleted from here since they're pulled from a
 * read-only URL feed managed elsewhere.
 *
 * Two-step lookup: (1) resolve the calendar collection by display name (using
 * the same normalization the add route uses so display renames don't break),
 * (2) REPORT the collection filtered by UID to get the exact .ics href, then
 * DELETE that href.
 */
export async function POST(request: Request) {
  const user = process.env.ICLOUD_CALDAV_USER;
  const pass = process.env.ICLOUD_CALDAV_PASS;
  if (!user || !pass) {
    return NextResponse.json({ error: "iCloud CalDAV not configured (ICLOUD_CALDAV_USER / ICLOUD_CALDAV_PASS)." }, { status: 503 });
  }

  let body: { calendar?: string; uid?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }

  const { calendar, uid } = body;
  if (!calendar || !uid) {
    return NextResponse.json({ error: "calendar and uid required" }, { status: 400 });
  }

  const auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

  const calendars = await discoverCalDAVCalendars(auth);
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-.]+/g, "");
  const needle = norm(calendar);
  const match =
    calendars.find((c) => c.displayName === calendar)
    ?? calendars.find((c) => c.displayName.toLowerCase() === calendar.toLowerCase())
    ?? calendars.find((c) => norm(c.displayName) === needle)
    ?? calendars.find((c) => norm(c.displayName).startsWith(needle))
    ?? calendars.find((c) => needle.startsWith(norm(c.displayName)));
  if (!match) {
    return NextResponse.json({
      error: `Calendar "${calendar}" not found on iCloud.`,
    }, { status: 404 });
  }

  // RRULE-expanded events use synthetic UIDs like `${baseUid}-${startISO}` —
  // the real CalDAV resource is keyed by the base UID only. Strip the
  // suffix so lookup finds the master event.
  const baseUid = uid.replace(/-\d{4}-\d{2}-\d{2}T[\d:.]+Z$/, "");

  const reportBody = `<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><D:getetag/></D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:prop-filter name="UID">
          <C:text-match collation="i;octet">${escapeXml(baseUid)}</C:text-match>
        </C:prop-filter>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

  let hrefs: string[] = [];
  try {
    const { text, finalUrl } = await dav(match.url, "REPORT", auth, reportBody, "1");
    hrefs = extractAllHrefs(text)
      .filter((h) => h.endsWith(".ics"))
      .map((h) => resolveHref(h, finalUrl));
  } catch (err) {
    return NextResponse.json({ error: `Lookup failed: ${String(err)}` }, { status: 502 });
  }

  if (hrefs.length === 0) {
    return NextResponse.json({ error: `Event "${baseUid}" not found in calendar "${match.displayName}".` }, { status: 404 });
  }

  // DELETE every matching resource (usually just one; RECURRENCE-ID overrides
  // may add extras — dropping them all removes the whole event cleanly).
  const errors: string[] = [];
  for (const href of hrefs) {
    try {
      const res = await fetch(href, {
        method: "DELETE",
        headers: { Authorization: auth, "User-Agent": "DashboardApp/1.0" },
      });
      if (!res.ok && res.status !== 404) errors.push(`${href}: ${res.status}`);
    } catch (err) {
      errors.push(`${href}: ${String(err)}`);
    }
  }

  if (errors.length) {
    return NextResponse.json({ error: `Delete failed: ${errors.join("; ")}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, deleted: hrefs.length });
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
}
