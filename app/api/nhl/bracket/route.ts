import { NextResponse } from "next/server";

const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 5 * 60 * 1000; // 5 min — playoffs update frequently

// Used to infer conference when the API doesn't specify one
const WESTERN_TEAMS = new Set([
  "ANA","ARI","CGY","CHI","COL","DAL","EDM","LAK","MIN","NSH","SEA","SJS","STL","UTA","VAN","VGK","WPG",
]);

export interface BracketSeries {
  letter: string;
  roundNumber: number;
  conference: string; // "Eastern" | "Western" | "Finals"
  topSeed: { abbrev: string; wins: number };
  bottomSeed: { abbrev: string; wins: number };
  status: string;
  complete: boolean;
}

export interface BracketData {
  series: BracketSeries[];
  year: number;
}

// NHL bracket letter assignments (standard):
// A-D = Eastern R1, E-H = Western R1
// I-J = Eastern R2, K-L = Western R2
// M = Eastern Conf Final, N = Western Conf Final
// O = Stanley Cup Final
const LETTER_ROUND: Record<string, number> = {
  A:1,B:1,C:1,D:1,E:1,F:1,G:1,H:1,
  I:2,J:2,K:2,L:2,
  M:3,N:3,
  O:4,
};
const LETTER_CONF: Record<string, string> = {
  A:"Eastern",B:"Eastern",C:"Eastern",D:"Eastern",
  E:"Western",F:"Western",G:"Western",H:"Western",
  I:"Eastern",J:"Eastern",K:"Western",L:"Western",
  M:"Eastern",N:"Western",
  O:"Finals",
};

function normalizeSeries(s: Record<string, unknown>, idx: number): BracketSeries {
  const rawLetter = (s.seriesLetter ?? s.seriesAbbrev ?? String.fromCharCode(65 + idx)) as string;
  const letter = rawLetter.toUpperCase();

  // Round: prefer explicit field, fall back to letter-based lookup
  const pr = s.playoffRound as Record<string, unknown> | null | undefined;
  const roundNumber =
    typeof s.roundNumber === "number" ? s.roundNumber
    : typeof pr?.roundNumber === "number" ? pr.roundNumber as number
    : LETTER_ROUND[letter] ?? 1;

  // Conference: prefer explicit field, fall back to letter-based lookup
  const confRaw = (
    (s.conference as Record<string, unknown>)?.name ??
    s.conferenceName ??
    s.conferenceAbbrev ??
    ""
  ) as string;
  const confFromApi =
    confRaw === "E" || confRaw.toLowerCase().startsWith("east") ? "Eastern"
    : confRaw === "W" || confRaw.toLowerCase().startsWith("west") ? "Western"
    : "";
  const top = ((s.topSeedTeam ?? s.team1 ?? {}) as Record<string, unknown>);
  const bot = ((s.bottomSeedTeam ?? s.team2 ?? {}) as Record<string, unknown>);
  const topAbbrev = (top.abbrev ?? "") as string;

  // Letter-based conf beats team-based inference (more reliable for unknown future matchups)
  const resolvedConference =
    confFromApi ||
    LETTER_CONF[letter] ||
    (roundNumber >= 4 ? "Finals" : WESTERN_TEAMS.has(topAbbrev) ? "Western" : "Eastern");

  const topWins = ((s.topSeedWins ?? top.score ?? top.wins ?? 0) as number);
  const botWins = ((s.bottomSeedWins ?? bot.score ?? bot.wins ?? 0) as number);
  const complete = topWins >= 4 || botWins >= 4;
  const status = ((s.seriesStatus ?? s.seriesStatusShort ?? "") as string);

  return {
    letter,
    roundNumber,
    conference: resolvedConference,
    topSeed: { abbrev: topAbbrev || "?", wins: topWins },
    bottomSeed: { abbrev: (bot.abbrev ?? "?") as string, wins: botWins },
    status,
    complete,
  };
}

export async function GET() {
  const year = new Date().getFullYear();
  const cacheKey = `bracket-v3-${year}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) return NextResponse.json(cached.data);

  try {
    const res = await fetch(`https://api-web.nhle.com/v1/playoff-bracket/${year}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; dashboard/1.0)" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`NHL API ${res.status}`);
    const raw = await res.json();

    const rawSeries: Record<string, unknown>[] = raw.series ?? raw.rounds?.flatMap((r: Record<string, unknown>) => r.series ?? []) ?? [];
    const series = rawSeries.map((s, i) => normalizeSeries(s, i));

    const payload: BracketData = { series, year };
    cache.set(cacheKey, { data: payload, ts: Date.now() });
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
