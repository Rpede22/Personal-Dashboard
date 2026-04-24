"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type ScopeType = "division" | "conference" | "league";
type Division = "pacific" | "central" | "atlantic" | "metropolitan";
type Conference = "western" | "eastern";

interface Standing {
  teamAbbrev: string;
  teamName: string;
  conference: string;
  division: string;
  points: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  otLosses: number;
  regulationWins: number;
  divisionRank: number;
  conferenceRank: number;
  wildcardRank: number;
  l10Wins: number;
  l10Losses: number;
  l10OtLosses: number;
}

interface ProbResult {
  teamAbbrev: string;
  teamName: string;
  currentPoints: number;
  division: string;
  conference: string;
  expectedPoints: number;
  mostLikelyDivRank: number;
  gamesAhead: number;
  divisionRankDistribution: Record<string, number>;
  conferenceRankDistribution: Record<string, number>;
  pointsDistribution: Record<string, number>;
}

interface Game {
  gameId?: string | number;
  gameDate: string;
  startTimeUTC?: string;
  homeTeam: { abbrev: string; score?: number };
  awayTeam: { abbrev: string; score?: number };
  gameState: string;
  venue?: string;
  periodType?: string | null;
}

interface GoalEvent {
  period: number;
  periodType: string;
  timeInPeriod: string;
  scorer: string;
  assists: string[];
  isHomeGoal: boolean;
  homeScore: number;
  awayScore: number;
  strength: "EV" | "PP1" | "PP2" | "SH" | "EN" | "SO";
}

// ── Live bracket types ─────────────────────────────────────────────────────────

interface BracketSeries {
  letter: string;
  roundNumber: number;
  conference: string;
  topSeed: { abbrev: string; wins: number };
  bottomSeed: { abbrev: string; wins: number };
  status: string;
  complete: boolean;
}

interface BracketData {
  series: BracketSeries[];
  year: number;
}

// ── Predicted playoffs types ───────────────────────────────────────────────────

interface PlayoffTeamInfo {
  role: string;
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

interface H2HRecord { wins: number; losses: number; total: number; }

interface MatchupResult {
  round: number;
  team1: PlayoffTeamInfo;
  team2: PlayoffTeamInfo;
  seriesWinProb: number;
  predictedWinner: PlayoffTeamInfo;
  h2h: H2HRecord;
  factors: {
    ptsPctAdj: number;
    formAdj: number;
    homeAdj: number;
    h2hAdj: number;
  };
}

interface ConferenceData {
  playoffTeams: PlayoffTeamInfo[];
  rounds: MatchupResult[][];
  champion: PlayoffTeamInfo;
}

interface PlayoffsData {
  western: ConferenceData;
  eastern: ConferenceData;
}

// ──────────────────────────────────────────────────────────────────────────────

const DIVISION_COLORS: Record<Division, string> = {
  pacific: "var(--accent-blue)",
  central: "var(--accent-orange)",
  atlantic: "var(--accent-purple)",
  metropolitan: "var(--accent-green)",
};

const STANDINGS_HEADERS: { label: string; title: string }[] = [
  { label: "#", title: "Rank" },
  { label: "Team", title: "Team" },
  { label: "GP", title: "Games Played" },
  { label: "W", title: "Wins" },
  { label: "L", title: "Regulation Losses" },
  { label: "OTL", title: "Overtime/Shootout Loss" },
  { label: "PTS", title: "Points" },
  { label: "RW", title: "Regulation Wins" },
  { label: "L10", title: "Last 10 games: W-L-OTL" },
];

const ROUND_LABELS = ["First Round", "Second Round", "Conference Final"];


export default function NHLHub() {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [schedule, setSchedule] = useState<{ recent: Game[]; next5: Game[] }>({ recent: [], next5: [] });
  const [playoffs, setPlayoffs] = useState<PlayoffsData | null>(null);
  const [scopeType, setScopeType] = useState<ScopeType>("division");
  const [division, setDivision] = useState<Division>("pacific");
  const [conference, setConference] = useState<Conference>("western");
  const [gamesAhead, setGamesAhead] = useState(5);
  const [loadingStandings, setLoadingStandings] = useState(true);
  const [loadingPlayoffs, setLoadingPlayoffs] = useState(false);
  const [tab, setTab] = useState<"standings" | "schedule" | "playoffs" | "predicted" | "playoff-predicted">("standings");
  const [predictedResults, setPredictedResults] = useState<Record<string, ProbResult[]>>({});
  const [loadingPredicted, setLoadingPredicted] = useState(false);
  const [bracket, setBracket] = useState<BracketData | null>(null);
  const [loadingBracket, setLoadingBracket] = useState(false);
  const [goalsMap, setGoalsMap] = useState<Record<string, GoalEvent[]>>({});
  const [loadingGoals, setLoadingGoals] = useState<Set<string>>(new Set());
  const [expandedGame, setExpandedGame] = useState<string | null>(null);

  const loadStandings = useCallback(async () => {
    setLoadingStandings(true);
    try {
      const filter = scopeType === "division" ? division : scopeType === "conference" ? conference : undefined;
      const url = filter ? `/api/nhl/standings?filter=${filter}` : "/api/nhl/standings";
      const res = await fetch(url);
      const data = await res.json();
      setStandings(data.standings ?? []);
    } finally {
      setLoadingStandings(false);
    }
  }, [scopeType, division, conference]);

  const loadPlayoffs = useCallback(async () => {
    setLoadingPlayoffs(true);
    try {
      const res = await fetch("/api/nhl/playoffs");
      const data = await res.json();
      setPlayoffs(data);
    } finally {
      setLoadingPlayoffs(false);
    }
  }, []);

  const loadBracket = useCallback(async () => {
    setLoadingBracket(true);
    try {
      const res = await fetch("/api/nhl/bracket");
      const data = await res.json();
      setBracket(data.error ? null : data);
    } finally {
      setLoadingBracket(false);
    }
  }, []);

  const loadPredicted = useCallback(async () => {
    setLoadingPredicted(true);
    try {
      const divisions = ["pacific", "central", "atlantic", "metropolitan"];
      const results: Record<string, ProbResult[]> = {};
      await Promise.all(
        divisions.map(async (div) => {
          const res = await fetch(`/api/nhl/probability?scope=division:${div}&games=${gamesAhead}`);
          const data = await res.json();
          results[div] = data.results ?? [];
        })
      );
      setPredictedResults(results);
    } finally {
      setLoadingPredicted(false);
    }
  }, [gamesAhead]);

  async function toggleGoals(gameId: string) {
    if (expandedGame === gameId) { setExpandedGame(null); return; }
    setExpandedGame(gameId);
    if (goalsMap[gameId] !== undefined || loadingGoals.has(gameId)) return;
    setLoadingGoals((prev) => new Set(prev).add(gameId));
    try {
      const res = await fetch(`/api/nhl/goals?gameId=${gameId}`);
      const data = await res.json();
      setGoalsMap((prev) => ({ ...prev, [gameId]: data.goals ?? [] }));
    } finally {
      setLoadingGoals((prev) => { const s = new Set(prev); s.delete(gameId); return s; });
    }
  }

  useEffect(() => { loadStandings(); }, [loadStandings]);

  useEffect(() => {
    fetch("/api/nhl/schedule?team=EDM")
      .then((r) => r.json())
      .then((d) => setSchedule({ recent: d.recent ?? [], next5: d.next5 ?? [] }))
      .catch(() => {});
  }, []);

  function formatCEST(dateStr: string, startTimeUTC?: string): string {
    // If we have a full ISO timestamp from startTimeUTC, use it
    const d = startTimeUTC ? new Date(startTimeUTC) : new Date(dateStr);
    // Format in Europe/Berlin timezone (CEST in summer)
    return d.toLocaleString("en-GB", {
      timeZone: "Europe/Berlin",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " CEST";
  }

  function gameResult(game: Game, team = "EDM"): "W" | "L" | "OTL" | "?" {
    if (game.gameState !== "OFF" && game.gameState !== "FINAL") return "?";
    const myScore = game.homeTeam.abbrev === team ? game.homeTeam.score : game.awayTeam.score;
    const oppScore = game.homeTeam.abbrev === team ? game.awayTeam.score : game.homeTeam.score;
    if (myScore === undefined || oppScore === undefined) return "?";
    if (myScore > oppScore) return "W";
    return (game.periodType === "OT" || game.periodType === "SO") ? "OTL" : "L";
  }

  // ── Playoffs helpers ──────────────────────────────────────────────────────

  // team1 = home ice (better regular season rank). Layout always: home | vs | away
  function MatchupCard({ m }: { m: MatchupResult }) {
    const isEdm = m.team1.abbrev === "EDM" || m.team2.abbrev === "EDM";
    const t1WinProb = Math.round(m.seriesWinProb * 100);
    const t2WinProb = 100 - t1WinProb;
    const isPredicted = m.round > 1;

    // H2H: "HOME W–A AWAY" where home is whoever has home-ice (team1)
    const h2hStr = m.h2h.total > 0
      ? `H2H: ${m.team1.abbrev} ${m.h2h.wins}–${m.h2h.losses} ${m.team2.abbrev}`
      : "H2H: no meetings";

    const h2hColor = m.h2h.total === 0 ? "var(--text-muted)"
      : m.h2h.wins > m.h2h.losses ? "var(--accent-green)"
      : m.h2h.wins < m.h2h.losses ? "var(--accent-red)"
      : "var(--text-muted)";

    return (
      <div
        className="rounded-xl p-3 space-y-2"
        style={{
          background: isEdm ? "var(--accent-blue)11" : "var(--surface-2)",
          border: isEdm ? "1px solid var(--accent-blue)44" : "1px solid var(--border)",
        }}
      >
        {/* Teams row — home always left, away always right */}
        <div className="flex items-center gap-2">
          {/* Home team (team1 — better regular season / home ice) */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className="font-bold text-base"
                style={{ color: m.team1.abbrev === "EDM" ? "var(--accent-blue)" : "var(--text)" }}
              >
                {m.team1.abbrev}
              </span>
              <span
                className="text-xs px-1.5 py-0.5 rounded font-bold"
                style={{ background: "var(--accent-blue)22", color: "var(--accent-blue)" }}
              >
                {t1WinProb}%
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>🏠</span>
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>{m.team1.role}</div>
          </div>

          <span className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>vs</span>

          {/* Away team (team2) */}
          <div className="flex-1 min-w-0 text-right">
            <div className="flex items-center justify-end gap-1.5">
              <span
                className="text-xs px-1.5 py-0.5 rounded font-bold"
                style={{ background: "var(--surface)", color: "var(--text-muted)" }}
              >
                {t2WinProb}%
              </span>
              <span
                className="font-bold text-base"
                style={{ color: m.team2.abbrev === "EDM" ? "var(--accent-blue)" : "var(--text)" }}
              >
                {m.team2.abbrev}
              </span>
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>{m.team2.role}</div>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          <span title="Regular season points">
            Pts: {m.team1.abbrev} {m.team1.points} — {m.team2.points} {m.team2.abbrev}
          </span>
          <span title="Last 10 games W-L-OTL">
            L10: {m.team1.abbrev} {m.team1.l10Wins}-{m.team1.l10Losses}-{m.team1.l10OtLosses}
            {" / "}{m.team2.abbrev} {m.team2.l10Wins}-{m.team2.l10Losses}-{m.team2.l10OtLosses}
          </span>
          <span style={{ color: h2hColor }} title="Head-to-head this season">{h2hStr}</span>
          {isPredicted && (
            <span className="italic" style={{ color: "var(--border)" }}>projected</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--background)" }}>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/" className="text-sm hover:underline" style={{ color: "var(--text-muted)" }}>
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: "var(--accent-blue)" }}>
          🏒 NHL Hub
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {([
          ["standings", "Standings"],
          ["schedule", "Schedule"],
          ["playoffs", "Playoffs"],
          ["predicted", "Predicted"],
          ["playoff-predicted", "Playoff Predicted"],
        ] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              if (t === "predicted" && Object.keys(predictedResults).length === 0) loadPredicted();
              if (t === "playoff-predicted" && playoffs === null) loadPlayoffs();
              if (t === "playoffs" && bracket === null) loadBracket();
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: tab === t ? "var(--surface)" : "transparent",
              color: tab === t ? "var(--accent-blue)" : "var(--text-muted)",
              border: tab === t ? "1px solid var(--border)" : "1px solid transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Scope controls — standings only, below tabs */}
      {tab === "standings" && (
        <div className="rounded-2xl p-4 mb-4 flex flex-wrap gap-4 items-end" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>View</label>
            <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              {(["division", "conference", "league"] as ScopeType[]).map((s) => (
                <button key={s} onClick={() => setScopeType(s)} className="px-3 py-1.5 text-sm capitalize transition-colors" style={{ background: scopeType === s ? "var(--accent-blue)" : "var(--surface-2)", color: scopeType === s ? "#fff" : "var(--text-muted)" }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          {scopeType === "division" && (
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Division</label>
              <select value={division} onChange={(e) => setDivision(e.target.value as Division)} className="rounded-lg px-3 py-1.5 text-sm" style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}>
                <option value="pacific">Pacific</option>
                <option value="central">Central</option>
                <option value="atlantic">Atlantic</option>
                <option value="metropolitan">Metropolitan</option>
              </select>
            </div>
          )}
          {scopeType === "conference" && (
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Conference</label>
              <select value={conference} onChange={(e) => setConference(e.target.value as Conference)} className="rounded-lg px-3 py-1.5 text-sm" style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}>
                <option value="western">Western</option>
                <option value="eastern">Eastern</option>
              </select>
            </div>
          )}
          <button onClick={loadStandings} className="px-4 py-1.5 rounded-lg text-sm font-medium" style={{ background: "var(--accent-blue)", color: "#fff" }}>
            Refresh
          </button>
        </div>
      )}

      {/* ── Standings ── */}
      {tab === "standings" && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          {loadingStandings ? (
            <div className="p-8 text-center" style={{ color: "var(--text-muted)" }}>Loading standings…</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {STANDINGS_HEADERS.map(({ label, title }) => (
                    <th
                      key={label}
                      title={title}
                      className="px-4 py-3 text-left font-medium cursor-help"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {standings.map((s, i) => {
                  const isEDM = s.teamAbbrev === "EDM";
                  const divColor = DIVISION_COLORS[s.division?.toLowerCase() as Division] ?? "var(--accent-blue)";
                  const l10 = `${s.l10Wins ?? 0}-${s.l10Losses ?? 0}-${s.l10OtLosses ?? 0}`;
                  const l10Pts = (s.l10Wins ?? 0) * 2 + (s.l10OtLosses ?? 0);
                  // Playoff spot badges: top 3 per division = guaranteed (P), wildcard rank ≤ 2 (div > 3) = WC
                  const isGuaranteed = (s.divisionRank ?? 99) <= 3;
                  const isWildcard = !isGuaranteed && (s.wildcardRank ?? 99) <= 2;
                  return (
                    <tr
                      key={s.teamAbbrev}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: isEDM ? `${divColor}11` : "transparent",
                      }}
                    >
                      <td className="px-4 py-3 font-bold" style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold" style={{ color: isEDM ? divColor : "var(--text)" }}>
                            {s.teamAbbrev}
                          </span>
                          {isGuaranteed && (
                            <span
                              title="Division playoff spot (top 3)"
                              style={{ fontSize: "10px", fontWeight: 700, padding: "0 3px", borderRadius: "3px", background: "var(--accent-green)33", color: "var(--accent-green)" }}
                            >P</span>
                          )}
                          {isWildcard && (
                            <span
                              title="Wild card playoff spot"
                              style={{ fontSize: "10px", fontWeight: 700, padding: "0 3px", borderRadius: "3px", background: "var(--accent-orange)33", color: "var(--accent-orange)" }}
                            >WC</span>
                          )}
                          <span className="ml-1 text-xs hidden sm:inline" style={{ color: "var(--text-muted)" }}>
                            {s.teamName}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">{s.gamesPlayed}</td>
                      <td className="px-4 py-3">{s.wins}</td>
                      <td className="px-4 py-3">{s.losses}</td>
                      <td className="px-4 py-3">{s.otLosses}</td>
                      <td className="px-4 py-3 font-bold" style={{ color: isEDM ? divColor : "var(--text)" }}>
                        {s.points}
                      </td>
                      <td className="px-4 py-3">{s.regulationWins}</td>
                      <td
                        className="px-4 py-3 font-medium"
                        style={{
                          color: l10Pts >= 14 ? "var(--accent-green)" :
                                 l10Pts >= 10 ? "var(--text)" :
                                 "var(--accent-red)",
                        }}
                      >
                        {l10}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Predicted Standings ── */}
      {tab === "predicted" && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div>
              <label className="text-xs" style={{ color: "var(--text-muted)" }}>Games ahead</label>
              <div className="flex gap-1 mt-1">
                {[3, 5, 8, 10].map((n) => (
                  <button
                    key={n}
                    onClick={() => setGamesAhead(n)}
                    className="px-3 py-1 rounded-lg text-sm"
                    style={{
                      background: gamesAhead === n ? "var(--accent-blue)" : "var(--surface-2)",
                      color: gamesAhead === n ? "#fff" : "var(--text-muted)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={loadPredicted}
              className="mt-5 px-4 py-1.5 rounded-lg text-sm font-medium"
              style={{ background: "var(--accent-blue)", color: "#fff" }}
            >
              {loadingPredicted ? "Simulating\u2026" : "Run All Divisions"}
            </button>
          </div>

          {loadingPredicted ? (
            <div className="rounded-2xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div style={{ color: "var(--text-muted)" }}>Running simulations for all divisions\u2026</div>
            </div>
          ) : Object.keys(predictedResults).length === 0 ? (
            <div className="rounded-2xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p style={{ color: "var(--text-muted)" }}>Click &quot;Run All Divisions&quot; to calculate predicted standings</p>
            </div>
          ) : (
            <div className="space-y-6">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Monte Carlo predicted standings after next {gamesAhead} games &middot; {(20000).toLocaleString()} simulations per division
              </p>

              {/* Division standings */}
              {(["pacific", "central", "atlantic", "metropolitan"] as const).map((div) => {
                const divResults = predictedResults[div] ?? [];
                if (divResults.length === 0) return null;
                const divColor = DIVISION_COLORS[div];
                return (
                  <div key={div} className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
                      <div className="w-3 h-3 rounded-full" style={{ background: divColor }} />
                      <h3 className="font-semibold capitalize">{div} Division</h3>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          {["#", "Team", "Current", "Predicted", "Gain", "Likely Rank", "Rank %"].map((h) => (
                            <th key={h} className="px-4 py-2 text-left font-medium" style={{ color: "var(--text-muted)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...divResults].sort((a, b) => a.mostLikelyDivRank - b.mostLikelyDivRank).map((r, i) => {
                          const isEDM = r.teamAbbrev === "EDM";
                          const gain = r.expectedPoints - r.currentPoints;
                          const rankProb = r.gamesAhead === 0 ? 100 : Math.round((r.divisionRankDistribution[r.mostLikelyDivRank] ?? 0) * 100);
                          return (
                            <tr key={r.teamAbbrev} style={{ borderBottom: "1px solid var(--border)", background: isEDM ? "var(--accent-blue)11" : "transparent" }}>
                              <td className="px-4 py-2 font-bold" style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                              <td className="px-4 py-2 font-semibold" style={{ color: isEDM ? "var(--accent-blue)" : "var(--text)" }}>{r.teamAbbrev}</td>
                              <td className="px-4 py-2">{r.currentPoints}</td>
                              <td className="px-4 py-2 font-bold" style={{ color: "var(--accent-green)" }}>{r.expectedPoints.toFixed(1)}</td>
                              <td className="px-4 py-2" style={{ color: "var(--accent-orange)" }}>+{gain.toFixed(1)}</td>
                              <td className="px-4 py-2 text-center">
                                <span className="inline-block w-7 h-7 rounded-lg text-sm font-bold leading-7 text-center" style={{
                                  background: r.mostLikelyDivRank === 1 ? "var(--accent-green)" : r.mostLikelyDivRank <= 3 ? "var(--accent-blue)33" : "var(--surface-2)",
                                  color: r.mostLikelyDivRank === 1 ? "#fff" : r.mostLikelyDivRank <= 3 ? "var(--accent-blue)" : "var(--text-muted)",
                                }}>
                                  {r.mostLikelyDivRank}
                                </span>
                              </td>
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-2">
                                  <div className="h-2 rounded-full" style={{ width: `${rankProb}px`, maxWidth: "60px", background: divColor, opacity: 0.7 }} />
                                  <span>{rankProb}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}

              {/* Conference standings */}
              {(["Western", "Eastern"] as const).map((conf) => {
                const confDivisions = conf === "Western" ? ["pacific", "central"] : ["atlantic", "metropolitan"];
                const confTeams = confDivisions.flatMap((d) => predictedResults[d] ?? []).sort((a, b) => b.expectedPoints - a.expectedPoints);
                if (confTeams.length === 0) return null;
                const confColor = conf === "Western" ? "var(--accent-orange)" : "var(--accent-purple)";
                return (
                  <div key={conf} className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
                      <div className="w-3 h-3 rounded-full" style={{ background: confColor }} />
                      <h3 className="font-semibold">{conf} Conference</h3>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          {["#", "Team", "Division", "Current", "Predicted", "Gain"].map((h) => (
                            <th key={h} className="px-4 py-2 text-left font-medium" style={{ color: "var(--text-muted)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {confTeams.map((r, i) => {
                          const isEDM = r.teamAbbrev === "EDM";
                          const gain = r.expectedPoints - r.currentPoints;
                          const divColor = DIVISION_COLORS[r.division?.toLowerCase() as Division] ?? "var(--text-muted)";
                          return (
                            <tr key={r.teamAbbrev} style={{ borderBottom: "1px solid var(--border)", background: isEDM ? "var(--accent-blue)11" : "transparent" }}>
                              <td className="px-4 py-2 font-bold" style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                              <td className="px-4 py-2 font-semibold" style={{ color: isEDM ? "var(--accent-blue)" : "var(--text)" }}>{r.teamAbbrev}</td>
                              <td className="px-4 py-2">
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize" style={{ background: `${divColor}22`, color: divColor }}>
                                  {r.division}
                                </span>
                              </td>
                              <td className="px-4 py-2">{r.currentPoints}</td>
                              <td className="px-4 py-2 font-bold" style={{ color: "var(--accent-green)" }}>{r.expectedPoints.toFixed(1)}</td>
                              <td className="px-4 py-2" style={{ color: "var(--accent-orange)" }}>+{gain.toFixed(1)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Schedule ── */}
      {tab === "schedule" && (
        <div className="space-y-6">
          <div>
            <h3 className="text-base font-semibold mb-3">EDM — Last 5 Games</h3>
            <div className="space-y-2">
              {schedule.recent.length === 0 ? (
                <p style={{ color: "var(--text-muted)" }}>No recent games</p>
              ) : (
                schedule.recent.map((g, i) => {
                  const res = gameResult(g);
                  const gid = String(g.gameId ?? i);
                  const isExpanded = expandedGame === gid;
                  const goals: GoalEvent[] = goalsMap[gid] ?? [];
                  const isLoadingGoals = loadingGoals.has(gid);
                  return (
                    <div key={i} className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                      {/* Game row */}
                      <button
                        onClick={() => g.gameId && toggleGoals(gid)}
                        className="w-full flex items-center gap-4 p-3 text-left"
                        style={{ cursor: g.gameId ? "pointer" : "default" }}
                      >
                        <span
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                          style={{
                            background: res === "W" ? "var(--accent-green)" : res === "OTL" ? "var(--accent-orange)" : res === "L" ? "var(--surface-2)" : "var(--border)",
                            color: res === "W" || res === "OTL" ? "#fff" : "var(--text)",
                          }}
                        >
                          {res}
                        </span>
                        <span className="font-medium">{g.awayTeam.abbrev} @ {g.homeTeam.abbrev}</span>
                        <span className="font-bold">{g.awayTeam.score ?? "—"} – {g.homeTeam.score ?? "—"}</span>
                        <span className="ml-auto text-sm" style={{ color: "var(--text-muted)" }}>
                          {formatCEST(g.gameDate, g.startTimeUTC)}
                        </span>
                        {g.gameId && (
                          <span className="text-xs ml-1" style={{ color: "var(--text-muted)" }}>
                            {isExpanded ? "▲" : "▼"}
                          </span>
                        )}
                      </button>

                      {/* Goal timeline */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                          {isLoadingGoals ? (
                            <p className="text-xs py-2" style={{ color: "var(--text-muted)" }}>Loading goals…</p>
                          ) : goals.length === 0 ? (
                            <p className="text-xs py-2" style={{ color: "var(--text-muted)" }}>No goals data</p>
                          ) : (
                            <div className="space-y-2 pt-1">
                              {goals.map((gl, gi) => {
                                const isEdmGoal = (gl.isHomeGoal && g.homeTeam.abbrev === "EDM") || (!gl.isHomeGoal && g.awayTeam.abbrev === "EDM");
                                const periodLabel = gl.periodType === "OT" ? "OT" : gl.periodType === "SO" ? "SO" : `P${gl.period}`;
                                const scoreStr = `${gl.awayScore}–${gl.homeScore}`;
                                // Strength badge styling
                                const strengthColor =
                                  gl.strength === "PP1" || gl.strength === "PP2" ? "var(--accent-green)" :
                                  gl.strength === "SH"  ? "var(--accent-purple)" :
                                  gl.strength === "EN"  ? "var(--accent-orange)" :
                                  gl.strength === "SO"  ? "var(--accent-blue)" : undefined;
                                const showStrength = gl.strength && gl.strength !== "EV";
                                return (
                                  <div key={gi} className="flex items-start gap-2.5 text-xs">
                                    <span className="w-2 h-2 rounded-full shrink-0 mt-0.5" style={{ background: isEdmGoal ? "var(--accent-blue)" : "var(--text-muted)" }} />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span style={{ color: "var(--text-muted)", minWidth: "3.5rem" }}>{periodLabel} {gl.timeInPeriod}</span>
                                        {showStrength && (
                                          <span
                                            style={{
                                              fontSize: "9px", fontWeight: 700, padding: "0 3px 1px", borderRadius: "3px",
                                              background: `${strengthColor}33`, color: strengthColor,
                                            }}
                                          >
                                            {gl.strength}
                                          </span>
                                        )}
                                        <span style={{ color: isEdmGoal ? "var(--text)" : "var(--text-muted)", fontWeight: isEdmGoal ? 600 : 400 }}>
                                          {gl.scorer}
                                        </span>
                                        <span className="ml-auto font-mono shrink-0" style={{ color: isEdmGoal ? "var(--accent-blue)" : "var(--text-muted)" }}>{scoreStr}</span>
                                      </div>
                                      {gl.assists.length > 0 && (
                                        <div style={{ color: "var(--text-muted)", paddingLeft: "3.5rem", marginTop: "1px" }}>
                                          Ast: {gl.assists.join(", ")}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <h3 className="text-base font-semibold mb-3">EDM — Next 5 Games</h3>
            <div className="space-y-2">
              {schedule.next5.length === 0 ? (
                <p style={{ color: "var(--text-muted)" }}>No upcoming games found</p>
              ) : (
                schedule.next5.map((g, i) => (
                  <div key={i} className="flex items-center gap-4 rounded-xl p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>#{i + 1}</span>
                    <span className="font-medium">{g.awayTeam.abbrev} @ {g.homeTeam.abbrev}</span>
                    {g.venue && <span className="text-xs" style={{ color: "var(--text-muted)" }}>{g.venue}</span>}
                    <span className="ml-auto text-sm" style={{ color: "var(--text-muted)" }}>
                      {formatCEST(g.gameDate, g.startTimeUTC)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Live Playoffs Bracket ── */}
      {tab === "playoffs" && (
        <div>
          {loadingBracket ? (
            <div className="rounded-2xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div style={{ color: "var(--text-muted)" }}>Loading live bracket…</div>
            </div>
          ) : bracket === null || bracket.series.length === 0 ? (
            <div className="rounded-2xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p style={{ color: "var(--text-muted)" }}>No bracket data yet — playoffs may not have started</p>
              <button onClick={loadBracket} className="mt-3 px-4 py-1.5 rounded-lg text-sm font-medium" style={{ background: "var(--accent-blue)", color: "#fff" }}>
                Retry
              </button>
            </div>
          ) : (() => {
            const rounds = [1, 2, 3, 4];
            const ROUND_NAMES: Record<number, string> = { 1: "First Round", 2: "Second Round", 3: "Conference Finals", 4: "Stanley Cup Final" };
            return (
              <div className="space-y-6">
                {rounds.map((round) => {
                  const series = bracket.series.filter((s) => s.roundNumber === round);
                  if (series.length === 0) return null;
                  const isFinal = round === 4;
                  const confs = isFinal ? ["Finals"] : ["Eastern", "Western"];
                  return (
                    <div key={round}>
                      <h3 className="font-semibold text-sm mb-3 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                        {ROUND_NAMES[round] ?? `Round ${round}`}
                      </h3>
                      <div className={isFinal ? "" : "grid grid-cols-1 lg:grid-cols-2 gap-4"}>
                        {confs.map((conf) => {
                          const confSeries = isFinal ? series : series.filter((s) => s.conference === conf);
                          if (confSeries.length === 0) return null;
                          return (
                            <div key={conf} className="space-y-2">
                              {!isFinal && (
                                <div className="text-xs font-bold uppercase mb-1" style={{ color: conf === "Eastern" ? "var(--accent-purple)" : "var(--accent-orange)" }}>
                                  {conf} Conference
                                </div>
                              )}
                              {confSeries.map((s) => {
                                const edmInvolved = s.topSeed.abbrev === "EDM" || s.bottomSeed.abbrev === "EDM";
                                const topLeading = s.topSeed.wins > s.bottomSeed.wins;
                                const tied = s.topSeed.wins === s.bottomSeed.wins;
                                return (
                                  <div
                                    key={s.letter}
                                    className="rounded-xl px-4 py-3"
                                    style={{
                                      background: edmInvolved ? "var(--accent-blue)11" : "var(--surface)",
                                      border: `1px solid ${edmInvolved ? "var(--accent-blue)44" : "var(--border)"}`,
                                    }}
                                  >
                                    <div className="flex items-center gap-2">
                                      {/* Letter badge */}
                                      <span className="text-xs font-bold w-5 shrink-0" style={{ color: "var(--text-muted)" }}>{s.letter}</span>
                                      {/* Left: top seed + pips (right-aligned) */}
                                      <div className="flex items-center gap-2 flex-1 justify-end">
                                        <span className="font-bold text-sm" style={{ color: s.topSeed.abbrev === "EDM" ? "var(--accent-blue)" : "var(--text)" }}>
                                          {s.topSeed.abbrev}
                                        </span>
                                        <div className="flex gap-0.5">
                                          {[0,1,2,3].map((i) => (
                                            <div key={i} className="w-4 h-4 rounded-sm" style={{
                                              background: i < s.topSeed.wins
                                                ? (s.complete && s.topSeed.wins > s.bottomSeed.wins ? "var(--accent-green)" : "var(--accent-blue)")
                                                : "var(--surface-2)",
                                              border: "1px solid var(--border)"
                                            }} />
                                          ))}
                                        </div>
                                      </div>
                                      {/* Score — fixed width, truly centered */}
                                      <span className="text-sm font-bold w-10 text-center shrink-0" style={{ color: "var(--text-muted)" }}>
                                        {s.topSeed.wins}–{s.bottomSeed.wins}
                                      </span>
                                      {/* Right: pips + bottom seed (left-aligned) */}
                                      <div className="flex items-center gap-2 flex-1 justify-start">
                                        <div className="flex gap-0.5">
                                          {[0,1,2,3].map((i) => (
                                            <div key={i} className="w-4 h-4 rounded-sm" style={{
                                              background: i < s.bottomSeed.wins
                                                ? (s.complete && s.bottomSeed.wins > s.topSeed.wins ? "var(--accent-green)" : "var(--accent-orange)")
                                                : "var(--surface-2)",
                                              border: "1px solid var(--border)"
                                            }} />
                                          ))}
                                        </div>
                                        <span className="font-bold text-sm" style={{ color: s.bottomSeed.abbrev === "EDM" ? "var(--accent-blue)" : "var(--text)" }}>
                                          {s.bottomSeed.abbrev}
                                        </span>
                                      </div>
                                    </div>
                                    {s.status && (
                                      <div className="text-xs mt-1.5 ml-5" style={{ color: s.complete ? "var(--accent-green)" : "var(--text-muted)" }}>
                                        {s.status}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-center" style={{ color: "var(--border)" }}>
                  Live data from NHL · refreshes every 5 min
                </p>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Playoff Predicted ── */}
      {tab === "playoff-predicted" && (
        <div>
          {loadingPlayoffs ? (
            <div className="rounded-2xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div style={{ color: "var(--text-muted)" }}>Calculating bracket… (fetching live data)</div>
            </div>
          ) : playoffs === null ? (
            <div className="rounded-2xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p style={{ color: "var(--text-muted)" }}>No playoff data available</p>
              <button
                onClick={loadPlayoffs}
                className="mt-3 px-4 py-1.5 rounded-lg text-sm font-medium"
                style={{ background: "var(--accent-blue)", color: "#fff" }}
              >
                Load Playoffs
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Explanation */}
              <div className="rounded-xl p-3 text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                Probabilities weighted by: regular season pts% (45%) · last 10 games form (25%) · home ice (10%) · head-to-head this season (8%).
                Round 2+ matchups are predicted from most likely Round 1 winners.
              </div>

              {/* Rounds */}
              {ROUND_LABELS.map((roundLabel, roundIdx) => (
                <div key={roundLabel}>
                  <h3 className="font-semibold text-sm mb-3 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                    {roundLabel}
                  </h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {(["western", "eastern"] as const).map((conf) => {
                      const confData = playoffs[conf];
                      const roundMatchups = confData?.rounds?.[roundIdx] ?? [];
                      if (roundMatchups.length === 0) return null;
                      return (
                        <div key={conf} className="space-y-2">
                          <div className="text-xs font-bold uppercase" style={{ color: conf === "western" ? "var(--accent-orange)" : "var(--accent-purple)" }}>
                            {conf} Conference
                          </div>
                          {roundMatchups.map((m, mi) => (
                            <MatchupCard key={mi} m={m} />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Cup Final */}
              {playoffs.western?.champion && playoffs.eastern?.champion && (() => {
                const west = playoffs.western.champion;
                const east = playoffs.eastern.champion;
                // Home ice in Cup Final goes to team with more pts (west tiebreak)
                const westHome = west.points >= east.points;
                const home = westHome ? west : east;
                const away = westHome ? east : west;
                // Simple prob using pts%
                const ptsDiff = (home.ptsPct - away.ptsPct) * 0.9;
                const finalHomeProb = Math.min(0.85, Math.max(0.15, 0.5 + ptsDiff + 0.07));
                const finalHomeWinPct = Math.round(finalHomeProb * 100);
                const cupWinner = finalHomeProb >= 0.5 ? home : away;
                const cupWinnerProb = finalHomeProb >= 0.5 ? finalHomeWinPct : 100 - finalHomeWinPct;
                const isEdmFinal = west.abbrev === "EDM" || east.abbrev === "EDM";
                const isEdmWinner = cupWinner.abbrev === "EDM";

                return (
                  <div>
                    <h3 className="font-semibold text-sm mb-3 uppercase tracking-wide" style={{ color: "var(--accent-orange)" }}>
                      🏆 Stanley Cup Final (Predicted)
                    </h3>
                    <div
                      className="rounded-2xl p-5 space-y-4"
                      style={{
                        background: isEdmFinal ? "var(--accent-blue)11" : "var(--surface)",
                        border: `1px solid ${isEdmFinal ? "var(--accent-blue)44" : "var(--accent-orange)44"}`,
                      }}
                    >
                      {/* Matchup */}
                      <div className="flex items-center gap-4">
                        <div className="flex-1 text-center">
                          <div className="text-2xl font-bold" style={{ color: home.abbrev === "EDM" ? "var(--accent-blue)" : "var(--text)" }}>
                            {home.abbrev}
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                            {home === west ? "Western" : "Eastern"} · {home.points} pts 🏠
                          </div>
                          <div
                            className="text-sm font-bold mt-1"
                            style={{ color: "var(--accent-blue)" }}
                          >
                            {finalHomeWinPct}%
                          </div>
                        </div>

                        <span className="text-xl font-bold" style={{ color: "var(--text-muted)" }}>vs</span>

                        <div className="flex-1 text-center">
                          <div className="text-2xl font-bold" style={{ color: away.abbrev === "EDM" ? "var(--accent-blue)" : "var(--text)" }}>
                            {away.abbrev}
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                            {away === west ? "Western" : "Eastern"} · {away.points} pts
                          </div>
                          <div className="text-sm font-bold mt-1" style={{ color: "var(--text-muted)" }}>
                            {100 - finalHomeWinPct}%
                          </div>
                        </div>
                      </div>

                      {/* Predicted champion */}
                      <div
                        className="rounded-xl p-3 text-center"
                        style={{
                          background: isEdmWinner ? "var(--accent-blue)22" : "var(--accent-orange)22",
                          border: `1px solid ${isEdmWinner ? "var(--accent-blue)44" : "var(--accent-orange)44"}`,
                        }}
                      >
                        <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>
                          Predicted Champion
                        </div>
                        <div
                          className="text-3xl font-bold"
                          style={{ color: isEdmWinner ? "var(--accent-blue)" : "var(--accent-orange)" }}
                        >
                          {cupWinner.abbrev}
                        </div>
                        <div className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                          {cupWinnerProb}% series win probability
                        </div>
                      </div>

                      <p className="text-xs text-center" style={{ color: "var(--border)" }}>
                        Predictions refresh every 15 min — based on pts%, form, home ice
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
