import { NextResponse } from "next/server";

const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 60 * 60 * 1000; // Completed games are immutable — 1h cache

export interface GoalEvent {
  period: number;
  periodType: string; // "REG" | "OT" | "SO"
  timeInPeriod: string; // "14:32"
  scorer: string;
  assists: string[];
  isHomeGoal: boolean;
  homeScore: number;
  awayScore: number;
  strength: "EV" | "PP1" | "PP2" | "SH" | "EN" | "SO"; // from scoring team's perspective
}

/** Parse situationCode (e.g. "1551") into a strength label from the scoring team's POV.
 *  Format: homeGoalies | homeSkaters | awaySkaters | awayGoalies
 */
function parseStrength(code: string | undefined, isHomeGoal: boolean): GoalEvent["strength"] {
  if (!code || code.length < 4) return "EV";
  // NHL situationCode format: [away_goalies][away_skaters][home_skaters][home_goalies]
  const ag  = parseInt(code[0]); // away goalies
  const as_ = parseInt(code[1]); // away skaters
  const hs  = parseInt(code[2]); // home skaters
  const hg  = parseInt(code[3]); // home goalies

  const scoringSkaters = isHomeGoal ? hs  : as_;
  const oppSkaters     = isHomeGoal ? as_ : hs;
  const oppGoalies     = isHomeGoal ? ag  : hg;

  if (oppGoalies === 0) return "EN";                   // opponent pulled goalie
  const diff = scoringSkaters - oppSkaters;
  if (diff === 0) return "EV";
  if (diff === 1) return "PP1";
  if (diff >= 2) return "PP2";
  return "SH";                                          // scored short-handed
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get("gameId");
  if (!gameId) return NextResponse.json({ error: "gameId required" }, { status: 400 });

  const cached = cache.get(gameId);
  if (cached && Date.now() - cached.ts < TTL) return NextResponse.json(cached.data);

  try {
    const res = await fetch(
      `https://api-web.nhle.com/v1/gamecenter/${gameId}/play-by-play`,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; dashboard/1.0)" }, cache: "no-store" }
    );
    if (!res.ok) throw new Error(`NHL API ${res.status}`);
    const data = await res.json();

    // Build player id → full name map from rosterSpots
    const playerMap = new Map<number, string>();
    for (const p of (data.rosterSpots ?? []) as Record<string, unknown>[]) {
      const id = p.playerId as number;
      const first = ((p.firstName as Record<string, string>)?.default ?? p.firstName ?? "") as string;
      const last = ((p.lastName as Record<string, string>)?.default ?? p.lastName ?? "") as string;
      if (id) playerMap.set(id, `${first} ${last}`.trim());
    }

    const homeTeamId = ((data.homeTeam as Record<string, unknown>)?.id as number) ?? -1;

    const goals: GoalEvent[] = [];
    for (const play of (data.plays ?? []) as Record<string, unknown>[]) {
      if (play.typeDescKey !== "goal") continue;
      const details = (play.details ?? {}) as Record<string, unknown>;
      const pd = (play.periodDescriptor ?? {}) as Record<string, unknown>;
      const period = (pd.number as number) ?? 1;
      const periodType = (pd.periodType as string) ?? "REG";
      const timeInPeriod = (play.timeInPeriod as string) ?? "";
      const scorerId = details.scoringPlayerId as number;
      const a1Id = details.assist1PlayerId as number;
      const a2Id = details.assist2PlayerId as number;
      const ownerTeamId = details.eventOwnerTeamId as number;

      const assists = ([a1Id, a2Id] as number[])
        .filter(Boolean)
        .map((id) => playerMap.get(id) ?? "")
        .filter(Boolean);

      const isHomeGoal = ownerTeamId === homeTeamId;
      // situationCode lives on the play object itself, not inside details
      const situationCode = (play.situationCode as string | undefined) ?? (details.situationCode as string | undefined);

      // Shootout goals have their own strength label
      const strength = periodType === "SO"
        ? "SO"
        : parseStrength(situationCode, isHomeGoal);

      goals.push({
        period,
        periodType,
        timeInPeriod,
        scorer: playerMap.get(scorerId) ?? "Unknown",
        assists,
        isHomeGoal,
        homeScore: (details.homeScore as number) ?? 0,
        awayScore: (details.awayScore as number) ?? 0,
        strength,
      });
    }

    const payload = { gameId, goals };
    cache.set(gameId, { data: payload, ts: Date.now() });
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
