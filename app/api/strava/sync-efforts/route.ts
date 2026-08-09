import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getValidToken } from "../route";
import { extractBestEfforts } from "@/lib/strava-efforts";

/**
 * POST /api/strava/sync-efforts — backfill `bestEffortsJson` for existing
 * Strava-imported runs that don't have it yet. One Strava detail request per
 * run, so this can burn API budget on big libraries — the loop stops at 40
 * requests per invocation and can be called again to keep going. Newest runs
 * first so recent PRs light up quickly.
 *
 * Rate limits Strava enforces (as of the last check):
 *   • 100 requests / 15 min · 1000 / day (base)
 *   • sync always leaves budget for the main /athlete/activities call
 */
const MAX_PER_CALL = 40;

export async function POST() {
  const token = await getValidToken();
  if (!token) return NextResponse.json({ error: "Not connected to Strava" }, { status: 401 });

  const pending = await prisma.runLog.findMany({
    where: { stravaId: { not: null }, bestEffortsJson: null },
    orderBy: { date: "desc" },
    take: MAX_PER_CALL,
  });

  let updated = 0;
  let failed = 0;
  for (const run of pending) {
    try {
      const res = await fetch(`https://www.strava.com/api/v3/activities/${run.stravaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        // Rate-limited — stop; the remaining runs get picked up on the next call.
        if (res.status === 429) break;
        failed++;
        continue;
      }
      const detail = await res.json();
      const efforts = extractBestEfforts(detail?.best_efforts);
      await prisma.runLog.update({
        where: { id: run.id },
        data: { bestEffortsJson: efforts.length > 0 ? JSON.stringify(efforts) : "[]" },
      });
      updated++;
    } catch { failed++; }
  }

  const remaining = await prisma.runLog.count({
    where: { stravaId: { not: null }, bestEffortsJson: null },
  });

  return NextResponse.json({ updated, failed, remaining, batchSize: MAX_PER_CALL });
}
