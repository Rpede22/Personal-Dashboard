import { NextResponse } from "next/server";

const resultCache = new Map<string, { data: unknown; ts: number }>();
const scheduleCache = new Map<string, unknown[]>();
const TTL = 15 * 60 * 1000;

function clamp(val: number, min: number, max: number) {
  return Math.min(max, Math.max(min, val));
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlayoffTeamInfo {
  role: string;       // e.g. "Pacific 1st", "Wildcard 1", "Central 2nd"
  abbrev: string;
  name: string;
  points: number;
  gamesPlayed: number;
  l10Wins: number;
  l10Losses: number;
  l10OtLosses: number;
  ptsPct: number;
  l10Pct: number;
}

export interface H2HRecord {
  wins: number;
  losses: number;
  total: number;
}

export interface MatchupResult {
  round: number;
  team1: PlayoffTeamInfo;   // home ice advantage (better seed)
  team2: PlayoffTeamInfo;
  seriesWinProb: number;    // probability team1 wins series
  predictedWinner: PlayoffTeamInfo;
  h2h: H2HRecord;           // team1's record vs team2 this season
  factors: {
    ptsPctAdj: number;
    formAdj: number;
    homeAdj: number;
    h2hAdj: number;
  };
}

export interface ConferenceResult {
  playoffTeams: PlayoffTeamInfo[];
  rounds: MatchupResult[][];   // rounds[0]=R1, rounds[1]=R2, rounds[2]=ConfFinal
  champion: PlayoffTeamInfo;
}

// ── H2H helpers ───────────────────────────────────────────────────────────────

async function getTeamSchedule(abbrev: string): Promise<unknown[]> {
  if (scheduleCache.has(abbrev)) return scheduleCache.get(abbrev)!;
  try {
    const res = await fetch(
      `https://api-web.nhle.com/v1/club-schedule-season/${abbrev}/now`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const games = (data.games ?? []) as unknown[];
    scheduleCache.set(abbrev, games);
    return games;
  } catch {
    return [];
  }
}

async function computeH2H(team1: string, team2: string): Promise<H2HRecord & { adj: number }> {
  try {
    const games = await getTeamSchedule(team1);
    let wins = 0, losses = 0;
    for (const g of games as Record<string, any>[]) {
      const homeAbbrev = g.homeTeam?.abbrev ?? "";
      const awayAbbrev = g.awayTeam?.abbrev ?? "";
      if (homeAbbrev !== team2 && awayAbbrev !== team2) continue;
      if (g.gameState !== "OFF" && g.gameState !== "FINAL") continue;
      const t1Score = homeAbbrev === team1 ? g.homeTeam.score : g.awayTeam.score;
      const t2Score = homeAbbrev === team2 ? g.homeTeam.score : g.awayTeam.score;
      if (typeof t1Score !== "number" || typeof t2Score !== "number") continue;
      if (t1Score > t2Score) wins++;
      else losses++;
    }
    const total = wins + losses;
    const adj = total === 0 ? 0 : clamp(((wins - losses) / total) * 0.08, -0.08, 0.08);
    return { wins, losses, total, adj };
  } catch {
    return { wins: 0, losses: 0, total: 0, adj: 0 };
  }
}

// ── Win probability ───────────────────────────────────────────────────────────

async function computeMatchup(
  t1: PlayoffTeamInfo,  // higher seed — home ice
  t2: PlayoffTeamInfo,
  round: number
): Promise<MatchupResult> {
  const h2hData = await computeH2H(t1.abbrev, t2.abbrev);

  const ptsPctAdj = clamp((t1.ptsPct - t2.ptsPct) * 0.9, -0.35, 0.35);
  const formAdj   = clamp((t1.l10Pct - t2.l10Pct) * 0.5, -0.2, 0.2);
  const homeAdj   = 0.07;
  const h2hAdj    = h2hData.adj;

  const seriesWinProb = clamp(0.5 + ptsPctAdj + formAdj + homeAdj + h2hAdj, 0.15, 0.85);
  const predictedWinner = seriesWinProb >= 0.5 ? t1 : t2;

  return {
    round,
    team1: t1,
    team2: t2,
    seriesWinProb,
    predictedWinner,
    h2h: { wins: h2hData.wins, losses: h2hData.losses, total: h2hData.total },
    factors: { ptsPctAdj, formAdj, homeAdj, h2hAdj },
  };
}

// ── Team builder ──────────────────────────────────────────────────────────────

function buildTeamInfo(s: Record<string, any>, role: string): PlayoffTeamInfo {
  const l10Wins = s.l10Wins ?? 0;
  const l10Losses = s.l10Losses ?? 0;
  const l10OtLosses = s.l10OtLosses ?? 0;
  return {
    role,
    abbrev: s.teamAbbrev ?? "",
    name: s.teamName ?? "",
    points: s.points ?? 0,
    gamesPlayed: s.gamesPlayed ?? 0,
    l10Wins,
    l10Losses,
    l10OtLosses,
    ptsPct: s.gamesPlayed > 0 ? s.points / (s.gamesPlayed * 2) : 0.5,
    l10Pct: (l10Wins + l10OtLosses * 0.5) / 10,
  };
}

// Home ice: lower seed number (better regular season team) goes first
function homeFirst(a: PlayoffTeamInfo, b: PlayoffTeamInfo): [PlayoffTeamInfo, PlayoffTeamInfo] {
  // "div1" roles sort first; otherwise sort by points
  const rank = (t: PlayoffTeamInfo) => {
    if (t.role.includes("1st")) return 1;
    if (t.role.includes("2nd")) return 2;
    if (t.role.includes("3rd")) return 3;
    if (t.role.includes("Wildcard 1")) return 4;
    if (t.role.includes("Wildcard 2")) return 5;
    return 6;
  };
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra < rb ? [a, b] : [b, a];
  return a.points >= b.points ? [a, b] : [b, a];
}

// ── Conference bracket builder ────────────────────────────────────────────────

async function buildConference(
  conference: string,
  standings: Record<string, any>[]
): Promise<ConferenceResult | null> {
  const confTeams = standings.filter(
    (s) => s.conference?.toLowerCase() === conference.toLowerCase()
  );

  // Group by division, sort by divisionRank within each division
  const byDivision = new Map<string, Record<string, any>[]>();
  for (const team of confTeams) {
    const div = team.division ?? "Unknown";
    if (!byDivision.has(div)) byDivision.set(div, []);
    byDivision.get(div)!.push(team);
  }
  for (const [div, teams] of byDivision) {
    byDivision.set(
      div,
      teams.sort((a, b) =>
        a.divisionRank != null ? a.divisionRank - b.divisionRank : b.points - a.points
      )
    );
  }

  const divisions = Array.from(byDivision.keys());
  if (divisions.length < 2) return null;

  const [divA, divB] = divisions;
  const divATeams = byDivision.get(divA)!;
  const divBTeams = byDivision.get(divB)!;

  // NHL: the division whose winner has MORE points is "div1" (gets home ice in conf final)
  const [div1, div1Name, div2, div2Name] =
    (divATeams[0]?.points ?? 0) >= (divBTeams[0]?.points ?? 0)
      ? [divATeams, divA, divBTeams, divB]
      : [divBTeams, divB, divATeams, divA];

  const top3A = div1.slice(0, 3);
  const top3B = div2.slice(0, 3);

  // Wildcards: best non-top-3 teams by pts
  const nonTop3 = confTeams
    .filter(
      (t) =>
        !top3A.some((d) => d.teamAbbrev === t.teamAbbrev) &&
        !top3B.some((d) => d.teamAbbrev === t.teamAbbrev)
    )
    .sort((a, b) => b.points - a.points)
    .slice(0, 2);

  if (top3A.length < 3 || top3B.length < 3 || nonTop3.length < 2) return null;

  // Build team info with human-readable roles
  const d1 = (n: number) => buildTeamInfo(top3A[n - 1], `${div1Name} ${["1st","2nd","3rd"][n-1]}`);
  const d2 = (n: number) => buildTeamInfo(top3B[n - 1], `${div2Name} ${["1st","2nd","3rd"][n-1]}`);
  const wc1 = buildTeamInfo(nonTop3[0], "Wildcard 1");
  const wc2 = buildTeamInfo(nonTop3[1], "Wildcard 2");

  const playoffTeams = [d1(1), d1(2), d1(3), d2(1), d2(2), d2(3), wc1, wc2];

  // ── Round 1 (NHL format):
  // Div1 1st  vs Wildcard 2   (Wildcard 2 has fewer pts → div winner gets home ice)
  // Div2 1st  vs Wildcard 1   (Wildcard 1 has more pts)
  // Div1 2nd  vs Div1 3rd     (intra-division)
  // Div2 2nd  vs Div2 3rd     (intra-division)
  const r1 = await Promise.all([
    computeMatchup(...homeFirst(d1(1), wc2), 1),
    computeMatchup(...homeFirst(d2(1), wc1), 1),
    computeMatchup(...homeFirst(d1(2), d1(3)), 1),
    computeMatchup(...homeFirst(d2(2), d2(3)), 1),
  ]);

  // ── Round 2: Div1 side vs Div2 side crossover within conference
  // Top div (div1) matchup winners play each other; div2 same
  const r2 = await Promise.all([
    computeMatchup(...homeFirst(r1[0].predictedWinner, r1[2].predictedWinner), 2),
    computeMatchup(...homeFirst(r1[1].predictedWinner, r1[3].predictedWinner), 2),
  ]);

  // ── Round 3: Conference Final
  const r3 = [
    await computeMatchup(...homeFirst(r2[0].predictedWinner, r2[1].predictedWinner), 3),
  ];

  return { playoffTeams, rounds: [r1, r2, r3], champion: r3[0].predictedWinner };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  const cacheKey = "playoffs-v4";
  const cached = resultCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const standingsRes = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/nhl/standings`,
      { cache: "no-store" }
    );
    if (!standingsRes.ok) throw new Error(`Standings fetch failed: ${standingsRes.status}`);
    const standingsData = await standingsRes.json();
    const standings: Record<string, any>[] = standingsData.standings ?? [];

    const [western, eastern] = await Promise.all([
      buildConference("Western", standings),
      buildConference("Eastern", standings),
    ]);

    const payload = { western, eastern };
    resultCache.set(cacheKey, { data: payload, ts: Date.now() });
    return NextResponse.json(payload);
  } catch (err) {
    console.error("Playoffs route error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
