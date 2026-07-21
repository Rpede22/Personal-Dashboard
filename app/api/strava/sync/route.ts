import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getValidToken } from "../route";

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
  }>).filter((a) => a.type === "Run");

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

    await prisma.runLog.create({
      data: {
        date: dateUTC,
        distance: distKm,
        duration: durationSec,
        notes: `Strava: ${run.name}`,
        stravaId: String(run.id),
      },
    });
    // Remove any run plans for this day — the run covers it
    await prisma.runPlan.deleteMany({ where: { date: dateUTC } });
    imported++;
  }

  return NextResponse.json({ imported, skipped, total: runs.length });
}
