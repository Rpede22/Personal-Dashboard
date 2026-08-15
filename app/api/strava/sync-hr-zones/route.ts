import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getValidToken } from "../route";
import { bucketHrZonesFromStreams, boundariesFromStravaZones } from "@/lib/hr-zones";

/**
 * POST /api/strava/sync-hr-zones — backfill `hrZonesJson` for Strava-imported
 * runs that don't have it yet. One `/streams` request per run.
 *
 * Batches of 40 to match the other backfill routes. Stops on 429 rate-limit
 * so the remaining runs get picked up on the next call.
 */
const MAX_PER_CALL = 40;

export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;

  // `?reset=1` clears cached zones so a subsequent normal call recomputes
  // them under the current bucketing rules. Sentinel `""` (no HR sensor) is
  // preserved so we don't re-fetch those forever. Does not call Strava.
  if (params.get("reset") === "1") {
    const result = await prisma.runLog.updateMany({
      where: { stravaId: { not: null }, NOT: { hrZonesJson: "" } },
      data: { hrZonesJson: null },
    });
    return NextResponse.json({ reset: true, cleared: result.count });
  }

  const token = await getValidToken();
  if (!token) return NextResponse.json({ error: "Not connected to Strava" }, { status: 401 });

  const pending = await prisma.runLog.findMany({
    where: { stravaId: { not: null }, hrZonesJson: null },
    orderBy: { date: "desc" },
    take: MAX_PER_CALL,
  });

  // Pull the athlete's configured HR zones once per batch — matches what the
  // athlete sees on strava.com. Silent fallback to the % model on failure.
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

  let updated = 0;
  let failed = 0;
  for (const run of pending) {
    try {
      const res = await fetch(
        `https://www.strava.com/api/v3/activities/${run.stravaId}/streams?keys=heartrate,time&key_by_type=true`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        if (res.status === 429) break;
        failed++;
        continue;
      }
      const streams = await res.json();
      const zones = bucketHrZonesFromStreams(streams?.heartrate?.data, streams?.time?.data, { zoneBoundaries: hrZoneBoundaries });
      await prisma.runLog.update({
        where: { id: run.id },
        // Sentinel `""` marks a run we've already asked about — Strava will
        // never give us zones for a run recorded without a chest strap /
        // wrist HR, and we don't want to keep asking.
        data: { hrZonesJson: zones ? JSON.stringify(zones) : "" },
      });
      if (zones) updated++;
      else failed++;
    } catch { failed++; }
  }

  const remaining = await prisma.runLog.count({ where: { stravaId: { not: null }, hrZonesJson: null } });
  return NextResponse.json({ updated, failed, remaining, batchSize: MAX_PER_CALL });
}
