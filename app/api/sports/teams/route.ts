import { NextResponse } from "next/server";
import {
  readFollowedTeams,
  writeFollowedTeams,
  defaultFollowedTeams,
  MAX_FOLLOWED,
  type FollowedTeam,
} from "@/lib/followed-teams";
import { getCatalogueLeague } from "@/lib/sports-catalogue";

/**
 * GET  /api/sports/teams → { teams: FollowedTeam[] }
 * POST /api/sports/teams → mutate the followed list. Actions:
 *   { action: "add", leagueId, name, matchKeyword, fotmobTeamId? }
 *   { action: "remove", slug }
 *   { action: "reorder", order: string[] }   // slugs in the new order
 *   { action: "reset" }                       // back to the seed defaults
 * The "add" path enriches the pick from the catalogue league (accent, emoji,
 * sport, provider, split-table config) so the client only sends the team pick.
 * Returns the updated { teams }.
 */

export async function GET() {
  return NextResponse.json({ teams: readFollowedTeams() });
}

function kebab(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-") || "team";
}

/** A 2–3 char badge for the widget. Multi-word names use initials
 *  (Manchester City → "MC"); single words use the first 3 letters
 *  (Liverpool → "LIV"). Drops a leading "FC"/"AFC" so "FC Barcelona" → "BAR". */
function shortNameFor(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter((w) => w && !/^(fc|afc|ac|sc)$/i.test(w));
  const src = words.length ? words : name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  if (src.length >= 2) return src.map((w) => w[0]).join("").slice(0, 3).toUpperCase();
  return (src[0] ?? name).slice(0, 3).toUpperCase();
}

function uniqueSlug(base: string, existing: FollowedTeam[]): string {
  const taken = new Set(existing.map((t) => t.slug));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const action = body.action;
  let teams = readFollowedTeams();

  if (action === "reset") {
    teams = defaultFollowedTeams();
    writeFollowedTeams(teams);
    return NextResponse.json({ teams });
  }

  if (action === "remove") {
    const slug = typeof body.slug === "string" ? body.slug : "";
    teams = teams.filter((t) => t.slug !== slug);
    writeFollowedTeams(teams);
    return NextResponse.json({ teams });
  }

  if (action === "reorder") {
    const order = Array.isArray(body.order) ? (body.order as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const bySlug = new Map(teams.map((t) => [t.slug, t]));
    const reordered = order.map((s) => bySlug.get(s)).filter((t): t is FollowedTeam => !!t);
    // Append any team not named in `order` so nothing is silently dropped.
    for (const t of teams) if (!order.includes(t.slug)) reordered.push(t);
    writeFollowedTeams(reordered);
    return NextResponse.json({ teams: reordered });
  }

  if (action === "add") {
    if (teams.length >= MAX_FOLLOWED) {
      return NextResponse.json({ error: `You can follow at most ${MAX_FOLLOWED} teams. Remove one first.` }, { status: 400 });
    }
    const leagueId = typeof body.leagueId === "string" ? body.leagueId : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const league = getCatalogueLeague(leagueId);
    if (!league || !name) {
      return NextResponse.json({ error: "add requires a valid leagueId and team name" }, { status: 400 });
    }
    const matchKeyword = typeof body.matchKeyword === "string" && body.matchKeyword.trim() ? body.matchKeyword.trim() : name;
    const fotmobTeamId = typeof body.fotmobTeamId === "number" && Number.isFinite(body.fotmobTeamId) ? body.fotmobTeamId : undefined;
    const espnTeamId = typeof body.espnTeamId === "string" && body.espnTeamId.trim() ? body.espnTeamId.trim() : undefined;

    // Dedupe: same league + same keyword already followed.
    if (teams.some((t) => t.leagueId === leagueId && t.matchKeyword.toLowerCase() === matchKeyword.toLowerCase())) {
      return NextResponse.json({ error: `${name} is already in your followed teams.` }, { status: 409 });
    }

    const newTeam: FollowedTeam = {
      slug: uniqueSlug(kebab(name), teams),
      name,
      shortName: shortNameFor(name),
      sport: league.sport,
      provider: league.provider,
      leagueId: league.id,
      leagueName: league.label,
      matchKeyword,
      accentColor: league.accent,
      emoji: league.emoji,
      fotmobLeagueId: league.fotmobLeagueId,
      fotmobTeamId,
      espnSport: league.espnSport,
      espnLeague: league.espnLeague,
      espnTeamId,
      splitAfterRank: league.splitAfterRank,
      splitLabel: league.splitLabel,
    };
    teams = [...teams, newTeam];
    writeFollowedTeams(teams);
    return NextResponse.json({ teams });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
