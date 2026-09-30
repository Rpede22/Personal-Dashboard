"use client";

/**
 * Playoff race strip + projected bracket for a followed US team (NHL / NBA /
 * NFL). This is the ESPN-team counterpart to the EDM `/nhl` hub's PlayoffRace +
 * projected bracket — it reads the already-loaded `/api/sports` standings
 * instead of the NHL-specific `/api/nhl/standings`, and branches every rule
 * (cutoff, seeding, bracket size, byes, points-vs-wins) off `PLAYOFF_RULES`.
 *
 * The Monte-Carlo predictor stays EDM-only by design.
 */

import { useMemo, useState, useEffect } from "react";
import {
  PLAYOFF_RULES,
  computeRace,
  type UsSport,
  type PlayoffRules,
  type RaceTeam,
} from "@/lib/playoff-rules";
import type { LiveBracket } from "@/lib/live-bracket";

interface StandingRow {
  rank: number;
  team: string;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  points: number;
  group?: string;      // conference
  groupRank?: number;  // rank within conference
  division?: string;
  divisionRank?: number;
  seed?: number;
}

// A team's "score" for race/bracket math: standings points (NHL) or wins (else).
function scoreOf(r: StandingRow, rules: PlayoffRules): number {
  return rules.usesPoints ? r.points : r.won;
}

function shortConf(name: string): string {
  const n = name.trim();
  if (/american football conference/i.test(n)) return "AFC";
  if (/national football conference/i.test(n)) return "NFC";
  if (/eastern conference/i.test(n)) return "East";
  if (/western conference/i.test(n)) return "West";
  return n.replace(/\s+Conference$/i, "");
}

// ── Projected bracket ───────────────────────────────────────────────────────────

interface BracketTeam {
  seed: number;
  name: string;
  score: number;
  played: number;
  scorePct: number; // 0..1, score per available score-unit
}
interface Matchup {
  round: number;
  home: BracketTeam | null; // null = bye placeholder
  away: BracketTeam | null;
  homeWinProb: number;
  winner: BracketTeam;
}

function seriesProb(home: BracketTeam, away: BracketTeam): number {
  const diff = home.scorePct - away.scorePct;   // roughly −1..+1
  const base = 0.5 + diff * 0.9;
  const homeBonus = 0.05;
  return Math.min(0.9, Math.max(0.1, base + homeBonus));
}

/** Build a seeded projected bracket for ONE conference from its ranked rows. */
function buildConferenceBracket(rows: StandingRow[], rules: PlayoffRules): { rounds: Matchup[][]; champion: BracketTeam } | null {
  const seeds: BracketTeam[] = rows.slice(0, rules.bracketSeeds).map((r, i) => {
    const score = scoreOf(r, rules);
    const denom = r.played * rules.pointsPerWin;
    return {
      seed: i + 1,
      name: r.team,
      score,
      played: r.played,
      scorePct: denom > 0 ? score / denom : 0,
    };
  });
  if (seeds.length < rules.bracketSeeds) return null;

  const play = (home: BracketTeam, away: BracketTeam, round: number): Matchup => {
    const homeWinProb = seriesProb(home, away);
    return { round, home, away, homeWinProb, winner: homeWinProb >= 0.5 ? home : away };
  };

  const rounds: Matchup[][] = [];

  if (rules.byes > 0) {
    // NFL: 7 seeds, #1 gets a bye. Wild-card round = 2v7 / 3v6 / 4v5.
    const wc = [play(seeds[1], seeds[6], 1), play(seeds[2], seeds[5], 1), play(seeds[3], seeds[4], 1)];
    rounds.push(wc);
    // Divisional: #1 (bye) vs lowest remaining seed; other two winners meet.
    const advancing = wc.map((m) => m.winner).sort((a, b) => a.seed - b.seed);
    const top = seeds[0];
    const div = [
      play(top, advancing[advancing.length - 1], 2),
      play(advancing[0], advancing[1], 2),
    ];
    rounds.push(div);
    // Conference championship.
    const [h, a] = div.map((m) => m.winner).sort((x, y) => x.seed - y.seed);
    rounds.push([play(h, a, 3)]);
    return { rounds, champion: rounds[2][0].winner };
  }

  // NHL / NBA: 8 seeds, 1v8 2v7 3v6 4v5.
  const qf = [
    play(seeds[0], seeds[7], 1),
    play(seeds[1], seeds[6], 1),
    play(seeds[2], seeds[5], 1),
    play(seeds[3], seeds[4], 1),
  ];
  rounds.push(qf);
  const sf = [
    (() => { const [h, a] = [qf[0].winner, qf[3].winner].sort((x, y) => x.seed - y.seed); return play(h, a, 2); })(),
    (() => { const [h, a] = [qf[1].winner, qf[2].winner].sort((x, y) => x.seed - y.seed); return play(h, a, 2); })(),
  ];
  rounds.push(sf);
  const [fh, fa] = [sf[0].winner, sf[1].winner].sort((x, y) => x.seed - y.seed);
  rounds.push([play(fh, fa, 3)]);
  return { rounds, champion: rounds[2][0].winner };
}

const ROUND_NAMES: Record<UsSport, string[]> = {
  nhl: ["First Round", "Second Round", "Conference Final"],
  nba: ["First Round", "Conference Semis", "Conference Final"],
  nfl: ["Wild Card", "Divisional", "Conference Championship"],
};

// ── Component ────────────────────────────────────────────────────────────────────

export default function SportsPlayoffs({
  sport,
  slug,
  allStandings,
  keyword,
  accent,
}: {
  sport: UsSport;
  slug: string;
  allStandings: StandingRow[];
  keyword: string;
  accent: string;
}) {
  const rules = PLAYOFF_RULES[sport];
  const [mode, setMode] = useState<"projected" | "live">("projected");

  const me = useMemo(
    () => allStandings.find((r) => r.team.toLowerCase().includes(keyword.toLowerCase())) ?? null,
    [allStandings, keyword],
  );

  // My conference's rows, ranked by conference seed.
  const confRows = useMemo(() => {
    if (!me?.group) return [];
    return allStandings
      .filter((r) => r.group === me.group)
      .slice()
      .sort((a, b) => (a.groupRank ?? 999) - (b.groupRank ?? 999));
  }, [allStandings, me]);

  const race = useMemo(() => {
    if (!me || confRows.length === 0) return null;
    const toRace = (r: StandingRow): RaceTeam => ({
      rank: r.groupRank ?? r.rank,
      team: r.team,
      score: scoreOf(r, rules),
      played: r.played,
    });
    const meRace = toRace(me);
    return computeRace(meRace, confRows.map(toRace), rules);
  }, [me, confRows, rules]);

  const brackets = useMemo(() => {
    const byConf = new Map<string, StandingRow[]>();
    for (const r of allStandings) {
      if (!r.group) continue;
      if (!byConf.has(r.group)) byConf.set(r.group, []);
      byConf.get(r.group)!.push(r);
    }
    return [...byConf.entries()]
      .map(([name, rows]) => ({
        name,
        rows: rows.slice().sort((a, b) => (a.groupRank ?? 999) - (b.groupRank ?? 999)),
      }))
      .map((c) => ({ name: c.name, bracket: buildConferenceBracket(c.rows, rules), rows: c.rows }));
  }, [allStandings, rules]);

  if (!me) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <p style={{ color: "var(--text-muted)" }}>No standings available to build the playoff picture yet.</p>
      </div>
    );
  }

  // Preseason: every team is 0-0-0, so seeds/race/bracket would be arbitrary.
  if (allStandings.length > 0 && allStandings.every((r) => r.played === 0)) {
    return (
      <div className="rounded-2xl p-8 text-center space-y-1" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <p className="font-medium">The playoff picture opens once the season starts</p>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No games have been played yet — check the Schedule tab for the upcoming fixtures.</p>
      </div>
    );
  }

  const scoreLabel = rules.usesPoints ? "pts" : "W";
  const statusColor = race?.status === "clinched" ? "var(--accent-green)"
    : race?.status === "eliminated" ? "var(--accent-red)" : "var(--accent-orange)";
  const statusLabel = race?.status === "clinched" ? "Clinched"
    : race?.status === "eliminated" ? "Eliminated" : "In the race";

  return (
    <div className="space-y-6">
      {/* ── Playoff race strip ── */}
      {race && (
        <div className="rounded-2xl px-5 py-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">
              🏆 Playoff race — {me.team}{me.group ? ` · ${shortConf(me.group)}` : ""}
            </div>
            <span className="text-xs uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: `${statusColor}22`, color: statusColor }}>
              {statusLabel}
            </span>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
            <Cell label="Conf seed" value={`#${race.rank}`} sub={me.division ? me.division.replace(/\s+Division$/i, "") : (me.group ? shortConf(me.group) : "")} />
            <Cell label={rules.usesPoints ? "Points" : "Record"} value={rules.usesPoints ? String(me.points) : `${me.won}-${me.lost}${sport === "nfl" && me.drawn ? `-${me.drawn}` : ""}`} sub={`${me.played} GP · ${race.gamesRemaining} left`} />
            <Cell
              label="Vs cutoff"
              value={race.marginToCutoff !== null ? `${race.marginToCutoff >= 0 ? "+" : ""}${race.marginToCutoff} ${scoreLabel}` : "—"}
              sub={race.cutoffTeam ? `#${rules.postseasonSpots} ${race.cutoffTeam.team.split(" ").pop()} · ${race.cutoffTeam.score}` : ""}
              color={race.marginToCutoff !== null && race.marginToCutoff >= 0 ? "var(--accent-green)" : "var(--accent-red)"}
            />
            <Cell
              label="Magic number"
              value={race.magicNumber !== null ? (race.magicNumber === 0 ? "✓" : String(race.magicNumber)) : "—"}
              sub={`${scoreLabel} to clinch`}
              color={race.clinched ? "var(--accent-green)" : undefined}
            />
            <Cell
              label="Elimination"
              value={race.eliminationNumber !== null ? (race.eliminationNumber === 0 ? "✗" : String(race.eliminationNumber)) : "—"}
              sub="opp gains to end run"
              color={race.eliminated ? "var(--accent-red)" : undefined}
            />
          </div>
          <div className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
            {rules.label} · top {rules.directSpots}{rules.playIn ? ` direct + play-in (${rules.playIn.from}–${rules.playIn.to})` : ""} per conference{rules.byes ? ` · #1 seed bye` : ""}.
            {rules.usesPoints ? " Points-based (2 per win)." : " Win-based."} Ignores tiebreakers.
          </div>
        </div>
      )}

      {/* ── Projected / Live sub-tabs ── */}
      <div className="flex gap-1 rounded-lg p-1" style={{ background: "var(--surface-2)", width: "fit-content" }}>
        {([["projected", "If playoffs started today"], ["live", "Live playoffs"]] as const).map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)} className="px-4 py-1.5 rounded-md text-sm font-medium"
            style={{ background: mode === m ? accent : "transparent", color: mode === m ? "#fff" : "var(--text-muted)" }}>{label}</button>
        ))}
      </div>

      {mode === "live" ? (
        <LiveBracketView slug={slug} accent={accent} keyword={keyword} onNoLive={() => setMode("projected")} />
      ) : (
      <>
      {/* ── Projected bracket (per conference) ── */}
      <div className="rounded-xl p-3 text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
        If the playoffs started today · seeded by conference{rules.byes ? ` · #1 seed byes into round 2` : ""}
        {rules.playIn ? ` · seeds ${rules.playIn.from}–${rules.playIn.to} shown as the play-in field` : ""}. Series odds from record with a small home bonus.
      </div>

      {brackets.map(({ name, bracket, rows }) => (
        <div key={name}>
          <h3 className="font-semibold text-sm mb-3 uppercase tracking-wide" style={{ color: accent }}>
            {shortConf(name)} Conference
          </h3>
          {!bracket ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Not enough teams to seed a bracket.</p>
          ) : (
            <div className="space-y-4">
              {bracket.rounds.map((round, ri) => (
                <div key={ri}>
                  <div className="text-[11px] uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>
                    {ROUND_NAMES[sport][ri] ?? `Round ${ri + 1}`}
                  </div>
                  <div className={round.length === 1 ? "flex" : "grid grid-cols-1 md:grid-cols-2 gap-3"}>
                    {round.map((m, mi) => (
                      <MatchupCard key={mi} m={m} keyword={keyword} accent={accent} predicted={ri > 0} single={round.length === 1} scoreLabel={scoreLabel} />
                    ))}
                  </div>
                </div>
              ))}
              {/* Play-in field (NBA) */}
              {rules.playIn && rows.length >= rules.playIn.to && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>
                    Play-in ({rules.playIn.from}–{rules.playIn.to})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {rows.slice(rules.playIn.from - 1, rules.playIn.to).map((r, i) => {
                      const mine = r.team.toLowerCase().includes(keyword.toLowerCase());
                      return (
                        <span key={r.team} className="text-xs px-2 py-1 rounded-lg" style={{ background: mine ? `${accent}22` : "var(--surface-2)", color: mine ? accent : "var(--text-muted)", border: "1px solid var(--border)" }}>
                          #{rules.playIn!.from + i} {r.team} · {r.won}-{r.lost}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="rounded-xl p-3 text-center" style={{ background: bracket.champion.name.toLowerCase().includes(keyword.toLowerCase()) ? `${accent}22` : "var(--surface)", border: `1px solid ${accent}44` }}>
                <div className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: "var(--text-muted)" }}>Projected {shortConf(name)} champion</div>
                <div className="text-lg font-bold" style={{ color: accent }}>{bracket.champion.name}</div>
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>#{bracket.champion.seed} seed · {bracket.champion.score} {scoreLabel}</div>
              </div>
            </div>
          )}
        </div>
      ))}
      </>
      )}
    </div>
  );
}

// ── Live bracket ────────────────────────────────────────────────────────────────
function LiveBracketView({ slug, accent, keyword, onNoLive }: { slug: string; accent: string; keyword: string; onNoLive: () => void }) {
  const [data, setData] = useState<LiveBracket | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/sports/live-bracket?slug=${slug}`)
      .then((r) => r.json())
      .then((d: LiveBracket) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [slug]);

  if (loading) return <div className="rounded-2xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}><p style={{ color: "var(--text-muted)" }}>Loading live bracket…</p></div>;
  if (!data || !data.available || data.rounds.length === 0) {
    return (
      <div className="rounded-2xl p-8 text-center space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <p className="font-medium">No live playoffs right now</p>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>The playoffs haven&apos;t started (or the season is over). See the <button onClick={onNoLive} className="underline" style={{ color: accent }}>projected</button> bracket instead.</p>
      </div>
    );
  }
  const mk = data.sport === "nfl" ? "score" : "series";
  return (
    <div className="space-y-6">
      <div className="rounded-xl p-3 text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
        Live {data.season} playoffs · {data.sport.toUpperCase()} · {data.sport === "nhl" ? "official NHL bracket" : "ESPN"}{mk === "series" ? " · best-of-7 series" : " · single elimination"}.
      </div>
      {data.rounds.map((round) => (
        <div key={round.name}>
          <h3 className="font-semibold text-sm mb-3 uppercase tracking-wide" style={{ color: accent }}>{round.name}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {round.series.map((s, i) => {
              const mine = s.top.abbr.toLowerCase() === keyword.toLowerCase().slice(0, 3) || [s.top.abbr, s.bottom.abbr].some((a) => keyword.toLowerCase().includes(a.toLowerCase()));
              const side = (t: typeof s.top, right: boolean) => (
                <div className={`flex items-center gap-1.5 ${right ? "justify-end" : ""}`}>
                  {!right && t.seed != null && <span className="text-[10px] px-1 rounded" style={{ background: "var(--surface)", color: "var(--text-muted)" }}>#{t.seed}</span>}
                  <span className="font-bold text-sm" style={{ color: s.winner === t.abbr ? "var(--accent-green)" : "var(--text)" }}>{t.abbr}</span>
                  {right && t.seed != null && <span className="text-[10px] px-1 rounded" style={{ background: "var(--surface)", color: "var(--text-muted)" }}>#{t.seed}</span>}
                </div>
              );
              return (
                <div key={i} className="rounded-xl p-3" style={{ background: mine ? `${accent}11` : "var(--surface-2)", border: `1px solid ${mine ? `${accent}44` : "var(--border)"}` }}>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">{side(s.top, false)}</div>
                    <div className="text-base font-bold px-2 shrink-0" style={{ color: "var(--text-muted)" }}>{s.top.wins}–{s.bottom.wins}</div>
                    <div className="flex-1 min-w-0 flex justify-end">{side(s.bottom, true)}</div>
                  </div>
                  {/* Best-of-N win pips (skip single-elim NFL) — EDM-hub-style
                      series progress with green for the side that clinched. */}
                  {s.bestOf > 1 && (() => {
                    const needed = Math.ceil(s.bestOf / 2);
                    const pips = (wins: number, won: boolean) => Array.from({ length: needed }, (_, k) => (
                      <div key={k} className="w-2.5 h-2.5 rounded-sm" style={{ background: k < wins ? (won ? "var(--accent-green)" : accent) : "var(--surface)", border: "1px solid var(--border)" }} />
                    ));
                    return (
                      <div className="flex items-center justify-between mt-1.5">
                        <div className="flex gap-1">{pips(s.top.wins, s.complete && s.winner === s.top.abbr)}</div>
                        <span className="text-[9px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>best of {s.bestOf}</span>
                        <div className="flex gap-1 flex-row-reverse">{pips(s.bottom.wins, s.complete && s.winner === s.bottom.abbr)}</div>
                      </div>
                    );
                  })()}
                  {s.conference && <div className="text-[10px] mt-1 text-center" style={{ color: "var(--text-muted)" }}>{s.conference}{s.complete && s.winner ? ` · ${s.winner} advance${data.sport === "nfl" ? "" : "s"}` : s.complete ? " · final" : ""}</div>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function MatchupCard({ m, keyword, accent, predicted, single, scoreLabel }: {
  m: Matchup; keyword: string; accent: string; predicted: boolean; single: boolean; scoreLabel: string;
}) {
  const homePct = Math.round(m.homeWinProb * 100);
  const awayPct = 100 - homePct;
  const mine = (m.home?.name ?? "").toLowerCase().includes(keyword.toLowerCase()) || (m.away?.name ?? "").toLowerCase().includes(keyword.toLowerCase());
  const side = (t: BracketTeam | null, right: boolean) => (
    <div className={`flex-1 min-w-0 ${right ? "text-right" : ""}`}>
      <div className={`flex items-center gap-1.5 ${right ? "justify-end" : ""}`}>
        {!right && t && <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: "var(--surface)", color: "var(--text-muted)" }}>#{t.seed}</span>}
        <span className="font-semibold text-sm truncate" style={{ color: t && t.name.toLowerCase().includes(keyword.toLowerCase()) ? accent : "var(--text)" }}>
          {t ? t.name : "TBD"}
        </span>
        {right && t && <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: "var(--surface)", color: "var(--text-muted)" }}>#{t.seed}</span>}
      </div>
      {t && <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{t.score} {scoreLabel} · {t.played} GP</div>}
    </div>
  );
  return (
    <div className="rounded-xl p-3" style={{
      background: mine ? `${accent}11` : "var(--surface-2)",
      border: `1px solid ${mine ? `${accent}44` : "var(--border)"}`,
      width: single ? "100%" : undefined,
      maxWidth: single ? "38rem" : undefined,
    }}>
      <div className="flex items-center gap-2">
        {side(m.home, false)}
        <div className="text-center shrink-0">
          <div className="text-xs px-2 py-0.5 rounded font-bold" style={{ background: `${accent}22`, color: accent }}>{homePct}%</div>
          <div className="text-[10px] my-0.5" style={{ color: "var(--text-muted)" }}>vs</div>
          <div className="text-xs px-2 py-0.5 rounded font-bold" style={{ background: "var(--surface)", color: "var(--text-muted)" }}>{awayPct}%</div>
        </div>
        {side(m.away, true)}
      </div>
      {predicted && <div className="text-[10px] italic mt-1.5 text-right" style={{ color: "var(--border)" }}>projected</div>}
    </div>
  );
}

function Cell({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg p-2" style={{ background: "var(--surface-2)" }}>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-lg font-bold" style={{ color: color ?? "var(--text)" }}>{value}</div>
      {sub && <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}
