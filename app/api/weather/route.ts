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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("latitude"));
  const lon = Number(searchParams.get("longitude"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "latitude and longitude required" }, { status: 400 });
  }

  // Forward every param the caller supplied to open-meteo untouched.
  const omUrl = `${OPEN_METEO}?${searchParams.toString()}`;
  let om: Record<string, unknown>;
  try {
    const res = await fetch(omUrl, { next: { revalidate: 900 } });
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

  return NextResponse.json({ ...om, source });
}
