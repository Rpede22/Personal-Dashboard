import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  hasRiotKey,
  fetchAccountByRiotId,
  fetchSummonerByPuuid,
  fetchRanksByPuuid,
  fetchMatchIds,
  fetchMatch,
  fetchTopMasteries,
  fetchActiveGame,
  getChampionsById,
  getDragonVersion,
  getSummonerSpellsById,
  type RiotLeagueEntry,
  type RiotMatchParticipant,
} from "@/lib/riot";

/**
 * GET /api/lol/summary?accountId=<id>
 *
 * One-shot fetch that returns everything the LoL hub needs for a single account:
 *   - profile (level, icon)
 *   - solo/duo + flex ranks
 *   - last 10 matches (with participant stats for THIS puuid)
 *   - top 5 champion masteries
 *   - live-game state (if in match)
 *   - Data Dragon version + champion id → key map for asset URLs
 *
 * Resolves the puuid on first call and writes it back to the DB so subsequent
 * calls skip the Riot ID lookup.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountIdParam = searchParams.get("accountId");
  if (!accountIdParam) return NextResponse.json({ error: "accountId required" }, { status: 400 });
  const accountId = parseInt(accountIdParam);

  if (!hasRiotKey()) {
    return NextResponse.json(
      { error: "RIOT_API_KEY not set — add a Riot dev key to .env.local. See developer.riotgames.com." },
      { status: 503 }
    );
  }

  const account = await prisma.lolAccount.findUnique({ where: { id: accountId } });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  // 1. Resolve puuid if we don't have it yet
  let puuid = account.puuid;
  if (!puuid) {
    const acctRes = await fetchAccountByRiotId(account.gameName, account.tagLine, account.region);
    if (!acctRes.ok) {
      return NextResponse.json(
        {
          error: acctRes.status === 404
            ? `Riot ID ${account.gameName}#${account.tagLine} not found on the ${account.region.toUpperCase()} region.`
            : `Riot API ${acctRes.status}: ${acctRes.body}`,
        },
        { status: acctRes.status || 502 }
      );
    }
    puuid = acctRes.data.puuid;
    await prisma.lolAccount.update({ where: { id: accountId }, data: { puuid } });
  }

  // 2. Fan out the remaining calls in parallel. Everything keys off puuid now,
  //    so no serial dependency on the summoner-id (Riot removed that field).
  const [summonerRes, ranksRes, matchIdsRes, masteryRes, liveRes, championsById, summonerSpellsById, dragonVersion] = await Promise.all([
    fetchSummonerByPuuid(puuid, account.region),
    fetchRanksByPuuid(puuid, account.region),
    fetchMatchIds(puuid, account.region, 10),
    fetchTopMasteries(puuid, account.region, 5),
    fetchActiveGame(puuid, account.region),
    getChampionsById(),
    getSummonerSpellsById(),
    getDragonVersion(),
  ]);

  if (!summonerRes.ok) {
    return NextResponse.json(
      { error: `Summoner fetch failed (${summonerRes.status}): ${summonerRes.body}` },
      { status: summonerRes.status || 502 }
    );
  }
  const summoner = summonerRes.data;
  const ranks: RiotLeagueEntry[] = ranksRes.ok ? ranksRes.data : [];

  // 3. Fetch match details (up to 10). Riot rate-limits so serialize with small stagger.
  const matchIds = matchIdsRes.ok ? matchIdsRes.data : [];
  const matches: Array<{
    id: string;
    gameCreation: number;
    gameDuration: number;
    queueId: number;
    gameMode: string;
    me: RiotMatchParticipant | null;
  }> = [];
  for (const matchId of matchIds) {
    const mRes = await fetchMatch(matchId, account.region);
    if (!mRes.ok) continue;
    const m = mRes.data;
    const me = m.info.participants.find((p) => p.puuid === puuid) ?? null;
    matches.push({
      id: matchId,
      gameCreation: m.info.gameCreation,
      gameDuration: m.info.gameDuration,
      queueId: m.info.queueId,
      gameMode: m.info.gameMode,
      me,
    });
  }

  const mastery = (masteryRes.ok ? masteryRes.data : []).map((m) => ({
    championId: m.championId,
    championName: championsById[m.championId] ?? "Unknown",
    championLevel: m.championLevel,
    championPoints: m.championPoints,
    lastPlayTime: m.lastPlayTime,
  }));

  const liveGame = liveRes.ok ? {
    queueId: liveRes.data.gameQueueConfigId,
    gameMode: liveRes.data.gameMode,
    startedAt: liveRes.data.gameStartTime,
    length: liveRes.data.gameLength,
  } : null;

  return NextResponse.json({
    puuid,
    summoner: {
      level: summoner.summonerLevel,
      profileIconId: summoner.profileIconId,
    },
    ranks,
    matches,
    mastery,
    liveGame,
    dragonVersion,
    championsById,
    summonerSpellsById,
  });
}
