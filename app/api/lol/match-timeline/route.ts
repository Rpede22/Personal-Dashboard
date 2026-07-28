import { NextResponse } from "next/server";
import { hasRiotKey, fetchMatch, fetchMatchTimeline } from "@/lib/riot";

/**
 * GET /api/lol/match-timeline?matchId=<>&region=<>
 *
 * Aggregates the per-minute participant frames from Match-v5's timeline into
 * per-team totals so the client can render a small gold/xp chart without
 * shipping the raw ~200 KB timeline document.
 *
 * Response: `{ frames: [{ timestampMs, blueGold, redGold, blueLevel, redLevel }] }`
 * Blue = teamId 100, Red = teamId 200. Level is the max level on the team at
 * that frame (a rough proxy for lane strength).
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

  // Timeline exposes participantId; we need teamId to bucket per-side. That
  // lives on the match document — fetch both in parallel; both cache 24h.
  const [matchRes, timelineRes] = await Promise.all([
    fetchMatch(matchId, region),
    fetchMatchTimeline(matchId, region),
  ]);
  if (!matchRes.ok) {
    return NextResponse.json({ error: `Match fetch failed (${matchRes.status})` }, { status: matchRes.status || 502 });
  }
  if (!timelineRes.ok) {
    return NextResponse.json({ error: `Timeline fetch failed (${timelineRes.status})` }, { status: timelineRes.status || 502 });
  }

  const teamByParticipantId = new Map<number, number>();
  for (const p of matchRes.data.info.participants) {
    // RiotMatchParticipant carries teamId but not participantId; match by puuid
    // via the timeline's own participant→puuid map.
    const tp = timelineRes.data.info.participants.find((x) => x.puuid === p.puuid);
    if (tp) teamByParticipantId.set(tp.participantId, p.teamId);
  }

  const frames = timelineRes.data.info.frames.map((f) => {
    let blueGold = 0, redGold = 0, blueLevel = 0, redLevel = 0;
    for (const pf of Object.values(f.participantFrames)) {
      const team = teamByParticipantId.get(pf.participantId);
      if (team === 100) {
        blueGold += pf.totalGold;
        if (pf.level > blueLevel) blueLevel = pf.level;
      } else if (team === 200) {
        redGold += pf.totalGold;
        if (pf.level > redLevel) redLevel = pf.level;
      }
    }
    return { timestampMs: f.timestamp, blueGold, redGold, blueLevel, redLevel };
  });

  return NextResponse.json({ frames });
}
