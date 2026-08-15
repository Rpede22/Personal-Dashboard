import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getValidToken } from "../route";
import { fetchRunWeather } from "@/lib/run-weather";

/**
 * POST /api/strava/sync-weather — backfill `weatherJson` for existing runs
 * that don't have it. Prefers Strava's activity `start_latlng` for the
 * archive lookup; falls back to Aarhus for runs without coords and for
 * manual entries.
 *
 * Batches of 40 per call (open-meteo is generous but not unlimited). Loop
 * again until `remaining === 0`.
 */
const MAX_PER_CALL = 40;

export async function POST() {
  const token = await getValidToken(); // optional — we still work without Strava creds for manual runs

  const pending = await prisma.runLog.findMany({
    where: { weatherJson: null },
    orderBy: { date: "desc" },
    take: MAX_PER_CALL,
  });

  let updated = 0;
  let failed = 0;
  for (const run of pending) {
    let lat: number | null = null;
    let lon: number | null = null;
    let startISO: string = run.date.toISOString();

    if (run.stravaId && token) {
      try {
        const res = await fetch(`https://www.strava.com/api/v3/activities/${run.stravaId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const detail = await res.json();
          if (Array.isArray(detail?.start_latlng) && detail.start_latlng.length === 2) {
            lat = Number(detail.start_latlng[0]);
            lon = Number(detail.start_latlng[1]);
          }
          if (typeof detail?.start_date === "string") startISO = detail.start_date;
        } else if (res.status === 429) {
          break; // Strava rate-limited; try again next call
        }
      } catch { /* fall through to fallback coords */ }
    }

    const weather = await fetchRunWeather(startISO, lat, lon);
    if (weather) {
      await prisma.runLog.update({
        where: { id: run.id },
        data: { weatherJson: JSON.stringify(weather) },
      });
      updated++;
    } else {
      // Stamp an empty marker so we don't re-fetch this row forever.
      await prisma.runLog.update({
        where: { id: run.id },
        data: { weatherJson: "" },
      });
      failed++;
    }
  }

  const remaining = await prisma.runLog.count({ where: { weatherJson: null } });
  return NextResponse.json({ updated, failed, remaining, batchSize: MAX_PER_CALL });
}
