import { NextResponse } from "next/server";
import ical from "node-ical";

const cache = new Map<string, { data: unknown; ts: number }>();
// Shorter TTL so the auto-refresh in the UI actually pulls fresh data every hour
const TTL = 15 * 60 * 1000;
// Look 365 days ahead (was 92) so long-term events like exam dates show up early.
const DAYS_BACK = 31;
const DAYS_FORWARD = 365;

export interface CalEvent {
  uid: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendar: string;
  location?: string;
  description?: string;
}

// ── ICS feed sources ───────────────────────────────────────────────────────────

const ICS_FEEDS = [
  { name: "Rasmus_skole",   envKey: "CALENDAR_SDU_URL" },
  { name: "Cand",           envKey: "CALENDAR_CAND_URL" },
  { name: "Rasmus_arbejde", envKey: "CALENDAR_ARBEJDE_URL" },
];

async function fetchICSFeed(rawUrl: string, calName: string, from: Date, to: Date): Promise<CalEvent[]> {
  const url = rawUrl.replace(/^webcal:\/\//i, "https://");
  const res = await fetch(url, { headers: { "User-Agent": "DashboardApp/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseICS(await res.text(), calName, from, to);
}

// ── ICS parser (shared) ────────────────────────────────────────────────────────

// node-ical properties can be a plain string or a ParameterValue object { val, params }.
// This helper extracts the string regardless of which form it takes.
function strVal(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "object" && "val" in (v as object)) return (v as { val: string }).val;
  return undefined;
}

function parseICS(text: string, calName: string, from: Date, to: Date): CalEvent[] {
  const parsed = ical.parseICS(text);
  const events: CalEvent[] = [];
  for (const comp of Object.values(parsed)) {
    if (!comp || comp.type !== "VEVENT") continue;
    const ev = comp as ical.VEvent;
    const start = ev.start instanceof Date ? ev.start : new Date(ev.start as unknown as string);
    const end   = ev.end   instanceof Date ? ev.end   : new Date(((ev.end as Date | undefined) ?? ev.start) as unknown as string);
    if (isNaN(start.getTime())) continue;
    const allDay = (ev as unknown as Record<string, unknown>).datetype === "date";

    const baseUid   = strVal(ev.uid) ?? Math.random().toString(36);
    const title     = strVal(ev.summary) ?? "(No title)";
    const location  = strVal(ev.location);
    const descRaw   = strVal(ev.description);
    const description = descRaw ? descRaw.replace(/\\n/g, "\n").trim() || undefined : undefined;
    const durationMs = end.getTime() - start.getTime();

    // If the event has a recurrence rule, expand it into instances that fall inside the window.
    // Without this, a weekly event whose DTSTART is outside `from` gets dropped even though its
    // occurrences within `from..to` should show up.
    const rrule = (ev as unknown as { rrule?: { between: (a: Date, b: Date, inc?: boolean) => Date[] } }).rrule;
    if (rrule && typeof rrule.between === "function") {
      // Widen the range by one event duration on each side so an occurrence that starts before
      // `from` but ends inside the window still shows up.
      const occurrences = rrule.between(new Date(from.getTime() - durationMs), to, true);
      for (const occStart of occurrences) {
        const occEnd = new Date(occStart.getTime() + durationMs);
        const effectiveEnd = allDay ? new Date(occEnd.getTime() - 1) : occEnd;
        if (effectiveEnd < from || occStart > to) continue;
        events.push({
          uid:         `${baseUid}-${occStart.toISOString()}`,
          title,
          start:       occStart.toISOString(),
          end:         occEnd.toISOString(),
          allDay,
          calendar:    calName,
          location,
          description,
        });
      }
      continue;
    }

    // DTEND for all-day events is exclusive — subtract 1 ms to get true end
    const effectiveEnd = allDay ? new Date(end.getTime() - 1) : end;
    if (effectiveEnd < from || start > to) continue;
    events.push({
      uid:         baseUid,
      title,
      start:       start.toISOString(),
      end:         end.toISOString(),
      allDay,
      calendar:    calName,
      location,
      description,
    });
  }
  return events;
}

// ── CalDAV helpers ─────────────────────────────────────────────────────────────
// fetch() with redirect:"follow" downgrades PROPFIND→GET on 301/302.
// We follow redirects manually to preserve the HTTP method AND track the final URL.

interface DavResult { text: string; finalUrl: string }

async function dav(url: string, method: string, auth: string, body: string, depth = "0", hops = 0): Promise<DavResult> {
  if (hops > 8) throw new Error("Too many redirects");
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: auth,
      "Content-Type": "application/xml; charset=utf-8",
      Depth: depth,
      "User-Agent": "DashboardApp/1.0",
      Accept: "text/xml, application/xml, */*",
    },
    body,
    redirect: "manual",
  });
  if (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) {
    const loc = res.headers.get("location");
    if (loc) {
      const next = loc.startsWith("http") ? loc : new URL(loc, url).href;
      return dav(next, method, auth, body, depth, hops + 1);
    }
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`${method} ${url} → HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  return { text: await res.text(), finalUrl: url };
}

function resolveHref(href: string, serverUrl: string): string {
  if (href.startsWith("http")) return href;
  return new URL(serverUrl).origin + (href.startsWith("/") ? href : "/" + href);
}

function extractHref(xml: string, parentTag: string): string | null {
  const escaped = parentTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<(?:[^:>]+:)?${escaped}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${escaped}>`, "i");
  const block = xml.match(re);
  if (!block) return null;
  const hrefRe = /<(?:[^:>]+:)?href[^>]*>([^<\s]+)<\/(?:[^:>]+:)?href>/i;
  const hm = block[1].match(hrefRe);
  return hm ? hm[1].trim() : null;
}

function extractAllHrefs(xml: string): string[] {
  const hrefs: string[] = [];
  const re = /<(?:[^:>]+:)?href[^>]*>([^<\s]+)<\/(?:[^:>]+:)?href>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) hrefs.push(m[1].trim());
  return hrefs;
}

function extractDisplayNames(xml: string): string[] {
  const names: string[] = [];
  const re = /<(?:[^:>]+:)?displayname[^>]*>([^<]*)<\/(?:[^:>]+:)?displayname>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) names.push(m[1].trim());
  return names;
}

function extractCalendarData(xml: string): string[] {
  const blocks: string[] = [];
  const re = /<(?:[^:>]+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?calendar-data>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) blocks.push(m[1].trim());
  return blocks;
}

// CalDAV calendars to include (match by iCloud display name prefix). Add a
// prefix here for every iCloud calendar you want surfaced (and writeable via
// the quick-add picker). `Cand` intentionally dropped — the ICS
// `CALENDAR_CAND_URL` feed covers it. `Rasmus` catches any iCloud calendar
// starting with that name (e.g. `Rasmus_skole`, `Rasmus_arbejde`) alongside
// the ICS feeds of the same name — the ICS entries stay read-only, but a
// matching iCloud calendar becomes writeable.
const CALDAV_INCLUDE = ["Arbejde", "Kalender", "Rasmus"];

// Rename iCloud-side display names to the labels shown in the app.
// Keyed by the CALDAV_INCLUDE prefix that matched — the app label replaces
// the raw iCloud name for every calendar under that prefix.
// `Rasmus` remaps to `Rasmus_arbejde` so any iCloud calendar starting with
// `Rasmus` (e.g. `Rasmus Arbejde`) collapses onto the existing ICS feed name
// and gets skipped by the collision guard rather than showing up as a
// duplicate chip.
const CALDAV_DISPLAY_NAME: Record<string, string> = {
  Arbejde: "Jennifer_arbejde",
  Rasmus:  "Rasmus_arbejde",
};

async function fetchCalDAVCalendars(auth: string): Promise<{ url: string; name: string }[]> {
  // Discover principal
  const propfindPrincipal = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:"><D:prop><D:current-user-principal/></D:prop></D:propfind>`;
  const { text: pXml, finalUrl: pFinal } = await dav("https://caldav.icloud.com/", "PROPFIND", auth, propfindPrincipal, "0");
  const principalHref = extractHref(pXml, "current-user-principal");
  if (!principalHref) throw new Error("Cannot find current-user-principal");
  const principalUrl = resolveHref(principalHref, pFinal);

  // Get calendar home
  const propfindHome = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><C:calendar-home-set/></D:prop>
</D:propfind>`;
  const { text: hXml, finalUrl: hFinal } = await dav(principalUrl, "PROPFIND", auth, propfindHome, "0");
  const homeHref = extractHref(hXml, "calendar-home-set");
  if (!homeHref) throw new Error("Cannot find calendar-home-set");
  const homeUrl = resolveHref(homeHref, hFinal);

  // List calendars
  const propfindCals = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><D:displayname/><D:resourcetype/><C:supported-calendar-component-set/></D:prop>
</D:propfind>`;
  const { text: cXml, finalUrl: cFinal } = await dav(homeUrl, "PROPFIND", auth, propfindCals, "1");
  const homePathname = new URL(homeUrl).pathname.replace(/\/$/, "");

  const calendars: { url: string; name: string }[] = [];
  const responseBlocks = cXml.split(/<\/?(?:[^:>]+:)?response>/i).filter((b) =>
    b.includes("href") || b.includes("displayname")
  );
  for (const block of responseBlocks) {
    if (!block.toLowerCase().includes("calendar")) continue;
    const hrefs = extractAllHrefs(block);
    if (!hrefs.length) continue;
    const href = hrefs[0];
    const pathname = href.startsWith("http") ? new URL(href).pathname : href;
    if (pathname.replace(/\/$/, "") === homePathname) continue;
    const names = extractDisplayNames(block);
    const name = names[0] ?? href.split("/").filter(Boolean).pop() ?? "Calendar";
    // Only include calendars whose names start with one of our target prefixes
    const matchedPrefix = CALDAV_INCLUDE.find((prefix) => name.startsWith(prefix));
    if (!matchedPrefix) continue;
    // Prefer the explicit display-name mapping (matched by prefix); otherwise keep the iCloud name.
    const displayName = CALDAV_DISPLAY_NAME[matchedPrefix] ?? name;
    calendars.push({ url: resolveHref(href, cFinal), name: displayName });
  }
  return calendars;
}

async function fetchCalDAVEvents(
  calendarUrl: string,
  calendarName: string,
  auth: string,
  from: Date,
  to: Date
): Promise<CalEvent[]> {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const reportBody = `<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><D:getetag/><C:calendar-data/></D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${fmt(from)}" end="${fmt(to)}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

  let xml: string;
  try {
    const result = await dav(calendarUrl, "REPORT", auth, reportBody, "1");
    xml = result.text;
  } catch {
    return [];
  }

  const events: CalEvent[] = [];
  for (const ics of extractCalendarData(xml)) {
    try {
      events.push(...parseICS(ics, calendarName, from, to));
    } catch { continue; }
  }
  return events;
}

// ── Route ──────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const hasICS     = ICS_FEEDS.some((f) => !!process.env[f.envKey]);
  const hasCalDAV  = !!(process.env.ICLOUD_CALDAV_USER && process.env.ICLOUD_CALDAV_PASS);
  if (!hasICS && !hasCalDAV) return NextResponse.json({ configured: false, events: [] });

  const bust = new URL(request.url).searchParams.get("bust") === "1";
  const cacheKey = "calendar-all";
  const cached = cache.get(cacheKey);
  if (!bust && cached && Date.now() - cached.ts < TTL) return NextResponse.json(cached.data);

  const now         = new Date();
  const oneMonthAgo = new Date(now.getTime() - DAYS_BACK    * 24 * 60 * 60 * 1000);
  const threeMonths = new Date(now.getTime() + DAYS_FORWARD * 24 * 60 * 60 * 1000);
  const allEvents: CalEvent[] = [];
  const fetchErrors: string[] = [];
  // Track every configured calendar name so the UI can show filter toggles even
  // for calendars that currently have zero events in the window.
  const allCalendarNames = new Set<string>();
  // Subset of allCalendarNames that we can PUT events to (iCloud CalDAV, not
  // read-only ICS feeds). Powers the quick-add picker.
  const writableCalendarNames = new Set<string>();

  // 1. ICS feeds — always register the name even if the feed is empty or failed,
  //    so the calendar filter chip still appears in the UI.
  await Promise.all(
    ICS_FEEDS.map(async ({ name, envKey }) => {
      const url = process.env[envKey];
      console.log(`[Calendar] ICS ${name} (${envKey}): url=${url ? url.slice(0, 40) + "..." : "UNSET"}`);
      if (!url) return;
      allCalendarNames.add(name);
      try {
        const evs = await fetchICSFeed(url, name, oneMonthAgo, threeMonths);
        console.log(`[Calendar] ICS ${name}: fetched ${evs.length} events`);
        allEvents.push(...evs);
      }
      catch (err) {
        const msg = `ICS ${name}: ${String(err)}`;
        console.error(`[Calendar] ${msg}`);
        fetchErrors.push(msg);
      }
    })
  );

  // 2. iCloud CalDAV — same rule: register the display name for every discovered
  //    calendar, even if fetching its events fails.
  if (hasCalDAV) {
    try {
      const auth = "Basic " + Buffer.from(`${process.env.ICLOUD_CALDAV_USER}:${process.env.ICLOUD_CALDAV_PASS}`).toString("base64");
      // Skip any CalDAV calendar whose name collides with an already-registered
      // ICS feed — otherwise the app shows a duplicate chip (usually the iCloud
      // side is empty since the real events come from the ICS URL).
      const calendars = (await fetchCalDAVCalendars(auth)).filter(
        (c) => !allCalendarNames.has(c.name)
      );
      for (const { name } of calendars) {
        allCalendarNames.add(name);
        writableCalendarNames.add(name);
      }
      await Promise.all(
        calendars.map(async ({ url, name }) => {
          try { allEvents.push(...await fetchCalDAVEvents(url, name, auth, oneMonthAgo, threeMonths)); }
          catch (err) {
            const msg = `CalDAV ${name}: ${String(err)}`;
            console.error(`[Calendar] ${msg}`);
            fetchErrors.push(msg);
          }
        })
      );
    } catch (err) {
      const msg = `CalDAV discovery: ${String(err)}`;
      console.error(`[Calendar] ${msg}`);
      fetchErrors.push(msg);
      // Non-fatal: ICS events are still returned
    }
  }

  allEvents.sort((a, b) => a.start.localeCompare(b.start));

  // Dedupe: the same real-world event can arrive twice — e.g. an RRULE master
  // gets expanded AND the ICS also ships explicit RECURRENCE-ID overrides for
  // the same date, or two feeds both list the same meeting. Two events with
  // the same (start, end, title, calendar) are treated as one; the first copy
  // wins. Compared to intra-second precision by trimming the ISO to seconds.
  const seen = new Set<string>();
  const dedupedEvents: CalEvent[] = [];
  for (const e of allEvents) {
    const key = `${e.start.slice(0, 19)}|${e.end.slice(0, 19)}|${e.title}|${e.calendar}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedEvents.push(e);
  }

  const payload = {
    configured: true,
    events: dedupedEvents,
    errors: fetchErrors,
    calendars: [...allCalendarNames].sort(),
    writableCalendars: [...writableCalendarNames].sort(),
  };
  cache.set(cacheKey, { data: payload, ts: Date.now() });
  return NextResponse.json(payload);
}
