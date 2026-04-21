import { NextResponse } from "next/server";
import ical from "node-ical";

const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 15 * 60 * 1000;

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
  { name: "SDU",     envKey: "CALENDAR_SDU_URL" },
  { name: "Cand",    envKey: "CALENDAR_CAND_URL" },
  { name: "Arbejde", envKey: "CALENDAR_ARBEJDE_URL" },
];

async function fetchICSFeed(rawUrl: string, calName: string, from: Date, to: Date): Promise<CalEvent[]> {
  const url = rawUrl.replace(/^webcal:\/\//i, "https://");
  const res = await fetch(url, { headers: { "User-Agent": "DashboardApp/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseICS(await res.text(), calName, from, to);
}

// ── ICS parser (shared) ────────────────────────────────────────────────────────

function parseICS(text: string, calName: string, from: Date, to: Date): CalEvent[] {
  const parsed = ical.parseICS(text);
  const events: CalEvent[] = [];
  for (const comp of Object.values(parsed)) {
    if (comp.type !== "VEVENT") continue;
    const ev = comp as ical.VEvent;
    const start = ev.start instanceof Date ? ev.start : new Date(ev.start as unknown as string);
    const end   = ev.end   instanceof Date ? ev.end   : new Date((ev.end ?? ev.start) as unknown as string);
    if (isNaN(start.getTime())) continue;
    const allDay = (ev as unknown as Record<string, unknown>).datetype === "date";
    // DTEND for all-day events is exclusive — subtract 1 ms to get true end
    const effectiveEnd = allDay ? new Date(end.getTime() - 1) : end;
    if (effectiveEnd < from || start > to) continue;
    events.push({
      uid:         ev.uid ?? Math.random().toString(36),
      title:       ev.summary ?? "(No title)",
      start:       start.toISOString(),
      end:         end.toISOString(),
      allDay,
      calendar:    calName,
      location:    ev.location ?? undefined,
      description: (ev.description ?? "").replace(/\\n/g, "\n").trim() || undefined,
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

// CalDAV calendars to include (match by display name prefix)
const CALDAV_INCLUDE = ["Arbejde", "Skolerelateret", "Kalender", "Cand"];

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
    if (!CALDAV_INCLUDE.some((prefix) => name.startsWith(prefix))) continue;
    // Shorten long names for display
    const shortName = name.startsWith("Skolerelateret") ? "Skolerelateret" : name;
    calendars.push({ url: resolveHref(href, cFinal), name: shortName });
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

export async function GET() {
  const hasICS     = ICS_FEEDS.some((f) => !!process.env[f.envKey]);
  const hasCalDAV  = !!(process.env.ICLOUD_CALDAV_USER && process.env.ICLOUD_CALDAV_PASS);
  if (!hasICS && !hasCalDAV) return NextResponse.json({ configured: false, events: [] });

  const cacheKey = "calendar-all";
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) return NextResponse.json(cached.data);

  const now         = new Date();
  const oneMonthAgo = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
  const threeMonths = new Date(now.getTime() + 92 * 24 * 60 * 60 * 1000);
  const allEvents: CalEvent[] = [];

  // 1. ICS feeds
  await Promise.all(
    ICS_FEEDS.map(async ({ name, envKey }) => {
      const url = process.env[envKey];
      if (!url) return;
      try { allEvents.push(...await fetchICSFeed(url, name, oneMonthAgo, threeMonths)); }
      catch (err) { console.error(`[Calendar] ICS ${name}:`, String(err)); }
    })
  );

  // 2. iCloud CalDAV (Arbejde, Skolerelateret, Kalender)
  if (hasCalDAV) {
    try {
      const auth = "Basic " + Buffer.from(`${process.env.ICLOUD_CALDAV_USER}:${process.env.ICLOUD_CALDAV_PASS}`).toString("base64");
      const calendars = await fetchCalDAVCalendars(auth);
      await Promise.all(
        calendars.map(async ({ url, name }) => {
          try { allEvents.push(...await fetchCalDAVEvents(url, name, auth, oneMonthAgo, threeMonths)); }
          catch (err) { console.error(`[Calendar] CalDAV ${name}:`, String(err)); }
        })
      );
    } catch (err) {
      console.error("[Calendar] CalDAV discovery failed:", String(err));
      // Non-fatal: ICS events are still returned
    }
  }

  allEvents.sort((a, b) => a.start.localeCompare(b.start));
  const payload = { configured: true, events: allEvents };
  cache.set(cacheKey, { data: payload, ts: Date.now() });
  return NextResponse.json(payload);
}
