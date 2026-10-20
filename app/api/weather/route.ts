import { NextResponse } from "next/server";
import { overlayDmi, inDenmark } from "@/lib/weather";

/**
 * Weather proxy. Forwards the caller's open-meteo query verbatim to
 * api.open-meteo.com, then overlays DMI (Danish Met Institute) near-term values
 * for Danish coordinates via `overlayDmi`. Returns the open-meteo response shape
 * unchanged (so every weather consumer keeps its existing parsing) plus a
 * `source` field: "dmi" when DMI values were blended in, else "open-meteo".
 *
 * Consumers call `/api/weather?latitude=..&longitude=..&<their open-meteo params>`
 * instead of hitting open-meteo directly — the DMI blend can't run client-side
 * (CORS + we want one place for the logic).
 */

const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";

// Short in-memory cache (keyed by the full query) so the ~5 weather widgets
// loading at once don't each hit open-meteo, without using Next's disk Data
// Cache (which froze the forecast weeks in the past).
const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 10 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("latitude"));
  const lon = Number(searchParams.get("longitude"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "latitude and longitude required" }, { status: 400 });
  }

  const qs = searchParams.toString();
  const cached = cache.get(qs);
  if (cached && Date.now() - cached.ts < TTL) return NextResponse.json(cached.data);

  // Forward every param the caller supplied to open-meteo untouched.
  const omUrl = `${OPEN_METEO}?${qs}`;
  let om: Record<string, unknown>;
  try {
    // no-store: open-meteo returns a rolling forecast whose dates shift daily;
    // Next's fetch Data Cache baked an old window to disk, freezing the forecast
    // weeks in the past (see lib/fotmob.ts). Consumers refresh on a ~30-60 min
    // client timer, so no server cache is needed.
    const res = await fetch(omUrl, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ error: `open-meteo ${res.status}` }, { status: 502 });
    om = await res.json();
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }

  let source: "dmi" | "open-meteo" = "open-meteo";
  if (inDenmark(lat, lon)) {
    try {
      if (await overlayDmi(om, lat, lon)) source = "dmi";
    } catch { /* DMI is a best-effort overlay — fall back to pure open-meteo */ }
  }

  const payload = { ...om, source };
  cache.set(qs, { data: payload, ts: Date.now() });
  return NextResponse.json(payload);
}
