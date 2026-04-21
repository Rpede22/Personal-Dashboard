"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface StandingRow {
  rank: number;
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

interface SportsEvent {
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

type Tab = "standings" | "schedule" | "playoffs";

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
  { label: "L",    title: "Losses" },
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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/sports?team=${teamSlug}`);
        setData(await res.json());
      } catch {}
      setLoading(false);
    })();
  }, [teamSlug]);

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

  const tabs: Tab[] = showPlayoffs ? ["standings", "schedule", "playoffs"] : ["standings", "schedule"];

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
    <div className="min-h-screen p-6" style={{ background: "var(--background)", color: "var(--text)" }}>
      <Link href="/" className="inline-flex items-center gap-1 text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        ← Dashboard
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
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

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all"
            style={{
              background: tab === t ? accent : "var(--surface)",
              color: tab === t ? "#fff" : "var(--text-muted)",
              border: `1px solid ${tab === t ? accent : "var(--border)"}`,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : !data ? (
        <p style={{ color: "var(--accent-red)" }}>Failed to load data.</p>
      ) : tab === "standings" ? (

        /* ── STANDINGS ── */
        <div className="space-y-6">
          <StandingsTable
            title="Regular Season"
            rows={data.allStandings}
            headers={headers}
            isFootball={isFootball}
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
                keyword={keyword}
                accent={accent}
                colSpan={colSpan}
              />
            ))}
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
                  return (
                    <div key={i} className="rounded-xl px-4 py-3 flex items-center gap-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
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
          {!bracket || bracket.rounds.length === 0 ? (
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
