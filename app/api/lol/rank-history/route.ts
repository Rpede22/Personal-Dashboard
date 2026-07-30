import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rankToLadderPoints } from "@/lib/rank-history";

/**
 * GET /api/lol/rank-history?accountId=X&days=30
 *
 * Returns rank snapshots for the given account over the last N days (default 30),
 * grouped by queueType. Each point includes ladder LP so the client can plot
 * a monotonic sparkline across tier boundaries.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountIdParam = searchParams.get("accountId");
  const days = Math.max(1, Math.min(365, parseInt(searchParams.get("days") ?? "30")));
  if (!accountIdParam) return NextResponse.json({ error: "accountId required" }, { status: 400 });

  const accountId = parseInt(accountIdParam);
  const since = new Date(Date.now() - days * 86400000);

  const rows = await prisma.lolRankSnapshot.findMany({
    where: { accountId, capturedAt: { gte: since } },
    orderBy: { capturedAt: "asc" },
  });

  const grouped: Record<string, Array<{ t: number; lp: number; tier: string; division: string; leaguePoints: number; wins: number; losses: number }>> = {};
  for (const r of rows) {
    if (!grouped[r.queueType]) grouped[r.queueType] = [];
    grouped[r.queueType].push({
      t: r.capturedAt.getTime(),
      lp: rankToLadderPoints(r.tier, r.division, r.leaguePoints),
      tier: r.tier,
      division: r.division,
      leaguePoints: r.leaguePoints,
      wins: r.wins,
      losses: r.losses,
    });
  }

  return NextResponse.json({ queues: grouped });
}
