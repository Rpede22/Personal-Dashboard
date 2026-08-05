"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/Skeleton";

// ── EDM (NHL) types ────────────────────────────────────────────────────────
interface TeamStanding {
  teamAbbrev: string;
  points: number;
  wins: number;
  losses: number;
  otLosses: number;
  divisionRank: number;
}
interface NHLGame {
  gameDate: string;
  startTimeUTC?: string;
  homeTeam: { abbrev: string; score?: number };
  awayTeam: { abbrev: string; score?: number };
  gameState: string;
  periodType?: string | null;
}
interface BracketSeries {
  letter: string;
  roundNumber: number;
  conference: string;
  topSeed: { abbrev: string; wins: number };
  bottomSeed: { abbrev: string; wins: number };
  status: string;
  complete: boolean;
}

// ── Other sports types ─────────────────────────────────────────────────────
interface SportsEvent {
  date: string;
  time?: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  finished: boolean;
}
interface SportsStanding {
  rank: number;
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  otLosses?: number; // hockey only — Metal Ligaen source populates this
  points: number;
}
interface SportsSubTable {
  name: string;
  localName?: string;
  rows: SportsStanding[];
}
interface SportsSummary {
  slug: string;
  config: { name: string; shortName: string; matchKeyword: string; accentColor: string; emoji: string; leagueName: string };
  standing: SportsStanding | null;
  last5: SportsEvent[];
  next5: SportsEvent[];
  subTables: SportsSubTable[];
  topOpponents?: string[];
}

// Team-specific colours: real club colours used for gradient borders.
// tint = subtle background tint (rgba), borderGradient = the stripe, textAccent = CSS var for text.
const SPORT_TEAM_CONFIGS = [
  {
    slug: "esbjerg-fb",
    href: "/sports/esbjerg-fb",
    short: "EFB",
    emoji: "⚽",
    textAccent: "var(--accent-blue)",
    // Esbjerg fB: blue & white
    borderGradient: "linear-gradient(135deg, #005B9A 0%, #ffffff 100%)",
  },
  {
    slug: "barcelona",
    href: "/sports/barcelona",
    short: "FCB",
    emoji: "⚽",
    textAccent: "var(--accent-red)",
    // FC Barcelona: blaugrana
    borderGradient: "linear-gradient(135deg, #A50044 0%, #004D98 100%)",
  },
  {
    slug: "esbjerg-energy",
    href: "/sports/esbjerg-energy",
    short: "EEN",
    emoji: "🏒",
    textAccent: "var(--accent-orange)",
    // Esbjerg Energy: yellow & dark blue
    borderGradient: "linear-gradient(135deg, #FFC400 0%, #003087 100%)",
  },
];

// EDM: Oilers — navy, white, orange
const EDM_BORDER  = "linear-gradient(135deg, #003087 0%, #ffffff 50%, #FC4C02 100%)";
const EDM_ACCENT  = "var(--accent-blue)";

// Sports outer card: all 6 team colours together
const SPORTS_OUTER_BORDER = "linear-gradient(90deg, #003087 0%, #FC4C02 20%, #ffffff 40%, #005B9A 55%, #A50044 75%, #FFC400 100%)";

// Wrapper that fakes a gradient border via padding + inner background.
// borderRadius on outer must be inner radius + borderWidth.
function GradientBorder({
  gradient,
  borderWidth = 3,
  innerRadius = 12,
  innerBg = "var(--surface-2)",
  shadow = "0 2px 16px rgba(0,0,0,0.3)",
  className = "",
  children,
}: {
  gradient: string;
  borderWidth?: number;
  innerRadius?: number;
  innerBg?: string;
  shadow?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: gradient,
        padding: borderWidth,
        borderRadius: innerRadius + borderWidth,
        boxShadow: shadow,
        height: "100%",
      }}
    >
      <div
        className={className}
        style={{
          background: innerBg,
          borderRadius: innerRadius,
          height: "100%",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function formatCEST(game: NHLGame): string {
  const d = game.startTimeUTC ? new Date(game.startTimeUTC) : new Date(game.gameDate);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }) + " CEST";
}

function edmDateLabel(game: NHLGame): string {
  const d = game.startTimeUTC ? new Date(game.startTimeUTC) : new Date(game.gameDate + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Berlin" });
}

function toCopenhagenTime(dateStr: string, timeStr?: string): string {
  if (!timeStr) return "";
  try {
    const dt = new Date(`${dateStr}T${timeStr}:00Z`);
    return dt.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" });
  } catch { return timeStr; }
}

function toCopenhagenDate(dateStr: string, timeStr?: string): string {
  try {
    const dt = new Date(timeStr ? `${dateStr}T${timeStr}:00Z` : `${dateStr}T12:00:00Z`);
    return dt.toLocaleDateString("da-DK", { day: "numeric", month: "short", timeZone: "Europe/Copenhagen" });
  } catch { return dateStr; }
}

function shortName(fullName: string): string {
  return fullName.split(" ").slice(0, 2).join(" ");
}

function ResultDot({ result }: { result: "W" | "D" | "L" | "OTL" }) {
  const bg =
    result === "W" ? "var(--accent-green)" :
    result === "D" ? "var(--accent-orange)" :
    "#374151";
  return (
    <span
      className="inline-block w-4 h-4 rounded-sm text-xs font-bold leading-4 text-center"
      style={{ background: bg, color: "#fff", fontSize: "9px" }}
    >
      {result}
    </span>
  );
}

export default function SportsWidget() {
  const [edm, setEdm] = useState<TeamStanding | null>(null);
  const [edmGames, setEdmGames] = useState<NHLGame[]>([]);
  const [edmNext, setEdmNext] = useState<NHLGame | null>(null);
  const [edmSeries, setEdmSeries] = useState<BracketSeries | null>(null);
  const [nhlStandings, setNhlStandings] = useState<TeamStanding[]>([]);
  const [sportsSummaries, setSportsSummaries] = useState<SportsSummary[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    try {
      const [standingsRes, scheduleRes, sportsRes, bracketRes] = await Promise.all([
        fetch("/api/nhl/standings"),
        fetch("/api/nhl/schedule?team=EDM"),
        fetch("/api/sports"),
        fetch("/api/nhl/bracket"),
      ]);
      const standings = await standingsRes.json();
      const schedule = await scheduleRes.json();
      const sports = await sportsRes.json();
      const bracketData = await bracketRes.json();

      const allStandings: TeamStanding[] = standings.standings ?? [];
      setNhlStandings(allStandings);
      setEdm(allStandings.find((s: TeamStanding) => s.teamAbbrev === "EDM") ?? null);
      setEdmGames(schedule.recent ?? []);
      setEdmNext(schedule.next ?? null);
      setSportsSummaries(sports.summaries ?? []);

      const series: BracketSeries[] = bracketData.series ?? [];
      const edmS = series.find((s) => s.topSeed.abbrev === "EDM" || s.bottomSeed.abbrev === "EDM") ?? null;
      setEdmSeries(edmS);
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5 * 60 * 1000); // refresh every 5 minutes
    return () => clearInterval(interval);
  }, []);

  function edmResult(game: NHLGame): "W" | "L" | "OTL" {
    const es = game.homeTeam.abbrev === "EDM" ? game.homeTeam.score : game.awayTeam.score;
    const os = game.homeTeam.abbrev === "EDM" ? game.awayTeam.score : game.homeTeam.score;
    if (es === undefined || os === undefined) return "L";
    if (es > os) return "W";
    return (game.periodType === "OT" || game.periodType === "SO") ? "OTL" : "L";
  }

  function sportsResult(e: SportsEvent, keyword: string): "W" | "D" | "L" {
    if (e.homeScore === null || e.awayScore === null) return "L";
    const isHome = e.homeTeam.toLowerCase().includes(keyword.toLowerCase());
    const scored = isHome ? e.homeScore : e.awayScore;
    const conceded = isHome ? e.awayScore : e.homeScore;
    if (scored > conceded) return "W";
    if (scored === conceded) return "D";
    return "L";
  }

  function nextMatchLabel(e: SportsEvent, keyword: string): string {
    const isHome = e.homeTeam.toLowerCase().includes(keyword.toLowerCase());
    const opponent = isHome ? e.awayTeam : e.homeTeam;
    const prefix = isHome ? "vs" : "@";
    return `${prefix} ${shortName(opponent)}`;
  }

  function oprykningsspilRank(summary: SportsSummary): number | null {
    const promo = summary.subTables.find(
      (t) => t.name.toLowerCase().includes("promotion") || t.localName?.toLowerCase().includes("oprykningsspil")
    );
    if (!promo) return null;
    const row = promo.rows.find((r) => r.team.toLowerCase().includes(
      summary.config.matchKeyword.toLowerCase()
    ));
    return row?.rank ?? null;
  }

  return (
    /* Outer Sports card — rainbow stripe border via wrapper padding */
    <GradientBorder
      gradient={SPORTS_OUTER_BORDER}
      borderWidth={3}
      innerRadius={16}
      innerBg="var(--surface)"
      shadow="0 4px 28px rgba(0,0,0,0.35)"
      className="p-5"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">🏆</span>
        <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>Sports</h2>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          <Skeleton height={110} rounded="14px" />
          <Skeleton height={110} rounded="14px" />
          <Skeleton height={110} rounded="14px" />
          <Skeleton height={110} rounded="14px" />
        </div>
      ) : (
        <>
        <div className="grid grid-cols-2 gap-3">

          {/* EDM box */}
          <Link href="/nhl" className="block transition-all hover:brightness-110">
            <GradientBorder gradient={EDM_BORDER} className="p-3 h-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold" style={{ color: EDM_ACCENT }}>🏒 EDM</span>
                {edmSeries ? (
                  <span className="text-xs font-bold" style={{ color: EDM_ACCENT }}>
                    R{edmSeries.roundNumber}
                  </span>
                ) : edm && (
                  <span className="text-xs font-bold" style={{ color: EDM_ACCENT }}>#{edm.divisionRank} Pacific</span>
                )}
              </div>
              {edmSeries ? (() => {
                const isTop = edmSeries.topSeed.abbrev === "EDM";
                const edmWins = isTop ? edmSeries.topSeed.wins : edmSeries.bottomSeed.wins;
                const oppWins = isTop ? edmSeries.bottomSeed.wins : edmSeries.topSeed.wins;
                const opp = isTop ? edmSeries.bottomSeed.abbrev : edmSeries.topSeed.abbrev;
                return (
                  <div className="mb-2">
                    <div className="flex gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                      <span className="font-bold" style={{ color: EDM_ACCENT }}>EDM {edmWins}</span>
                      <span>–</span>
                      <span className="font-bold">{oppWins} {opp}</span>
                    </div>
                    {edmSeries.status && (
                      <div className="text-xs mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
                        {edmSeries.status}
                      </div>
                    )}
                  </div>
                );
              })() : edm && (
                <div className="flex gap-2 text-xs mb-2" style={{ color: "var(--text-muted)" }}>
                  <span className="font-bold" style={{ color: EDM_ACCENT }}>{edm.points}pts</span>
                  <span>{edm.wins}W {edm.losses}L {edm.otLosses}OTL</span>
                </div>
              )}
              <div className="flex gap-1 mb-2">
                {edmGames.slice(0, 5).map((g, i) => {
                  const r = edmResult(g);
                  return <ResultDot key={i} result={r === "OTL" ? "D" : r} />;
                })}
                {edmGames.length === 0 && <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>}
              </div>
              {edmNext && (
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Next: {edmDateLabel(edmNext)} · {edmNext.awayTeam.abbrev} @ {edmNext.homeTeam.abbrev} · {formatCEST(edmNext)}
                </div>
              )}
            </GradientBorder>
          </Link>

          {/* Other 3 teams */}
          {SPORT_TEAM_CONFIGS.map((teamCfg) => {
            const summary = sportsSummaries.find((s) => s.slug === teamCfg.slug);
            const last5 = summary?.last5 ?? [];
            const next = summary?.next5?.[0] ?? null;
            const keyword = summary?.config.matchKeyword ?? teamCfg.short;

            const promoRank = summary ? oprykningsspilRank(summary) : null;
            const standing = summary?.standing ?? null;
            const displayRank = promoRank ?? standing?.rank ?? null;
            const rankLabel = promoRank ? `#${promoRank} Opryk.` : displayRank ? `#${displayRank}` : null;

            return (
              <Link key={teamCfg.slug} href={teamCfg.href} className="block transition-all hover:brightness-110">
                <GradientBorder gradient={teamCfg.borderGradient} className="p-3 h-full">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold" style={{ color: teamCfg.textAccent }}>
                      {teamCfg.emoji} {teamCfg.short}
                    </span>
                    {rankLabel && (
                      <span className="text-xs font-bold" style={{ color: teamCfg.textAccent }}>{rankLabel}</span>
                    )}
                  </div>
                  {standing ? (
                    <div className="flex gap-2 text-xs mb-2" style={{ color: "var(--text-muted)" }}>
                      <span className="font-bold" style={{ color: teamCfg.textAccent }}>{standing.points}pts</span>
                      {standing.otLosses !== undefined ? (
                        <span>{standing.won}W {standing.lost}L {standing.otLosses}OTL</span>
                      ) : (
                        <span>{standing.won}W {standing.drawn}D {standing.lost}L</span>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>No data yet</div>
                  )}
                  <div className="flex gap-1 mb-2">
                    {last5.filter((e) => e.finished).slice(-5).map((e, i) => (
                      <ResultDot key={i} result={sportsResult(e, keyword)} />
                    ))}
                    {last5.filter((e) => e.finished).length === 0 && (
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </div>
                  {next && (
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Next: {toCopenhagenDate(next.date, next.time)} · {nextMatchLabel(next, keyword)}
                      {next.time && ` · ${toCopenhagenTime(next.date, next.time)} CEST`}
                    </div>
                  )}
                </GradientBorder>
              </Link>
            );
          })}

        </div>

        {/* ── Match of the week: flag any upcoming top-3-opponent fixture.
            Rendered below the grid so the four team cards stay the main event
            and the strip acts as a "coming up" footer. Up to 4 rows — one per
            team when they each have a qualifying fixture in the next 7 days. ── */}
        {(() => {
          const now = Date.now();
          const weekOut = now + 7 * 24 * 3600 * 1000;
          type Highlight = {
            key: string;
            href: string;
            teamLabel: string;
            teamEmoji: string;
            teamAccent: string;
            opponent: string;
            opponentRank: number;
            homeAway: "vs" | "@";
            when: string;
            leagueName: string;
          };
          const found: Highlight[] = [];

          if (edmNext && nhlStandings.length > 0) {
            const start = edmNext.startTimeUTC ? new Date(edmNext.startTimeUTC).getTime() : new Date(edmNext.gameDate + "T12:00:00Z").getTime();
            if (start >= now && start <= weekOut) {
              const isHome = edmNext.homeTeam.abbrev === "EDM";
              const oppAbbrev = isHome ? edmNext.awayTeam.abbrev : edmNext.homeTeam.abbrev;
              const opp = nhlStandings.find((s) => s.teamAbbrev === oppAbbrev);
              if (opp && opp.divisionRank <= 3) {
                found.push({
                  key: `nhl-${oppAbbrev}`,
                  href: "/nhl",
                  teamLabel: "EDM",
                  teamEmoji: "🏒",
                  teamAccent: EDM_ACCENT,
                  opponent: oppAbbrev,
                  opponentRank: opp.divisionRank,
                  homeAway: isHome ? "vs" : "@",
                  when: `${edmDateLabel(edmNext)} · ${formatCEST(edmNext)}`,
                  leagueName: "NHL",
                });
              }
            }
          }

          for (const teamCfg of SPORT_TEAM_CONFIGS) {
            const summary = sportsSummaries.find((s) => s.slug === teamCfg.slug);
            if (!summary?.topOpponents?.length) continue;
            for (const evt of summary.next5 ?? []) {
              const start = new Date(`${evt.date}T${evt.time ?? "12:00"}:00Z`).getTime();
              if (!isFinite(start) || start < now || start > weekOut) continue;
              const isHome = evt.homeTeam.toLowerCase().includes(summary.config.matchKeyword.toLowerCase());
              const opp = isHome ? evt.awayTeam : evt.homeTeam;
              const oppLower = opp.toLowerCase();
              const rankIdx = summary.topOpponents.findIndex((t) => oppLower.includes(t.toLowerCase()) || t.toLowerCase().includes(oppLower));
              if (rankIdx === -1) continue;
              found.push({
                key: `${teamCfg.slug}-${evt.date}-${opp}`,
                href: teamCfg.href,
                teamLabel: teamCfg.short,
                teamEmoji: teamCfg.emoji,
                teamAccent: teamCfg.textAccent,
                opponent: shortName(opp),
                opponentRank: rankIdx + 1,
                homeAway: isHome ? "vs" : "@",
                when: `${toCopenhagenDate(evt.date, evt.time)}${evt.time ? ` · ${toCopenhagenTime(evt.date, evt.time)} CEST` : ""}`,
                leagueName: summary.config.leagueName,
              });
              break; // one match per team is enough
            }
          }

          if (found.length === 0) return null;
          return (
            <div className="mt-3 rounded-lg p-2.5" style={{
              background: "linear-gradient(135deg, rgba(252,76,2,0.18), rgba(252,76,2,0.05))",
              border: "1px solid rgba(252,76,2,0.45)",
            }}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs">⭐</span>
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--accent-orange)" }}>
                  Match of the week{found.length > 1 ? ` · ${found.length}` : ""}
                </span>
              </div>
              <div className="space-y-1">
                {found.map((h) => (
                  <Link key={h.key} href={h.href} className="block hover:brightness-125">
                    <div className="text-xs flex items-baseline gap-1.5 flex-wrap">
                      <span className="font-bold" style={{ color: h.teamAccent }}>{h.teamEmoji} {h.teamLabel}</span>
                      <span style={{ color: "var(--text-muted)" }}>{h.homeAway}</span>
                      <span className="font-semibold" style={{ color: "var(--text)" }}>{h.opponent}</span>
                      <span
                        className="text-[9px] font-bold px-1 rounded"
                        style={{ background: "var(--accent-orange)22", color: "var(--accent-orange)" }}
                      >
                        #{h.opponentRank}
                      </span>
                      <span style={{ color: "var(--text-muted)" }}>· {h.when}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })()}
        </>
      )}
    </GradientBorder>
  );
}
