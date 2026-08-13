import { NextResponse } from "next/server";

/**
 * Top-N scoring leaders for the current NHL regular season.
 *
 * Source: api.nhle.com/stats/rest/en/skater/summary — the official stats
 * endpoint that returns GP/G/A/P per row (unlike the newer
 * skater-stats-leaders/current which only returns one leader value per
 * category). Filter to gameTypeId=2 so playoffs never leak in.
 *
 * Season inference: NHL regular season starts in early October. If we're
 * past Oct 1 use current→next year; before Oct 1 use last→current year. The
 * league uses YYYYYYYY (e.g. `20252026`).
 */

let cache: { seasonId: string; leaders: Leader[]; ts: number } | null = null;
const TTL = 15 * 60 * 1000;

interface Leader {
  playerId: number;
  name: string;
  team: string;
  position: string;
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number;
}

function currentSeasonId(now: Date): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0=Jan
  const start = m >= 9 ? y : y - 1;
  return `${start}${start + 1}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "10", 10) || 10, 1), 50);
  const seasonId = currentSeasonId(new Date());

  if (cache && cache.seasonId === seasonId && Date.now() - cache.ts < TTL) {
    return NextResponse.json({ seasonId, leaders: cache.leaders.slice(0, limit) });
  }

  const sort = encodeURIComponent(JSON.stringify([{ property: "points", direction: "DESC" }]));
  const cayenne = encodeURIComponent(`seasonId=${seasonId} and gameTypeId=2`);
  const url = `https://api.nhle.com/stats/rest/en/skater/summary?limit=${Math.max(limit, 25)}&start=0&sort=${sort}&cayenneExp=${cayenne}`;

  try {
    const res = await fetch(url, { next: { revalidate: 900 } });
    if (!res.ok) throw new Error(`NHL stats ${res.status}`);
    const raw = await res.json();
    const rows: Record<string, unknown>[] = raw.data ?? [];
    const leaders: Leader[] = rows.map((r) => ({
      playerId: Number(r.playerId ?? 0),
      name: String(r.skaterFullName ?? ""),
      team: String(r.teamAbbrevs ?? "").split(",").pop()?.trim() ?? "",
      position: String(r.positionCode ?? ""),
      gamesPlayed: Number(r.gamesPlayed ?? 0),
      goals: Number(r.goals ?? 0),
      assists: Number(r.assists ?? 0),
      points: Number(r.points ?? 0),
    }));

    cache = { seasonId, leaders, ts: Date.now() };
    return NextResponse.json({ seasonId, leaders: leaders.slice(0, limit) });
  } catch (err) {
    return NextResponse.json({ error: String(err), seasonId }, { status: 500 });
  }
}
