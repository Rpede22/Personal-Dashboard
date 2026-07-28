import { NextResponse } from "next/server";
import { hasRiotKey, fetchMatchIds, fetchMatch } from "@/lib/riot";

/**
 * GET /api/lol/season-champs?puuid=<>&region=<>
 *
 * Aggregates per-champion stats across a large ranked sample so the "Top
 * champions this season" panel isn't limited to the last 10 loaded matches.
 *
 * Fetches ranked match IDs (queue 420 solo + 440 flex, up to 40 + 20) and the
 * full match detail for each in parallel. Riot's match documents are immutable,
 * so `fetchMatch` is cached 24h — repeat visits are nearly free.
 *
 * Response: `{ champions[], sampleSize, oldestGameMs }` sorted by games desc.
 */
export async function GET(request: Request) {
  if (!hasRiotKey()) {
    return NextResponse.json({ error: "RIOT_API_KEY not set" }, { status: 503 });
  }
  const { searchParams } = new URL(request.url);
  const puuid  = searchParams.get("puuid");
  const region = searchParams.get("region");
  if (!puuid || !region) {
    return NextResponse.json({ error: "puuid and region required" }, { status: 400 });
  }

  // Solo queue is the primary "season" signal; flex fills in the sample.
  const [soloIds, flexIds] = await Promise.all([
    fetchMatchIds(puuid, region, 40, 0, 420),
    fetchMatchIds(puuid, region, 20, 0, 440),
  ]);
  if (!soloIds.ok && !flexIds.ok) {
    const err = soloIds.ok ? flexIds : soloIds;
    if (!err.ok) {
      return NextResponse.json(
        { error: `Riot API ${err.status}: ${err.body}` },
        { status: err.status || 502 }
      );
    }
  }

  const ids = Array.from(new Set([
    ...(soloIds.ok ? soloIds.data : []),
    ...(flexIds.ok ? flexIds.data : []),
  ]));

  // Parallel fan-out; each fetchMatch call hits Riot only on cold cache.
  const results = await Promise.all(ids.map((id) => fetchMatch(id, region)));

  interface Row {
    name: string; games: number; wins: number;
    kills: number; deaths: number; assists: number;
    cs: number; durationSec: number;
  }
  const perChampion = new Map<string, Row>();
  let oldestGameMs = Infinity;

  for (const r of results) {
    if (!r.ok) continue;
    const m = r.data;
    const me = m.info.participants.find((p) => p.puuid === puuid);
    if (!me) continue;
    if (m.info.gameCreation < oldestGameMs) oldestGameMs = m.info.gameCreation;
    const key = me.championName;
    const row = perChampion.get(key) ?? {
      name: key, games: 0, wins: 0,
      kills: 0, deaths: 0, assists: 0,
      cs: 0, durationSec: 0,
    };
    row.games      += 1;
    row.wins       += me.win ? 1 : 0;
    row.kills      += me.kills;
    row.deaths     += me.deaths;
    row.assists    += me.assists;
    row.cs         += me.totalMinionsKilled + me.neutralMinionsKilled;
    row.durationSec += m.info.gameDuration;
    perChampion.set(key, row);
  }

  const champions = [...perChampion.values()].sort((a, b) => b.games - a.games);
  const sampleSize = champions.reduce((s, c) => s + c.games, 0);

  return NextResponse.json({
    champions,
    sampleSize,
    oldestGameMs: isFinite(oldestGameMs) ? oldestGameMs : null,
  });
}
