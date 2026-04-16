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
  streakCode: string;
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
  gameDate: string;
  homeTeam: { abbrev: string; score?: number };
  awayTeam: { abbrev: string; score?: number };
  gameState: string;
  venue?: string;
  periodType?: string | null;
}

interface PlayoffTeam {
  seed: number;
  teamAbbrev: string;
  teamName: string;
  points: number;
  division: string;
  type: "division-winner" | "2nd" | "3rd" | "wildcard";
}

interface Matchup {
  seed1: number;
  team1: string;
  team1Name: string;
  pts1: number;
  seed2: number;
  team2: string;
  team2Name: string;
  pts2: number;
  homeWinProbability: number;
  division: string;
}

interface PlayoffsData {
  western: { matchups: Matchup[]; playoffTeams: PlayoffTeam[] };
  eastern: { matchups: Matchup[]; playoffTeams: PlayoffTeam[] };
}

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
  { label: "Streak", title: "Current win/loss streak" },
];

const PROB_HEADERS: (gamesAhead: number) => { label: string; title: string }[] = (n) => [
  { label: "#", title: "Rank" },
  { label: "Team", title: "Team" },
  { label: "Now", title: "Current points" },
  { label: `Exp. Pts (+${n})`, title: `Expected points after ${n} games (Monte Carlo average)` },
  { label: "Gain", title: "Expected points gained" },
  { label: "Top 3 div", title: "Probability of finishing in top 3 of division" },
  { label: "P(#1)", title: "Probability of 1st in division" },
  { label: "P(#2)", title: "Probability of 2nd in division" },
  { label: "P(#3)", title: "Probability of 3rd in division" },
  { label: "Games", title: "Games simulated ahead" },
];

export default function NHLHub() {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [probResults, setProbResults] = useState<ProbResult[]>([]);
  const [schedule, setSchedule] = useState<{ recent: Game[]; next5: Game[] }>({
    recent: [],
    next5: [],
  });
  const [playoffs, setPlayoffs] = useState<PlayoffsData | null>(null);
  const [scopeType, setScopeType] = useState<ScopeType>("division");
  const [division, setDivision] = useState<Division>("pacific");
  const [conference, setConference] = useState<Conference>("western");
  const [gamesAhead, setGamesAhead] = useState(5);
  const [loadingStandings, setLoadingStandings] = useState(true);
  const [loadingProb, setLoadingProb] = useState(false);
  const [loadingPlayoffs, setLoadingPlayoffs] = useState(false);
  const [tab, setTab] = useState<"standings" | "probability" | "schedule" | "playoffs">(
    "standings"
  );

  const scopeParam =
    scopeType === "division"
      ? `division:${division}`
      : scopeType === "conference"
      ? `conference:${conference}`
      : "league";

  const loadStandings = useCallback(async () => {
    setLoadingStandings(true);
    try {
      const filter =
        scopeType === "division"
          ? division
          : scopeType === "conference"
          ? conference
          : undefined;
      const url = filter
        ? `/api/nhl/standings?filter=${filter}`
        : "/api/nhl/standings";
      const res = await fetch(url);
      const data = await res.json();
      setStandings(data.standings ?? []);
    } finally {
      setLoadingStandings(false);
    }
  }, [scopeType, division, conference]);

  const loadProbability = useCallback(async () => {
    setLoadingProb(true);
    try {
      const res = await fetch(
        `/api/nhl/probability?scope=${scopeParam}&games=${gamesAhead}`
      );
      const data = await res.json();
      setProbResults(data.results ?? []);
    } finally {
      setLoadingProb(false);
    }
  }, [scopeParam, gamesAhead]);

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

  useEffect(() => {
    loadStandings();
  }, [loadStandings]);

  useEffect(() => {
    fetch("/api/nhl/schedule?team=EDM")
      .then((r) => r.json())
      .then((d) =>
        setSchedule({ recent: d.recent ?? [], next5: d.next5 ?? [] })
      )
      .catch(() => {});
  }, []);

  function gameResult(game: Game, team = "EDM"): "W" | "L" | "OTL" | "?" {
    if (game.gameState !== "OFF" && game.gameState !== "FINAL") return "?";
    const myScore =
      game.homeTeam.abbrev === team ? game.homeTeam.score : game.awayTeam.score;
    const oppScore =
      game.homeTeam.abbrev === team ? game.awayTeam.score : game.homeTeam.score;
    if (myScore === undefined || oppScore === undefined) return "?";
    if (myScore > oppScore) return "W";
    const isOT = game.periodType === "OT" || game.periodType === "SO";
    return isOT ? "OTL" : "L";
  }

  const topRankProb = (result: ProbResult) => {
    const top3 = [1, 2, 3].reduce(
      (sum, r) => sum + (result.divisionRankDistribution[r] ?? 0),
      0
    );
    return Math.round(top3 * 100);
  };

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

      {/* Scope controls */}
      <div
        className="rounded-2xl p-4 mb-6 flex flex-wrap gap-4 items-end"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
            View
          </label>
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            {(["division", "conference", "league"] as ScopeType[]).map((s) => (
              <button
                key={s}
                onClick={() => setScopeType(s)}
                className="px-3 py-1.5 text-sm capitalize transition-colors"
                style={{
                  background: scopeType === s ? "var(--accent-blue)" : "var(--surface-2)",
                  color: scopeType === s ? "#fff" : "var(--text-muted)",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {scopeType === "division" && (
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
              Division
            </label>
            <select
              value={division}
              onChange={(e) => setDivision(e.target.value as Division)}
              className="rounded-lg px-3 py-1.5 text-sm"
              style={{
                background: "var(--surface-2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
              }}
            >
              <option value="pacific">Pacific</option>
              <option value="central">Central</option>
              <option value="atlantic">Atlantic</option>
              <option value="metropolitan">Metropolitan</option>
            </select>
          </div>
        )}

        {scopeType === "conference" && (
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
              Conference
            </label>
            <select
              value={conference}
              onChange={(e) => setConference(e.target.value as Conference)}
              className="rounded-lg px-3 py-1.5 text-sm"
              style={{
                background: "var(--surface-2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
              }}
            >
              <option value="western">Western</option>
              <option value="eastern">Eastern</option>
            </select>
          </div>
        )}

        <button
          onClick={loadStandings}
          className="px-4 py-1.5 rounded-lg text-sm font-medium"
          style={{ background: "var(--accent-blue)", color: "#fff" }}
        >
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {(["standings", "probability", "schedule", "playoffs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              if (t === "probability" && probResults.length === 0) loadProbability();
              if (t === "playoffs" && playoffs === null) loadPlayoffs();
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors"
            style={{
              background: tab === t ? "var(--surface)" : "transparent",
              color: tab === t ? "var(--accent-blue)" : "var(--text-muted)",
              border: tab === t ? "1px solid var(--border)" : "1px solid transparent",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Standings Table */}
      {tab === "standings" && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          {loadingStandings ? (
            <div className="p-8 text-center" style={{ color: "var(--text-muted)" }}>
              Loading standings…
            </div>
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
                  const divColor =
                    DIVISION_COLORS[s.division?.toLowerCase() as Division] ??
                    "var(--accent-blue)";
                  return (
                    <tr
                      key={s.teamAbbrev}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: isEDM ? `${divColor}11` : "transparent",
                      }}
                    >
                      <td
                        className="px-4 py-3 font-bold"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {i + 1}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="font-semibold"
                          style={{ color: isEDM ? divColor : "var(--text)" }}
                        >
                          {s.teamAbbrev}
                        </span>
                        <span
                          className="ml-2 text-xs hidden sm:inline"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {s.teamName}
                        </span>
                      </td>
                      <td className="px-4 py-3">{s.gamesPlayed}</td>
                      <td className="px-4 py-3">{s.wins}</td>
                      <td className="px-4 py-3">{s.losses}</td>
                      <td className="px-4 py-3">{s.otLosses}</td>
                      <td
                        className="px-4 py-3 font-bold"
                        style={{ color: isEDM ? divColor : "var(--text)" }}
                      >
                        {s.points}
                      </td>
                      <td className="px-4 py-3">{s.regulationWins}</td>
                      <td
                        className="px-4 py-3 font-medium"
                        style={{
                          color: s.streakCode?.startsWith("W")
                            ? "var(--accent-green)"
                            : s.streakCode?.startsWith("L")
                            ? "var(--accent-red)"
                            : "var(--text-muted)",
                        }}
                      >
                        {s.streakCode ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Probability Tab */}
      {tab === "probability" && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div>
              <label className="text-xs" style={{ color: "var(--text-muted)" }}>
                Games ahead
              </label>
              <div className="flex gap-1 mt-1">
                {[3, 5, 8, 10].map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      setGamesAhead(n);
                    }}
                    className="px-3 py-1 rounded-lg text-sm"
                    style={{
                      background:
                        gamesAhead === n ? "var(--accent-blue)" : "var(--surface-2)",
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
              onClick={loadProbability}
              className="mt-5 px-4 py-1.5 rounded-lg text-sm font-medium"
              style={{ background: "var(--accent-blue)", color: "#fff" }}
            >
              {loadingProb ? "Simulating…" : "Run Simulation"}
            </button>
          </div>

          {loadingProb ? (
            <div
              className="rounded-2xl p-8 text-center"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div style={{ color: "var(--text-muted)" }}>
                Running Monte Carlo simulation ({(20000).toLocaleString()} iterations)…
              </div>
            </div>
          ) : probResults.length === 0 ? (
            <div
              className="rounded-2xl p-8 text-center"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <p style={{ color: "var(--text-muted)" }}>
                Click &quot;Run Simulation&quot; to calculate probabilities
              </p>
            </div>
          ) : (
            <div
              className="rounded-2xl overflow-hidden"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div className="p-4 border-b" style={{ borderColor: "var(--border)" }}>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Weighted Monte Carlo after next {gamesAhead} games per team.
                  Home ice base 54%, adjusted by pts% and regulation win rate.
                  {(20000).toLocaleString()} simulations.
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {PROB_HEADERS(gamesAhead).map(({ label, title }) => (
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
                  {probResults.map((r, i) => {
                    const isEDM = r.teamAbbrev === "EDM";
                    const gain = r.expectedPoints - r.currentPoints;
                    const p1 = Math.round(
                      (r.divisionRankDistribution["1"] ?? 0) * 100
                    );
                    const p2 = Math.round(
                      (r.divisionRankDistribution["2"] ?? 0) * 100
                    );
                    const p3 = Math.round(
                      (r.divisionRankDistribution["3"] ?? 0) * 100
                    );
                    return (
                      <tr
                        key={r.teamAbbrev}
                        style={{
                          borderBottom: "1px solid var(--border)",
                          background: isEDM
                            ? "var(--accent-blue)11"
                            : "transparent",
                        }}
                      >
                        <td
                          className="px-4 py-3 font-bold"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {i + 1}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          <span
                            style={{ color: isEDM ? "var(--accent-blue)" : "var(--text)" }}
                          >
                            {r.teamAbbrev}
                          </span>
                        </td>
                        <td className="px-4 py-3">{r.currentPoints}</td>
                        <td className="px-4 py-3 font-bold" style={{ color: "var(--accent-green)" }}>
                          {r.expectedPoints.toFixed(1)}
                        </td>
                        <td className="px-4 py-3" style={{ color: "var(--accent-orange)" }}>
                          +{gain.toFixed(1)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-2 rounded-full"
                              style={{
                                width: `${topRankProb(r)}px`,
                                maxWidth: "60px",
                                background: "var(--accent-blue)",
                                opacity: 0.7,
                              }}
                            />
                            <span style={{ color: isEDM ? "var(--accent-blue)" : "var(--text)" }}>
                              {topRankProb(r)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">{p1}%</td>
                        <td className="px-4 py-3">{p2}%</td>
                        <td className="px-4 py-3">{p3}%</td>
                        <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                          {r.gamesAhead}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Schedule Tab */}
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
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-4 rounded-xl p-3"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                    >
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                        style={{
                          background:
                            res === "W"
                              ? "var(--accent-green)"
                              : res === "OTL"
                              ? "var(--accent-orange)"
                              : res === "L"
                              ? "var(--surface-2)"
                              : "var(--border)",
                          color: res === "W" || res === "OTL" ? "#fff" : "var(--text)",
                        }}
                      >
                        {res}
                      </span>
                      <span className="font-medium">
                        {g.awayTeam.abbrev} @ {g.homeTeam.abbrev}
                      </span>
                      <span className="font-bold">
                        {g.awayTeam.score ?? "—"} – {g.homeTeam.score ?? "—"}
                      </span>
                      <span className="ml-auto text-sm" style={{ color: "var(--text-muted)" }}>
                        {new Date(g.gameDate).toLocaleDateString("en-GB", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
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
                  <div
                    key={i}
                    className="flex items-center gap-4 rounded-xl p-3"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                  >
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      #{i + 1}
                    </span>
                    <span className="font-medium">
                      {g.awayTeam.abbrev} @ {g.homeTeam.abbrev}
                    </span>
                    {g.venue && (
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {g.venue}
                      </span>
                    )}
                    <span className="ml-auto text-sm" style={{ color: "var(--text-muted)" }}>
                      {new Date(g.gameDate).toLocaleDateString("en-GB", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Playoffs Tab */}
      {tab === "playoffs" && (
        <div>
          {loadingPlayoffs ? (
            <div
              className="rounded-2xl p-8 text-center"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div style={{ color: "var(--text-muted)" }}>Loading playoff picture…</div>
            </div>
          ) : playoffs === null ? (
            <div
              className="rounded-2xl p-8 text-center"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {(["western", "eastern"] as const).map((conf) => {
                const data = playoffs[conf];
                return (
                  <div
                    key={conf}
                    className="rounded-2xl overflow-hidden"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                  >
                    <div
                      className="px-5 py-3 font-bold text-base capitalize"
                      style={{
                        background: "var(--surface-2)",
                        borderBottom: "1px solid var(--border)",
                        color: "var(--accent-blue)",
                      }}
                    >
                      {conf} Conference
                    </div>
                    <div className="p-4 space-y-3">
                      {data.matchups.map((m) => {
                        const edmIn = m.team1 === "EDM" || m.team2 === "EDM";
                        return (
                          <div
                            key={`${m.seed1}-${m.seed2}`}
                            className="rounded-xl p-3"
                            style={{
                              background: edmIn
                                ? "var(--accent-blue)11"
                                : "var(--surface-2)",
                              border: edmIn
                                ? "1px solid var(--accent-blue)44"
                                : "1px solid var(--border)",
                            }}
                          >
                            {/* Matchup header */}
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2 text-sm font-semibold">
                                <span
                                  className="text-xs px-1.5 py-0.5 rounded"
                                  style={{
                                    background: "var(--accent-blue)22",
                                    color: "var(--accent-blue)",
                                  }}
                                >
                                  ({m.seed1})
                                </span>
                                <span
                                  style={{
                                    color:
                                      m.team1 === "EDM"
                                        ? "var(--accent-blue)"
                                        : "var(--text)",
                                  }}
                                >
                                  {m.team1}
                                </span>
                                <span style={{ color: "var(--text-muted)" }}>vs</span>
                                <span
                                  className="text-xs px-1.5 py-0.5 rounded"
                                  style={{
                                    background: "var(--surface)",
                                    color: "var(--text-muted)",
                                  }}
                                >
                                  ({m.seed2})
                                </span>
                                <span
                                  style={{
                                    color:
                                      m.team2 === "EDM"
                                        ? "var(--accent-blue)"
                                        : "var(--text)",
                                  }}
                                >
                                  {m.team2}
                                </span>
                              </div>
                              {/* Win probability for seed 1 */}
                              <span
                                className="text-xs font-medium px-2 py-0.5 rounded-full"
                                style={{
                                  background: "var(--accent-green)22",
                                  color: "var(--accent-green)",
                                }}
                              >
                                ({m.seed1}) {Math.round(m.homeWinProbability * 100)}%
                              </span>
                            </div>
                            {/* Points row */}
                            <div
                              className="flex gap-4 text-xs"
                              style={{ color: "var(--text-muted)" }}
                            >
                              <span
                                style={{
                                  color:
                                    m.team1 === "EDM"
                                      ? "var(--accent-blue)"
                                      : "var(--text-muted)",
                                }}
                              >
                                {m.team1Name} — {m.pts1} pts
                              </span>
                              <span>·</span>
                              <span
                                style={{
                                  color:
                                    m.team2 === "EDM"
                                      ? "var(--accent-blue)"
                                      : "var(--text-muted)",
                                }}
                              >
                                {m.team2Name} — {m.pts2} pts
                              </span>
                            </div>
                          </div>
                        );
                      })}
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
}
