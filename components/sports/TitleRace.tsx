"use client";

interface StandingRow {
  rank: number;
  team: string;
  played: number;
  points: number;
}

interface Props {
  keyword: string;               // team-name substring for matching (from TeamConfig.matchKeyword)
  rows: StandingRow[];
  totalRounds?: number;          // total matchdays in the league; defaults from row.played max × 2 if omitted
  accent?: string;
}

/**
 * Compact title-race / relegation panel for football teams. Shows:
 *   - Current rank + points + games played
 *   - Gap to leader (0 = leading)
 *   - Gap to first team below the "safety line" (rank 3 for promotion, rank N-3 for relegation)
 *   - Max points achievable this season if we win out
 */
export default function TitleRace({ keyword, rows, totalRounds, accent = "var(--accent-blue)" }: Props) {
  if (!rows || rows.length === 0) return null;
  const me = rows.find((r) => r.team.toLowerCase().includes(keyword.toLowerCase()));
  if (!me) return null;

  const leader = rows[0];
  const behindLeader = leader.points - me.points;
  const gamesInHand = leader.played - me.played;
  const leading = me.rank === 1;

  // Try to infer total rounds: default to (teams - 1) × 2 which is standard round-robin twice.
  const inferredTotal = (rows.length - 1) * 2;
  const rounds = totalRounds ?? inferredTotal;
  const remaining = Math.max(0, rounds - me.played);
  const maxPossible = me.points + remaining * 3;

  const relegationCutoff = rows.length >= 4 ? rows[rows.length - 3] : null;
  const aboveRelegation = relegationCutoff ? me.points - relegationCutoff.points : null;

  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold" style={{ color: accent }}>
          📈 Title race
        </div>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Round {me.played}/{rounds || "?"}
        </span>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        <Cell label="Position" value={`#${me.rank}`} sub={`${me.points} pts · ${me.played} P`} />
        <Cell
          label={leading ? "Ahead of 2nd" : "Behind leader"}
          value={leading ? `+${rows[1] ? me.points - rows[1].points : 0}` : `${behindLeader}`}
          sub={leading
            ? (rows[1] ? `${rows[1].team}` : "")
            : `${leader.team}${gamesInHand !== 0 ? `, ${gamesInHand > 0 ? gamesInHand : -gamesInHand} GiH ${gamesInHand > 0 ? "for us" : "for them"}` : ""}`}
          color={leading ? "var(--accent-green)" : behindLeader <= 3 ? "var(--accent-orange)" : "var(--text)"}
        />
        {relegationCutoff && aboveRelegation !== null && (
          <Cell
            label="Above drop"
            value={`${aboveRelegation >= 0 ? "+" : ""}${aboveRelegation}`}
            sub={`${relegationCutoff.team} (${relegationCutoff.points} pts)`}
            color={aboveRelegation < 0 ? "var(--accent-red)" : aboveRelegation <= 5 ? "var(--accent-orange)" : "var(--accent-green)"}
          />
        )}
        <Cell
          label="Max possible"
          value={`${maxPossible} pts`}
          sub={`if ${remaining}/${remaining} wins remaining`}
        />
      </div>
    </div>
  );
}

function Cell({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg p-2" style={{ background: "var(--surface-2)" }}>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-lg font-bold" style={{ color: color ?? "var(--text)" }}>{value}</div>
      {sub && <div className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}
