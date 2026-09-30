import { NextResponse } from "next/server";
import { mlFetchPlayoffs } from "@/lib/metalligaen";
import { getFollowedTeam } from "@/lib/followed-teams";

/**
 * GET /api/sports/playoffs?team=<slug>
 *
 * Returns a live playoff bracket for team hubs that have a working data source.
 * Right now that's Esbjerg Energy (via Metal Ligaen's own JSON). Other teams
 * get 404 — the "Projected" sub-tab in SportsTeamHub handles the fallback UI.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("team");

  // Metal Ligaen publishes a league-wide bracket, so any followed Danish
  // hockey team can show it (not just Esbjerg Energy). Everything else 404s —
  // the "Projected" sub-tab in SportsTeamHub handles the fallback UI.
  const followed = slug ? getFollowedTeam(slug) : undefined;
  if (!followed || followed.provider !== "metalligaen") {
    return NextResponse.json({ error: "No playoff data source for this team" }, { status: 404 });
  }

  const bracket = await mlFetchPlayoffs();
  if (!bracket) {
    return NextResponse.json({ error: "Playoffs not published yet" }, { status: 404 });
  }
  return NextResponse.json(bracket);
}
