/**
 * Small CalDAV client for iCloud. Extracted from `app/api/calendar/route.ts`
 * so the read path (calendar GET) and the write path (quick-add POST) can
 * share the discovery + transport bits without either owning the other.
 *
 * Only the pieces both routes need live here — event parsing stays in
 * `app/api/calendar/route.ts` (that's a read-only concern).
 */

export interface DavResult { text: string; finalUrl: string }

/**
 * PROPFIND / REPORT / PUT / etc. against a CalDAV endpoint. Follows redirects
 * manually because fetch()'s `redirect: "follow"` downgrades to GET on 301/302
 * for non-GET methods — we need the original method preserved through the
 * hop chain, and we also want the *final* URL so hrefs can be resolved
 * against the right origin.
 */
export async function dav(
  url: string,
  method: string,
  auth: string,
  body: string,
  depth = "0",
  extraHeaders: Record<string, string> = {},
  hops = 0,
): Promise<DavResult> {
  if (hops > 8) throw new Error("Too many redirects");
  const headers: Record<string, string> = {
    Authorization: auth,
    "Content-Type": "application/xml; charset=utf-8",
    Depth: depth,
    "User-Agent": "DashboardApp/1.0",
    Accept: "text/xml, application/xml, */*",
    ...extraHeaders,
  };
  const res = await fetch(url, { method, headers, body, redirect: "manual" });
  if (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) {
    const loc = res.headers.get("location");
    if (loc) {
      const next = loc.startsWith("http") ? loc : new URL(loc, url).href;
      return dav(next, method, auth, body, depth, extraHeaders, hops + 1);
    }
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`${method} ${url} → HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  return { text: await res.text(), finalUrl: url };
}

export function resolveHref(href: string, serverUrl: string): string {
  if (href.startsWith("http")) return href;
  return new URL(serverUrl).origin + (href.startsWith("/") ? href : "/" + href);
}

export function extractHref(xml: string, parentTag: string): string | null {
  const escaped = parentTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<(?:[^:>]+:)?${escaped}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${escaped}>`, "i");
  const block = xml.match(re);
  if (!block) return null;
  const hrefRe = /<(?:[^:>]+:)?href[^>]*>([^<\s]+)<\/(?:[^:>]+:)?href>/i;
  const hm = block[1].match(hrefRe);
  return hm ? hm[1].trim() : null;
}

export function extractAllHrefs(xml: string): string[] {
  const hrefs: string[] = [];
  const re = /<(?:[^:>]+:)?href[^>]*>([^<\s]+)<\/(?:[^:>]+:)?href>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) hrefs.push(m[1].trim());
  return hrefs;
}

export function extractDisplayNames(xml: string): string[] {
  const names: string[] = [];
  const re = /<(?:[^:>]+:)?displayname[^>]*>([^<]*)<\/(?:[^:>]+:)?displayname>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) names.push(m[1].trim());
  return names;
}

export interface CalDAVCalendar { url: string; displayName: string }

/** Discover every calendar collection under the current user's calendar-home.
 *  Returns the iCloud display name as-is (no prefix filtering) so the caller
 *  can pick the right one by whatever rule they need. */
export async function discoverCalDAVCalendars(auth: string): Promise<CalDAVCalendar[]> {
  const propfindPrincipal = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:"><D:prop><D:current-user-principal/></D:prop></D:propfind>`;
  const { text: pXml, finalUrl: pFinal } = await dav("https://caldav.icloud.com/", "PROPFIND", auth, propfindPrincipal, "0");
  const principalHref = extractHref(pXml, "current-user-principal");
  if (!principalHref) throw new Error("Cannot find current-user-principal");
  const principalUrl = resolveHref(principalHref, pFinal);

  const propfindHome = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><C:calendar-home-set/></D:prop>
</D:propfind>`;
  const { text: hXml, finalUrl: hFinal } = await dav(principalUrl, "PROPFIND", auth, propfindHome, "0");
  const homeHref = extractHref(hXml, "calendar-home-set");
  if (!homeHref) throw new Error("Cannot find calendar-home-set");
  const homeUrl = resolveHref(homeHref, hFinal);

  const propfindCals = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><D:displayname/><D:resourcetype/><C:supported-calendar-component-set/></D:prop>
</D:propfind>`;
  const { text: cXml, finalUrl: cFinal } = await dav(homeUrl, "PROPFIND", auth, propfindCals, "1");
  const homePathname = new URL(homeUrl).pathname.replace(/\/$/, "");

  const calendars: CalDAVCalendar[] = [];
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

    // Only include collections that declare VEVENT support (skip contacts, tasks, etc.).
    if (!/vevent/i.test(block)) continue;

    const names = extractDisplayNames(block);
    const displayName = names[0] ?? "(unnamed)";
    const url = resolveHref(href, cFinal);
    calendars.push({ url, displayName });
  }
  return calendars;
}

/** Build an RFC 5545 date string (`YYYYMMDDTHHmmssZ` for UTC, or `YYYYMMDD`
 *  for all-day). Assumes the input Date is already in the intended TZ. */
export function icsDate(d: Date, allDay: boolean): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getUTCFullYear();
  const mo = pad(d.getUTCMonth() + 1);
  const da = pad(d.getUTCDate());
  if (allDay) return `${y}${mo}${da}`;
  const h = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const s = pad(d.getUTCSeconds());
  return `${y}${mo}${da}T${h}${mi}${s}Z`;
}

function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export interface QuickAddInput {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
  description?: string;
}

/** Build a minimal single-event VCALENDAR that iCloud accepts. Long lines are
 *  folded at 74 chars (RFC 5545 §3.1) — iCloud tolerates unfolded lines but
 *  the folding keeps the payload spec-clean. */
export function buildIcsEvent(input: QuickAddInput): string {
  const now = icsDate(new Date(), false);
  const startProp = input.allDay ? `DTSTART;VALUE=DATE:${icsDate(input.start, true)}` : `DTSTART:${icsDate(input.start, false)}`;
  const endProp   = input.allDay ? `DTEND;VALUE=DATE:${icsDate(input.end, true)}`     : `DTEND:${icsDate(input.end, false)}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dashboard//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${now}`,
    startProp,
    endProp,
    `SUMMARY:${escapeIcsText(input.title)}`,
    ...(input.location    ? [`LOCATION:${escapeIcsText(input.location)}`]       : []),
    ...(input.description ? [`DESCRIPTION:${escapeIcsText(input.description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n");
}

function foldLine(line: string): string {
  if (line.length <= 74) return line;
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    chunks.push(rest.slice(0, 74));
    rest = rest.slice(74);
  }
  chunks.push(rest);
  return chunks.join("\r\n ");
}

/** PUT a fresh event to a discovered calendar collection. Returns the new
 *  resource URL (`{calendarUrl}{uid}.ics`). */
export async function putCalDAVEvent(
  calendarUrl: string,
  auth: string,
  event: QuickAddInput,
): Promise<string> {
  const ics = buildIcsEvent(event);
  const target = calendarUrl.replace(/\/$/, "") + `/${encodeURIComponent(event.uid)}.ics`;
  const res = await fetch(target, {
    method: "PUT",
    headers: {
      Authorization: auth,
      "Content-Type": "text/calendar; charset=utf-8",
      "If-None-Match": "*", // create only — don't overwrite an existing UID
      "User-Agent": "DashboardApp/1.0",
    },
    body: ics,
    redirect: "manual",
  });
  if (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) {
    const loc = res.headers.get("location");
    if (loc) {
      const next = loc.startsWith("http") ? loc : new URL(loc, target).href;
      const retry = await fetch(next, {
        method: "PUT",
        headers: {
          Authorization: auth,
          "Content-Type": "text/calendar; charset=utf-8",
          "If-None-Match": "*",
          "User-Agent": "DashboardApp/1.0",
        },
        body: ics,
      });
      if (!retry.ok) throw new Error(`PUT after redirect → HTTP ${retry.status}`);
      return next;
    }
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`PUT ${target} → HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  return target;
}
