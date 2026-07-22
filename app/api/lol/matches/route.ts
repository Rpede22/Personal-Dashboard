import { NextResponse } from "next/server";
import {
  hasRiotKey,
  fetchMatchIds,
  fetchMatch,
  type RiotMatchParticipant,
} from "@/lib/riot";

/**
 * GET /api/lol/matches?puuid=<>&region=<>&start=<>&count=<>
 *
 * Paginated match feed for the "Load more" button in LoLHub. Returns just the
 * same match-summary shape as /api/lol/summary so the client can append rows
 * to the existing list without special-casing.
 */
export async function GET(request: Request) {
  if (!hasRiotKey()) {
    return NextResponse.json(
      { error: "RIOT_API_KEY not set" },
      { status: 503 }
    );
  }
  const { searchParams } = new URL(request.url);
  const puuid  = searchParams.get("puuid");
  const region = searchParams.get("region");
  const start  = Math.max(0, parseInt(searchParams.get("start")  ?? "0"));
  const count  = Math.max(1, Math.min(20, parseInt(searchParams.get("count") ?? "10")));

  if (!puuid || !region) {
    return NextResponse.json({ error: "puuid and region required" }, { status: 400 });
  }

  const idsRes = await fetchMatchIds(puuid, region, count, start);
  if (!idsRes.ok) {
    return NextResponse.json(
      { error: `Riot API ${idsRes.status}: ${idsRes.body}` },
      { status: idsRes.status || 502 }
    );
  }

  const matches: Array<{
    id: string;
    gameCreation: number;
    gameDuration: number;
    queueId: number;
    gameMode: string;
    me: RiotMatchParticipant | null;
  }> = [];
  for (const matchId of idsRes.data) {
    const mRes = await fetchMatch(matchId, region);
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

  return NextResponse.json({ matches });
}
