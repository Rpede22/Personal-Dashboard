import { NextResponse } from "next/server";
import { fetchMatchScoreboard, hasFaceitKey } from "@/lib/faceit";

/**
 * Full scoreboard for one CS2 match (both teams, all players).
 *   GET /api/faceit/match?matchId=<id>
 *     → FaceitScoreboard
 *     → 503 { needsKey } when no FACEIT_API_KEY
 */
export async function GET(request: Request) {
  if (!hasFaceitKey()) {
    return NextResponse.json({ needsKey: true, error: "No FACEIT API key configured." }, { status: 503 });
  }
  const matchId = new URL(request.url).searchParams.get("matchId");
  if (!matchId) return NextResponse.json({ error: "matchId is required." }, { status: 400 });
  const board = await fetchMatchScoreboard(matchId);
  if (!board) return NextResponse.json({ error: "Match stats unavailable." }, { status: 404 });
  return NextResponse.json(board);
}
