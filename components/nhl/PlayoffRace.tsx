"use client";

import { useEffect, useState } from "react";

interface Standing {
  teamAbbrev: string;
  teamName: string;
  conference: string;
  division: string;
  points: number;
  gamesPlayed: number;
  divisionRank: number;
  conferenceRank: number;
  wildcardRank: number;
}

const REGULAR_SEASON_GAMES = 82;

/**
 * Compact "Playoff Race" strip for a specific NHL team. Shows:
 *   - Games remaining
 *   - Division rank (top 3 auto-qualify)
 *   - Points margin over the current playoff cutoff (9th place in conference)
 *   - Magic number to clinch a playoff spot
 *   - Elimination number (points where the team is mathematically out)
 */
export default function PlayoffRace({ teamAbbrev = "EDM" }: { teamAbbrev?: string }) {
  const [standings, setStandings] = useState<Standing[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/nhl/standings")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setStandings(d.standings ?? []); })
      .catch((e) => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <div className="text-xs" style={{ color: "var(--accent-red)" }}>Race data unavailable: {error}</div>;
  if (!standings) return null;

  const me = standings.find((s) => s.teamAbbrev === teamAbbrev);
  if (!me) return null;

  const conf = standings.filter((s) => s.conference === me.conference);
  const conferenceCutoff = conf.find((s) => s.conferenceRank === 8);
  const firstOut = conf.find((s) => s.conferenceRank === 9);

  const gamesRemaining = REGULAR_SEASON_GAMES - me.gamesPlayed;
  const maxPossiblePoints = me.points + gamesRemaining * 2;

  // Magic number over "first-out" team: any combination of own wins + that team's losses
  // summing to M clinches a spot ahead of them (assumes 2 points per win, no reg-win tiebreak).
  const outGR = firstOut ? REGULAR_SEASON_GAMES - firstOut.gamesPlayed : 0;
  const outMaxPoints = firstOut ? firstOut.points + outGR * 2 : 0;
  // M = (opp max pts) - (own current pts) + 1  → own points needed to guarantee clear
  const magicNumber = firstOut ? Math.max(0, outMaxPoints - me.points + 1) : null;

  // Elimination number: pts our team must lose out on for the cutoff team to overtake us.
  // = own max - (current cutoff pts) + 1
  const eliminationNumber = conferenceCutoff
    ? Math.max(0, maxPossiblePoints - conferenceCutoff.points + 1)
    : null;

  const clinched = magicNumber !== null && magicNumber === 0;
  const eliminated = eliminationNumber !== null && eliminationNumber === 0;

  const statusColor = clinched ? "var(--accent-green)" : eliminated ? "var(--accent-red)" : "var(--accent-orange)";
  const statusLabel = clinched ? "Clinched" : eliminated ? "Eliminated" : "In the race";

  return (
    <div
      className="mb-6 rounded-2xl px-5 py-4"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">🏒 Playoff race — {me.teamName}</div>
        <span className="text-xs uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: `${statusColor}22`, color: statusColor }}>
          {statusLabel}
        </span>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        <Cell label="Div rank" value={`#${me.divisionRank}`} sub={`${me.division}`} />
        <Cell label="Points" value={String(me.points)} sub={`${me.gamesPlayed} GP · ${gamesRemaining} GR`} />
        <Cell
          label="Vs 9th (cutoff)"
          value={firstOut ? `${me.points - firstOut.points >= 0 ? "+" : ""}${me.points - firstOut.points} pts` : "—"}
          sub={firstOut ? `${firstOut.teamAbbrev} · ${firstOut.points} pts` : ""}
          color={firstOut && me.points >= firstOut.points ? "var(--accent-green)" : "var(--accent-red)"}
        />
        <Cell
          label="Magic number"
          value={magicNumber !== null ? (magicNumber === 0 ? "✓" : String(magicNumber)) : "—"}
          sub="pts to clinch"
          color={clinched ? "var(--accent-green)" : undefined}
        />
        <Cell
          label="Elimination"
          value={eliminationNumber !== null ? (eliminationNumber === 0 ? "✗" : String(eliminationNumber)) : "—"}
          sub="opp pts to end run"
          color={eliminated ? "var(--accent-red)" : undefined}
        />
      </div>

      <div className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
        Magic number = combined own wins + <b>{firstOut?.teamAbbrev ?? "9th"}</b> losses required to clinch (2 pts each).
        Elimination = points <b>{firstOut ? conferenceCutoff?.teamAbbrev : "cutoff team"}</b> must gain for you to fall out.
        Ignores regulation-win tiebreaker.
      </div>
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
