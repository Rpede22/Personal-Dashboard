import { NextResponse } from "next/server";
import { hasRiotKey, fetchMatch, getChampionsById, getDragonVersion } from "@/lib/riot";

/**
 * GET /api/lol/match?matchId=<>&region=<>
 *
 * Full match detail for the popover in LoLHub — all 10 participants + team
 * totals. Matches are immutable once finished, so the Riot fetch is cached
 * hard by lib/riot.ts (24h revalidate).
 */
export async function GET(request: Request) {
  if (!hasRiotKey()) {
    return NextResponse.json({ error: "RIOT_API_KEY not set" }, { status: 503 });
  }
  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("matchId");
  const region  = searchParams.get("region");
  if (!matchId || !region) {
    return NextResponse.json({ error: "matchId and region required" }, { status: 400 });
  }

  const mRes = await fetchMatch(matchId, region);
  if (!mRes.ok) {
    return NextResponse.json(
      { error: `Riot API ${mRes.status}: ${mRes.body}` },
      { status: mRes.status || 502 }
    );
  }
  const m = mRes.data;
  const [championsById, dragonVersion] = await Promise.all([getChampionsById(), getDragonVersion()]);

  return NextResponse.json({
    id: m.metadata.matchId,
    gameCreation: m.info.gameCreation,
    gameDuration: m.info.gameDuration,
    queueId:      m.info.queueId,
    gameMode:     m.info.gameMode,
    participants: m.info.participants.map((p) => ({
      puuid: p.puuid,
      championId:   p.championId,
      championName: p.championName,
      teamPosition: p.teamPosition,
      kills:        p.kills,
      deaths:       p.deaths,
      assists:      p.assists,
      cs:           p.totalMinionsKilled + p.neutralMinionsKilled,
      goldEarned:   p.goldEarned,
      damage:       p.totalDamageDealtToChampions,
      visionScore:  p.visionScore,
      win:          p.win,
      teamId:       p.teamId,
    })),
    dragonVersion,
    championsById,
  });
}
