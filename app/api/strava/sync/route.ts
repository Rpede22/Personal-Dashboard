import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getValidToken } from "../route";
import { extractBestEfforts } from "@/lib/strava-efforts";
import { fetchRunWeather } from "@/lib/run-weather";
import { bucketHrZonesFromStreams, boundariesFromStravaZones } from "@/lib/hr-zones";

// POST /api/strava/sync — import recent activities from Strava
export async function POST() {
  const token = await getValidToken();
  if (!token) {
    return NextResponse.json({ error: "Not connected to Strava" }, { status: 401 });
  }

  // Fetch last 30 days of activities
  const after = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
  const res = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    // Return a friendlier message so the UI can explain the fix
    const bodyText = await res.text().catch(() => "");
    let hint = "";
    if (res.status === 401) hint = "Token invalid or expired — click Disconnect then Connect Strava again.";
    else if (res.status === 403) hint = "Missing scope. Disconnect and reconnect Strava so it re-requests activity:read_all.";
    else if (res.status === 429) hint = "Rate limit hit (100 req / 15 min · 1000 / day). Wait a few minutes.";
    return NextResponse.json(
      { error: `Strava API ${res.status}${hint ? ` — ${hint}` : ""}`, body: bodyText.slice(0, 200) },
      { status: res.status }
    );
  }

  const activities = await res.json();

  // Filter to Run activities only
  const runs = (activities as Array<{
    id: number;
    type: string;
    start_date: string;
    distance: number;
    moving_time: number;
    name: string;
    start_latlng?: [number, number] | null;
  }>).filter((a) => a.type === "Run");

  // Default shoe for auto-imports = the most recently-used, non-retired shoe.
  // Users can reassign on the run row if they wore something else.
  const lastShoeRun = await prisma.runLog.findFirst({
    where: { shoeId: { not: null } },
    orderBy: { date: "desc" },
    include: { /* nothing — we only need shoeId */ } as never,
  });
  let defaultShoeId: number | null = lastShoeRun?.shoeId ?? null;
  if (defaultShoeId) {
    const shoe = await prisma.shoe.findUnique({ where: { id: defaultShoeId } });
    if (!shoe || shoe.retired) defaultShoeId = null;
  }

  // Fetch the athlete's configured HR zones once so every run this batch
  // gets bucketed against exactly the ranges they see on strava.com. Silent
  // on failure — bucketing then falls back to the % model.
  let hrZoneBoundaries: number[] | null = null;
  try {
    const zonesRes = await fetch("https://www.strava.com/api/v3/athlete/zones", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (zonesRes.ok) {
      const j = await zonesRes.json();
      hrZoneBoundaries = boundariesFromStravaZones(j?.heart_rate?.zones);
    }
  } catch { /* silent */ }

  let imported = 0;
  let skipped = 0;

  for (const run of runs) {
    const date = new Date(run.start_date);
    // Normalize to UTC midnight for matching
    const dateUTC = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const distKm = Math.round((run.distance / 1000) * 100) / 100;
    const durationSec = run.moving_time;

    // Check if a run already exists on this date with similar distance (within 0.5km)
    const existing = await prisma.runLog.findFirst({
      where: {
        date: dateUTC,
        distance: { gte: distKm - 0.5, lte: distKm + 0.5 },
      },
    });

    if (existing) {
      // Backfill stravaId if it was imported before that field existed
      if (!existing.stravaId) {
        await prisma.runLog.update({
          where: { id: existing.id },
          data: { stravaId: String(run.id) },
        });
      }
      skipped++;
      continue;
    }

    // Snapshot the planned distance for this date (if a plan exists) before
    // the plan is deleted — keeps `weekPlannedKm` intact so the widget's
    // "vs plan" bar still shows this week's target after the run happens.
    const planForDay = await prisma.runPlan.findFirst({ where: { date: dateUTC } });

    // Pull the activity detail for its `best_efforts` array. Strava only
    // exposes best_efforts on the detail endpoint (not the summary list).
    // Per-run cost is one extra request; the endpoint's response is cached
    // internally by the Next.js data fetching layer if hit again. Any
    // network/parse failure is non-fatal — we just save without efforts.
    let bestEffortsJson: string | null = null;
    try {
      const detailRes = await fetch(`https://www.strava.com/api/v3/activities/${run.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (detailRes.ok) {
        const detail = await detailRes.json();
        const efforts = extractBestEfforts(detail?.best_efforts);
        if (efforts.length > 0) bestEffortsJson = JSON.stringify(efforts);
      }
    } catch { /* silent — leave bestEffortsJson null */ }

    // Weather at the run's start (open-meteo archive; free, no key).
    const [lat, lon] = run.start_latlng ?? [null, null];
    const weather = await fetchRunWeather(run.start_date, lat, lon);
    const weatherJson = weather ? JSON.stringify(weather) : null;

    // Strava HR streams → Z1..Z5 breakdown. One extra request per run.
    let hrZonesJson: string | null = null;
    try {
      const streamsRes = await fetch(
        `https://www.strava.com/api/v3/activities/${run.id}/streams?keys=heartrate,time&key_by_type=true`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (streamsRes.ok) {
        const streams = await streamsRes.json();
        const zones = bucketHrZonesFromStreams(streams?.heartrate?.data, streams?.time?.data, { zoneBoundaries: hrZoneBoundaries });
        if (zones) hrZonesJson = JSON.stringify(zones);
      }
    } catch { /* silent — leave hrZonesJson null */ }

    await prisma.runLog.create({
      data: {
        date: dateUTC,
        distance: distKm,
        duration: durationSec,
        notes: `Strava: ${run.name}`,
        stravaId: String(run.id),
        plannedDistance: planForDay?.distance ?? null,
        bestEffortsJson,
        weatherJson,
        hrZonesJson,
        shoeId: defaultShoeId,
      },
    });
    // Remove any run plans for this day — the run covers it
    await prisma.runPlan.deleteMany({ where: { date: dateUTC } });
    imported++;
  }

  return NextResponse.json({ imported, skipped, total: runs.length });
}
