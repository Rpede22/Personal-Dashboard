"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TitleRace from "@/components/sports/TitleRace";
import ReorderableTabs from "@/components/ReorderableTabs";

interface MatchStats {
  homeTeam: string | null;
  awayTeam: string | null;
  possession: { home: string | number | null; away: string | number | null } | null;
  shotsTotal: { home: string | number | null; away: string | number | null } | null;
  shotsOnTarget: { home: string | number | null; away: string | number | null } | null;
  xg: { home: string | number | null; away: string | number | null } | null;
  formationHome: string | null;
  formationAway: string | null;
}

interface GoalEvent {
  minute: number;
  extraMinute: number | null;
  scorer: string;
  assist: string | null;
  type: "REGULAR" | "PENALTY" | "OWN_GOAL";
  isHome: boolean;
  homeScore: number;
  awayScore: number;
}

interface StandingRow {
  rank: number;
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  otLosses?: number;   // hockey only — populated by Metal Ligaen source
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

interface SportsEvent {
  matchId?: string | null;
  date: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  finished: boolean;
}

interface TeamConfig {
  name: string;
  shortName: string;
  matchKeyword: string;
  accentColor: string;
  emoji: string;
  leagueName: string;
  sport: string;
  splitAfterRank?: number;
  splitLabel?: string;
}

interface SubTable {
  name: string;
  localName?: string;
  rows: StandingRow[];
}

interface TeamData {
  config: TeamConfig;
  standing: StandingRow | null;
  last5: SportsEvent[];
  next5: SportsEvent[];
  allStandings: StandingRow[];
  subTables?: SubTable[];
  source?: "fotmob" | "api-football" | "thesportsdb";
}

// Convert a UTC `HH:MM` + `YYYY-MM-DD` pair to Copenhagen-local `HH:MM`.
// Falls back to the raw string if the time isn't parseable.
function toCopenhagenTime(dateStr: string, timeStr: string): string {
  if (!dateStr || !timeStr) return timeStr;
  // TSDB "time" can be "HH:MM:SS"; truncate
  const hhmm = timeStr.slice(0, 5);
  const iso = `${dateStr}T${hhmm}:00Z`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return hhmm;
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Copenhagen",
    hour12: false,
  });
}

function toCopenhagenDate(dateStr: string, timeStr: string): string {
  if (!dateStr) return dateStr;
  if (!timeStr) return dateStr;
  const hhmm = timeStr.slice(0, 5);
  const iso = `${dateStr}T${hhmm}:00Z`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Copenhagen",
  });
}

type Tab = "standings" | "schedule" | "top-scorers" | "playoffs";

interface TopScorer {
  playerId: number | string;
  name: string;
  team: string;
  position?: string;
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number;
}
type PlayoffMode = "projected" | "live";

// Shape of the live playoffs response from /api/sports/playoffs.
// Mirrors lib/metalligaen.ts's `MetalLigaenPlayoffs`.
interface LivePlayoffSide {
  teamId: string;
  team: string;
  shortcut: string;
  seed: number;
  wins: number;
  isWinner: boolean;
}
interface LivePlayoffGame {
  date: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  finished: boolean;
  overtime: boolean;
  shootout: boolean;
}
interface LivePlayoffSeries {
  round: string;
  roundOrder: number;
  top: LivePlayoffSide;
  bottom: LivePlayoffSide;
  complete: boolean;
  games: LivePlayoffGame[];
  bronzeFormat?: boolean;
  bronzeWinner?: string;
}
interface LivePlayoffs {
  season: string;
  rounds: Array<{
    name: string;
    order: number;
    active: boolean;
    series: LivePlayoffSeries[];
  }>;
}

function gameResult(e: SportsEvent, keyword: string): "W" | "D" | "L" | null {
  if (!e.finished || e.homeScore === null || e.awayScore === null) return null;
  const isHome = e.homeTeam.toLowerCase().includes(keyword.toLowerCase());
  const scored   = isHome ? e.homeScore : e.awayScore;
  const conceded = isHome ? e.awayScore : e.homeScore;
  if (scored > conceded) return "W";
  if (scored === conceded) return "D";
  return "L";
}

const RESULT_BG: Record<string, string> = {
  W: "var(--accent-green)",
  D: "var(--accent-orange)",
  L: "#374151",
};

// Tooltip headers — football has D (draws) and GD, icehockey does not
const FOOTBALL_HEADERS: { label: string; title: string }[] = [
  { label: "#",    title: "Rank" },
  { label: "Team", title: "Team" },
  { label: "P",    title: "Games Played" },
  { label: "W",    title: "Wins" },
  { label: "D",    title: "Draws" },
  { label: "L",    title: "Losses" },
  { label: "GD",   title: "Goal Difference (Goals For − Goals Against)" },
  { label: "Pts",  title: "Points" },
];
const HOCKEY_HEADERS: { label: string; title: string }[] = [
  { label: "#",    title: "Rank" },
  { label: "Team", title: "Team" },
  { label: "P",    title: "Games Played" },
  { label: "W",    title: "Wins" },
  { label: "L",    title: "Regulation Losses" },
  { label: "OTL",  title: "Overtime / Shootout Losses" },
  { label: "Pts",  title: "Points" },
];

// ── Playoffs (Metal Ligaen-style: top 8, 1v8 2v7 3v6 4v5) ─────────────────────
interface PlayoffTeam {
  seed: number;
  name: string;
  points: number;
  played: number;
  ptsPct: number; // points per game, normalized to 0-1
}

interface PlayoffMatchup {
  round: number;
  home: PlayoffTeam; // higher seed = home ice
  away: PlayoffTeam;
  homeWinProb: number;
  winner: PlayoffTeam;
}

// Simple series probability from pts/game diff + home-ice bonus
function computeSeriesProb(home: PlayoffTeam, away: PlayoffTeam): number {
  const diff = home.ptsPct - away.ptsPct; // range roughly −1..+1 (pts per game)
  const base = 0.5 + diff * 0.35;         // each 1 pt/game ≈ 35% swing
  const homeBonus = 0.06;                 // modest home-ice advantage in a series
  return Math.min(0.88, Math.max(0.12, base + homeBonus));
}

function buildBracket(top8: PlayoffTeam[]): { rounds: PlayoffMatchup[][]; champion: PlayoffTeam } {
  if (top8.length < 8) return { rounds: [], champion: top8[0] };

  // Quarterfinals: 1v8, 2v7, 3v6, 4v5
  const qfPairs: [PlayoffTeam, PlayoffTeam][] = [
    [top8[0], top8[7]],
    [top8[1], top8[6]],
    [top8[2], top8[5]],
    [top8[3], top8[4]],
  ];
  const qf: PlayoffMatchup[] = qfPairs.map(([home, away]) => {
    const homeWinProb = computeSeriesProb(home, away);
    return { round: 1, home, away, homeWinProb, winner: homeWinProb >= 0.5 ? home : away };
  });

  // Semis: QF1 winner vs QF4 winner, QF2 winner vs QF3 winner
  const sfPairs: [PlayoffMatchup, PlayoffMatchup][] = [
    [qf[0], qf[3]],
    [qf[1], qf[2]],
  ];
  const sf: PlayoffMatchup[] = sfPairs.map(([a, b]) => {
    const [home, away] = a.winner.seed <= b.winner.seed ? [a.winner, b.winner] : [b.winner, a.winner];
    const homeWinProb = computeSeriesProb(home, away);
    return { round: 2, home, away, homeWinProb, winner: homeWinProb >= 0.5 ? home : away };
  });

  // Final
  const [fHome, fAway] = sf[0].winner.seed <= sf[1].winner.seed ? [sf[0].winner, sf[1].winner] : [sf[1].winner, sf[0].winner];
  const fProb = computeSeriesProb(fHome, fAway);
  const final: PlayoffMatchup = {
    round: 3,
    home: fHome,
    away: fAway,
    homeWinProb: fProb,
    winner: fProb >= 0.5 ? fHome : fAway,
  };

  return { rounds: [qf, sf, [final]], champion: final.winner };
}

const ROUND_LABELS = ["Quarterfinals", "Semifinals", "Final"];

// ── Reusable standings table (used for main + split subtables) ───────────────
function StandingsTable({
  title,
  subtitle,
  rows,
  headers,
  isFootball,
  isHockey,
  keyword,
  accent,
  colSpan,
  splitAfterRank,
  splitLabel,
}: {
  title: string;
  subtitle?: string;
  rows: StandingRow[];
  headers: { label: string; title: string }[];
  isFootball: boolean;
  isHockey: boolean;
  keyword: string;
  accent: string;
  colSpan: number;
  splitAfterRank?: number;
  splitLabel?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {title}
        </h3>
        {subtitle && (
          <span className="text-xs" style={{ color: "var(--border)" }}>({subtitle})</span>
        )}
      </div>
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {headers.map(({ label, title }) => (
                <th
                  key={label}
                  title={title}
                  className="px-4 py-2 text-left font-medium cursor-help"
                  style={{ color: "var(--text-muted)" }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const isThis = row.team.toLowerCase().includes(keyword.toLowerCase());
              const showSplit = splitAfterRank && idx > 0 && row.rank === splitAfterRank + 1;
              return (
                <React.Fragment key={row.rank}>
                  {showSplit && (
                    <tr>
                      <td colSpan={colSpan} className="px-4 py-1 text-xs text-center" style={{ color: "var(--text-muted)", background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                        {splitLabel ?? "── Split ──"}
                      </td>
                    </tr>
                  )}
                  <tr
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: isThis ? `${accent}11` : "transparent",
                    }}
                  >
                    <td className="px-4 py-2 font-bold" style={{ color: "var(--text-muted)" }}>{row.rank}</td>
                    <td className="px-4 py-2 font-semibold" style={{ color: isThis ? accent : "var(--text)" }}>{row.team}</td>
                    <td className="px-4 py-2">{row.played}</td>
                    <td className="px-4 py-2">{row.won}</td>
                    {isFootball && <td className="px-4 py-2">{row.drawn}</td>}
                    <td className="px-4 py-2">{row.lost}</td>
                    {isHockey && (
                      <td className="px-4 py-2" style={{ color: "var(--text-muted)" }}>
                        {row.otLosses ?? 0}
                      </td>
                    )}
                    {isFootball && (
                      <td className="px-4 py-2" style={{ color: row.goalDiff > 0 ? "var(--accent-green)" : row.goalDiff < 0 ? "var(--accent-red)" : "var(--text-muted)" }}>
                        {row.goalDiff > 0 ? "+" : ""}{row.goalDiff}
                      </td>
                    )}
                    <td className="px-4 py-2 font-bold" style={{ color: isThis ? accent : "var(--text)" }}>{row.points}</td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SportsTeamHub({ teamSlug }: { teamSlug: string }) {
  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("standings");
  const [playoffMode, setPlayoffMode] = useState<PlayoffMode>("projected");
  const [livePlayoffs, setLivePlayoffs] = useState<LivePlayoffs | null>(null);
  const [livePlayoffsError, setLivePlayoffsError] = useState<string | null>(null);
  const [livePlayoffsLoading, setLivePlayoffsLoading] = useState(false);
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [goalsMap, setGoalsMap] = useState<Record<string, GoalEvent[] | "loading" | "error">>({});
  const [statsMap, setStatsMap] = useState<Record<string, MatchStats | "loading" | "error">>({});
  const [topScorers, setTopScorers] = useState<TopScorer[] | null>(null);
  const [topScorersLoading, setTopScorersLoading] = useState(false);

  async function loadData() {
    try {
      const res = await fetch(`/api/sports?team=${teamSlug}`);
      setData(await res.json());
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5 * 60 * 1000); // refresh every 5 minutes
    return () => clearInterval(interval);
  }, [teamSlug]);

  // Top scorers — lazy-loaded when the user opens that tab.
  useEffect(() => {
    if (tab !== "top-scorers" || topScorers !== null || topScorersLoading) return;
    setTopScorersLoading(true);
    fetch(`/api/sports/top-scorers?team=${teamSlug}&limit=10`)
      .then((r) => r.json())
      .then((d: { leaders?: TopScorer[] }) => setTopScorers(d.leaders ?? []))
      .catch(() => setTopScorers([]))
      .finally(() => setTopScorersLoading(false));
  }, [tab, teamSlug, topScorers, topScorersLoading]);

  // Live playoff bracket — lazy-loaded when the user opens the Live sub-tab.
  useEffect(() => {
    if (tab !== "playoffs" || playoffMode !== "live") return;
    if (livePlayoffs || livePlayoffsLoading) return;
    setLivePlayoffsLoading(true);
    setLivePlayoffsError(null);
    fetch(`/api/sports/playoffs?team=${teamSlug}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d: LivePlayoffs) => setLivePlayoffs(d))
      .catch((err) => setLivePlayoffsError(err.message || "Failed to load playoffs"))
      .finally(() => setLivePlayoffsLoading(false));
  }, [tab, playoffMode, teamSlug, livePlayoffs, livePlayoffsLoading]);

  async function toggleGoals(matchId: string, date: string) {
    if (expandedMatch === matchId) { setExpandedMatch(null); return; }
    setExpandedMatch(matchId);
    // Kick off stats fetch (FotMob-only, football-only) in parallel with goals.
    if (isFootball && statsMap[matchId] === undefined) {
      setStatsMap((prev) => ({ ...prev, [matchId]: "loading" }));
      fetch(`/api/sports/match-stats?matchId=${matchId}`)
        .then((r) => r.ok ? r.json() : Promise.reject(r.status))
        .then((d) => setStatsMap((prev) => ({ ...prev, [matchId]: d })))
        .catch(() => setStatsMap((prev) => ({ ...prev, [matchId]: "error" })));
    }
    if (goalsMap[matchId] !== undefined) return; // already fetched or fetching
    setGoalsMap((prev) => ({ ...prev, [matchId]: "loading" }));
    try {
      const res = await fetch(`/api/sports/goals?matchId=${matchId}&date=${date}&slug=${teamSlug}`);
      const d = await res.json();
      setGoalsMap((prev) => ({ ...prev, [matchId]: d.goals ?? [] }));
    } catch {
      setGoalsMap((prev) => ({ ...prev, [matchId]: "error" }));
    }
  }

  const cfg = data?.config;
  const accent = cfg?.accentColor ?? "var(--accent-blue)";
  const keyword = cfg?.matchKeyword ?? teamSlug;
  const isFootball = cfg?.sport === "football";
  const isHockey = cfg?.sport === "icehockey";
  const showPlayoffs = isHockey; // Only hockey gets a simple 1v8 bracket
  const headers = isFootball ? FOOTBALL_HEADERS : HOCKEY_HEADERS;
  const colSpan = headers.length;

  const bracket = useMemo(() => {
    if (!showPlayoffs || !data?.allStandings?.length) return null;
    const top8: PlayoffTeam[] = data.allStandings.slice(0, 8).map((s) => ({
      seed:    s.rank,
      name:    s.team,
      points:  s.points,
      played:  s.played,
      ptsPct:  s.played > 0 ? s.points / s.played : 0,
    }));
    return buildBracket(top8);
  }, [data, showPlayoffs]);

  const tabs: Tab[] = showPlayoffs
    ? ["standings", "schedule", "top-scorers", "playoffs"]
    : ["standings", "schedule", "top-scorers"];

  // Prefer Oprykningsspil rank when it exists (matches front-page logic)
  const promoSubTable = data?.subTables?.find(
    (t) => t.name.toLowerCase().includes("promotion") || t.localName?.toLowerCase().includes("oprykningsspil")
  );
  const promoRow = promoSubTable?.rows.find((r) =>
    r.team.toLowerCase().includes(keyword.toLowerCase())
  );
  const displayRank = promoRow?.rank ?? data?.standing?.rank ?? null;
  const displayRankLabel = promoRow ? "Opryk." : cfg?.leagueName ?? "";

  return (
    <div className="min-h-screen p-6 page-bg" style={{ color: "var(--text)" }}>

      {/* ── Sticky header: back link + team info + tabs ── */}
      <div
        className="sticky top-[28px] z-10 -mx-6 px-6 pt-5 pb-3 mb-4 page-bg"
      >
      <Link href="/" className="inline-flex items-center gap-1 text-sm mb-4" style={{ color: "var(--text-muted)" }}>
        ← Dashboard
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-4xl">{cfg?.emoji ?? "🏆"}</span>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: accent }}>{cfg?.name ?? teamSlug}</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>{cfg?.leagueName}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {data?.source && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{
              background: data.source === "fotmob" ? "var(--accent-blue)22" :
                          data.source === "api-football" ? "var(--accent-green)22" : "var(--surface-2)",
              color:      data.source === "fotmob" ? "var(--accent-blue)" :
                          data.source === "api-football" ? "var(--accent-green)" : "var(--text-muted)",
              border: "1px solid var(--border)",
            }}>
              {data.source === "fotmob" ? "FotMob" :
               data.source === "api-football" ? "API-Football" : "TheSportsDB"}
            </span>
          )}
          {data?.standing && displayRank !== null && (
            <div className="rounded-xl px-4 py-2 text-center" style={{ background: "var(--surface)", border: `1px solid ${accent}44` }}>
              <div className="text-2xl font-bold" style={{ color: accent }}>#{displayRank}</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                {displayRankLabel && <span>{displayRankLabel} · </span>}
                {(promoRow ?? data.standing).points} pts
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs — reorderable per team (hockey adds a Playoffs tab; the picker
          only shows tabs available for this team). */}
      <ReorderableTabs
        hubKey={`sports:${teamSlug}`}
        defaults={tabs}
        active={tab}
        labels={{
          "standings":    "Standings",
          "schedule":     "Schedule",
          "top-scorers":  "Top scorers",
          "playoffs":     "Playoffs",
        }}
        onSelect={setTab}
        accent={accent}
        variant="pill"
      />
      </div> {/* end sticky header */}

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : !data ? (
        <p style={{ color: "var(--accent-red)" }}>Failed to load data.</p>
      ) : tab === "standings" ? (

        /* ── STANDINGS ── */
        <div className="space-y-6">
          {isFootball && (
            <TitleRace keyword={keyword} rows={data.allStandings} accent={accent} />
          )}
          <StandingsTable
            title="Regular Season"
            rows={data.allStandings}
            headers={headers}
            isFootball={isFootball}
            isHockey={isHockey}
            keyword={keyword}
            accent={accent}
            colSpan={colSpan}
            splitAfterRank={cfg?.splitAfterRank}
            splitLabel={cfg?.splitLabel}
          />

          {/* Split subtables (Danish 1st Div post-round 22: Oprykningsspil + Nedrykningsspil) */}
          {data.subTables
            ?.filter((t) => t.name.toLowerCase().includes("group"))
            .map((sub) => (
              <StandingsTable
                key={sub.name}
                title={sub.localName ?? sub.name}
                subtitle={sub.localName ? sub.name : undefined}
                rows={sub.rows}
                headers={headers}
                isFootball={isFootball}
            isHockey={isHockey}
                keyword={keyword}
                accent={accent}
                colSpan={colSpan}
              />
            ))}
        </div>

      ) : tab === "top-scorers" ? (

        /* ── TOP SCORERS ── */
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-baseline justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <h3 className="text-lg font-semibold" style={{ color: accent }}>
              Top 10 scorers — {cfg?.leagueName}
            </h3>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {isHockey ? "Sorted by points (G + A)" : "Sorted by goals"}
            </span>
          </div>
          {topScorersLoading && topScorers === null ? (
            <div className="p-8 text-center" style={{ color: "var(--text-muted)" }}>Loading scoring leaders…</div>
          ) : !topScorers || topScorers.length === 0 ? (
            <div className="p-8 text-center" style={{ color: "var(--text-muted)" }}>
              No data available right now — league may be between seasons.
            </div>
          ) : (
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                  <th className="text-left px-3 py-2 font-medium">#</th>
                  <th className="text-left px-3 py-2 font-medium">Player</th>
                  <th className="text-left px-3 py-2 font-medium">Team</th>
                  {isHockey && <th className="text-left px-3 py-2 font-medium">Pos</th>}
                  <th className="text-right px-3 py-2 font-medium">GP</th>
                  <th className="text-right px-3 py-2 font-medium">G</th>
                  <th className="text-right px-3 py-2 font-medium">A</th>
                  {isHockey && <th className="text-right px-3 py-2 font-medium">P</th>}
                </tr>
              </thead>
              <tbody>
                {topScorers.map((p, i) => {
                  const isMyTeam = p.team.toLowerCase().includes(keyword.toLowerCase());
                  return (
                    <tr
                      key={String(p.playerId)}
                      style={{
                        background: isMyTeam ? `${accent}11` : "transparent",
                        borderTop: "1px solid var(--border)",
                      }}
                    >
                      <td className="px-3 py-2 font-semibold" style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                      <td className="px-3 py-2 font-semibold">{p.name}</td>
                      <td className="px-3 py-2" style={{ color: isMyTeam ? accent : "var(--text-muted)" }}>{p.team}</td>
                      {isHockey && <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{p.position ?? ""}</td>}
                      <td className="px-3 py-2 text-right" style={{ color: "var(--text-muted)" }}>{p.gamesPlayed}</td>
                      <td className="px-3 py-2 text-right">{p.goals}</td>
                      <td className="px-3 py-2 text-right">{p.assists}</td>
                      {isHockey && <td className="px-3 py-2 text-right font-bold" style={{ color: accent }}>{p.points}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

      ) : tab === "schedule" ? (

        /* ── SCHEDULE ── */
        <div className="space-y-6">
          {/* Last 5 */}
          <div>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-muted)" }}>LAST 5 RESULTS</h3>
            {data.last5.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>No recent results available</p>
            ) : (
              <div className="space-y-2">
                {data.last5.map((e, i) => {
                  const res = gameResult(e, keyword);
                  const canExpand = !!(e.matchId && e.finished);
                  const isExpanded = expandedMatch === e.matchId;
                  const goalsState = e.matchId ? goalsMap[e.matchId] : undefined;
                  const goals = Array.isArray(goalsState) ? goalsState : [];
                  return (
                    <div key={i} className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                      {/* Match row */}
                      <div
                        className={`px-4 py-3 flex items-center gap-4${canExpand ? " cursor-pointer select-none" : ""}`}
                        onClick={canExpand ? () => toggleGoals(e.matchId!, e.date) : undefined}
                      >
                        {res ? (
                          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0" style={{ background: RESULT_BG[res], color: "#fff" }}>
                            {res}
                          </span>
                        ) : (
                          <span className="w-8 h-8 rounded-lg shrink-0" style={{ background: "var(--surface-2)" }} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {e.homeTeam} <span style={{ color: "var(--text-muted)" }}>vs</span> {e.awayTeam}
                          </div>
                          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {toCopenhagenDate(e.date, e.time)}{e.time ? " · " + toCopenhagenTime(e.date, e.time) + " CEST" : ""}
                          </div>
                        </div>
                        {e.homeScore !== null && e.awayScore !== null && (
                          <span className="text-lg font-bold shrink-0" style={{ color: accent }}>
                            {e.homeScore}–{e.awayScore}
                          </span>
                        )}
                        {canExpand && (
                          <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
                            {isExpanded ? "▲" : "▼"}
                          </span>
                        )}
                      </div>

                      {/* Match stats (football only) + goal timeline */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                          {isFootball && e.matchId && (() => {
                            const st = statsMap[e.matchId];
                            if (!st || st === "error") return null;
                            if (st === "loading") {
                              return <div className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>Loading stats…</div>;
                            }
                            const rows: Array<{ label: string; row: MatchStats["possession"] | null; suffix?: string }> = [
                              { label: "Possession",     row: st.possession,    suffix: "%" },
                              { label: "Shots",          row: st.shotsTotal },
                              { label: "Shots on target",row: st.shotsOnTarget },
                              { label: "Expected goals", row: st.xg },
                            ];
                            const anyStat = rows.some((r) => r.row && (r.row.home !== null || r.row.away !== null));
                            if (!anyStat && !st.formationHome && !st.formationAway) return null;
                            return (
                              <div className="mb-3 rounded-lg p-3" style={{ background: "var(--surface-2)" }}>
                                {(st.formationHome || st.formationAway) && (
                                  <div className="flex items-center justify-between text-xs mb-2" style={{ color: "var(--text-muted)" }}>
                                    <span>{st.formationHome ?? "?"}</span>
                                    <span className="uppercase tracking-wide">Formations</span>
                                    <span>{st.formationAway ?? "?"}</span>
                                  </div>
                                )}
                                <div className="space-y-1.5">
                                  {rows.map((r) => {
                                    if (!r.row || (r.row.home === null && r.row.away === null)) return null;
                                    const h = r.row.home !== null ? `${r.row.home}${r.suffix ?? ""}` : "—";
                                    const a = r.row.away !== null ? `${r.row.away}${r.suffix ?? ""}` : "—";
                                    return (
                                      <div key={r.label} className="grid gap-2 items-center text-xs" style={{ gridTemplateColumns: "auto 1fr auto" }}>
                                        <span className="font-semibold tabular-nums" style={{ minWidth: "3rem", textAlign: "right" }}>{h}</span>
                                        <span className="uppercase tracking-wide text-center" style={{ color: "var(--text-muted)" }}>{r.label}</span>
                                        <span className="font-semibold tabular-nums" style={{ minWidth: "3rem" }}>{a}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                          {goalsState === "loading" ? (
                            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Loading…</p>
                          ) : goalsState === "error" ? (
                            <p className="text-xs" style={{ color: "var(--accent-red)" }}>Failed to load goals</p>
                          ) : goals.length === 0 ? (
                            <p className="text-xs" style={{ color: "var(--text-muted)" }}>No goals recorded</p>
                          ) : (
                            <div className="space-y-1.5">
                              {goals.map((gl, gi) => {
                                const myTeamGoal = gl.type !== "OWN_GOAL"
                                  ? (gl.isHome === e.homeTeam.toLowerCase().includes(keyword.toLowerCase()))
                                  : (gl.isHome !== e.homeTeam.toLowerCase().includes(keyword.toLowerCase()));
                                const minuteStr = gl.extraMinute ? `${gl.minute}+${gl.extraMinute}′` : `${gl.minute}′`;
                                const typeColor = gl.type === "PENALTY" ? "var(--accent-orange)" : gl.type === "OWN_GOAL" ? "var(--accent-red)" : undefined;
                                return (
                                  <div key={gi} className="flex items-center gap-2.5 text-xs">
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: myTeamGoal ? accent : "var(--text-muted)" }} />
                                    <span className="w-9 shrink-0 tabular-nums" style={{ color: "var(--text-muted)" }}>{minuteStr}</span>
                                    <span className="flex-1 min-w-0 flex flex-wrap items-center gap-1">
                                      {gl.type !== "REGULAR" && (
                                        <span style={{ fontSize: "9px", fontWeight: 700, padding: "0 3px 1px", borderRadius: "3px", background: `${typeColor}33`, color: typeColor }}>
                                          {gl.type === "OWN_GOAL" ? "OG" : "PEN"}
                                        </span>
                                      )}
                                      <span style={{ color: myTeamGoal ? "var(--text)" : "var(--text-muted)", fontWeight: myTeamGoal ? 600 : 400 }}>
                                        {gl.scorer}
                                      </span>
                                      {gl.assist && <span style={{ color: "var(--text-muted)" }}>({gl.assist})</span>}
                                    </span>
                                    <span className="shrink-0 font-bold tabular-nums" style={{ color: myTeamGoal ? accent : "var(--text-muted)" }}>
                                      {gl.homeScore}–{gl.awayScore}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Next 5 */}
          <div>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-muted)" }}>NEXT 5 FIXTURES</h3>
            {data.next5.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>No upcoming fixtures available</p>
            ) : (
              <div className="space-y-2">
                {data.next5.map((e, i) => (
                  <div key={i} className="rounded-xl px-4 py-3 flex items-center gap-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {e.homeTeam} <span style={{ color: "var(--text-muted)" }}>vs</span> {e.awayTeam}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {toCopenhagenDate(e.date, e.time)}{e.time ? " · " + toCopenhagenTime(e.date, e.time) + " CEST" : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      ) : (

        /* ── PLAYOFFS (hockey only) ── */
        <div>
          {/* Sub-tabs: Projected (if playoffs started today) | Live (real bracket) */}
          <div className="flex gap-1 mb-4 rounded-lg p-1" style={{ background: "var(--surface-2)", width: "fit-content" }}>
            {([
              ["projected", "If playoffs started today"],
              ["live",      "Live playoffs"],
            ] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setPlayoffMode(m)}
                className="px-4 py-1.5 rounded-md text-sm font-medium"
                style={{
                  background: playoffMode === m ? accent : "transparent",
                  color: playoffMode === m ? "#fff" : "var(--text-muted)",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {playoffMode === "live" ? (
            /* Live playoffs — Metal Ligaen JSON via icestats.at (Esbjerg Energy only). */
            livePlayoffsLoading ? (
              <div className="rounded-2xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <p style={{ color: "var(--text-muted)" }}>Loading playoffs…</p>
              </div>
            ) : livePlayoffsError ? (
              <div className="rounded-2xl p-8 text-center space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <p className="font-medium" style={{ color: "var(--text)" }}>Live playoff bracket unavailable</p>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>{livePlayoffsError}</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Try the <button onClick={() => setPlayoffMode("projected")} className="underline" style={{ color: accent }}>Projected</button> tab
                  for the &quot;if playoffs started today&quot; bracket instead.
                </p>
              </div>
            ) : livePlayoffs ? (
              <div className="space-y-6">
                <div className="rounded-xl p-3 text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                  Live from Metal Ligaen · Season {livePlayoffs.season}/{Number(livePlayoffs.season) + 1} · Best-of-7 series
                </div>

                {livePlayoffs.rounds.map((r) => (
                  <div key={r.name}>
                    <h3 className="font-semibold text-sm mb-3 uppercase tracking-wide" style={{ color: r.active ? accent : "var(--text-muted)" }}>
                      {r.name}{r.active ? " · active" : ""}
                      {r.series.some((s) => s.bronzeFormat) && (
                        <span className="ml-2 text-[10px] font-normal normal-case tracking-normal" style={{ color: "var(--text-muted)" }}>
                          (2-game aggregate · OT golden goal on tie)
                        </span>
                      )}
                    </h3>
                    <div className={r.series.length === 1 ? "" : "grid grid-cols-1 md:grid-cols-2 gap-3"}>
                      {r.series.map((s, si) => {
                        const isThisTeam =
                          s.top.team.toLowerCase().includes(keyword.toLowerCase()) ||
                          s.bottom.team.toLowerCase().includes(keyword.toLowerCase());
                        // Bronze is a two-game aggregate + OT golden-goal
                        // decider. `bronzeWinner` is set by the metalligaen
                        // lib once both games are finished — win pips read
                        // 1-1 in that case but the winner is unambiguous.
                        const topWon = s.bronzeFormat
                          ? s.bronzeWinner === s.top.shortcut
                          : s.complete && s.top.wins > s.bottom.wins;
                        const bottomWon = s.bronzeFormat
                          ? s.bronzeWinner === s.bottom.shortcut
                          : s.complete && s.bottom.wins > s.top.wins;
                        // For bronze, only two pips per side (best-of-2 aggregate).
                        const pipCount = s.bronzeFormat ? 2 : 4;
                        const pipIndexes = Array.from({ length: pipCount }, (_, i) => i);
                        return (
                          <div
                            key={si}
                            className="rounded-xl p-3 space-y-2"
                            style={{
                              background: isThisTeam ? `${accent}11` : "var(--surface-2)",
                              border: `1px solid ${isThisTeam ? `${accent}44` : "var(--border)"}`,
                            }}
                          >
                            {/* Series header — teams + best-of-7 pips */}
                            <div className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: "var(--surface)", color: "var(--text-muted)" }}>
                                    #{s.top.seed}
                                  </span>
                                  <span
                                    className="font-semibold text-sm truncate"
                                    style={{ color: s.top.team.toLowerCase().includes(keyword.toLowerCase()) ? accent : "var(--text)" }}
                                  >
                                    {s.top.team}
                                  </span>
                                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>🏠</span>
                                </div>
                              </div>
                              <div className="text-center shrink-0 flex items-center gap-1">
                                {pipIndexes.map((i) => {
                                  // For bronze: green pip = won that game;
                                  // otherwise mirror the best-of-7 look
                                  // (accent while active, green when the
                                  // series is over and this side won).
                                  let filled: boolean;
                                  if (s.bronzeFormat) {
                                    const g = s.games[i];
                                    filled = !!g?.finished && (g.homeScore ?? 0) + (g.awayScore ?? 0) > 0 && (
                                      (g.homeTeam === s.top.team && (g.homeScore ?? 0) > (g.awayScore ?? 0)) ||
                                      (g.awayTeam === s.top.team && (g.awayScore ?? 0) > (g.homeScore ?? 0))
                                    );
                                  } else {
                                    filled = i < s.top.wins;
                                  }
                                  return (
                                    <div
                                      key={i}
                                      className="w-3.5 h-3.5 rounded-sm"
                                      style={{
                                        background: filled ? (topWon ? "var(--accent-green)" : accent) : "var(--surface)",
                                        border: "1px solid var(--border)",
                                      }}
                                    />
                                  );
                                })}
                                <span className="text-sm font-bold mx-1" style={{ color: "var(--text-muted)" }}>
                                  {s.bronzeFormat
                                    ? (() => {
                                        // Aggregate goals across the pair — much more
                                        // informative than "1-1 wins" on a best-of-2.
                                        let topGoals = 0, botGoals = 0;
                                        for (const g of s.games.filter((x) => x.finished)) {
                                          if (g.homeTeam === s.top.team)    topGoals += (g.homeScore ?? 0);
                                          if (g.awayTeam === s.top.team)    topGoals += (g.awayScore ?? 0);
                                          if (g.homeTeam === s.bottom.team) botGoals += (g.homeScore ?? 0);
                                          if (g.awayTeam === s.bottom.team) botGoals += (g.awayScore ?? 0);
                                        }
                                        return `${topGoals}–${botGoals}`;
                                      })()
                                    : `${s.top.wins}–${s.bottom.wins}`}
                                </span>
                                {pipIndexes.map((i) => {
                                  let filled: boolean;
                                  if (s.bronzeFormat) {
                                    const g = s.games[i];
                                    filled = !!g?.finished && (
                                      (g.homeTeam === s.bottom.team && (g.homeScore ?? 0) > (g.awayScore ?? 0)) ||
                                      (g.awayTeam === s.bottom.team && (g.awayScore ?? 0) > (g.homeScore ?? 0))
                                    );
                                  } else {
                                    filled = i < s.bottom.wins;
                                  }
                                  return (
                                    <div
                                      key={i}
                                      className="w-3.5 h-3.5 rounded-sm"
                                      style={{
                                        background: filled ? (bottomWon ? "var(--accent-green)" : "var(--accent-orange)") : "var(--surface)",
                                        border: "1px solid var(--border)",
                                      }}
                                    />
                                  );
                                })}
                              </div>
                              <div className="flex-1 min-w-0 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <span
                                    className="font-semibold text-sm truncate"
                                    style={{ color: s.bottom.team.toLowerCase().includes(keyword.toLowerCase()) ? accent : "var(--text)" }}
                                  >
                                    {s.bottom.team}
                                  </span>
                                  <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: "var(--surface)", color: "var(--text-muted)" }}>
                                    #{s.bottom.seed}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Game-by-game scores */}
                            {s.games.length > 0 && (
                              <div className="flex flex-wrap gap-1 text-[11px] pt-1 border-t" style={{ borderColor: "var(--border)" }}>
                                {s.games.map((g, gi) => {
                                  const scoreStr = g.finished
                                    ? `${g.homeScore}–${g.awayScore}${g.overtime ? " OT" : g.shootout ? " SO" : ""}`
                                    : g.date.slice(5);
                                  return (
                                    <span
                                      key={gi}
                                      title={`${g.homeTeam} vs ${g.awayTeam} · ${g.date}${g.time ? " " + g.time : ""}`}
                                      className="px-1.5 py-0.5 rounded"
                                      style={{
                                        background: g.finished ? "var(--surface)" : "var(--surface-2)",
                                        color: g.finished ? "var(--text)" : "var(--text-muted)",
                                        border: "1px solid var(--border)",
                                      }}
                                    >
                                      G{gi + 1}: {scoreStr}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null
          ) : !bracket || bracket.rounds.length === 0 ? (
            <div className="rounded-2xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p style={{ color: "var(--text-muted)" }}>Need top 8 standings to build bracket</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-xl p-3 text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                Top 8 regular-season teams · 1v8 · 2v7 · 3v6 · 4v5 · Probabilities from pts/game with a small home-ice bonus.
              </div>

              {bracket.rounds.map((round, ri) => (
                <div key={ri}>
                  <h3 className="font-semibold text-sm mb-3 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                    {ROUND_LABELS[ri]}
                  </h3>
                  <div
                    className={
                      round.length === 1
                        ? "flex justify-center" // Final has a single matchup — center it
                        : "grid grid-cols-1 md:grid-cols-2 gap-3"
                    }
                  >
                    {round.map((m, mi) => {
                      const isThisTeam = m.home.name.includes(keyword) || m.away.name.includes(keyword);
                      const homePct = Math.round(m.homeWinProb * 100);
                      const awayPct = 100 - homePct;
                      const predicted = ri > 0; // QF uses real seeding, SF+ predicted
                      return (
                        <div
                          key={mi}
                          className="rounded-xl p-3"
                          style={{
                            background: isThisTeam ? `${accent}11` : "var(--surface-2)",
                            border: `1px solid ${isThisTeam ? `${accent}44` : "var(--border)"}`,
                            width: round.length === 1 ? "100%" : undefined,
                            maxWidth: round.length === 1 ? "38rem" : undefined,
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: "var(--surface)", color: "var(--text-muted)" }}>#{m.home.seed}</span>
                                <span className="font-semibold text-sm truncate" style={{ color: m.home.name.includes(keyword) ? accent : "var(--text)" }}>
                                  {m.home.name}
                                </span>
                                <span className="text-xs" style={{ color: "var(--text-muted)" }}>🏠</span>
                              </div>
                              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                                {m.home.points} pts · {m.home.played} GP
                              </div>
                            </div>
                            <div className="text-center shrink-0">
                              <div className="text-xs px-2 py-0.5 rounded font-bold" style={{ background: `${accent}22`, color: accent }}>
                                {homePct}%
                              </div>
                              <div className="text-[10px] my-0.5" style={{ color: "var(--text-muted)" }}>vs</div>
                              <div className="text-xs px-2 py-0.5 rounded font-bold" style={{ background: "var(--surface)", color: "var(--text-muted)" }}>
                                {awayPct}%
                              </div>
                            </div>
                            <div className="flex-1 min-w-0 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <span className="font-semibold text-sm truncate" style={{ color: m.away.name.includes(keyword) ? accent : "var(--text)" }}>
                                  {m.away.name}
                                </span>
                                <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: "var(--surface)", color: "var(--text-muted)" }}>#{m.away.seed}</span>
                              </div>
                              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                                {m.away.points} pts · {m.away.played} GP
                              </div>
                            </div>
                          </div>
                          {predicted && (
                            <div className="text-[10px] italic mt-1.5 text-right" style={{ color: "var(--border)" }}>
                              projected
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Predicted champion */}
              <div>
                <h3 className="font-semibold text-sm mb-3 uppercase tracking-wide" style={{ color: accent }}>
                  🏆 Predicted Champion
                </h3>
                <div
                  className="rounded-2xl p-5 text-center"
                  style={{
                    background: bracket.champion.name.includes(keyword) ? `${accent}22` : "var(--surface)",
                    border: `1px solid ${accent}44`,
                  }}
                >
                  <div className="text-3xl font-bold" style={{ color: accent }}>
                    {bracket.champion.name}
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    #{bracket.champion.seed} seed · {bracket.champion.points} regular-season pts
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
