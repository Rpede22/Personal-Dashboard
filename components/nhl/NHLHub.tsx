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
}

const DIVISION_COLORS: Record<Division, string> = {
  pacific: "var(--accent-blue)",
  central: "var(--accent-orange)",
  atlantic: "var(--accent-purple)",
  metropolitan: "var(--accent-green)",
};

export default function NHLHub() {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [probResults, setProbResults] = useState<ProbResult[]>([]);
  const [schedule, setSchedule] = useState<{ recent: Game[]; next5: Game[] }>({
    recent: [],
    next5: [],
  });
  const [scopeType, setScopeType] = useState<ScopeType>("division");
  const [division, setDivision] = useState<Division>("pacific");
  const [conference, setConference] = useState<Conference>("western");
  const [gamesAhead, setGamesAhead] = useState(5);
  const [loadingStandings, setLoadingStandings] = useState(true);
  const [loadingProb, setLoadingProb] = useState(false);
  const [tab, setTab] = useState<"standings" | "probability" | "schedule">(
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
    return myScore > oppScore ? "W" : "L";
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
        {(["standings", "probability", "schedule"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              if (t === "probability" && probResults.length === 0) loadProbability();
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
                  {["#", "Team", "GP", "W", "L", "OTL", "PTS", "RW", "Streak"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left font-medium"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {h}
                      </th>
                    )
                  )}
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
                  Probability distribution after next {gamesAhead} games per team.
                  Equal weights: reg-W (37.5%), OT-W (12.5%), OT-L (12.5%), reg-L (37.5%).
                  {(20000).toLocaleString()} simulations.
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {[
                      "#",
                      "Team",
                      "Now",
                      `Exp. Pts (+${gamesAhead})`,
                      "Gain",
                      "Top 3 div",
                      "P(#1)",
                      "P(#2)",
                      "P(#3)",
                      "Games",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left font-medium"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {h}
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
                              : res === "L"
                              ? "var(--surface-2)"
                              : "var(--border)",
                          color: res === "W" ? "#fff" : "var(--text)",
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
    </div>
  );
}
